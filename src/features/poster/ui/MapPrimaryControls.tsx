import {
  BleedIcon,
  CrosshairIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  RecenterIcon,
  UnlockIcon,
} from "@/shared/ui/Icons";
import { formatInchesNumber } from "@/features/layout/domain/bleed";

export type GuideDisplayMode = "layout" | "layout_and_center" | "off";

interface MapPrimaryControlsProps {
  isMapEditing: boolean;
  isMarkerEditorActive: boolean;
  guideMode: GuideDisplayMode;
  showBleedPreview: boolean;
  bleedInches: number;
  recenterHint: string;
  unlockHint: string;
  onCycleGuideMode: () => void;
  onToggleBleedPreview: () => void;
  onRecenter: () => void;
  onStartEditing: () => void;
  onFinishEditing: () => void;
}

const GUIDE_MODE_META: Record<
  GuideDisplayMode,
  { label: string; title: string; className: string }
> = {
  layout: {
    label: "Guides: Layout",
    title: "Showing layout guides — click to add center guides",
    className: "map-control-btn map-control-btn--guides",
  },
  layout_and_center: {
    label: "Guides: +Center",
    title: "Showing layout and center guides — click to hide all guides",
    className: "map-control-btn map-control-btn--guides is-active",
  },
  off: {
    label: "Guides: Off",
    title: "All guides hidden — click to show layout guides",
    className: "map-control-btn map-control-btn--guides is-muted",
  },
};

export default function MapPrimaryControls({
  isMapEditing,
  isMarkerEditorActive,
  guideMode,
  showBleedPreview,
  bleedInches,
  recenterHint,
  unlockHint,
  onCycleGuideMode,
  onToggleBleedPreview,
  onRecenter,
  onStartEditing,
  onFinishEditing,
}: MapPrimaryControlsProps) {
  const guideMeta = GUIDE_MODE_META[guideMode];
  const hasBleed = bleedInches > 0;
  const formattedBleed = formatInchesNumber(bleedInches);
  const bleedLabel = !hasBleed
    ? 'Bleed: 0"'
    : showBleedPreview
      ? `Bleed: +${formattedBleed}"`
      : "Bleed: Off";
  const bleedTitle = !hasBleed
    ? "Print bleed is set to 0 in under Settings"
    : showBleedPreview
      ? `Showing +${formattedBleed} in print bleed area — click to hide`
      : `Print bleed hidden (+${formattedBleed} in configured in Settings) — click to preview`;

  return (
    <>
      <button
        type="button"
        className={guideMeta.className}
        onClick={onCycleGuideMode}
        title={guideMeta.title}
        aria-label={guideMeta.label}
      >
        {guideMode === "layout_and_center" ? (
          <CrosshairIcon aria-hidden="true" />
        ) : guideMode === "off" ? (
          <EyeOffIcon aria-hidden="true" />
        ) : (
          <EyeIcon aria-hidden="true" />
        )}
        <span>{guideMeta.label}</span>
      </button>
      <button
        type="button"
        className={`map-control-btn map-control-btn--bleed${
          hasBleed && showBleedPreview ? " is-active" : " is-muted"
        }`}
        onClick={onToggleBleedPreview}
        disabled={!hasBleed}
        aria-pressed={hasBleed && showBleedPreview}
        title={bleedTitle}
        aria-label={bleedLabel}
      >
        <BleedIcon aria-hidden="true" />
        <span>{bleedLabel}</span>
      </button>
      {!isMapEditing ? (
        <button
          type="button"
          className="map-control-btn"
          onClick={onRecenter}
          title={recenterHint}
        >
          <RecenterIcon />
          <span>Recenter</span>
        </button>
      ) : null}
      {isMapEditing ? (
        <button
          type="button"
          className="map-control-btn map-control-btn--primary map-control-btn--mode"
          onClick={onFinishEditing}
          title="Lock map editing"
        >
          <LockIcon />
          <span>Lock Map</span>
        </button>
      ) : (
        <button
          type="button"
          className="map-control-btn map-control-btn--primary map-control-btn--mode"
          onClick={onStartEditing}
          title={unlockHint}
          disabled={isMarkerEditorActive}
        >
          <UnlockIcon />
          <span>Edit Map</span>
        </button>
      )}
    </>
  );
}
