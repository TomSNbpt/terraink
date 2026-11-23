import { useCallback, useEffect, useRef } from "react";
import {
  DISPLAY_PALETTE_KEYS,
  type ThemeOption,
  type ThemeColorKey,
} from "../domain/types";
import { CheckIcon, SaveIcon, TrashIcon } from "@/shared/ui/Icons";

const PREVIEW_HOLD_DELAY_MS = 200;

interface ThemeCardProps {
  themeOption: ThemeOption | null;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onPreviewStart?: () => void;
  onPreviewEnd?: () => void;
  isSelected?: boolean;
  outlineState?: "green" | "red";
  isPreviewing?: boolean;
  compact?: boolean;
  title?: string;
  showFullPalette?: boolean;
  onDelete?: () => void;
  deleteAriaLabel?: string;
  onSave?: () => void;
  saveAriaLabel?: string;
  isSaved?: boolean;
}

export default function ThemeCard({
  themeOption,
  onClick,
  onDoubleClick,
  onPreviewStart,
  onPreviewEnd,
  isSelected = false,
  outlineState,
  isPreviewing = false,
  compact = false,
  title,
  showFullPalette = false,
  onDelete,
  deleteAriaLabel,
  onSave,
  saveAriaLabel,
  isSaved = false,
}: ThemeCardProps) {
  const holdTimerRef = useRef<number | null>(null);
  const previewActiveRef = useRef(false);
  const releaseListenersRef = useRef<(() => void) | null>(null);

  const cleanupPreview = useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (releaseListenersRef.current) {
      releaseListenersRef.current();
      releaseListenersRef.current = null;
    }
    if (previewActiveRef.current) {
      previewActiveRef.current = false;
      onPreviewEnd?.();
    }
  }, [onPreviewEnd]);

  useEffect(() => {
    return () => {
      cleanupPreview();
    };
  }, [cleanupPreview]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!onPreviewStart) return;
      if (event.button !== 0) return;

      cleanupPreview();

      const handleRelease = () => {
        cleanupPreview();
      };

      window.addEventListener("pointerup", handleRelease);
      window.addEventListener("pointercancel", handleRelease);
      window.addEventListener("blur", handleRelease);
      releaseListenersRef.current = () => {
        window.removeEventListener("pointerup", handleRelease);
        window.removeEventListener("pointercancel", handleRelease);
        window.removeEventListener("blur", handleRelease);
      };

      holdTimerRef.current = window.setTimeout(() => {
        holdTimerRef.current = null;
        previewActiveRef.current = true;
        onPreviewStart();
      }, PREVIEW_HOLD_DELAY_MS);
    },
    [cleanupPreview, onPreviewStart],
  );

  const handlePointerLeave = useCallback(() => {
    // Cancel pending hold timer if pointer leaves before preview starts;
    // once preview is active, keep previewing until mouse/pointer release.
    if (holdTimerRef.current !== null && !previewActiveRef.current) {
      cleanupPreview();
    }
  }, [cleanupPreview]);

  const handleDoubleClick = useCallback(() => {
    cleanupPreview();
    onDoubleClick?.();
  }, [cleanupPreview, onDoubleClick]);

  if (!themeOption) {
    return null;
  }

  const majorPaletteKeys: ThemeColorKey[] = showFullPalette
    ? DISPLAY_PALETTE_KEYS
    : [
        "ui.text",
        "map.land",
        "map.roads.major",
        "map.roads.minor_high",
        "map.roads.minor_mid",
      ];
  const majorPaletteIndices = majorPaletteKeys
    .map((key) => DISPLAY_PALETTE_KEYS.indexOf(key))
    .filter((index) => index >= 0);
  const palette = (() => {
    if (!Array.isArray(themeOption.palette)) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const index of majorPaletteIndices) {
      const color = themeOption.palette[index];
      if (color && !seen.has(color)) {
        seen.add(color);
        result.push(color);
      }
    }
    return result;
  })();
  const hasOverlayAction = Boolean(onDelete || onSave);
  const className = [
    "theme-card",
    compact ? "theme-card--compact" : "",
    isSelected ? "is-selected" : "",
    isSelected && outlineState === "green" ? "is-clean" : "",
    isSelected && outlineState === "red" ? "is-dirty" : "",
    isPreviewing ? "is-previewing" : "",
    hasOverlayAction ? "theme-card--deletable" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const cardButton = (
    <button
      type="button"
      className={className}
      onClick={onClick}
      onDoubleClick={onDoubleClick ? handleDoubleClick : undefined}
      onPointerDown={onPreviewStart ? handlePointerDown : undefined}
      onPointerLeave={onPreviewStart ? handlePointerLeave : undefined}
      aria-pressed={isSelected}
      aria-label={themeOption.name}
      title={title}
    >
      <div
        className={[
          "theme-card-palette",
          showFullPalette ? "theme-card-palette--full" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-hidden="true"
      >
        {palette.map((color, index) => (
          <span
            key={`${themeOption.id}-${color}-${index}`}
            className="theme-card-swatch"
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
      </div>
      <span className="theme-card-name-shadow" aria-hidden="true" />
      <p className="theme-card-name">{themeOption.name}</p>
    </button>
  );

  if (!hasOverlayAction) return cardButton;

  return (
    <div className="theme-card-wrap">
      {cardButton}
      {onSave ? (
        <button
          type="button"
          className={`theme-card-save${isSaved ? " is-saved" : ""}`}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onSave();
          }}
          title={
            isSaved
              ? "Saved — click to save another copy"
              : "Save as custom theme"
          }
          aria-label={saveAriaLabel ?? `Save ${themeOption.name}`}
        >
          {isSaved ? <CheckIcon /> : <SaveIcon />}
        </button>
      ) : null}
      {onDelete ? (
        <button
          type="button"
          className="theme-card-delete"
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title={deleteAriaLabel ?? `Delete ${themeOption.name}`}
          aria-label={deleteAriaLabel ?? `Delete ${themeOption.name}`}
        >
          <TrashIcon />
        </button>
      ) : null}
    </div>
  );
}
