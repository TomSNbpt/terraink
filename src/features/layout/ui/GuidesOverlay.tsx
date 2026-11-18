import type { CustomSizeUnit } from "@/features/poster/application/posterReducer";
import type { LayoutGuide } from "../domain/types";
import { formatGuideReadout } from "../domain/guides";

interface GuidesOverlayProps {
  guides: LayoutGuide[];
  visible: boolean;
  widthCm: number;
  heightCm: number;
  unit: CustomSizeUnit;
}

export default function GuidesOverlay({
  guides,
  visible,
  widthCm,
  heightCm,
  unit,
}: GuidesOverlayProps) {
  if (!visible || guides.length === 0 || widthCm <= 0 || heightCm <= 0) {
    return null;
  }

  return (
    <div className="poster-guides-overlay" aria-hidden="true">
      {guides.map((guide) => {
        const isVertical = guide.axis === "x";
        const totalCm = isVertical ? widthCm : heightCm;
        const percent = (guide.offsetCm / totalCm) * 100;

        if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
          return null;
        }

        const readout = formatGuideReadout(guide.offsetCm, unit);

        if (isVertical) {
          const isNearRight = percent > 86;
          return (
            <div
              key={guide.id}
              className="poster-guide-line poster-guide-line--x"
              style={{ left: `${percent}%` }}
            >
              <span
                className={`poster-guide-label poster-guide-label--x${
                  isNearRight ? " is-flipped" : ""
                }`}
              >
                {readout}
              </span>
            </div>
          );
        }

        const isNearBottom = percent > 88;
        return (
          <div
            key={guide.id}
            className="poster-guide-line poster-guide-line--y"
            style={{ top: `${percent}%` }}
          >
            <span
              className={`poster-guide-label poster-guide-label--y${
                isNearBottom ? " is-flipped" : ""
              }`}
            >
              {readout}
            </span>
          </div>
        );
      })}
    </div>
  );
}
