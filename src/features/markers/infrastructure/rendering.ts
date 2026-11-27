import type {
  MarkerIconDefinition,
  MarkerItem,
  MarkerProjectionInput,
} from "@/features/markers/domain/types";
import { projectMarkerToCanvas } from "./projection";
import { buildNumberedCircleSvg, buildStrokedSvgIcon } from "./svgStroke";

function serializeSvgWithColor(svgMarkup: string, color: string) {
  return svgMarkup.split("currentColor").join(color);
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load marker icon."));
    image.src = src;
  });
}

function drawTintedImage(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  const drawSize = Math.max(1, Math.round(size));
  const tintCanvas = document.createElement("canvas");
  tintCanvas.width = drawSize;
  tintCanvas.height = drawSize;
  const tintCtx = tintCanvas.getContext("2d");
  if (!tintCtx) {
    ctx.drawImage(image, x, y, size, size);
    return;
  }

  tintCtx.drawImage(image, 0, 0, drawSize, drawSize);
  tintCtx.globalCompositeOperation = "source-in";
  tintCtx.fillStyle = color;
  tintCtx.fillRect(0, 0, drawSize, drawSize);
  tintCtx.globalCompositeOperation = "source-over";

  ctx.drawImage(tintCanvas, x, y, size, size);
}

async function resolveMarkerImage(
  icon: MarkerIconDefinition,
  color: string,
  size: number,
  strokeColor?: string,
  strokeWidthPx?: number,
  outerStrokeColor?: string,
  outerStrokeWidthPx?: number,
  labelText?: string,
  labelColor?: string,
): Promise<{ image: HTMLImageElement; boxSize: number }> {
  if (labelText) {
    const numbered = buildNumberedCircleSvg({
      size,
      fillColor: color,
      labelText,
      labelColor: labelColor || strokeColor || "#ffffff",
      strokeColor: strokeWidthPx && strokeWidthPx > 0 ? strokeColor : undefined,
      strokeWidthPx: strokeWidthPx && strokeWidthPx > 0 ? strokeWidthPx : undefined,
      outerStrokeColor:
        outerStrokeWidthPx && outerStrokeWidthPx > 0 ? outerStrokeColor : undefined,
      outerStrokeWidthPx:
        outerStrokeWidthPx && outerStrokeWidthPx > 0 ? outerStrokeWidthPx : undefined,
    });
    const encodedSvg = encodeURIComponent(numbered.svgMarkup);
    const image = await loadImage(
      `data:image/svg+xml;charset=utf-8,${encodedSvg}`,
    );
    return { image, boxSize: numbered.boxSize };
  }

  if (icon.kind === "svg" && icon.svgMarkup) {
    if (strokeColor && strokeWidthPx && strokeWidthPx > 0) {
      const stroked = buildStrokedSvgIcon(
        icon.svgMarkup,
        size,
        color,
        strokeColor,
        strokeWidthPx,
        outerStrokeColor,
        outerStrokeWidthPx,
      );
      if (stroked) {
        const encodedSvg = encodeURIComponent(stroked.svgMarkup);
        const image = await loadImage(
          `data:image/svg+xml;charset=utf-8,${encodedSvg}`,
        );
        return { image, boxSize: stroked.boxSize };
      }
    }
    const encodedSvg = encodeURIComponent(
      serializeSvgWithColor(icon.svgMarkup, color),
    );
    const image = await loadImage(
      `data:image/svg+xml;charset=utf-8,${encodedSvg}`,
    );
    return { image, boxSize: size };
  }

  if (icon.dataUrl) {
    const image = await loadImage(icon.dataUrl);
    return { image, boxSize: size };
  }

  throw new Error(`Marker icon "${icon.id}" is missing render data.`);
}

export async function drawMarkersOnCanvas(
  ctx: CanvasRenderingContext2D,
  markers: MarkerItem[],
  icons: MarkerIconDefinition[],
  projection: MarkerProjectionInput,
  scaleX = 1,
  scaleY = 1,
  sizeScale = 1,
) {
  const strokeScale = ((scaleX + scaleY) / 2) * sizeScale;

  const prepared = await Promise.all(
    markers.map(async (marker) => {
      const icon = icons.find((entry) => entry.id === marker.iconId);
      if (!icon) {
        return null;
      }

      const point = projectMarkerToCanvas(marker.lat, marker.lon, projection);
      const x = point.x * scaleX + (marker.offsetX ?? 0);
      const y = point.y * scaleY + (marker.offsetY ?? 0);
      const size = marker.size * Math.max(scaleX, scaleY) * sizeScale;
      const strokeWidthPx =
        marker.strokeColor &&
        typeof marker.strokeWidth === "number" &&
        marker.strokeWidth > 0
          ? marker.strokeWidth * strokeScale
          : 0;
      const outerStrokeWidthPx =
        strokeWidthPx > 0 &&
        marker.outerStrokeColor &&
        typeof marker.outerStrokeWidth === "number" &&
        marker.outerStrokeWidth > 0
          ? marker.outerStrokeWidth * strokeScale
          : 0;

      const { image, boxSize } = await resolveMarkerImage(
        icon,
        marker.color,
        size,
        marker.strokeColor,
        strokeWidthPx,
        marker.outerStrokeColor,
        outerStrokeWidthPx,
        marker.labelText,
        marker.labelColor,
      );
      return {
        image,
        boxSize,
        imageX: x - boxSize / 2,
        imageY: y - boxSize / 2,
        tintWithColor: !marker.labelText && Boolean(icon.tintWithMarkerColor),
        color: marker.color,
      };
    }),
  );

  for (const item of prepared) {
    if (!item) continue;
    if (item.tintWithColor) {
      drawTintedImage(
        ctx,
        item.image,
        item.imageX,
        item.imageY,
        item.boxSize,
        item.color,
      );
      continue;
    }
    ctx.drawImage(item.image, item.imageX, item.imageY, item.boxSize, item.boxSize);
  }
}
