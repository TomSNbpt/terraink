import { useMemo, useState } from "react";
import {
  DEFAULT_FORM,
  usePosterContext,
} from "@/features/poster/ui/PosterContext";
import { useFormHandlers } from "@/features/poster/application/useFormHandlers";
import { themeOptions } from "@/features/theme/infrastructure/themeRepository";
import { layoutOptions } from "@/features/layout/infrastructure/layoutRepository";
import { FONT_OPTIONS } from "@/core/config";
import ConfirmModal from "@/shared/ui/ConfirmModal";

function findFontLabel(fontFamily: string | undefined): string {
  if (!fontFamily) return "Default (Space Grotesk)";
  const match = FONT_OPTIONS.find((f) => f.value === fontFamily);
  return match?.label ?? fontFamily;
}

export default function SettingsSection() {
  const { state } = usePosterContext();
  const { handleSaveCurrentAsDefaults, handleResetUserDefaults } =
    useFormHandlers();

  const [confirmOpen, setConfirmOpen] = useState<"save" | "reset" | null>(null);

  const { userDefaults, savedThemes, form } = state;

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

  const hasAnyDefaults = Object.keys(userDefaults).length > 0;

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
