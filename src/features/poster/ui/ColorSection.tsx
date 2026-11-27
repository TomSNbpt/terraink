import { useMemo, useState } from "react";
import { usePosterContext } from "@/features/poster/ui/PosterContext";
import { useFormHandlers } from "@/features/poster/application/useFormHandlers";
import { COLOR_ADJUST_DEFAULTS } from "@/features/poster/application/colorAdjustFields";
import {
  COLOR_ADJUST_LIMITS,
  DEFAULT_COLOR_ADJUSTMENTS,
  adjustColor,
  getColorAdjustmentsFromForm,
  hasColorAdjustments,
} from "@/features/theme/domain/colorAdjust";
import { applyThemeColorOverrides } from "@/features/theme/domain/colorPaths";
import type {
  ResolvedTheme,
  SavedTheme,
  ThemeColors,
} from "@/features/theme/domain/types";
import SaveThemeModal from "@/features/theme/ui/SaveThemeModal";
import SaveChoiceModal from "@/features/theme/ui/SaveChoiceModal";
import SliderField from "@/shared/ui/SliderField";
import { ResetIcon, SaveIcon } from "@/shared/ui/Icons";

const SLIDERS = [
  { key: "brightness", label: "Brightness", name: "colorBrightness", unit: "%" },
  { key: "contrast", label: "Contrast", name: "colorContrast", unit: "%" },
  { key: "saturation", label: "Saturation", name: "colorSaturation", unit: "%" },
  { key: "hue", label: "Hue", name: "colorHue", unit: "°" },
  { key: "warmth", label: "Warmth", name: "colorWarmth", unit: "" },
] as const;

const SWITCHES = [
  { key: "invert", label: "Invert", name: "colorInvert" },
  { key: "grayscale", label: "Grayscale", name: "colorGrayscale" },
] as const;

function getPreviewSwatches(theme: ResolvedTheme): string[] {
  return [
    theme.ui.bg,
    theme.map.water,
    theme.map.parks,
    theme.map.roads.minor_high,
    theme.map.roads.major,
    theme.ui.text,
  ];
}

export default function ColorSection() {
  const { state, dispatch, selectedTheme, effectiveTheme } = usePosterContext();
  const {
    handleThemeChange,
    handleResetColors,
    handleAddSavedTheme,
    handleUpdateSavedTheme,
  } = useFormHandlers();
  const { form } = state;

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isSaveChoiceModalOpen, setIsSaveChoiceModalOpen] = useState(false);

  const adjustments = useMemo(
    () => getColorAdjustmentsFromForm(form),
    [
      form.colorBrightness,
      form.colorContrast,
      form.colorSaturation,
      form.colorHue,
      form.colorWarmth,
      form.colorInvert,
      form.colorGrayscale,
    ],
  );

  const hasColorShift = hasColorAdjustments(adjustments);
  const hasCustomOverrides = Object.keys(state.customColors).length > 0;
  const canSaveTheme = hasColorShift || hasCustomOverrides;

  const beforeTheme = useMemo(
    () => applyThemeColorOverrides(selectedTheme, state.customColors),
    [selectedTheme, state.customColors],
  );

  const beforeSwatches = useMemo(
    () => getPreviewSwatches(beforeTheme),
    [beforeTheme],
  );
  const afterSwatches = useMemo(
    () => getPreviewSwatches(effectiveTheme),
    [effectiveTheme],
  );

  const tracks = useMemo(() => {
    const base = beforeTheme.ui.text;
    const sweep = (
      key: "hue" | "warmth" | "saturation" | "brightness" | "contrast",
      limit: number,
    ) =>
      `linear-gradient(to right, ${[-1, -0.5, 0, 0.5, 1]
        .map((step) =>
          adjustColor(base, {
            ...DEFAULT_COLOR_ADJUSTMENTS,
            [key]: step * limit,
          }),
        )
        .join(", ")})`;

    return {
      brightness: "linear-gradient(to right, #050505, #8a8a8a, #fafafa)",
      contrast:
        "linear-gradient(to right, #7c7c7c, #ffffff) top / 100% 50% no-repeat, " +
        "linear-gradient(to right, #7c7c7c, #000000) bottom / 100% 50% no-repeat",
      saturation: sweep("saturation", COLOR_ADJUST_LIMITS.saturation),
      hue: sweep("hue", COLOR_ADJUST_LIMITS.hue),
      warmth: "linear-gradient(to right, #4f8fe6, #c9c9c9, #f2a43a)",
    } satisfies Record<(typeof SLIDERS)[number]["key"], string>;
  }, [beforeTheme.ui.text]);

  const isOnSavedTheme = state.savedThemes.some((t) => t.id === form.theme);

  function buildSuggestedThemeName(): string {
    const baseName = (selectedTheme.name || "Theme").trim();
    const now = new Date();
    const pad = (n: number, width = 2) => String(n).padStart(width, "0");
    const stamp =
      `${now.getFullYear()}` +
      `${pad(now.getMonth() + 1)}` +
      `${pad(now.getDate())}` +
      `${pad(now.getHours())}` +
      `${pad(now.getMinutes())}` +
      `${pad(now.getSeconds())}`;
    return `${baseName}-${stamp}`;
  }

  function handleResetAll() {
    dispatch({ type: "SET_FORM_FIELDS", fields: COLOR_ADJUST_DEFAULTS });
  }

  function handleOpenSaveModal() {
    if (isOnSavedTheme) {
      setIsSaveChoiceModalOpen(true);
      return;
    }
    setIsSaveModalOpen(true);
  }

  function buildBakedColors(): ThemeColors {
    return {
      ui: { ...effectiveTheme.ui },
      map: {
        ...effectiveTheme.map,
        roads: { ...effectiveTheme.map.roads },
      },
    };
  }

  function handleChooseSaveOverwrite() {
    handleUpdateSavedTheme(form.theme, {
      colors: buildBakedColors(),
      savedAt: new Date().toISOString(),
    });
    handleResetColors();
    dispatch({ type: "SET_FORM_FIELDS", fields: COLOR_ADJUST_DEFAULTS });
    setIsSaveChoiceModalOpen(false);
  }

  function handleConfirmSaveNew(name: string, description: string) {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `saved-${crypto.randomUUID()}`
        : `saved-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newTheme: SavedTheme = {
      id,
      name,
      description,
      colors: buildBakedColors(),
      savedAt: new Date().toISOString(),
    };
    handleAddSavedTheme(newTheme);
    handleThemeChange(id);
    // Always clear temporary adjustments after baking them into the saved theme,
    // even if "Keep across themes" is turned on, so they are not double-applied.
    dispatch({ type: "SET_FORM_FIELDS", fields: COLOR_ADJUST_DEFAULTS });
    setIsSaveModalOpen(false);
  }

  const currentSavedTheme = state.savedThemes.find((t) => t.id === form.theme);

  return (
    <section className="panel-block color-section">
      <div className="color-section-head">
        <p className="section-summary-label">COLOR</p>
        <div className="color-section-actions">
          <button
            type="button"
            className="color-section-save-btn"
            disabled={!canSaveTheme}
            onClick={handleOpenSaveModal}
            title="Save adjusted palette as a custom theme"
          >
            <SaveIcon aria-hidden="true" />
            <span>Save</span>
          </button>
          <button
            type="button"
            className="color-section-reset-btn"
            disabled={!hasColorShift}
            onClick={handleResetAll}
            title="Reset all color adjustments"
            aria-label="Reset all color adjustments"
          >
            <ResetIcon aria-hidden="true" />
          </button>
        </div>
      </div>

      <p className="color-section-hint">
        Adjust the overall tone of the active map theme and poster text without
        changing routes or markers.
      </p>

      <div className="color-preview" aria-label="Before and after theme palette preview">
        <span className="color-preview-label">Before</span>
        <span className="color-preview-row">
          {beforeSwatches.map((color, index) => (
            <span
              key={`before-${index}`}
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </span>
        <span className="color-preview-label">After</span>
        <span className="color-preview-row">
          {afterSwatches.map((color, index) => (
            <span
              key={`after-${index}`}
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </span>
      </div>

      <label className="toggle-field color-keep-toggle">
        <span>Keep across themes</span>
        <span className="theme-switch">
          <input
            type="checkbox"
            checked={Boolean(form.colorKeepAcrossThemes)}
            onChange={(event) =>
              dispatch({
                type: "SET_FIELD",
                name: "colorKeepAcrossThemes",
                value: event.target.checked,
              })
            }
          />
          <span className="theme-switch-track" aria-hidden="true" />
        </span>
      </label>

      <div className="color-sliders-group">
        {SLIDERS.map((slider) => (
          <SliderField
            key={slider.name}
            label={slider.label}
            value={Number(form[slider.name]) || 0}
            min={-COLOR_ADJUST_LIMITS[slider.key]}
            max={COLOR_ADJUST_LIMITS[slider.key]}
            step={1}
            unit={slider.unit}
            defaultValue={0}
            trackBackground={tracks[slider.key]}
            commitDelayMs={150}
            onChange={(value) =>
              dispatch({
                type: "SET_FIELD",
                name: slider.name,
                value: String(value),
              })
            }
          />
        ))}
      </div>

      <div className="color-switches-group">
        {SWITCHES.map((toggle) => (
          <label key={toggle.name} className="toggle-field">
            <span>{toggle.label}</span>
            <span className="theme-switch">
              <input
                type="checkbox"
                checked={Boolean(form[toggle.name])}
                onChange={(event) =>
                  dispatch({
                    type: "SET_FIELD",
                    name: toggle.name,
                    value: event.target.checked,
                  })
                }
              />
              <span className="theme-switch-track" aria-hidden="true" />
            </span>
          </label>
        ))}
      </div>

      {isSaveChoiceModalOpen ? (
        <SaveChoiceModal
          themeName={currentSavedTheme?.name || selectedTheme.name}
          onSave={handleChooseSaveOverwrite}
          onSaveAsCopy={() => {
            setIsSaveChoiceModalOpen(false);
            setIsSaveModalOpen(true);
          }}
          onCancel={() => setIsSaveChoiceModalOpen(false)}
        />
      ) : null}

      {isSaveModalOpen ? (
        <SaveThemeModal
          suggestedName={buildSuggestedThemeName()}
          suggestedDescription={
            currentSavedTheme?.description || selectedTheme.description || ""
          }
          existingNames={state.savedThemes.map((t) => t.name)}
          onConfirm={handleConfirmSaveNew}
          onCancel={() => setIsSaveModalOpen(false)}
        />
      ) : null}
    </section>
  );
}
