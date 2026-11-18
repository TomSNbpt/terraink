import { withAlpha } from "@/shared/utils/color";
import type { TrimRect } from "@/features/layout/domain/bleed";

export function applyFades(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: string,
  trimRect?: TrimRect,
): void {
  const ty = trimRect?.y ?? 0;
  const th = trimRect?.height ?? height;

  if (ty > 0) {
    ctx.fillStyle = withAlpha(color, 1);
    ctx.fillRect(0, 0, width, ty);
  }

  const topFadeHeight = th * 0.25;
  const topGradient = ctx.createLinearGradient(0, ty, 0, ty + topFadeHeight);
  topGradient.addColorStop(0, withAlpha(color, 1));
  topGradient.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = topGradient;
  ctx.fillRect(0, ty, width, topFadeHeight);

  const bottomTrimEdge = ty + th;
  const bottomFadeStart = ty + th * 0.75;
  const bottomGradient = ctx.createLinearGradient(
    0,
    bottomTrimEdge,
    0,
    bottomFadeStart,
  );
  bottomGradient.addColorStop(0, withAlpha(color, 1));
  bottomGradient.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = bottomGradient;
  ctx.fillRect(0, bottomFadeStart, width, th * 0.25);

  if (bottomTrimEdge < height) {
    ctx.fillStyle = withAlpha(color, 1);
    ctx.fillRect(0, bottomTrimEdge, width, height - bottomTrimEdge);
  }
}
