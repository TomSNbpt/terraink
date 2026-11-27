import type { MarkerProjectionInput } from "@/features/markers/domain/types";
import { projectMarkerToCanvas } from "@/features/markers/infrastructure/projection";
import { ROUTE_DASH_PATTERN } from "../domain/constants";
import type { Route } from "../domain/types";
import { resolveRouteOutline, resolveRouteOutline2 } from "./helpers";
import {
  resolveProjectedRouteGeometry,
  type ProjectedRouteVertex,
  type RoutePointProjector,
} from "./overlapSeparation";

export type { RoutePointProjector };

interface DrawOptions {
  widthScale?: number;
}

function strokeProjectedSegments(
  ctx: CanvasRenderingContext2D,
  segments: ProjectedRouteVertex[][],
): void {
  for (const segment of segments) {
    if (segment.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(segment[0]!.x, segment[0]!.y);
    for (let i = 1; i < segment.length; i += 1) {
      ctx.lineTo(segment[i]!.x, segment[i]!.y);
    }
    ctx.stroke();
  }
}

export function drawRoutesWithProjector(
  ctx: CanvasRenderingContext2D,
  routes: Route[],
  project: RoutePointProjector,
  { widthScale = 1 }: DrawOptions = {},
): void {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const route of routes) {
    if (!route.visible || route.segments.length === 0) continue;

    const { segments } = resolveProjectedRouteGeometry(
      route,
      project,
      widthScale,
    );
    if (segments.length === 0) continue;

    const width = Math.max(0.5, route.strokeWidth * widthScale);
    const outline = resolveRouteOutline(route);
    const outline2 = resolveRouteOutline2(route);

    if (outline2.active) {
      const totalExtra = (outline.width + outline2.width) * widthScale;
      ctx.lineWidth = width + totalExtra * 2;
      ctx.strokeStyle = outline2.color;
      ctx.globalAlpha = route.opacity;
      ctx.setLineDash([]);
      strokeProjectedSegments(ctx, segments);
    }

    if (outline.enabled && outline.width > 0) {
      const outlineExtra = outline.width * widthScale;
      ctx.lineWidth = width + outlineExtra * 2;
      ctx.strokeStyle = outline.color;
      ctx.globalAlpha = route.opacity;
      ctx.setLineDash([]);
      strokeProjectedSegments(ctx, segments);
    }

    ctx.lineWidth = width;
    ctx.strokeStyle = route.color;
    ctx.globalAlpha = route.opacity;
    if (route.lineStyle === "dashed") {
      ctx.setLineDash([ROUTE_DASH_PATTERN[0] * width, ROUTE_DASH_PATTERN[1] * width]);
    } else {
      ctx.setLineDash([]);
    }

    strokeProjectedSegments(ctx, segments);
  }

  ctx.restore();
}

export function drawRoutesOnCanvas(
  ctx: CanvasRenderingContext2D,
  routes: Route[],
  projection: MarkerProjectionInput,
  scaleX = 1,
  scaleY = 1,
  sizeScale = 1,
): void {
  const widthScale = ((scaleX + scaleY) / 2) * sizeScale;
  drawRoutesWithProjector(
    ctx,
    routes,
    (lat, lon) => {
      const { x, y } = projectMarkerToCanvas(lat, lon, projection);
      return { x: x * scaleX, y: y * scaleY };
    },
    { widthScale },
  );
}
