import type { Coordinate } from "@/shared/geo/types";
import { gpxParser } from "./gpxParser";

const rawBundledGpxModules = import.meta.glob("/src/data/gpx/*.gpx", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const bundledXmlByFilename = new Map<string, string>();
const bundledFilenameLookup = new Map<string, string>();
const parsedSegmentsCache = new Map<string, Coordinate[][]>();

for (const [modulePath, xml] of Object.entries(rawBundledGpxModules)) {
  if (typeof xml !== "string" || xml.trim().length === 0) continue;
  const filename = modulePath.split("/").pop()?.trim();
  if (!filename) continue;
  bundledXmlByFilename.set(filename, xml);
  bundledFilenameLookup.set(filename.toLowerCase(), filename);
}

function cloneSegments(segments: Coordinate[][]): Coordinate[][] {
  return segments.map((segment) =>
    segment.map((point) => ({ lat: point.lat, lon: point.lon })),
  );
}

function parseGpxXmlSegments(xml: string): Coordinate[][] {
  if (typeof DOMParser !== "undefined") {
    try {
      return gpxParser.parse(xml).segments;
    } catch {
      // Fall through to lightweight regex fallback for non-standard files.
    }
  }

  const segments: Coordinate[][] = [];
  const segMatches = xml.match(/<trkseg\b[^>]*>[\s\S]*?<\/trkseg>/gi) ?? [];
  const blocks = segMatches.length > 0 ? segMatches : [xml];
  const ptPattern =
    /<(?:trkpt|rtept)\b[^>]*\blat=["']([^"']+)["'][^>]*\blon=["']([^"']+)["'][^>]*\/?>/gi;

  for (const block of blocks) {
    const points: Coordinate[] = [];
    ptPattern.lastIndex = 0;
    let match: RegExpExecArray | null = ptPattern.exec(block);
    while (match) {
      const lat = Number(match[1]);
      const lon = Number(match[2]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        points.push({ lat, lon });
      }
      match = ptPattern.exec(block);
    }
    if (points.length >= 2) {
      segments.push(points);
    }
  }

  return segments;
}

function resolveCanonicalBundledFilename(filename: string): string | null {
  const trimmed = filename.trim();
  if (!trimmed) return null;
  const base = trimmed.split(/[\\/]/).pop() ?? trimmed;
  if (bundledXmlByFilename.has(base)) return base;
  return bundledFilenameLookup.get(base.toLowerCase()) ?? null;
}

export function normalizeGpxFilename(
  rawName: string | undefined,
  fallbackLabel = "route",
): string {
  const baseSource = (rawName?.trim() || fallbackLabel.trim() || "route")
    .split(/[\\/]/)
    .pop()!
    .trim();

  const withoutExt = baseSource.replace(/\.gpx$/i, "");
  const cleaned = withoutExt
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${cleaned || "route"}.gpx`;
}

export function listBundledGpxFilenames(): string[] {
  return Array.from(bundledXmlByFilename.keys()).sort((a, b) =>
    a.localeCompare(b),
  );
}

export function hasBundledGpxFile(filename: string | undefined): boolean {
  if (!filename) return false;
  return resolveCanonicalBundledFilename(filename) !== null;
}

export function getBundledGpxSegments(
  filename: string | undefined,
): Coordinate[][] | null {
  if (!filename) return null;
  const canonical = resolveCanonicalBundledFilename(filename);
  if (!canonical) return null;

  const cached = parsedSegmentsCache.get(canonical);
  if (cached) {
    return cloneSegments(cached);
  }

  const xml = bundledXmlByFilename.get(canonical);
  if (!xml) return null;

  const segments = parseGpxXmlSegments(xml);
  if (segments.length === 0) return null;

  parsedSegmentsCache.set(canonical, segments);
  return cloneSegments(segments);
}

export function doesRouteMatchBundledGpx(
  filename: string | undefined,
  segments: Coordinate[][],
): boolean {
  const bundled = getBundledGpxSegments(filename);
  if (!bundled || bundled.length !== segments.length) return false;
  for (let i = 0; i < bundled.length; i++) {
    const a = bundled[i];
    const b = segments[i];
    if (!a || !b || a.length !== b.length) return false;
    if (a.length === 0) continue;
    const firstA = a[0];
    const firstB = b[0];
    const lastA = a[a.length - 1];
    const lastB = b[b.length - 1];
    if (
      Math.abs(firstA.lat - firstB.lat) > 1e-6 ||
      Math.abs(firstA.lon - firstB.lon) > 1e-6 ||
      Math.abs(lastA.lat - lastB.lat) > 1e-6 ||
      Math.abs(lastA.lon - lastB.lon) > 1e-6
    ) {
      return false;
    }
  }
  return true;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function serializeRouteToGpxXml(
  label: string,
  segments: Coordinate[][],
): string {
  const safeName = escapeXml(label.trim() || "Route");
  const segmentXml = segments
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      const pointsXml = segment
        .map(
          (point) => `      <trkpt lat="${point.lat}" lon="${point.lon}" />`,
        )
        .join("\n");
      return `    <trkseg>\n${pointsXml}\n    </trkseg>`;
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Terraink" xmlns="http://www.topografix.com/GPX/1/1">',
    "  <trk>",
    `    <name>${safeName}</name>`,
    segmentXml,
    "  </trk>",
    "</gpx>",
    "",
  ].join("\n");
}
