import { memo, useMemo, type CSSProperties } from "react";
import type { MarkerIconDefinition } from "@/features/markers/domain/types";
import { buildStrokedSvgIcon } from "@/features/markers/infrastructure/svgStroke";

interface MarkerVisualProps {
  icon: MarkerIconDefinition;
  size: number;
  color: string;
  strokeColor?: string;
  strokeWidth?: number;
  className?: string;
}

const MarkerVisual = memo(function MarkerVisual({
  icon,
  size,
  color,
  strokeColor,
  strokeWidth,
  className = "",
}: MarkerVisualProps) {
  const isThemeTintedMarkerSvg =
    icon.kind === "image" &&
    Boolean(icon.tintWithMarkerColor) &&
    Boolean(icon.dataUrl);

  const hasStroke =
    Boolean(strokeColor) &&
    typeof strokeWidth === "number" &&
    Number.isFinite(strokeWidth) &&
    strokeWidth > 0;

  const strokedSvg = useMemo(() => {
    if (!hasStroke || icon.kind !== "svg" || !icon.svgMarkup) {
      return null;
    }
    return buildStrokedSvgIcon(
      icon.svgMarkup,
      size,
      color,
      strokeColor,
      strokeWidth,
    );
  }, [color, hasStroke, icon.kind, icon.svgMarkup, size, strokeColor, strokeWidth]);

  const visualSize = strokedSvg ? strokedSvg.boxSize : size;
  const imageStrokeFilter =
    hasStroke && icon.kind === "image"
      ? `drop-shadow(0 0 ${strokeWidth}px ${strokeColor}) drop-shadow(0 0 ${Math.max(0.5, strokeWidth! * 0.5)}px ${strokeColor})`
      : undefined;

  return (
    <span
      className={`marker-visual ${className}`.trim()}
      style={
        {
          "--marker-size": `${visualSize}px`,
          "--marker-color": color,
          ...(imageStrokeFilter ? { filter: imageStrokeFilter } : {}),
        } as CSSProperties
      }
    >
      {strokedSvg ? (
        <span
          className="marker-visual__icon"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: strokedSvg.svgMarkup }}
        />
      ) : isThemeTintedMarkerSvg ? (
        <span
          className="marker-visual__image-mask"
          aria-hidden="true"
          style={
            {
              "--marker-mask-url": `url(${icon.dataUrl})`,
            } as CSSProperties
          }
        />
      ) : icon.kind === "image" && icon.dataUrl ? (
        <img
          className="marker-visual__image"
          src={icon.dataUrl}
          alt=""
          aria-hidden="true"
        />
      ) : (
        icon.component ? (
          <span className="marker-visual__icon" aria-hidden="true">
            <icon.component size={size} color={color} />
          </span>
        ) : (
          <span
            className="marker-visual__icon"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: icon.svgMarkup ?? "" }}
          />
        )
      )}
    </span>
  );
});

export default MarkerVisual;
