import maplibregl from "maplibre-gl";
import type { Map as MaplibreMap } from "maplibre-gl";
import type {
  MarkerIconDefinition,
  MarkerItem,
  MarkerProjectionInput,
} from "@/features/markers/domain/types";
import { projectMarkerToCanvas } from "@/features/markers/infrastructure/projection";
import { ROUTE_DASH_PATTERN } from "@/features/routes/domain/constants";
import type { Route } from "@/features/routes/domain/types";
import { routeEndpointMarkerItems } from "@/features/routes/infrastructure/helpers";
import type { ResolvedTheme } from "@/features/theme/domain/types";
import { formatCoordinates } from "@/shared/geo/posterBounds";
import {
  CITY_FONT_BASE_PX,
  COORDS_FONT_BASE_PX,
  COUNTRY_FONT_BASE_PX,
  TEXT_CITY_Y_RATIO,
  TEXT_COORDS_Y_RATIO,
  TEXT_COUNTRY_Y_RATIO,
  TEXT_DIMENSION_REFERENCE_PX,
  TEXT_DIVIDER_Y_RATIO,
  computeCityFontScale,
  formatCityLabel,
} from "@/features/poster/domain/textLayout";
import type { TrimRect } from "@/features/layout/domain/bleed";
import {
  createOffscreenContainer,
  resolveExportRenderParams,
  waitForMapIdle,
  type ExportBleedRenderOptions,
} from "./exportUtils";

interface VectorSvgOptions {
  map: MaplibreMap;
  exportWidth: number;
  exportHeight: number;
  theme: ResolvedTheme;
  center: { lat: number; lon: number };
  displayCity: string;
  displayCountry: string;
  fontFamily?: string;
  showPosterText: boolean;
  showOverlay: boolean;
  includeCredits: boolean;
  markers: MarkerItem[];
  markerIcons: MarkerIconDefinition[];
  routes?: Route[];
  trimRect?: TrimRect;
  bleedOptions?: ExportBleedRenderOptions;
}

interface Point2D {
  x: number;
  y: number;
}

interface ClipRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function fmt(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sanitizeLayerId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function evaluateNumericStyleExpr(
  expr: unknown,
  zoom: number,
  fallback: number,
): number {
  if (typeof expr === "number" && Number.isFinite(expr)) {
    return expr;
  }

  if (!Array.isArray(expr) || expr.length === 0) {
    return fallback;
  }

  if (
    expr[0] === "interpolate" &&
    Array.isArray(expr[2]) &&
    expr[2][0] === "zoom"
  ) {
    const stops: [number, number][] = [];
    for (let i = 3; i + 1 < expr.length; i += 2) {
      const z = Number(expr[i]);
      const v = Number(expr[i + 1]);
      if (Number.isFinite(z) && Number.isFinite(v)) {
        stops.push([z, v]);
      }
    }
    if (stops.length === 0) return fallback;
    if (zoom <= stops[0]![0]) return stops[0]![1];
    for (let i = 1; i < stops.length; i += 1) {
      const [z0, v0] = stops[i - 1]!;
      const [z1, v1] = stops[i]!;
      if (zoom <= z1) {
        const span = z1 - z0;
        const t = span > 0 ? (zoom - z0) / span : 0;
        return v0 + (v1 - v0) * t;
      }
    }
    return stops[stops.length - 1]![1];
  }

  if (expr[0] === "step" && Array.isArray(expr[1]) && expr[1][0] === "zoom") {
    let result = Number.isFinite(Number(expr[2])) ? Number(expr[2]) : fallback;
    for (let i = 3; i + 1 < expr.length; i += 2) {
      const stopZoom = Number(expr[i]);
      const stopVal = Number(expr[i + 1]);
      if (Number.isFinite(stopZoom) && Number.isFinite(stopVal) && zoom >= stopZoom) {
        result = stopVal;
      }
    }
    return result;
  }

  return fallback;
}

function evaluateStringStyleExpr(expr: unknown, fallback: string): string {
  if (typeof expr === "string" && expr.trim()) {
    return expr.trim();
  }
  return fallback;
}

function clipSegmentToRect(
  p0: Point2D,
  p1: Point2D,
  rect: ClipRect,
): [Point2D, Point2D] | null {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  let t0 = 0;
  let t1 = 1;

  const checks: [number, number][] = [
    [-dx, p0.x - rect.minX],
    [dx, rect.maxX - p0.x],
    [-dy, p0.y - rect.minY],
    [dy, rect.maxY - p0.y],
  ];

  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }

  return [
    { x: p0.x + t0 * dx, y: p0.y + t0 * dy },
    { x: p0.x + t1 * dx, y: p0.y + t1 * dy },
  ];
}

function clipPolylineToRect(points: Point2D[], rect: ClipRect): Point2D[][] {
  if (points.length < 2) return [];

  const polylines: Point2D[][] = [];
  let current: Point2D[] = [];

  for (let i = 1; i < points.length; i += 1) {
    const clipped = clipSegmentToRect(points[i - 1]!, points[i]!, rect);
    if (!clipped) {
      if (current.length >= 2) {
        polylines.push(current);
      }
      current = [];
      continue;
    }

    const [a, b] = clipped;
    if (current.length === 0) {
      current.push(a, b);
    } else {
      const last = current[current.length - 1]!;
      const sameStart =
        Math.abs(last.x - a.x) < 0.01 && Math.abs(last.y - a.y) < 0.01;
      if (sameStart) {
        current.push(b);
      } else {
        if (current.length >= 2) {
          polylines.push(current);
        }
        current = [a, b];
      }
    }
  }

  if (current.length >= 2) {
    polylines.push(current);
  }

  return polylines;
}

function clipPolygonRingToRect(ring: Point2D[], rect: ClipRect): Point2D[] {
  if (ring.length < 3) return [];

  // Strip closing vertex if repeated before clipping
  let output =
    ring.length > 3 &&
    ring[0]!.x === ring[ring.length - 1]!.x &&
    ring[0]!.y === ring[ring.length - 1]!.y
      ? ring.slice(0, -1)
      : ring.slice();

  const edges: {
    inside: (p: Point2D) => boolean;
    intersect: (a: Point2D, b: Point2D) => Point2D;
  }[] = [
    {
      inside: (p) => p.x >= rect.minX,
      intersect: (a, b) => {
        const dx = b.x - a.x;
        const t = dx !== 0 ? (rect.minX - a.x) / dx : 0;
        return { x: rect.minX, y: a.y + t * (b.y - a.y) };
      },
    },
    {
      inside: (p) => p.x <= rect.maxX,
      intersect: (a, b) => {
        const dx = b.x - a.x;
        const t = dx !== 0 ? (rect.maxX - a.x) / dx : 0;
        return { x: rect.maxX, y: a.y + t * (b.y - a.y) };
      },
    },
    {
      inside: (p) => p.y >= rect.minY,
      intersect: (a, b) => {
        const dy = b.y - a.y;
        const t = dy !== 0 ? (rect.minY - a.y) / dy : 0;
        return { x: a.x + t * (b.x - a.x), y: rect.minY };
      },
    },
    {
      inside: (p) => p.y <= rect.maxY,
      intersect: (a, b) => {
        const dy = b.y - a.y;
        const t = dy !== 0 ? (rect.maxY - a.y) / dy : 0;
        return { x: a.x + t * (b.x - a.x), y: rect.maxY };
      },
    },
  ];

  for (const edge of edges) {
    if (output.length === 0) return [];
    const input = output;
    output = [];
    let s = input[input.length - 1]!;
    for (const e of input) {
      const eIn = edge.inside(e);
      const sIn = edge.inside(s);
      if (eIn) {
        if (!sIn) {
          output.push(edge.intersect(s, e));
        }
        output.push(e);
      } else if (sIn) {
        output.push(edge.intersect(s, e));
      }
      s = e;
    }
  }

  return output.length >= 3 ? output : [];
}

function polylineToPathData(points: Point2D[]): string {
  if (points.length < 2) return "";
  const parts = [`M${fmt(points[0]!.x)} ${fmt(points[0]!.y)}`];
  for (let i = 1; i < points.length; i += 1) {
    parts.push(`L${fmt(points[i]!.x)} ${fmt(points[i]!.y)}`);
  }
  return parts.join("");
}

function polygonRingToPathData(ring: Point2D[]): string {
  if (ring.length < 3) return "";
  const parts = [`M${fmt(ring[0]!.x)} ${fmt(ring[0]!.y)}`];
  for (let i = 1; i < ring.length; i += 1) {
    parts.push(`L${fmt(ring[i]!.x)} ${fmt(ring[i]!.y)}`);
  }
  parts.push("Z");
  return parts.join("");
}

function projectCoordPair(
  coord: unknown,
  exportMap: MaplibreMap,
  scaleX: number,
  scaleY: number,
): Point2D | null {
  if (!Array.isArray(coord) || coord.length < 2) return null;
  const lng = Number(coord[0]);
  const lat = Number(coord[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const projected = exportMap.project([lng, lat]);
  return {
    x: projected.x * scaleX,
    y: projected.y * scaleY,
  };
}

function extractLinePathsFromGeometry(
  geometry: GeoJSON.Geometry | null | undefined,
  exportMap: MaplibreMap,
  scaleX: number,
  scaleY: number,
  clipRect: ClipRect,
): string[] {
  if (!geometry) return [];

  const lineStrings: number[][][] =
    geometry.type === "LineString"
      ? [geometry.coordinates]
      : geometry.type === "MultiLineString"
        ? geometry.coordinates
        : [];

  const paths: string[] = [];
  for (const coords of lineStrings) {
    const projected: Point2D[] = [];
    for (const pair of coords) {
      const pt = projectCoordPair(pair, exportMap, scaleX, scaleY);
      if (pt) projected.push(pt);
    }
    const clippedPolylines = clipPolylineToRect(projected, clipRect);
    for (const poly of clippedPolylines) {
      const d = polylineToPathData(poly);
      if (d) paths.push(d);
    }
  }
  return paths;
}

function extractPolygonPathsFromGeometry(
  geometry: GeoJSON.Geometry | null | undefined,
  exportMap: MaplibreMap,
  scaleX: number,
  scaleY: number,
  clipRect: ClipRect,
): string[] {
  if (!geometry) return [];

  const polygons: number[][][][] =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates
        : [];

  const paths: string[] = [];
  for (const polygonRings of polygons) {
    const ringParts: string[] = [];
    for (const ring of polygonRings) {
      const projected: Point2D[] = [];
      for (const pair of ring) {
        const pt = projectCoordPair(pair, exportMap, scaleX, scaleY);
        if (pt) projected.push(pt);
      }
      const clippedRing = clipPolygonRingToRect(projected, clipRect);
      if (clippedRing.length >= 3) {
        ringParts.push(polygonRingToPathData(clippedRing));
      }
    }
    if (ringParts.length > 0) {
      paths.push(ringParts.join(""));
    }
  }
  return paths;
}

const fetchedSvgCache = new Map<string, string>();

async function fetchSvgText(url: string): Promise<string | null> {
  if (fetchedSvgCache.has(url)) {
    return fetchedSvgCache.get(url) ?? null;
  }
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const text = await response.text();
    fetchedSvgCache.set(url, text);
    return text;
  } catch {
    return null;
  }
}

function parseSvgDataUrl(dataUrl: string): string | null {
  if (!dataUrl.startsWith("data:image/svg+xml")) return null;
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx === -1) return null;
  const header = dataUrl.slice(0, commaIdx);
  const payload = dataUrl.slice(commaIdx + 1);
  try {
    if (header.includes(";base64")) {
      return atob(payload);
    }
    return decodeURIComponent(payload);
  } catch {
    return null;
  }
}

function serializeInlineSvgIcon(
  rawSvg: string,
  x: number,
  y: number,
  size: number,
  tintColor: string | null,
): string | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawSvg, "image/svg+xml");
  const svgEl = doc.querySelector("svg");
  if (!svgEl) return null;

  const viewBox =
    svgEl.getAttribute("viewBox") ||
    `0 0 ${svgEl.getAttribute("width") || "24"} ${svgEl.getAttribute("height") || "24"}`;

  if (tintColor) {
    // Strip gradient defs and replace fill/style colors with solid tintColor
    for (const def of Array.from(svgEl.querySelectorAll("defs"))) {
      def.remove();
    }
    for (const node of Array.from(
      svgEl.querySelectorAll("path, circle, rect, polygon, polyline, ellipse, line"),
    )) {
      const styleAttr = node.getAttribute("style");
      if (styleAttr) {
        const cleanedStyle = styleAttr
          .replace(/fill\s*:\s*[^;]+;?/gi, "")
          .replace(/stroke\s*:\s*[^;]+;?/gi, "");
        if (cleanedStyle.trim()) {
          node.setAttribute("style", cleanedStyle);
        } else {
          node.removeAttribute("style");
        }
      }
      const existingFill = node.getAttribute("fill");
      if (existingFill !== "none") {
        node.setAttribute("fill", tintColor);
      }
      const existingStroke = node.getAttribute("stroke");
      if (existingStroke && existingStroke !== "none") {
        node.setAttribute("stroke", tintColor);
      }
    }
  }

  const serializer = new XMLSerializer();
  const inner = Array.from(svgEl.childNodes)
    .map((child) => serializer.serializeToString(child))
    .join("")
    .split("currentColor")
    .join(tintColor ?? "#000000");

  return `<svg x="${fmt(x)}" y="${fmt(y)}" width="${fmt(size)}" height="${fmt(size)}" viewBox="${escapeXml(viewBox)}"${tintColor ? ` color="${escapeXml(tintColor)}" fill="${escapeXml(tintColor)}"` : ""}>${inner}</svg>`;
}

async function renderMarkerItemsToSvgGroup(
  groupId: string,
  items: MarkerItem[],
  icons: MarkerIconDefinition[],
  markerProjection: MarkerProjectionInput,
  scaleX: number,
  scaleY: number,
  sizeScale: number,
): Promise<string | null> {
  if (items.length === 0 || icons.length === 0) return null;

  const elements: string[] = [];

  for (const marker of items) {
    const icon = icons.find((entry) => entry.id === marker.iconId);
    if (!icon) continue;

    const point = projectMarkerToCanvas(marker.lat, marker.lon, markerProjection);
    const x = point.x * scaleX;
    const y = point.y * scaleY;
    const size = marker.size * Math.max(scaleX, scaleY) * sizeScale;
    const imageX = x - size / 2;
    const imageY = y - size / 2;

    if (icon.kind === "svg" && icon.svgMarkup) {
      const serialized = serializeInlineSvgIcon(
        icon.svgMarkup,
        imageX,
        imageY,
        size,
        marker.color,
      );
      if (serialized) {
        elements.push(`  ${serialized}`);
        continue;
      }
    }

    if (icon.dataUrl) {
      let svgSource = parseSvgDataUrl(icon.dataUrl);
      if (!svgSource && icon.dataUrl.toLowerCase().endsWith(".svg")) {
        svgSource = await fetchSvgText(icon.dataUrl);
      }
      if (svgSource) {
        const serialized = serializeInlineSvgIcon(
          svgSource,
          imageX,
          imageY,
          size,
          icon.tintWithMarkerColor ? marker.color : null,
        );
        if (serialized) {
          elements.push(`  ${serialized}`);
          continue;
        }
      }

      // Raster custom icon fallback
      elements.push(
        `  <image href="${escapeXml(icon.dataUrl)}" x="${fmt(imageX)}" y="${fmt(imageY)}" width="${fmt(size)}" height="${fmt(size)}" preserveAspectRatio="xMidYMid meet" />`,
      );
    }
  }

  if (elements.length === 0) return null;

  return `<g id="overlay-layer-${sanitizeLayerId(groupId)}">\n${elements.join("\n")}\n</g>`;
}

export async function createVectorSvgBlobFromMap({
  map,
  exportWidth,
  exportHeight,
  theme,
  center,
  displayCity,
  displayCountry,
  fontFamily,
  showPosterText,
  showOverlay,
  includeCredits: _includeCredits,
  markers,
  markerIcons,
  routes = [],
  trimRect,
  bleedOptions,
}: VectorSvgOptions): Promise<Blob> {
  await waitForMapIdle(map);

  const {
    center: mapCenter,
    zoom,
    pitch,
    bearing,
    style,
    renderWidth,
    renderHeight,
    pixelRatio,
    markerProjection,
    markerScaleX,
    markerScaleY,
    markerSizeScale,
  } = resolveExportRenderParams(map, exportWidth, exportHeight, bleedOptions);

  const offscreenContainer = createOffscreenContainer(renderWidth, renderHeight);
  document.body.appendChild(offscreenContainer);

  const exportMap = new maplibregl.Map({
    container: offscreenContainer,
    style,
    center: [mapCenter.lng, mapCenter.lat],
    zoom,
    pitch,
    bearing,
    interactive: false,
    attributionControl: false,
    pixelRatio,
  });

  try {
    await waitForMapIdle(exportMap);

    const activeZoom = exportMap.getZoom();
    const scaleX = exportWidth / renderWidth;
    const scaleY = exportHeight / renderHeight;
    const strokeScale = (scaleX + scaleY) / 2;
    const artboardClip: ClipRect = {
      minX: 0,
      minY: 0,
      maxX: exportWidth,
      maxY: exportHeight,
    };

    const exportStyle = exportMap.getStyle();
    const layers = exportStyle.layers ?? [];
    const mapLayerGroups: string[] = [];

    for (const layer of layers) {
      const visibility = String(
        exportMap.getLayoutProperty(layer.id, "visibility") ?? "visible",
      );
      if (visibility === "none") continue;

      if (layer.type === "background") {
        const paint = (layer.paint ?? {}) as Record<string, unknown>;
        const bgColor = evaluateStringStyleExpr(
          exportMap.getPaintProperty(layer.id, "background-color") ??
            paint["background-color"],
          theme.map.land || "#ffffff",
        );
        const bgOpacity = evaluateNumericStyleExpr(
          exportMap.getPaintProperty(layer.id, "background-opacity") ??
            paint["background-opacity"],
          activeZoom,
          1,
        );
        if (bgOpacity <= 0) continue;
        const opacityAttr =
          bgOpacity < 0.999 ? ` opacity="${fmt(bgOpacity)}"` : "";
        mapLayerGroups.push(
          `<g id="map-layer-${sanitizeLayerId(layer.id)}"${opacityAttr}>\n  <rect x="0" y="0" width="${fmt(exportWidth)}" height="${fmt(exportHeight)}" fill="${escapeXml(bgColor)}" />\n</g>`,
        );
        continue;
      }

      if (layer.type === "fill") {
        const paint = (layer.paint ?? {}) as Record<string, unknown>;
        const fillOpacity = evaluateNumericStyleExpr(
          exportMap.getPaintProperty(layer.id, "fill-opacity") ??
            paint["fill-opacity"],
          activeZoom,
          1,
        );
        if (fillOpacity <= 0.001) continue;

        const fillColor = evaluateStringStyleExpr(
          exportMap.getPaintProperty(layer.id, "fill-color") ??
            paint["fill-color"],
          "#000000",
        );

        const features = exportMap.queryRenderedFeatures({
          layers: [layer.id],
        });
        if (features.length === 0) continue;

        const pathElements: string[] = [];
        for (const feature of features) {
          const paths = extractPolygonPathsFromGeometry(
            feature.geometry,
            exportMap,
            scaleX,
            scaleY,
            artboardClip,
          );
          for (const d of paths) {
            pathElements.push(`  <path d="${d}" />`);
          }
        }
        if (pathElements.length === 0) continue;

        const opacityAttr =
          fillOpacity < 0.999 ? ` opacity="${fmt(fillOpacity)}"` : "";
        mapLayerGroups.push(
          `<g id="map-layer-${sanitizeLayerId(layer.id)}" fill="${escapeXml(fillColor)}" fill-rule="evenodd" stroke="none"${opacityAttr}>\n${pathElements.join("\n")}\n</g>`,
        );
        continue;
      }

      if (layer.type === "line") {
        const paint = (layer.paint ?? {}) as Record<string, unknown>;
        const lineOpacity = evaluateNumericStyleExpr(
          exportMap.getPaintProperty(layer.id, "line-opacity") ??
            paint["line-opacity"],
          activeZoom,
          1,
        );
        if (lineOpacity <= 0.001) continue;

        const rawLineWidth = evaluateNumericStyleExpr(
          exportMap.getPaintProperty(layer.id, "line-width") ??
            paint["line-width"],
          activeZoom,
          1,
        );
        const lineWidth = rawLineWidth * strokeScale;
        if (lineWidth <= 0) continue;

        const lineColor = evaluateStringStyleExpr(
          exportMap.getPaintProperty(layer.id, "line-color") ??
            paint["line-color"],
          "#000000",
        );
        const lineCap = String(
          exportMap.getLayoutProperty(layer.id, "line-cap") ?? "butt",
        );
        const lineJoin = String(
          exportMap.getLayoutProperty(layer.id, "line-join") ?? "miter",
        );

        const rawDasharray =
          exportMap.getPaintProperty(layer.id, "line-dasharray") ??
          paint["line-dasharray"];
        let dashAttr = "";
        if (Array.isArray(rawDasharray) && rawDasharray.length >= 2) {
          const scaledDash = rawDasharray
            .map((v) => Number(v) * lineWidth)
            .filter((v) => Number.isFinite(v) && v >= 0);
          if (scaledDash.length >= 2) {
            dashAttr = ` stroke-dasharray="${scaledDash.map(fmt).join(" ")}"`;
          }
        }

        const pad = Math.ceil(lineWidth) + 2;
        const lineClipRect: ClipRect = {
          minX: -pad,
          minY: -pad,
          maxX: exportWidth + pad,
          maxY: exportHeight + pad,
        };

        const features = exportMap.queryRenderedFeatures({
          layers: [layer.id],
        });
        if (features.length === 0) continue;

        const pathElements: string[] = [];
        for (const feature of features) {
          const paths = extractLinePathsFromGeometry(
            feature.geometry,
            exportMap,
            scaleX,
            scaleY,
            lineClipRect,
          );
          for (const d of paths) {
            pathElements.push(`  <path d="${d}" />`);
          }
        }
        if (pathElements.length === 0) continue;

        const opacityAttr =
          lineOpacity < 0.999 ? ` opacity="${fmt(lineOpacity)}"` : "";
        mapLayerGroups.push(
          `<g id="map-layer-${sanitizeLayerId(layer.id)}" fill="none" stroke="${escapeXml(lineColor)}" stroke-width="${fmt(lineWidth)}" stroke-linecap="${escapeXml(lineCap)}" stroke-linejoin="${escapeXml(lineJoin)}"${dashAttr}${opacityAttr}>\n${pathElements.join("\n")}\n</g>`,
        );
      }
    }

    const defs: string[] = [
      `  <clipPath id="poster-bounds">\n    <rect x="0" y="0" width="${fmt(exportWidth)}" height="${fmt(exportHeight)}" />\n  </clipPath>`,
    ];
    const overlayGroups: string[] = [];

    const tx = trimRect?.x ?? 0;
    const ty = trimRect?.y ?? 0;
    const tw = trimRect?.width ?? exportWidth;
    const th = trimRect?.height ?? exportHeight;

    if (showOverlay) {
      const fadeColor = escapeXml(theme.ui.bg || "#ffffff");
      defs.push(
        `  <linearGradient id="poster-fade-top" x1="0" y1="0" x2="0" y2="1">\n    <stop offset="0%" stop-color="${fadeColor}" stop-opacity="1" />\n    <stop offset="100%" stop-color="${fadeColor}" stop-opacity="0" />\n  </linearGradient>`,
      );
      defs.push(
        `  <linearGradient id="poster-fade-bottom" x1="0" y1="1" x2="0" y2="0">\n    <stop offset="0%" stop-color="${fadeColor}" stop-opacity="1" />\n    <stop offset="100%" stop-color="${fadeColor}" stop-opacity="0" />\n  </linearGradient>`,
      );

      const fadeRects: string[] = [];
      if (ty > 0) {
        fadeRects.push(
          `  <rect x="0" y="0" width="${fmt(exportWidth)}" height="${fmt(ty)}" fill="${fadeColor}" />`,
        );
      }
      fadeRects.push(
        `  <rect x="0" y="${fmt(ty)}" width="${fmt(exportWidth)}" height="${fmt(th * 0.25)}" fill="url(#poster-fade-top)" />`,
      );
      fadeRects.push(
        `  <rect x="0" y="${fmt(ty + th * 0.75)}" width="${fmt(exportWidth)}" height="${fmt(th * 0.25)}" fill="url(#poster-fade-bottom)" />`,
      );
      const bottomTrimEdge = ty + th;
      if (bottomTrimEdge < exportHeight) {
        fadeRects.push(
          `  <rect x="0" y="${fmt(bottomTrimEdge)}" width="${fmt(exportWidth)}" height="${fmt(exportHeight - bottomTrimEdge)}" fill="${fadeColor}" />`,
        );
      }

      overlayGroups.push(
        `<g id="overlay-layer-fades">\n${fadeRects.join("\n")}\n</g>`,
      );
    }

    const visibleRoutes = routes.filter(
      (route) => route.visible && route.segments.length > 0,
    );

    if (visibleRoutes.length > 0) {
      const widthScale = ((markerScaleX + markerScaleY) / 2) * markerSizeScale;
      const usedRouteLayerIds = new Set<string>();

      for (let routeIdx = 0; routeIdx < visibleRoutes.length; routeIdx += 1) {
        const route = visibleRoutes[routeIdx];
        const routePaths: string[] = [];

        const width = Math.max(0.5, route.strokeWidth * widthScale);
        const pad = Math.ceil(width) + 2;
        const routeClip: ClipRect = {
          minX: -pad,
          minY: -pad,
          maxX: exportWidth + pad,
          maxY: exportHeight + pad,
        };
        const dashAttr =
          route.lineStyle === "dashed"
            ? ` stroke-dasharray="${fmt(ROUTE_DASH_PATTERN[0] * width)} ${fmt(ROUTE_DASH_PATTERN[1] * width)}"`
            : "";
        const opacityAttr =
          route.opacity < 0.999 ? ` stroke-opacity="${fmt(route.opacity)}"` : "";

        for (const segment of route.segments) {
          if (segment.length < 2) continue;
          const projected = segment.map(({ lat, lon }) => {
            const pt = projectMarkerToCanvas(lat, lon, markerProjection);
            return { x: pt.x * markerScaleX, y: pt.y * markerScaleY };
          });
          const clipped = clipPolylineToRect(projected, routeClip);
          for (const poly of clipped) {
            const d = polylineToPathData(poly);
            if (d) {
              routePaths.push(
                `  <path d="${d}" fill="none" stroke="${escapeXml(route.color)}" stroke-width="${fmt(width)}" stroke-linecap="round" stroke-linejoin="round"${dashAttr}${opacityAttr} />`,
              );
            }
          }
        }

        if (routePaths.length > 0) {
          const baseLabel = route.label?.trim() || `Route ${routeIdx + 1}`;
          const baseSlug = sanitizeLayerId(baseLabel) || `route-${routeIdx + 1}`;
          let layerId = `overlay-layer-route-${routeIdx + 1}-${baseSlug}`;
          let suffix = 2;
          while (usedRouteLayerIds.has(layerId)) {
            layerId = `overlay-layer-route-${routeIdx + 1}-${baseSlug}-${suffix}`;
            suffix += 1;
          }
          usedRouteLayerIds.add(layerId);

          const layerLabel = escapeXml(`Route: ${baseLabel}`);
          overlayGroups.push(
            `<g id="${layerId}" inkscape:groupmode="layer" inkscape:label="${layerLabel}" data-name="${layerLabel}">\n${routePaths.join("\n")}\n</g>`,
          );
        }
      }
    }

    if (visibleRoutes.length > 0 && markerIcons.length > 0) {
      for (let routeIdx = 0; routeIdx < visibleRoutes.length; routeIdx += 1) {
        const route = visibleRoutes[routeIdx];
        const endpointItems = routeEndpointMarkerItems([route]);
        if (endpointItems.length === 0) continue;
        const baseLabel = route.label?.trim() || `Route ${routeIdx + 1}`;
        const baseSlug = sanitizeLayerId(baseLabel) || `route-${routeIdx + 1}`;
        const endpointGroup = await renderMarkerItemsToSvgGroup(
          `route-endpoints-${routeIdx + 1}-${baseSlug}`,
          endpointItems,
          markerIcons,
          markerProjection,
          markerScaleX,
          markerScaleY,
          markerSizeScale,
        );
        if (endpointGroup) {
          const layerLabel = escapeXml(`Route Endpoints: ${baseLabel}`);
          overlayGroups.push(
            endpointGroup.replace(
              /^<g /,
              `<g inkscape:groupmode="layer" inkscape:label="${layerLabel}" data-name="${layerLabel}" `,
            ),
          );
        }
      }
    }

    if (markers.length > 0 && markerIcons.length > 0) {
      const markerGroup = await renderMarkerItemsToSvgGroup(
        "markers",
        markers,
        markerIcons,
        markerProjection,
        markerScaleX,
        markerScaleY,
        markerSizeScale,
      );
      if (markerGroup) overlayGroups.push(markerGroup);
    }

    // Typography layer — native editable <text> and <line> elements
    const textElements: string[] = [];
    const textColor = theme.ui?.text || "#111111";
    const titleFontFamily = fontFamily
      ? `'${fontFamily}', 'Space Grotesk', sans-serif`
      : "'Space Grotesk', sans-serif";
    const bodyFontFamily = fontFamily
      ? `'${fontFamily}', 'IBM Plex Mono', monospace`
      : "'IBM Plex Mono', monospace";

    const dimScale = Math.max(
      0.45,
      Math.min(tw, th) / TEXT_DIMENSION_REFERENCE_PX,
    );

    if (showPosterText) {
      const cityLabel = formatCityLabel(displayCity);
      const cityFontSize =
        CITY_FONT_BASE_PX * dimScale * computeCityFontScale(displayCity);
      const countryFontSize = COUNTRY_FONT_BASE_PX * dimScale;
      const coordinateFontSize = COORDS_FONT_BASE_PX * dimScale;
      const centerX = tx + tw * 0.5;
      const cityY = ty + th * TEXT_CITY_Y_RATIO;
      const lineY = ty + th * TEXT_DIVIDER_Y_RATIO;
      const countryY = ty + th * TEXT_COUNTRY_Y_RATIO;
      const coordinatesY = ty + th * TEXT_COORDS_Y_RATIO;

      textElements.push(
        `  <text x="${fmt(centerX)}" y="${fmt(cityY)}" dy="0.35em" text-anchor="middle" fill="${escapeXml(textColor)}" font-family="${escapeXml(titleFontFamily)}" font-size="${fmt(cityFontSize)}" font-weight="700">${escapeXml(cityLabel)}</text>`,
      );
      textElements.push(
        `  <line x1="${fmt(tx + tw * 0.4)}" y1="${fmt(lineY)}" x2="${fmt(tx + tw * 0.6)}" y2="${fmt(lineY)}" stroke="${escapeXml(textColor)}" stroke-width="${fmt(3 * dimScale)}" />`,
      );
      textElements.push(
        `  <text x="${fmt(centerX)}" y="${fmt(countryY)}" dy="0.35em" text-anchor="middle" fill="${escapeXml(textColor)}" font-family="${escapeXml(titleFontFamily)}" font-size="${fmt(countryFontSize)}" font-weight="300">${escapeXml(displayCountry.toUpperCase())}</text>`,
      );
      textElements.push(
        `  <text x="${fmt(centerX)}" y="${fmt(coordinatesY)}" dy="0.35em" text-anchor="middle" fill="${escapeXml(textColor)}" fill-opacity="0.75" font-family="${escapeXml(bodyFontFamily)}" font-size="${fmt(coordinateFontSize)}" font-weight="400">${escapeXml(formatCoordinates(center.lat, center.lon))}</text>`,
      );
    }

    if (textElements.length > 0) {
      overlayGroups.push(
        `<g id="overlay-layer-text">\n${textElements.join("\n")}\n</g>`,
      );
    }

    const hasBleedArea =
      Boolean(trimRect) &&
      ((bleedOptions?.bleedRatioX ?? 0) > 0 ||
        (bleedOptions?.bleedRatioY ?? 0) > 0 ||
        tx > 0.01 ||
        ty > 0.01 ||
        tw < exportWidth - 0.01 ||
        th < exportHeight - 0.01);

    if (hasBleedArea) {
      overlayGroups.push(
        `<g id="TRIM_AREA" data-name="TRIM AREA">\n  <rect x="${fmt(tx)}" y="${fmt(ty)}" width="${fmt(tw)}" height="${fmt(th)}" fill="none" stroke="none" />\n</g>`,
      );
    }

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${fmt(exportWidth)}" height="${fmt(exportHeight)}" viewBox="0 0 ${fmt(exportWidth)} ${fmt(exportHeight)}">
<defs>
${defs.join("\n")}
</defs>
<g id="poster-artboard" inkscape:groupmode="layer" inkscape:label="Poster" clip-path="url(#poster-bounds)">
${mapLayerGroups.join("\n")}
${overlayGroups.join("\n")}
</g>
</svg>`;

    return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  } finally {
    exportMap.remove();
    offscreenContainer.remove();
  }
}
