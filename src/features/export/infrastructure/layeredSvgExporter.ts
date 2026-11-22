import maplibregl from "maplibre-gl";
import type { Map as MaplibreMap } from "maplibre-gl";
import type {
  MarkerIconDefinition,
  MarkerItem,
} from "@/features/markers/domain/types";
import { drawMarkersOnCanvas } from "@/features/markers/infrastructure/rendering";
import type { Route } from "@/features/routes/domain/types";
import { drawRoutesOnCanvas } from "@/features/routes/infrastructure/rendering";
import { routeEndpointMarkerItems } from "@/features/routes/infrastructure/helpers";
import { applyFades } from "@/features/poster/infrastructure/renderer/layers";
import { drawPosterText } from "@/features/poster/infrastructure/renderer/typography";
import type { ResolvedTheme } from "@/features/theme/domain/types";
import type { TrimRect } from "@/features/layout/domain/bleed";
import {
  waitForMapIdle,
  createOffscreenContainer,
  resolveExportRenderParams,
  type ExportBleedRenderOptions,
} from "./exportUtils";

interface LayeredSvgOptions {
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

function renderMapCanvasToDataUrl(
  mapCanvas: HTMLCanvasElement,
  exportWidth: number,
  exportHeight: number,
): string {
  const layerCanvas = document.createElement("canvas");
  layerCanvas.width = exportWidth;
  layerCanvas.height = exportHeight;
  const ctx = layerCanvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create 2D context for SVG layer export.");
  }
  ctx.clearRect(0, 0, exportWidth, exportHeight);
  ctx.drawImage(mapCanvas, 0, 0, exportWidth, exportHeight);
  return layerCanvas.toDataURL("image/png");
}

function canvasToDataUrl(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create 2D context for SVG overlay export.");
  }
  ctx.clearRect(0, 0, width, height);
  draw(ctx);
  return canvas.toDataURL("image/png");
}

function sanitizeLayerId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export async function createLayeredSvgBlobFromMap({
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
  includeCredits,
  markers,
  markerIcons,
  routes = [],
  trimRect,
  bleedOptions,
}: LayeredSvgOptions): Promise<Blob> {
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
    canvasContextAttributes: { preserveDrawingBuffer: true },
  });

  try {
    await waitForMapIdle(exportMap);

    const exportStyle = exportMap.getStyle();
    const layerIds = (exportStyle.layers ?? []).map((layer) => layer.id);
    const originalVisibility = new Map<string, string>();
    const visibleLayerIds = layerIds.filter((layerId) => {
      const visibility = String(
        exportMap.getLayoutProperty(layerId, "visibility") ?? "visible",
      );
      originalVisibility.set(layerId, visibility);
      return visibility !== "none";
    });

    for (const layerId of visibleLayerIds) {
      exportMap.setLayoutProperty(layerId, "visibility", "none");
    }
    await waitForMapIdle(exportMap);

    const mapLayerDataUrls: { id: string; dataUrl: string }[] = [];
    for (const layerId of visibleLayerIds) {
      exportMap.setLayoutProperty(layerId, "visibility", "visible");
      await waitForMapIdle(exportMap);
      mapLayerDataUrls.push({
        id: layerId,
        dataUrl: renderMapCanvasToDataUrl(
          exportMap.getCanvas(),
          exportWidth,
          exportHeight,
        ),
      });
      exportMap.setLayoutProperty(layerId, "visibility", "none");
      await waitForMapIdle(exportMap);
    }

    for (const layerId of layerIds) {
      const visibility = originalVisibility.get(layerId) ?? "visible";
      exportMap.setLayoutProperty(layerId, "visibility", visibility);
    }
    await waitForMapIdle(exportMap);

    const overlayLayers: { id: string; label?: string; dataUrl: string }[] = [];

    if (showOverlay) {
      overlayLayers.push({
        id: "fades",
        label: "Fades",
        dataUrl: canvasToDataUrl(exportWidth, exportHeight, (ctx) => {
          applyFades(ctx, exportWidth, exportHeight, theme.ui.bg, trimRect);
        }),
      });
    }

    const visibleRoutes = routes.filter(
      (route) => route.visible && route.segments.length > 0,
    );

    if (visibleRoutes.length > 0) {
      for (let routeIdx = 0; routeIdx < visibleRoutes.length; routeIdx += 1) {
        const route = visibleRoutes[routeIdx];
        const routesCanvas = document.createElement("canvas");
        routesCanvas.width = exportWidth;
        routesCanvas.height = exportHeight;
        const routesCtx = routesCanvas.getContext("2d");
        if (routesCtx) {
          drawRoutesOnCanvas(
            routesCtx,
            [route],
            markerProjection,
            markerScaleX,
            markerScaleY,
            markerSizeScale,
          );
          const baseLabel = route.label?.trim() || `Route ${routeIdx + 1}`;
          const baseSlug =
            sanitizeLayerId(baseLabel) || `route-${routeIdx + 1}`;
          overlayLayers.push({
            id: `route-${routeIdx + 1}-${baseSlug}`,
            label: `Route: ${baseLabel}`,
            dataUrl: routesCanvas.toDataURL("image/png"),
          });
        }
      }
    }

    if (visibleRoutes.length > 0 && markerIcons.length > 0) {
      for (let routeIdx = 0; routeIdx < visibleRoutes.length; routeIdx += 1) {
        const route = visibleRoutes[routeIdx];
        const endpointItems = routeEndpointMarkerItems([route]);
        if (endpointItems.length === 0) continue;
        const endpointsCanvas = document.createElement("canvas");
        endpointsCanvas.width = exportWidth;
        endpointsCanvas.height = exportHeight;
        const endpointsCtx = endpointsCanvas.getContext("2d");
        if (endpointsCtx) {
          await drawMarkersOnCanvas(
            endpointsCtx,
            endpointItems,
            markerIcons,
            markerProjection,
            markerScaleX,
            markerScaleY,
            markerSizeScale,
          );
          const baseLabel = route.label?.trim() || `Route ${routeIdx + 1}`;
          const baseSlug =
            sanitizeLayerId(baseLabel) || `route-${routeIdx + 1}`;
          overlayLayers.push({
            id: `route-endpoints-${routeIdx + 1}-${baseSlug}`,
            label: `Route Endpoints: ${baseLabel}`,
            dataUrl: endpointsCanvas.toDataURL("image/png"),
          });
        }
      }
    }

    if (markers.length > 0 && markerIcons.length > 0) {
      // drawMarkersOnCanvas is async; render through explicit await canvas path.
      const markersCanvas = document.createElement("canvas");
      markersCanvas.width = exportWidth;
      markersCanvas.height = exportHeight;
      const markersCtx = markersCanvas.getContext("2d");
      if (markersCtx) {
        await drawMarkersOnCanvas(
          markersCtx,
          markers,
          markerIcons,
          markerProjection,
          markerScaleX,
          markerScaleY,
          markerSizeScale,
        );
        overlayLayers.push({
          id: "markers",
          dataUrl: markersCanvas.toDataURL("image/png"),
        });
      }
    }

    overlayLayers.push({
      id: "text",
      dataUrl: canvasToDataUrl(exportWidth, exportHeight, (ctx) => {
        drawPosterText(
          ctx,
          exportWidth,
          exportHeight,
          theme,
          { lat: center.lat, lon: center.lon },
          displayCity,
          displayCountry,
          fontFamily,
          showPosterText,
          showOverlay,
          includeCredits,
          trimRect,
        );
      }),
    });

    const escapeAttr = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const mapLayerGroups = mapLayerDataUrls
      .map((layer) => {
        const id = sanitizeLayerId(layer.id);
        const label = escapeAttr(layer.id);
        return `<g id="map-layer-${id}" inkscape:groupmode="layer" inkscape:label="${label}" data-name="${label}">
  <image href="${layer.dataUrl}" width="${exportWidth}" height="${exportHeight}" preserveAspectRatio="none" />
</g>`;
      })
      .join("\n");

    const overlayGroups = overlayLayers
      .map((layer) => {
        const id = sanitizeLayerId(layer.id);
        const label = escapeAttr(layer.label ?? layer.id);
        return `<g id="overlay-layer-${id}" inkscape:groupmode="layer" inkscape:label="${label}" data-name="${label}">
  <image href="${layer.dataUrl}" width="${exportWidth}" height="${exportHeight}" preserveAspectRatio="none" />
</g>`;
      })
      .join("\n");

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${exportWidth}" height="${exportHeight}" viewBox="0 0 ${exportWidth} ${exportHeight}">
${mapLayerGroups}
${overlayGroups}
</svg>`;

    return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  } finally {
    exportMap.remove();
    offscreenContainer.remove();
  }
}
