import { haversineMeters } from "@/shared/geo/math";
import {
  DEFAULT_ROUTE_OVERLAP_SPACING,
  MAX_ROUTE_OVERLAP_SPACING,
  MIN_ROUTE_OVERLAP_SPACING,
} from "../domain/constants";
import type { Route } from "../domain/types";
import { resolveRouteOutline, resolveRouteOutline2 } from "./helpers";

export type RoutePointProjector = (
  lat: number,
  lon: number,
) => { x: number; y: number } | null;

export interface ProjectedRouteVertex {
  x: number;
  y: number;
  cumMeters: number;
}

export interface ProjectedRouteGeometry {
  segments: ProjectedRouteVertex[][];
  startPoint: { x: number; y: number } | null;
  finishPoint: { x: number; y: number } | null;
  pointAtDistance: (meters: number) => { x: number; y: number } | null;
  approachBeforeFinish: (
    minDistancePx: number,
  ) => { x: number; y: number } | null;
}

interface ResampledPoint {
  x: number;
  y: number;
  cumMeters: number;
  arcPx: number;
  segmentIdx: number;
  localIdx: number;
}

interface CacheEntry {
  widthScale: number;
  p0x: number;
  p0y: number;
  relMidX: number;
  relMidY: number;
  relEndX: number;
  relEndY: number;
  geometry: ProjectedRouteGeometry;
}

const geometryCache = new WeakMap<Route, CacheEntry>();

const MAX_RESAMPLED_POINTS = 7500;
const PARALLEL_COS_THRESHOLD = 0.82; // ~35 deg tolerance for parallel corridors

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function resolveOverlapSpacingPx(
  route: Route,
  widthScale: number,
): number {
  const width = Math.max(0.5, route.strokeWidth * widthScale);
  const outline = resolveRouteOutline(route);
  const outline2 = resolveRouteOutline2(route);
  const o1 =
    outline.enabled && outline.width > 0 ? outline.width * widthScale : 0;
  const o2 = outline2.active ? outline2.width * widthScale : 0;

  // When Outline 2 is active, spacing passes by (W + 2*O1 + O2) separates both
  // passes' Course + Outline 1 completely by an O2-wide seam while allowing both
  // passes' Outline 2 strokes to overlap cleanly down the center and exterior.
  // When Outline 2 is off, add a crisp subtle gap so Outline 1 edges stay distinct.
  const autoSpacing =
    o2 > 0
      ? width + 2 * o1 + o2
      : width + 2 * o1 + Math.max(1.5 * widthScale, width * 0.25);

  const fineTuneRaw =
    typeof route.overlapSpacing === "number" &&
    Number.isFinite(route.overlapSpacing)
      ? clampValue(
          route.overlapSpacing,
          MIN_ROUTE_OVERLAP_SPACING,
          MAX_ROUTE_OVERLAP_SPACING,
        )
      : DEFAULT_ROUTE_OVERLAP_SPACING;

  const fineTunePx = fineTuneRaw * widthScale;
  return Math.max(width * 0.6, autoSpacing + fineTunePx);
}

function buildGeometryAccessor(
  segments: ProjectedRouteVertex[][],
): ProjectedRouteGeometry {
  let startPoint: { x: number; y: number } | null = null;
  let finishPoint: { x: number; y: number } | null = null;

  for (const seg of segments) {
    if (seg.length === 0) continue;
    if (!startPoint) {
      startPoint = { x: seg[0]!.x, y: seg[0]!.y };
    }
    const last = seg[seg.length - 1]!;
    finishPoint = { x: last.x, y: last.y };
  }

  const pointAtDistance = (targetMeters: number): { x: number; y: number } | null => {
    if (!Number.isFinite(targetMeters)) return null;
    if (targetMeters <= 0) return startPoint;

    for (const seg of segments) {
      if (seg.length === 0) continue;
      const first = seg[0]!;
      const last = seg[seg.length - 1]!;
      if (targetMeters < first.cumMeters) {
        return { x: first.x, y: first.y };
      }
      if (targetMeters > last.cumMeters) continue;

      // Binary search within segment
      let lo = 0;
      let hi = seg.length - 1;
      while (lo + 1 < hi) {
        const mid = (lo + hi) >> 1;
        if (seg[mid]!.cumMeters <= targetMeters) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      const a = seg[lo]!;
      const b = seg[hi]!;
      const span = b.cumMeters - a.cumMeters;
      if (span <= 1e-6) {
        return { x: a.x, y: a.y };
      }
      const t = clampValue((targetMeters - a.cumMeters) / span, 0, 1);
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      };
    }

    return finishPoint;
  };

  const approachBeforeFinish = (
    minDistancePx: number,
  ): { x: number; y: number } | null => {
    if (!finishPoint) return null;
    let fallback: { x: number; y: number } | null = null;
    for (let s = segments.length - 1; s >= 0; s -= 1) {
      const seg = segments[s]!;
      for (let i = seg.length - 1; i >= 0; i -= 1) {
        const pt = seg[i]!;
        const d = Math.hypot(finishPoint.x - pt.x, finishPoint.y - pt.y);
        if (d > 0.25) {
          fallback = { x: pt.x, y: pt.y };
          if (d >= minDistancePx) {
            return fallback;
          }
        }
      }
    }
    return fallback;
  };

  return {
    segments,
    startPoint,
    finishPoint,
    pointAtDistance,
    approachBeforeFinish,
  };
}

function translateGeometry(
  geom: ProjectedRouteGeometry,
  dx: number,
  dy: number,
): ProjectedRouteGeometry {
  if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) return geom;
  const translatedSegments = geom.segments.map((seg) =>
    seg.map((pt) => ({
      x: pt.x + dx,
      y: pt.y + dy,
      cumMeters: pt.cumMeters,
    })),
  );
  return buildGeometryAccessor(translatedSegments);
}

function getRouteAnchors(route: Route): {
  first: { lat: number; lon: number };
  mid: { lat: number; lon: number };
  last: { lat: number; lon: number };
} | null {
  const flat: { lat: number; lon: number }[] = [];
  for (const seg of route.segments) {
    for (const pt of seg) {
      flat.push(pt);
    }
  }
  if (flat.length === 0) return null;
  return {
    first: flat[0]!,
    mid: flat[flat.length >> 1]!,
    last: flat[flat.length - 1]!,
  };
}

function projectRawSegments(
  route: Route,
  project: RoutePointProjector,
): ProjectedRouteVertex[][] {
  const result: ProjectedRouteVertex[][] = [];
  let cumMeters = 0;

  for (const seg of route.segments) {
    if (seg.length === 0) continue;
    let current: ProjectedRouteVertex[] = [];

    for (let i = 0; i < seg.length; i += 1) {
      const pt = seg[i]!;
      if (i > 0) {
        const d = haversineMeters(seg[i - 1]!, pt);
        if (Number.isFinite(d) && d > 0) {
          cumMeters += d;
        }
      }
      const projected = project(pt.lat, pt.lon);
      if (!projected || !Number.isFinite(projected.x) || !Number.isFinite(projected.y)) {
        if (current.length >= 2) {
          result.push(current);
        }
        current = [];
        continue;
      }
      current.push({
        x: projected.x,
        y: projected.y,
        cumMeters,
      });
    }

    if (current.length >= 2) {
      result.push(current);
    }
  }

  return result;
}

function computeSeparatedSegments(
  rawSegments: ProjectedRouteVertex[][],
  targetSpacing: number,
  widthScale: number,
): ProjectedRouteVertex[][] {
  if (rawSegments.length === 0 || targetSpacing <= 0.1) {
    return rawSegments;
  }

  // 1. Measure total projected pixel length to select an adaptive resampling step
  let totalProjectedPx = 0;
  for (const seg of rawSegments) {
    for (let i = 1; i < seg.length; i += 1) {
      totalProjectedPx += Math.hypot(
        seg[i]!.x - seg[i - 1]!.x,
        seg[i]!.y - seg[i - 1]!.y,
      );
    }
  }
  if (totalProjectedPx < targetSpacing * 2) {
    return rawSegments;
  }

  let stepPx = clampValue(targetSpacing * 0.55, 3, 10);
  if (totalProjectedPx / stepPx > MAX_RESAMPLED_POINTS) {
    stepPx = totalProjectedPx / MAX_RESAMPLED_POINTS;
  }
  const minSamplePx = Math.max(1.2, stepPx * 0.28);

  // 2. Resample segments uniformly in projected pixel space while preserving exact cumMeters
  const resampledSegments: ResampledPoint[][] = [];
  const allPoints: ResampledPoint[] = [];
  let globalArcPx = 0;

  for (let s = 0; s < rawSegments.length; s += 1) {
    const raw = rawSegments[s]!;
    if (raw.length < 2) continue;

    const segPts: ResampledPoint[] = [];
    const first = raw[0]!;
    const startPt: ResampledPoint = {
      x: first.x,
      y: first.y,
      cumMeters: first.cumMeters,
      arcPx: globalArcPx,
      segmentIdx: resampledSegments.length,
      localIdx: 0,
    };
    segPts.push(startPt);
    allPoints.push(startPt);

    let lastEmitted = startPt;

    for (let i = 1; i < raw.length; i += 1) {
      const a = raw[i - 1]!;
      const b = raw[i]!;
      const edgeLen = Math.hypot(b.x - a.x, b.y - a.y);
      const isLastVertex = i === raw.length - 1;

      if (edgeLen < 1e-4) continue;

      if (edgeLen > stepPx) {
        const steps = Math.ceil(edgeLen / stepPx);
        for (let k = 1; k <= steps; k += 1) {
          const t = k / steps;
          const nx = a.x + (b.x - a.x) * t;
          const ny = a.y + (b.y - a.y) * t;
          const nMeters = a.cumMeters + (b.cumMeters - a.cumMeters) * t;
          const dFromLast = Math.hypot(nx - lastEmitted.x, ny - lastEmitted.y);
          if (dFromLast < minSamplePx && !(isLastVertex && k === steps)) {
            continue;
          }
          globalArcPx += dFromLast;
          const pt: ResampledPoint = {
            x: nx,
            y: ny,
            cumMeters: nMeters,
            arcPx: globalArcPx,
            segmentIdx: resampledSegments.length,
            localIdx: segPts.length,
          };
          segPts.push(pt);
          allPoints.push(pt);
          lastEmitted = pt;
        }
      } else {
        const dFromLast = Math.hypot(b.x - lastEmitted.x, b.y - lastEmitted.y);
        if (dFromLast >= minSamplePx || isLastVertex) {
          globalArcPx += dFromLast;
          const pt: ResampledPoint = {
            x: b.x,
            y: b.y,
            cumMeters: b.cumMeters,
            arcPx: globalArcPx,
            segmentIdx: resampledSegments.length,
            localIdx: segPts.length,
          };
          segPts.push(pt);
          allPoints.push(pt);
          lastEmitted = pt;
        }
      }
    }

    if (segPts.length >= 2) {
      resampledSegments.push(segPts);
      // Add a small virtual arc gap between disconnected GPX track segments
      globalArcPx += Math.max(targetSpacing * 5, 50 * widthScale);
    }
  }

  const n = allPoints.length;
  if (n < 4) return rawSegments;

  // 3. Compute smoothed unit tangents per sample along each segment
  const tangentWindowPx = Math.max(8 * widthScale, targetSpacing * 1.1);
  const tx = new Float64Array(n);
  const ty = new Float64Array(n);

  let flatOffset = 0;
  for (const seg of resampledSegments) {
    const m = seg.length;
    for (let i = 0; i < m; i += 1) {
      const centerArc = seg[i]!.arcPx;
      let back = i;
      while (back > 0 && centerArc - seg[back]!.arcPx < tangentWindowPx) {
        back -= 1;
      }
      let fwd = i;
      while (fwd < m - 1 && seg[fwd]!.arcPx - centerArc < tangentWindowPx) {
        fwd += 1;
      }
      let dx = seg[fwd]!.x - seg[back]!.x;
      let dy = seg[fwd]!.y - seg[back]!.y;
      let len = Math.hypot(dx, dy);
      if (len < 1e-4) {
        const prev = seg[Math.max(0, i - 1)]!;
        const next = seg[Math.min(m - 1, i + 1)]!;
        dx = next.x - prev.x;
        dy = next.y - prev.y;
        len = Math.hypot(dx, dy);
      }
      const idx = flatOffset + i;
      if (len >= 1e-4) {
        tx[idx] = dx / len;
        ty[idx] = dy / len;
      } else {
        tx[idx] = 1;
        ty[idx] = 0;
      }
    }
    flatOffset += m;
  }

  // 4. Spatial hash grid for fast O(N) parallel corridor lookup
  const detectRadius = targetSpacing * 1.02;
  const detectRadiusSq = detectRadius * detectRadius;
  const cellSize = Math.max(4, detectRadius);
  const invCellSize = 1 / cellSize;

  const grid = new Map<string, number[]>();
  for (let i = 0; i < n; i += 1) {
    const pt = allPoints[i]!;
    const cx = Math.floor(pt.x * invCellSize);
    const cy = Math.floor(pt.y * invCellSize);
    const key = `${cx},${cy}`;
    const bucket = grid.get(key);
    if (bucket) {
      bucket.push(i);
    } else {
      grid.set(key, [i]);
    }
  }

  const minOppositeArcSepPx = Math.max(targetSpacing * 2.0, 14 * widthScale);
  const minSameDirArcSepPx = Math.max(targetSpacing * 4.5, 36 * widthScale);
  const passClusterArcPx = Math.max(targetSpacing * 2.0, 16 * widthScale);

  const rawOffX = new Float64Array(n);
  const rawOffY = new Float64Array(n);
  const hasOverlap = new Uint8Array(n);

  // 5. For each sample, cluster parallel same-route passes and compute symmetric centerline shift
  for (let i = 0; i < n; i += 1) {
    const pi = allPoints[i]!;
    const cx = Math.floor(pi.x * invCellSize);
    const cy = Math.floor(pi.y * invCellSize);
    const tix = tx[i]!;
    const tiy = ty[i]!;

    const candidates: number[] = [i];

    for (let gx = cx - 1; gx <= cx + 1; gx += 1) {
      for (let gy = cy - 1; gy <= cy + 1; gy += 1) {
        const bucket = grid.get(`${gx},${gy}`);
        if (!bucket) continue;
        for (let b = 0; b < bucket.length; b += 1) {
          const j = bucket[b]!;
          if (j === i) continue;
          const pj = allPoints[j]!;
          const dx = pj.x - pi.x;
          const dy = pj.y - pi.y;
          const distSq = dx * dx + dy * dy;
          if (distSq > detectRadiusSq) continue;

          const dot = tix * tx[j]! + tiy * ty[j]!;
          const absDot = Math.abs(dot);
          if (absDot < PARALLEL_COS_THRESHOLD) continue;

          const arcDiff = Math.abs(pj.arcPx - pi.arcPx);
          const minArcSep = dot < 0 ? minOppositeArcSepPx : minSameDirArcSepPx;
          if (arcDiff < minArcSep) continue;

          candidates.push(j);
        }
      }
    }

    if (candidates.length < 2) continue;

    // Sort candidates chronologically along route arc-length and group into distinct passes
    candidates.sort((a, b) => allPoints[a]!.arcPx - allPoints[b]!.arcPx);

    const passReps: number[] = [];
    let bestInPass = candidates[0]!;
    let bestDistSq =
      bestInPass === i
        ? -1
        : (allPoints[bestInPass]!.x - pi.x) ** 2 +
          (allPoints[bestInPass]!.y - pi.y) ** 2;
    let passLastArc = allPoints[bestInPass]!.arcPx;

    for (let c = 1; c < candidates.length; c += 1) {
      const idx = candidates[c]!;
      const arc = allPoints[idx]!.arcPx;
      if (arc - passLastArc <= passClusterArcPx) {
        const dSq =
          idx === i
            ? -1
            : (allPoints[idx]!.x - pi.x) ** 2 + (allPoints[idx]!.y - pi.y) ** 2;
        if (dSq < bestDistSq) {
          bestInPass = idx;
          bestDistSq = dSq;
        }
        passLastArc = arc;
      } else {
        passReps.push(bestInPass);
        bestInPass = idx;
        bestDistSq =
          idx === i
            ? -1
            : (allPoints[idx]!.x - pi.x) ** 2 + (allPoints[idx]!.y - pi.y) ** 2;
        passLastArc = arc;
      }
    }
    passReps.push(bestInPass);

    const k = passReps.length;
    if (k < 2) continue;

    const myRank = passReps.indexOf(i);
    if (myRank < 0) continue;

    // Canonical corridor normal: right-hand side of earliest pass p_0.
    // In screen coordinates (x right, y down), right-hand normal of (tx, ty) is (-ty, tx).
    const firstPassIdx = passReps[0]!;
    const nx = -ty[firstPassIdx]!;
    const ny = tx[firstPassIdx]!;

    // Compute corridor centerline across all k passes
    let sumX = 0;
    let sumY = 0;
    for (let m = 0; m < k; m += 1) {
      const rep = allPoints[passReps[m]!]!;
      sumX += rep.x;
      sumY += rep.y;
    }
    const centerX = sumX / k;
    const centerY = sumY / k;

    // Symmetric lane coordinate around the corridor centerline
    const currentLateral = (pi.x - centerX) * nx + (pi.y - centerY) * ny;
    const desiredLateral = ((k - 1) / 2 - myRank) * targetSpacing;
    const shiftAlongNormal = desiredLateral - currentLateral;

    // Guard against huge jumps when a wide loop briefly grazes detectRadius
    const maxShift = targetSpacing * ((k - 1) * 0.5 + 0.65);
    const clampedShift = clampValue(shiftAlongNormal, -maxShift, maxShift);

    rawOffX[i] = nx * clampedShift;
    rawOffY[i] = ny * clampedShift;
    hasOverlap[i] = 1;
  }

  // 6. Suppress tiny isolated overlap flecks shorter than minCorridorPx
  const minCorridorPx = Math.max(targetSpacing * 1.2, 8 * widthScale);
  flatOffset = 0;
  for (const seg of resampledSegments) {
    const m = seg.length;
    let runStart = -1;
    for (let i = 0; i <= m; i += 1) {
      const active = i < m && hasOverlap[flatOffset + i] === 1;
      if (active && runStart === -1) {
        runStart = i;
      } else if (!active && runStart !== -1) {
        const runEnd = i - 1;
        const runLenPx = seg[runEnd]!.arcPx - seg[runStart]!.arcPx;
        if (runLenPx < minCorridorPx) {
          for (let r = runStart; r <= runEnd; r += 1) {
            const idx = flatOffset + r;
            hasOverlap[idx] = 0;
            rawOffX[idx] = 0;
            rawOffY[idx] = 0;
          }
        }
        runStart = -1;
      }
    }
    flatOffset += m;
  }

  // Quick exit if no overlap was found anywhere along the route
  let anyOverlap = false;
  for (let i = 0; i < n; i += 1) {
    if (hasOverlap[i] === 1) {
      anyOverlap = true;
      break;
    }
  }
  if (!anyOverlap) {
    return rawSegments;
  }

  // 7. Feather slightly into aligned non-overlapping approach edges so that
  //    Gaussian smoothing reaches full separation right at the corridor boundary,
  //    then apply arc-length Gaussian smoothing for gradual, kink-free ramps.
  const smoothRadiusPx = Math.max(targetSpacing * 2.4, 16 * widthScale);
  const featherLeadPx = smoothRadiusPx * 0.4;
  const sigma = smoothRadiusPx * 0.45;
  const invTwoSigmaSq = 1 / (2 * sigma * sigma);

  const preSmoothX = new Float64Array(rawOffX);
  const preSmoothY = new Float64Array(rawOffY);
  const featherBestWeight = new Float64Array(n);

  flatOffset = 0;
  for (const seg of resampledSegments) {
    const m = seg.length;

    // Feather outward from overlap run boundaries into aligned approach points
    for (let i = 0; i < m; i += 1) {
      const idx = flatOffset + i;
      if (hasOverlap[idx] === 0) continue;

      // Start boundary of an overlap run -> feather backward
      if (i > 0 && hasOverlap[idx - 1] === 0) {
        const edgeOx = rawOffX[idx]!;
        const edgeOy = rawOffY[idx]!;
        const edgeTx = tx[idx]!;
        const edgeTy = ty[idx]!;
        const boundaryArc = seg[i]!.arcPx;
        for (let b = i - 1; b >= 0; b -= 1) {
          const bIdx = flatOffset + b;
          if (hasOverlap[bIdx] === 1) break;
          const dist = boundaryArc - seg[b]!.arcPx;
          if (dist > featherLeadPx) break;
          const align = edgeTx * tx[bIdx]! + edgeTy * ty[bIdx]!;
          if (align < 0.5) break;
          const weight = 1 - dist / featherLeadPx;
          if (weight > featherBestWeight[bIdx]!) {
            featherBestWeight[bIdx] = weight;
            preSmoothX[bIdx] = edgeOx * weight;
            preSmoothY[bIdx] = edgeOy * weight;
          }
        }
      }

      // End boundary of an overlap run -> feather forward
      if (i < m - 1 && hasOverlap[idx + 1] === 0) {
        const edgeOx = rawOffX[idx]!;
        const edgeOy = rawOffY[idx]!;
        const edgeTx = tx[idx]!;
        const edgeTy = ty[idx]!;
        const boundaryArc = seg[i]!.arcPx;
        for (let f = i + 1; f < m; f += 1) {
          const fIdx = flatOffset + f;
          if (hasOverlap[fIdx] === 1) break;
          const dist = seg[f]!.arcPx - boundaryArc;
          if (dist > featherLeadPx) break;
          const align = edgeTx * tx[fIdx]! + edgeTy * ty[fIdx]!;
          if (align < 0.5) break;
          const weight = 1 - dist / featherLeadPx;
          if (weight > featherBestWeight[fIdx]!) {
            featherBestWeight[fIdx] = weight;
            preSmoothX[fIdx] = edgeOx * weight;
            preSmoothY[fIdx] = edgeOy * weight;
          }
        }
      }
    }

    flatOffset += m;
  }

  // Gaussian smoothing pass along arc-length (symmetric endpoint normalization)
  const smoothX = new Float64Array(n);
  const smoothY = new Float64Array(n);

  flatOffset = 0;
  for (const seg of resampledSegments) {
    const m = seg.length;
    for (let i = 0; i < m; i += 1) {
      const centerArc = seg[i]!.arcPx;
      let sumW = 0;
      let sumOx = 0;
      let sumOy = 0;

      for (let j = i; j >= 0; j -= 1) {
        const d = centerArc - seg[j]!.arcPx;
        if (d > smoothRadiusPx) break;
        const w = Math.exp(-(d * d) * invTwoSigmaSq);
        const jIdx = flatOffset + j;
        sumW += w;
        sumOx += preSmoothX[jIdx]! * w;
        sumOy += preSmoothY[jIdx]! * w;
      }

      for (let j = i + 1; j < m; j += 1) {
        const d = seg[j]!.arcPx - centerArc;
        if (d > smoothRadiusPx) break;
        const w = Math.exp(-(d * d) * invTwoSigmaSq);
        const jIdx = flatOffset + j;
        sumW += w;
        sumOx += preSmoothX[jIdx]! * w;
        sumOy += preSmoothY[jIdx]! * w;
      }

      const idx = flatOffset + i;
      if (sumW > 0) {
        smoothX[idx] = sumOx / sumW;
        smoothY[idx] = sumOy / sumW;
      }
    }
    flatOffset += m;
  }

  // 8. Build final shifted projected polylines
  const outputSegments: ProjectedRouteVertex[][] = [];
  flatOffset = 0;
  for (const seg of resampledSegments) {
    const m = seg.length;
    const out: ProjectedRouteVertex[] = new Array(m);
    for (let i = 0; i < m; i += 1) {
      const pt = seg[i]!;
      const idx = flatOffset + i;
      out[i] = {
        x: pt.x + smoothX[idx]!,
        y: pt.y + smoothY[idx]!,
        cumMeters: pt.cumMeters,
      };
    }
    outputSegments.push(out);
    flatOffset += m;
  }

  return outputSegments;
}

/**
 * Projects a route into 2D pixel space and, when `route.separateOverlaps` is
 * enabled, smoothly separates parallel same-route overlapping corridors
 * symmetrically around their shared centerline.
 *
 * Results are cached per immutable Route reference with translation-only fast
 * path so live preview canvas rendering and marker overlays share the exact
 * same shifted geometry at 60fps.
 */
export function resolveProjectedRouteGeometry(
  route: Route,
  project: RoutePointProjector,
  widthScale = 1,
): ProjectedRouteGeometry {
  if (!route.separateOverlaps) {
    return buildGeometryAccessor(projectRawSegments(route, project));
  }

  const anchors = getRouteAnchors(route);
  const p0 = anchors ? project(anchors.first.lat, anchors.first.lon) : null;
  const pMid = anchors ? project(anchors.mid.lat, anchors.mid.lon) : null;
  const pEnd = anchors ? project(anchors.last.lat, anchors.last.lon) : null;

  if (p0 && pMid && pEnd) {
    const relMidX = pMid.x - p0.x;
    const relMidY = pMid.y - p0.y;
    const relEndX = pEnd.x - p0.x;
    const relEndY = pEnd.y - p0.y;

    const cached = geometryCache.get(route);
    if (
      cached &&
      Math.abs(cached.widthScale - widthScale) < 1e-4 &&
      Math.abs(cached.relMidX - relMidX) < 0.05 &&
      Math.abs(cached.relMidY - relMidY) < 0.05 &&
      Math.abs(cached.relEndX - relEndX) < 0.05 &&
      Math.abs(cached.relEndY - relEndY) < 0.05
    ) {
      return translateGeometry(
        cached.geometry,
        p0.x - cached.p0x,
        p0.y - cached.p0y,
      );
    }

    const rawSegments = projectRawSegments(route, project);
    const targetSpacing = resolveOverlapSpacingPx(route, widthScale);
    const separatedSegments = computeSeparatedSegments(
      rawSegments,
      targetSpacing,
      widthScale,
    );
    const geometry = buildGeometryAccessor(separatedSegments);

    geometryCache.set(route, {
      widthScale,
      p0x: p0.x,
      p0y: p0.y,
      relMidX,
      relMidY,
      relEndX,
      relEndY,
      geometry,
    });

    return geometry;
  }

  const rawSegments = projectRawSegments(route, project);
  const targetSpacing = resolveOverlapSpacingPx(route, widthScale);
  const separatedSegments = computeSeparatedSegments(
    rawSegments,
    targetSpacing,
    widthScale,
  );
  return buildGeometryAccessor(separatedSegments);
}
