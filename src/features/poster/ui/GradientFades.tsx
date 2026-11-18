import { withAlpha } from "@/shared/utils/color";

interface GradientFadesProps {
  color: string;
  bleedRatioY?: number;
}

/**
 * CSS gradient overlays that fade the top and bottom of the poster frame.
 * Matches the canvas-based `applyFades()` behaviour but runs on the GPU.
 * When `bleedRatioY > 0`, the fade ramp stays anchored to the inner trim
 * rectangle (0%–25% of trim height) and solid background extends through the
 * top/bottom bleed bands.
 */
export default function GradientFades({
  color,
  bleedRatioY = 0,
}: GradientFadesProps) {
  const solid = withAlpha(color, 1);
  const transparent = withAlpha(color, 0);

  if (!Number.isFinite(bleedRatioY) || bleedRatioY <= 0) {
    return (
      <>
        <div
          className="poster-fade poster-fade--top"
          style={{
            background: `linear-gradient(to bottom, ${solid}, ${transparent})`,
          }}
        />
        <div
          className="poster-fade poster-fade--bottom"
          style={{
            background: `linear-gradient(to top, ${solid}, ${transparent})`,
          }}
        />
      </>
    );
  }

  const bleedTopPct = (bleedRatioY / (1 + 2 * bleedRatioY)) * 100;
  const trimSpanPct = 100 - 2 * bleedTopPct;
  const fadeHeightPct = trimSpanPct * 0.25;
  const totalBandPct = bleedTopPct + fadeHeightPct;
  const solidStopPct =
    totalBandPct > 0 ? (bleedTopPct / totalBandPct) * 100 : 0;

  return (
    <>
      <div
        className="poster-fade poster-fade--top"
        style={{
          top: 0,
          height: `${totalBandPct}%`,
          background: `linear-gradient(to bottom, ${solid} 0%, ${solid} ${solidStopPct}%, ${transparent} 100%)`,
        }}
      />
      <div
        className="poster-fade poster-fade--bottom"
        style={{
          bottom: 0,
          top: "auto",
          height: `${totalBandPct}%`,
          background: `linear-gradient(to top, ${solid} 0%, ${solid} ${solidStopPct}%, ${transparent} 100%)`,
        }}
      />
    </>
  );
}

