import type { CSSProperties } from "react";
import {
  formatInchesNumber,
  type BleedLayoutMetrics,
} from "../domain/bleed";

interface BleedOverlayProps {
  metrics: BleedLayoutMetrics;
}

/**
 * Preview-only overlay rendered across the extended bleed stage when Bleed
 * Preview is enabled. Uses an even-odd polygon clip-path so the dimmed
 * grayscale scrim only covers the outer bleed zone and leaves the inner trim
 * area 100% untouched.
 */
export default function BleedOverlay({ metrics }: BleedOverlayProps) {
  if (
    metrics.bleedInches <= 0 ||
    metrics.totalWidthCm <= 0 ||
    metrics.totalHeightCm <= 0
  ) {
    return null;
  }

  const leftPct = (metrics.bleedCm / metrics.totalWidthCm) * 100;
  const rightPct = 100 - leftPct;
  const topPct = (metrics.bleedCm / metrics.totalHeightCm) * 100;
  const bottomPct = 100 - topPct;

  const trimWidthPct = Math.max(0, 100 - 2 * leftPct);
  const trimHeightPct = Math.max(0, 100 - 2 * topPct);

  const stageStyle: CSSProperties = {
    left: `${-metrics.bleedPercentX}%`,
    top: `${-metrics.bleedPercentY}%`,
    width: `${100 + 2 * metrics.bleedPercentX}%`,
    height: `${100 + 2 * metrics.bleedPercentY}%`,
  };

  const scrimStyle: CSSProperties = {
    clipPath: `polygon(evenodd, 0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${leftPct}% ${topPct}%, ${leftPct}% ${bottomPct}%, ${rightPct}% ${bottomPct}%, ${rightPct}% ${topPct}%, ${leftPct}% ${topPct}%)`,
  };

  const trimBorderStyle: CSSProperties = {
    left: `${leftPct}%`,
    top: `${topPct}%`,
    width: `${trimWidthPct}%`,
    height: `${trimHeightPct}%`,
  };

  return (
    <div
      className="poster-bleed-overlay"
      style={stageStyle}
      aria-hidden="true"
    >
      <div className="poster-bleed-scrim" style={scrimStyle} />
      <div className="poster-bleed-outer-border" />
      <div className="poster-bleed-trim-border" style={trimBorderStyle} />
      <span className="poster-bleed-tag">
        +{formatInchesNumber(metrics.bleedInches)} in bleed
      </span>
    </div>
  );
}
