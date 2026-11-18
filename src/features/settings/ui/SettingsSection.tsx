import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_FORM,
  usePosterContext,
} from "@/features/poster/ui/PosterContext";
import { useFormHandlers } from "@/features/poster/application/useFormHandlers";
import { themeOptions } from "@/features/theme/infrastructure/themeRepository";
import { layoutOptions } from "@/features/layout/infrastructure/layoutRepository";
import {
  DEFAULT_POSTER_HEIGHT_CM,
  DEFAULT_POSTER_WIDTH_CM,
  FONT_OPTIONS,
} from "@/core/config";
import { DEFAULT_BLEED_INCHES } from "@/features/settings/domain/types";
import {
  computeBleedLayoutMetrics,
  formatInchesNumber,
  normalizeBleedInches,
  resolveBleedInches,
} from "@/features/layout/domain/bleed";
import { OUTPUT_DPI } from "@/features/poster/infrastructure/renderer/constants";
import ConfirmModal from "@/shared/ui/ConfirmModal";

function findFontLabel(fontFamily: string | undefined): string {
  if (!fontFamily) return "Default (Space Grotesk)";
  const match = FONT_OPTIONS.find((f) => f.value === fontFamily);
  return match?.label ?? fontFamily;
}

export default function SettingsSection() {
  const { state, dispatch } = usePosterContext();
  const { handleSaveCurrentAsDefaults, handleResetUserDefaults } =
    useFormHandlers();

  const [confirmOpen, setConfirmOpen] = useState<"save" | "reset" | null>(null);

  const { userDefaults, savedThemes, form } = state;
  const bleedInches = resolveBleedInches(userDefaults);
  const [bleedDraft, setBleedDraft] = useState(() =>
    formatInchesNumber(bleedInches),
  );
  const isBleedFocusedRef = useRef(false);

  useEffect(() => {
    if (!isBleedFocusedRef.current) {
      setBleedDraft(formatInchesNumber(bleedInches));
    }
  }, [bleedInches]);

  const trimWidthCm = Number(form.width) || DEFAULT_POSTER_WIDTH_CM;
  const trimHeightCm = Number(form.height) || DEFAULT_POSTER_HEIGHT_CM;
  const bleedMetrics = useMemo(
    () => computeBleedLayoutMetrics(trimWidthCm, trimHeightCm, bleedInches),
    [trimWidthCm, trimHeightCm, bleedInches],
  );
  const bleedPxPerEdge = Math.round(bleedInches * OUTPUT_DPI);

  // Effective defaults: user-set values fall back to built-in DEFAULT_FORM.
  const effectiveThemeId = userDefaults.theme ?? DEFAULT_FORM.theme;
  const effectiveLayoutId = userDefaults.layout ?? DEFAULT_FORM.layout;
  const effectiveFontFamily =
    userDefaults.fontFamily !== undefined
      ? userDefaults.fontFamily
      : DEFAULT_FORM.fontFamily;

  const themeLabel = useMemo(() => {
    const builtin = themeOptions.find((t) => t.id === effectiveThemeId);
    if (builtin) return builtin.name;
    const saved = savedThemes.find((t) => t.id === effectiveThemeId);
    if (saved) return `${saved.name} (saved)`;
    return effectiveThemeId;
  }, [savedThemes, effectiveThemeId]);

  const layoutLabel = useMemo(() => {
    const match = layoutOptions.find((l) => l.id === effectiveLayoutId);
    return match?.name ?? effectiveLayoutId;
  }, [effectiveLayoutId]);

  const fontLabel = findFontLabel(effectiveFontFamily);

  const currentSummary: { label: string; value: string }[] = [
    {
      label: "Theme",
      value:
        themeOptions.find((t) => t.id === form.theme)?.name ??
        savedThemes.find((t) => t.id === form.theme)?.name ??
        form.theme,
    },
    {
      label: "Layout",
      value:
        layoutOptions.find((l) => l.id === form.layout)?.name ?? form.layout,
    },
    { label: "Font", value: findFontLabel(form.fontFamily) },
  ];

  function handleBleedInputChange(rawValue: string) {
    setBleedDraft(rawValue);
    const trimmed = rawValue.trim();
    if (!trimmed) return;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    dispatch({
      type: "SET_BLEED_INCHES",
      bleedInches: normalizeBleedInches(parsed),
    });
  }

  function handleBleedInputBlur() {
    isBleedFocusedRef.current = false;
    const trimmed = bleedDraft.trim();
    const parsed = Number(trimmed);
    if (!trimmed || !Number.isFinite(parsed) || parsed < 0) {
      setBleedDraft(formatInchesNumber(bleedInches));
      return;
    }
    const normalized = normalizeBleedInches(parsed);
    dispatch({ type: "SET_BLEED_INCHES", bleedInches: normalized });
    setBleedDraft(formatInchesNumber(normalized));
  }

  function handleResetBleed() {
    dispatch({ type: "SET_BLEED_INCHES", bleedInches: DEFAULT_BLEED_INCHES });
    setBleedDraft(formatInchesNumber(DEFAULT_BLEED_INCHES));
  }

  function handleSaveClick() {
    setConfirmOpen("save");
  }

  function handleResetClick() {
    setConfirmOpen("reset");
  }

  function handleConfirm() {
    if (confirmOpen === "save") {
      handleSaveCurrentAsDefaults();
    } else if (confirmOpen === "reset") {
      handleResetUserDefaults();
    }
    setConfirmOpen(null);
  }

  return (
    <section className="panel-block settings-section">
      <h2>Settings</h2>

      <div className="settings-defaults-list">
        <div className="settings-default-row">
          <div className="settings-bleed-header">
            <label className="settings-default-label" htmlFor="settings-bleed-input">
              Print bleed (all 4 edges)
            </label>
            <button
              type="button"
              className="settings-inline-reset-btn"
              onClick={handleResetBleed}
              disabled={Math.abs(bleedInches - DEFAULT_BLEED_INCHES) < 0.001}
              title={`Reset print bleed to ${DEFAULT_BLEED_INCHES} inches`}
            >
              Reset ({DEFAULT_BLEED_INCHES}&Prime;)
            </button>
          </div>

          <div className="settings-bleed-input-row">
            <input
              id="settings-bleed-input"
              type="number"
              className="settings-bleed-input"
              min={0}
              max={24}
              step="any"
              value={bleedDraft}
              onFocus={() => {
                isBleedFocusedRef.current = true;
              }}
              onChange={(event) => handleBleedInputChange(event.target.value)}
              onBlur={handleBleedInputBlur}
            />
            <span className="settings-bleed-unit">in</span>
          </div>

          <p className="settings-bleed-meta">
            <span>
              Trim {formatInchesNumber(bleedMetrics.trimWidthInches)} &times;{" "}
              {formatInchesNumber(bleedMetrics.trimHeightInches)} in
            </span>
            <span aria-hidden="true">&middot;</span>
            <span>
              Export {formatInchesNumber(bleedMetrics.totalWidthInches)} &times;{" "}
              {formatInchesNumber(bleedMetrics.totalHeightInches)} in
            </span>
            <span aria-hidden="true">&middot;</span>
            <span>
              {bleedInches > 0
                ? `${bleedPxPerEdge} px/edge @ 300 DPI`
                : "Bleed disabled"}
            </span>
          </p>
          <p className="settings-bleed-hint">
            Added around all four edges on SVG, RSVG, PNG, and PDF exports. Use
            the Bleed toggle under the preview to inspect it on screen.
          </p>
        </div>
      </div>

      <p className="settings-note">
        Startup defaults are now managed by the <strong>DEFAULT</strong> preset
        in the <strong>Presets</strong> menu.
      </p>

      <div className="settings-defaults-list">
        <div className="settings-default-row is-disabled" aria-disabled="true">
          <span className="settings-default-label">Default theme</span>
          <span className="settings-default-value">
            <span>{themeLabel}</span>
            <span className="settings-coming-soon">Managed in Presets</span>
          </span>
        </div>
        <div className="settings-default-row is-disabled" aria-disabled="true">
          <span className="settings-default-label">Default layout</span>
          <span className="settings-default-value">
            <span>{layoutLabel}</span>
            <span className="settings-coming-soon">Managed in Presets</span>
          </span>
        </div>
        <div className="settings-default-row is-disabled" aria-disabled="true">
          <span className="settings-default-label">Default font</span>
          <span className="settings-default-value">
            <span>{fontLabel}</span>
            <span className="settings-coming-soon">Managed in Presets</span>
          </span>
        </div>

        <div className="settings-default-row is-disabled" aria-disabled="true">
          <span className="settings-default-label">Default location</span>
          <span className="settings-default-value">
            <span className="settings-coming-soon">Coming soon</span>
          </span>
        </div>
        <div className="settings-default-row is-disabled" aria-disabled="true">
          <span className="settings-default-label">Default distance</span>
          <span className="settings-default-value">
            <span className="settings-coming-soon">Coming soon</span>
          </span>
        </div>
        <div className="settings-default-row is-disabled" aria-disabled="true">
          <span className="settings-default-label">Default unit</span>
          <span className="settings-default-value">
            Centimeters
            <span className="settings-coming-soon">Coming soon</span>
          </span>
        </div>
        <div className="settings-default-row is-disabled" aria-disabled="true">
          <span className="settings-default-label">App theme</span>
          <span className="settings-default-value">
            Dark
            <span className="settings-coming-soon">Coming soon</span>
          </span>
        </div>
      </div>

      <div className="settings-actions">
        <button
          type="button"
          className="settings-save-btn"
          onClick={handleSaveClick}
          disabled
        >
          Save Settings
        </button>
        <button
          type="button"
          className="settings-reset-btn"
          onClick={handleResetClick}
          disabled
        >
          Reset
        </button>
      </div>

      {confirmOpen === "save" ? (
        <ConfirmModal
          title="Save settings"
          message={
            "Save your current settings as defaults?\n\n" +
            currentSummary
              .map((s) => `• ${s.label}: ${s.value}`)
              .join("\n") +
            "\n\nThese values will be used the next time you open the app."
          }
          confirmLabel="Save Settings"
          cancelLabel="Cancel"
          onConfirm={handleConfirm}
          onCancel={() => setConfirmOpen(null)}
        />
      ) : null}

      {confirmOpen === "reset" ? (
        <ConfirmModal
          title="Reset settings"
          message="Clear your saved defaults? The app will use built-in defaults on next visit."
          confirmLabel="Reset"
          cancelLabel="Cancel"
          destructive
          onConfirm={handleConfirm}
          onCancel={() => setConfirmOpen(null)}
        />
      ) : null}
    </section>
  );
}
