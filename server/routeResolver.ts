import dns from "node:dns/promises";
import net from "node:net";

export interface RouteCoordinate {
  lat: number;
  lon: number;
}

export interface RouteBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface RouteRequestPayload {
  label: string;
  activityType?: "road" | "trail";
  publicGpxOrGeoJsonUrl?: string;
  osmRelationSearch?: string;
  bbox?: {
    south: number;
    west: number;
    north: number;
    east: number;
  };
  waypoints?: Array<{
    lat: number;
    lon: number;
    name?: string;
  }>;
}

export interface ResolvedRouteOverlay {
  label: string;
  sourceFilename: string;
  segments: RouteCoordinate[][];
  bounds: RouteBounds;
  pointCount: number;
  sourceMethod: "gpx-url" | "osm-relation" | "street-routed" | "waypoints";
}

const FETCH_TIMEOUT_MS = 9000;
const MAX_DOWNLOAD_BYTES = 4 * 1024 * 1024;
const MAX_OUTPUT_POINTS = 2600;
const USER_AGENT = "Terraink/0.4.2 (aistudio-build route-resolver)";

function isValidLatLon(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -85.05 &&
    lat <= 85.05 &&
    lon >= -180 &&
    lon <= 180
  );
}

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateOrReservedIp(ip: string): boolean {
  const ipVersion = net.isIP(ip);
  if (ipVersion === 4) {
    return isPrivateOrReservedIpv4(ip);
  }
  if (ipVersion === 6) {
    const normalized = ip.toLowerCase();
    if (normalized === "::" || normalized === "::1") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    ) {
      return true;
    }
    if (normalized.startsWith("::ffff:")) {
      const suffix = normalized.slice(7);
      if (net.isIP(suffix) === 4) {
        return isPrivateOrReservedIpv4(suffix);
      }
      // Block hex-encoded IPv4-mapped IPv6 addresses defensively.
      return true;
    }
    return false;
  }
  return true;
}

async function validatePublicHttpsUrl(rawUrl: string): Promise<URL | null> {
  const trimmed = String(rawUrl ?? "").trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;

  const host = parsed.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    return null;
  }

  if (net.isIP(host)) {
    return isPrivateOrReservedIp(host) ? null : parsed;
  }

  try {
    const records = await dns.lookup(host, { all: true });
    if (!records || records.length === 0) return null;
    for (const record of records) {
      if (isPrivateOrReservedIp(record.address)) {
        return null;
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

async function fetchTextWithLimit(
  url: string,
  options: {
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
    maxBytes?: number;
    allowRedirects?: boolean;
  } = {},
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? FETCH_TIMEOUT_MS,
  );
  const maxBytes = options.maxBytes ?? MAX_DOWNLOAD_BYTES;

  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        "User-Agent": USER_AGENT,
        ...(options.headers ?? {}),
      },
      body: options.body,
      redirect: options.allowRedirects ? "follow" : "manual",
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader) {
      const len = Number(contentLengthHeader);
      if (Number.isFinite(len) && len > maxBytes) return null;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      const text = await response.text();
      return text.length <= maxBytes ? text : null;
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          controller.abort();
          return null;
        }
        chunks.push(value);
      }
    }

    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder("utf-8").decode(merged);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parseGpxTextToSegments(xml: string): RouteCoordinate[][] {
  const segments: RouteCoordinate[][] = [];

  const extractPoints = (chunk: string, tagName: string): RouteCoordinate[] => {
    const pts: RouteCoordinate[] = [];
    const tagRegex = new RegExp(`<${tagName}\\b([^>]*)>`, "gi");
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(chunk)) !== null) {
      const attrs = match[1];
      const latMatch = attrs.match(/\blat\s*=\s*["']([^"']+)["']/i);
      const lonMatch = attrs.match(/\blon\s*=\s*["']([^"']+)["']/i);
      if (!latMatch || !lonMatch) continue;
      const lat = Number(latMatch[1]);
      const lon = Number(lonMatch[1]);
      if (isValidLatLon(lat, lon)) {
        pts.push({ lat, lon });
      }
    }
    return pts;
  };

  const trksegRegex = /<trkseg\b[^>]*>([\s\S]*?)<\/trkseg>/gi;
  let segMatch: RegExpExecArray | null;
  while ((segMatch = trksegRegex.exec(xml)) !== null) {
    const pts = extractPoints(segMatch[1], "trkpt");
    if (pts.length >= 2) segments.push(pts);
  }

  if (segments.length === 0) {
    const rteRegex = /<rte\b[^>]*>([\s\S]*?)<\/rte>/gi;
    let rteMatch: RegExpExecArray | null;
    while ((rteMatch = rteRegex.exec(xml)) !== null) {
      const pts = extractPoints(rteMatch[1], "rtept");
      if (pts.length >= 2) segments.push(pts);
    }
  }

  if (segments.length === 0) {
    const fallbackPts = extractPoints(xml, "trkpt");
    if (fallbackPts.length >= 2) segments.push(fallbackPts);
  }

  return segments;
}

function parseGeoJsonToSegments(rawJson: string): RouteCoordinate[][] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return [];
  }

  const segments: RouteCoordinate[][] = [];

  const pushCoordArray = (coords: unknown) => {
    if (!Array.isArray(coords)) return;
    const pts: RouteCoordinate[] = [];
    for (const pair of coords) {
      if (!Array.isArray(pair) || pair.length < 2) continue;
      const lon = Number(pair[0]);
      const lat = Number(pair[1]);
      if (isValidLatLon(lat, lon)) {
        pts.push({ lat, lon });
      }
    }
    if (pts.length >= 2) segments.push(pts);
  };

  const visitGeometry = (geom: unknown) => {
    if (!geom || typeof geom !== "object") return;
    const g = geom as Record<string, unknown>;
    if (g.type === "LineString") {
      pushCoordArray(g.coordinates);
    } else if (g.type === "MultiLineString" && Array.isArray(g.coordinates)) {
      for (const line of g.coordinates) pushCoordArray(line);
    } else if (g.type === "GeometryCollection" && Array.isArray(g.geometries)) {
      for (const child of g.geometries) visitGeometry(child);
    } else if (g.type === "Feature") {
      visitGeometry(g.geometry);
    } else if (g.type === "FeatureCollection" && Array.isArray(g.features)) {
      for (const feat of g.features) visitGeometry(feat);
    }
  };

  visitGeometry(parsed);
  return segments;
}

async function tryFetchPublicGpxOrGeoJson(
  rawUrl: string,
): Promise<RouteCoordinate[][] | null> {
  const safeUrl = await validatePublicHttpsUrl(rawUrl);
  if (!safeUrl) return null;

  const text = await fetchTextWithLimit(safeUrl.toString(), {
    allowRedirects: false,
  });
  if (!text) return null;

  const trimmed = text.trim();
  if (trimmed.startsWith("<")) {
    const segs = parseGpxTextToSegments(trimmed);
    return segs.length > 0 ? segs : null;
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const segs = parseGeoJsonToSegments(trimmed);
    return segs.length > 0 ? segs : null;
  }
  return null;
}

function stitchAdjacentWays(ways: RouteCoordinate[][]): RouteCoordinate[][] {
  if (ways.length <= 1) return ways;

  const closeEnough = (a: RouteCoordinate, b: RouteCoordinate) =>
    Math.abs(a.lat - b.lat) < 0.00025 && Math.abs(a.lon - b.lon) < 0.00025;

  const remaining = ways.map((w) => [...w]).filter((w) => w.length >= 2);
  const stitched: RouteCoordinate[][] = [];

  while (remaining.length > 0) {
    let chain = remaining.shift()!;
    let extended = true;
    while (extended) {
      extended = false;
      const start = chain[0];
      const end = chain[chain.length - 1];
      for (let i = 0; i < remaining.length; i += 1) {
        const candidate = remaining[i];
        const cStart = candidate[0];
        const cEnd = candidate[candidate.length - 1];
        if (closeEnough(end, cStart)) {
          chain = chain.concat(candidate.slice(1));
          remaining.splice(i, 1);
          extended = true;
          break;
        }
        if (closeEnough(end, cEnd)) {
          chain = chain.concat([...candidate].reverse().slice(1));
          remaining.splice(i, 1);
          extended = true;
          break;
        }
        if (closeEnough(start, cEnd)) {
          chain = candidate.concat(chain.slice(1));
          remaining.splice(i, 1);
          extended = true;
          break;
        }
        if (closeEnough(start, cStart)) {
          chain = [...candidate].reverse().concat(chain.slice(1));
          remaining.splice(i, 1);
          extended = true;
          break;
        }
      }
    }
    stitched.push(chain);
  }

  return stitched;
}

async function tryFetchOsmRelation(
  relationName: string,
  bbox?: RouteRequestPayload["bbox"],
): Promise<RouteCoordinate[][] | null> {
  const sanitizedName = String(relationName ?? "")
    .replace(/[^a-zA-Z0-9\s\-']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

  if (sanitizedName.length < 3) return null;

  let bboxClause = "";
  if (
    bbox &&
    isValidLatLon(bbox.south, bbox.west) &&
    isValidLatLon(bbox.north, bbox.east) &&
    bbox.south < bbox.north &&
    bbox.west < bbox.east &&
    bbox.north - bbox.south <= 8 &&
    bbox.east - bbox.west <= 8
  ) {
    bboxClause = `(${bbox.south.toFixed(4)},${bbox.west.toFixed(4)},${bbox.north.toFixed(4)},${bbox.east.toFixed(4)})`;
  } else {
    // Always require a bounded region so Overpass queries stay fast and targeted.
    return null;
  }

  const escapedRegex = sanitizedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const query = `[out:json][timeout:10];relation["type"="route"]["name"~"${escapedRegex}",i]${bboxClause};out geom;`;

  const body = `data=${encodeURIComponent(query)}`;
  const raw = await fetchTextWithLimit(
    "https://overpass-api.de/api/interpreter",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      timeoutMs: 10000,
    },
  );
  if (!raw) return null;

  let parsed: {
    elements?: Array<{
      type?: string;
      tags?: Record<string, string>;
      members?: Array<{
        type?: string;
        role?: string;
        geometry?: Array<{ lat: number; lon: number }>;
      }>;
    }>;
  };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const relations = (parsed.elements ?? []).filter(
    (el) => el.type === "relation" && Array.isArray(el.members),
  );
  if (relations.length === 0) return null;

  // Prefer the relation whose members provide the most way geometry points.
  let bestWays: RouteCoordinate[][] = [];
  let bestPointCount = 0;

  for (const rel of relations) {
    const ways: RouteCoordinate[][] = [];
    let count = 0;
    for (const member of rel.members ?? []) {
      if (member.type !== "way" || !Array.isArray(member.geometry)) continue;
      if (
        member.role &&
        /^(side_branch|approach|excursion|alternative)$/i.test(member.role)
      ) {
        continue;
      }
      const pts: RouteCoordinate[] = [];
      for (const node of member.geometry) {
        if (isValidLatLon(node.lat, node.lon)) {
          pts.push({ lat: node.lat, lon: node.lon });
        }
      }
      if (pts.length >= 2) {
        ways.push(pts);
        count += pts.length;
      }
    }
    if (count > bestPointCount) {
      bestPointCount = count;
      bestWays = ways;
    }
  }

  if (bestWays.length === 0 || bestPointCount < 10) return null;
  return stitchAdjacentWays(bestWays);
}

async function routeWaypointsWithOsrm(
  waypoints: RouteCoordinate[],
  profile: "foot" | "driving",
): Promise<RouteCoordinate[][] | null> {
  if (waypoints.length < 2) return null;

  const baseEndpoint =
    profile === "foot"
      ? "https://routing.openstreetmap.de/routed-foot/route/v1/foot"
      : "https://router.project-osrm.org/route/v1/driving";

  // Chunk into overlapping batches of 20 coordinates so OSRM URLs stay concise.
  const CHUNK_SIZE = 20;
  const fullTrack: RouteCoordinate[] = [];

  for (let start = 0; start < waypoints.length - 1; start += CHUNK_SIZE - 1) {
    const chunk = waypoints.slice(start, start + CHUNK_SIZE);
    if (chunk.length < 2) break;

    const coordParam = chunk
      .map((pt) => `${pt.lon.toFixed(6)},${pt.lat.toFixed(6)}`)
      .join(";");
    const url = `${baseEndpoint}/${coordParam}?overview=full&geometries=geojson&continue_straight=true`;

    const raw = await fetchTextWithLimit(url, { timeoutMs: 8500 });
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as {
        code?: string;
        routes?: Array<{
          geometry?: {
            type?: string;
            coordinates?: Array<[number, number]>;
          };
        }>;
      };
      const coords = parsed.routes?.[0]?.geometry?.coordinates;
      if (parsed.code !== "Ok" || !Array.isArray(coords) || coords.length < 2) {
        return null;
      }
      const chunkPts: RouteCoordinate[] = [];
      for (const pair of coords) {
        const lon = Number(pair[0]);
        const lat = Number(pair[1]);
        if (isValidLatLon(lat, lon)) {
          chunkPts.push({ lat, lon });
        }
      }
      if (chunkPts.length < 2) return null;
      if (fullTrack.length === 0) {
        fullTrack.push(...chunkPts);
      } else {
        fullTrack.push(...chunkPts.slice(1));
      }
    } catch {
      return null;
    }
  }

  return fullTrack.length >= 2 ? [fullTrack] : null;
}

function downsampleSegments(
  segments: RouteCoordinate[][],
  maxPoints = MAX_OUTPUT_POINTS,
): RouteCoordinate[][] {
  const totalPoints = segments.reduce((sum, seg) => sum + seg.length, 0);
  if (totalPoints <= maxPoints) return segments;

  const stride = Math.ceil(totalPoints / maxPoints);
  return segments.map((seg) => {
    if (seg.length <= 2) return seg;
    const sampled: RouteCoordinate[] = [seg[0]];
    for (let i = stride; i < seg.length - 1; i += stride) {
      sampled.push(seg[i]);
    }
    sampled.push(seg[seg.length - 1]);
    return sampled;
  });
}

function computeBounds(segments: RouteCoordinate[][]): RouteBounds | null {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  for (const seg of segments) {
    for (const pt of seg) {
      if (pt.lat < minLat) minLat = pt.lat;
      if (pt.lat > maxLat) maxLat = pt.lat;
      if (pt.lon < minLon) minLon = pt.lon;
      if (pt.lon > maxLon) maxLon = pt.lon;
    }
  }

  if (
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLat) ||
    !Number.isFinite(minLon) ||
    !Number.isFinite(maxLon)
  ) {
    return null;
  }

  return { minLat, maxLat, minLon, maxLon };
}

function slugifyGpxFilename(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return `${slug || "ai-route"}.gpx`;
}

export async function resolveRouteRequest(
  request: RouteRequestPayload,
): Promise<ResolvedRouteOverlay | null> {
  const label = String(request.label ?? "").trim().slice(0, 80) || "Course Route";
  const sourceFilename = slugifyGpxFilename(label);

  const validWaypoints: RouteCoordinate[] = Array.isArray(request.waypoints)
    ? request.waypoints
        .map((wp) => ({
          lat: Number(wp?.lat),
          lon: Number(wp?.lon),
        }))
        .filter((wp) => isValidLatLon(wp.lat, wp.lon))
        .slice(0, 60)
    : [];

  let segments: RouteCoordinate[][] | null = null;
  let sourceMethod: ResolvedRouteOverlay["sourceMethod"] = "waypoints";

  // 1. Try direct public GPX or GeoJSON file URL if Gemini found one.
  if (request.publicGpxOrGeoJsonUrl) {
    const downloaded = await tryFetchPublicGpxOrGeoJson(
      request.publicGpxOrGeoJsonUrl,
    );
    if (downloaded && downloaded.length > 0) {
      segments = downloaded;
      sourceMethod = "gpx-url";
    }
  }

  // 2. Try OpenStreetMap route relation via Overpass (especially great for trails & mapped courses).
  if (!segments && request.osmRelationSearch) {
    const derivedBbox =
      request.bbox ??
      (() => {
        if (validWaypoints.length < 2) return undefined;
        const b = computeBounds([validWaypoints]);
        if (!b) return undefined;
        return {
          south: b.minLat - 0.15,
          west: b.minLon - 0.15,
          north: b.maxLat + 0.15,
          east: b.maxLon + 0.15,
        };
      })();

    const osmSegments = await tryFetchOsmRelation(
      request.osmRelationSearch,
      derivedBbox,
    );
    if (osmSegments && osmSegments.length > 0) {
      segments = osmSegments;
      sourceMethod = "osm-relation";
    }
  }

  // 3. Snap researched turn-by-turn waypoints along real streets/paths via OSRM.
  if (!segments && validWaypoints.length >= 2) {
    const routed =
      (await routeWaypointsWithOsrm(validWaypoints, "foot")) ??
      (await routeWaypointsWithOsrm(validWaypoints, "driving"));

    if (routed && routed.length > 0) {
      segments = routed;
      sourceMethod = "street-routed";
    } else {
      segments = [validWaypoints];
      sourceMethod = "waypoints";
    }
  }

  if (!segments || segments.length === 0) {
    return null;
  }

  const compacted = downsampleSegments(segments);
  const bounds = computeBounds(compacted);
  if (!bounds) return null;

  const pointCount = compacted.reduce((sum, seg) => sum + seg.length, 0);
  if (pointCount < 2) return null;

  return {
    label,
    sourceFilename,
    segments: compacted,
    bounds,
    pointCount,
    sourceMethod,
  };
}
