import { useEffect, useMemo, useState } from "react";
import { usePosterContext } from "@/features/poster/ui/PosterContext";
import {
  DISPLAY_PALETTE_KEYS,
  PALETTE_COLOR_LABELS,
  type ResolvedTheme,
  type SavedTheme,
  type ThemeColorKey,
  type ThemeColors,
  type ThemeOption,
} from "@/features/theme/domain/types";
import { getThemeColorByPath } from "@/features/theme/domain/colorPaths";
import { normalizeHexColor } from "@/shared/utils/color";
import {
  buildDynamicColorChoices,
  createFallbackThemeOption,
} from "@/features/theme/domain/colorSuggestions";
import ColorPicker from "@/features/theme/ui/ColorPicker";
import ThemeCard from "@/features/theme/ui/ThemeCard";
import ThemePickerView from "@/features/theme/ui/ThemePickerView";
import SaveThemeModal from "@/features/theme/ui/SaveThemeModal";
import SaveChoiceModal from "@/features/theme/ui/SaveChoiceModal";
import RouteStylingSection from "@/features/routes/ui/RouteStylingSection";
import type { ThemeDesignerSession } from "@/features/theme-designer/domain/types";

const FALLBACK_COLOR = "#000000";

interface DesignSectionProps {
  activeTab?: string;
  themeId: string;
  selectedTheme: ResolvedTheme;
  effectiveTheme: ResolvedTheme;
  themeOptions: ThemeOption[];
  deletedBuiltinThemeIds: string[];
  savedThemes: SavedTheme[];
  customColors: Record<string, string>;
  onThemeChange: (themeId: string) => void;
  onColorChange: (key: string, value: string) => void;
  onResetColors: () => void;
  onAddSavedTheme: (theme: SavedTheme) => void;
  onUpdateSavedTheme: (themeId: string, changes: Partial<SavedTheme>) => void;
  onRemoveSavedTheme: (themeId: string) => void;
  onDeleteBuiltinTheme: (themeId: string) => void;
  onSetCustomColors: (colors: Record<string, string>) => void;
  themeDesigner: ThemeDesignerSession;
}

export default function DesignSection({
  activeTab,
  themeId,
  selectedTheme,
  effectiveTheme,
  themeOptions,
  deletedBuiltinThemeIds,
  savedThemes,
  customColors,
  onThemeChange,
  onColorChange,
  onResetColors,
  onAddSavedTheme,
  onUpdateSavedTheme,
  onRemoveSavedTheme,
  onDeleteBuiltinTheme,
  onSetCustomColors,
  themeDesigner,
}: DesignSectionProps) {
  const { isThemeDesignDirty } = usePosterContext();

  const [isThemePickerOpen, setIsThemePickerOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isSaveChoiceModalOpen, setIsSaveChoiceModalOpen] = useState(false);

  const defaultColorKey: ThemeColorKey = DISPLAY_PALETTE_KEYS[0] ?? "ui.bg";
  const [activeColorKey, setActiveColorKey] = useState<ThemeColorKey | null>(
    null,
  );
  const [activeColorSession, setActiveColorSession] = useState<{
    key: ThemeColorKey;
    seedColor: string;
    seedPalette: string[];
  } | null>(null);

  useEffect(() => {
    if (activeTab && activeTab !== "style") {
      setIsThemePickerOpen(false);
      setActiveColorKey(null);
      setActiveColorSession(null);
    }
  }, [activeTab]);

  const visibleThemeOptions = useMemo(() => {
    if (deletedBuiltinThemeIds.length === 0) return themeOptions;
    const deletedSet = new Set(deletedBuiltinThemeIds);
    return themeOptions.filter((option) => !deletedSet.has(option.id));
  }, [deletedBuiltinThemeIds, themeOptions]);

  const activeGeneratedTheme = useMemo(
    () =>
      themeDesigner.activeGeneratedThemeId
        ? (themeDesigner.generatedThemes.find(
            (t) => t.id === themeDesigner.activeGeneratedThemeId,
          ) ?? null)
        : null,
    [themeDesigner.activeGeneratedThemeId, themeDesigner.generatedThemes],
  );

  const selectedThemeOption = useMemo(() => {
    if (activeGeneratedTheme) {
      const palette = DISPLAY_PALETTE_KEYS.map(
        (key) => getThemeColorByPath(activeGeneratedTheme.colors, key) || "",
      );
      return {
        id: activeGeneratedTheme.id,
        name: activeGeneratedTheme.name,
        description: activeGeneratedTheme.description,
        palette,
      };
    }
    const matchingOption = visibleThemeOptions.find((t) => t.id === themeId);
    if (matchingOption) return matchingOption;
    const matchingSaved = savedThemes.find((t) => t.id === themeId);
    if (matchingSaved) {
      const palette = DISPLAY_PALETTE_KEYS.map(
        (key) => getThemeColorByPath(matchingSaved.colors, key) || "",
      );
      return {
        id: matchingSaved.id,
        name: matchingSaved.name,
        description: matchingSaved.description,
        palette,
      };
    }
    return createFallbackThemeOption(themeId, selectedTheme);
  }, [
    activeGeneratedTheme,
    savedThemes,
    selectedTheme,
    themeId,
    visibleThemeOptions,
  ]);

  const currentThemePalette = useMemo(
    () =>
      DISPLAY_PALETTE_KEYS.map((key) => {
        const themeColor =
          getThemeColorByPath(selectedTheme, key) || FALLBACK_COLOR;
        return customColors[key] ?? themeColor;
      }),
    [customColors, selectedTheme],
  );

  const currentThemeCardOption = useMemo<ThemeOption>(
    () => ({
      ...selectedThemeOption,
      palette: currentThemePalette,
    }),
    [currentThemePalette, selectedThemeOption],
  );

  const activeColorChoices = useMemo(() => {
    if (!activeColorKey) return { suggestedColors: [], moreColors: [] };

    const sessionColor =
      activeColorSession?.key === activeColorKey
        ? activeColorSession.seedColor
        : "";
    const sessionPalette =
      activeColorSession?.key === activeColorKey
        ? activeColorSession.seedPalette
        : currentThemePalette;

    return buildDynamicColorChoices(
      sessionColor ||
        customColors[activeColorKey] ||
        getThemeColorByPath(selectedTheme, activeColorKey) ||
        currentThemePalette[0] ||
        "",
      sessionPalette,
    );
  }, [
    activeColorKey,
    activeColorSession,
    customColors,
    currentThemePalette,
    selectedTheme,
  ]);

  const colorTargets = useMemo(
    () =>
      DISPLAY_PALETTE_KEYS.map((key) => {
        const baseColor =
          getThemeColorByPath(selectedTheme, key) || FALLBACK_COLOR;
        const currentColor = customColors[key] ?? baseColor;
        return {
          key,
          label: PALETTE_COLOR_LABELS[key] ?? key,
          color: currentColor,
          isActive: activeColorKey === key,
        };
      }),
    [activeColorKey, customColors, selectedTheme],
  );

  const hasCustomColors = useMemo(
    () =>
      DISPLAY_PALETTE_KEYS.some((key) => {
        const override = normalizeHexColor(customColors[key]);
        if (!override) return false;
        const original = normalizeHexColor(
          getThemeColorByPath(selectedTheme, key),
        );
        return override !== original;
      }),
    [customColors, selectedTheme],
  );

  const activeColorLabel = activeColorKey
    ? (PALETTE_COLOR_LABELS[activeColorKey] ?? "Color")
    : "Color";

  function clearColorPickerState() {
    setActiveColorKey(null);
    setActiveColorSession(null);
  }

  function handleSwatchClick(key: ThemeColorKey) {
    const themeColor = getThemeColorByPath(selectedTheme, key);
    const seedColor =
      customColors[key] ?? (themeColor || currentThemePalette[0] || "");
    setActiveColorKey(key);
    setActiveColorSession({
      key,
      seedColor,
      seedPalette: [...currentThemePalette],
    });
  }

  function handleResetThemeColors() {
    onResetColors();
    if (!activeColorKey) {
      clearColorPickerState();
      return;
    }
    const seedPalette = DISPLAY_PALETTE_KEYS.map(
      (key) =>
        normalizeHexColor(getThemeColorByPath(selectedTheme, key)) ||
        normalizeHexColor(currentThemePalette[0]) ||
        "",
    );
    setActiveColorSession({
      key: activeColorKey,
      seedColor:
        seedPalette[DISPLAY_PALETTE_KEYS.indexOf(activeColorKey)] ||
        seedPalette[0] ||
        "",
      seedPalette,
    });
  }

  function handleResetSingleColor(key: ThemeColorKey) {
    const originalColor =
      normalizeHexColor(getThemeColorByPath(selectedTheme, key)) ||
      normalizeHexColor(currentThemePalette[0]) ||
      "";
    if (!originalColor) return;
    onColorChange(key, originalColor);
  }

  function buildSuggestedThemeName(): string {
    const baseName = (
      selectedThemeOption.name ||
      selectedTheme.name ||
      "Theme"
    ).trim();
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

  const isOnSavedTheme = savedThemes.some((t) => t.id === themeId);

  function handleOpenSaveModal() {
    if (isOnSavedTheme) {
      setIsSaveChoiceModalOpen(true);
      return;
    }
    setIsSaveModalOpen(true);
  }

  function handleChooseSaveOverwrite() {
    const colorsSnapshot: ThemeColors = {
      ui: { ...effectiveTheme.ui },
      map: {
        ...effectiveTheme.map,
        roads: { ...effectiveTheme.map.roads },
      },
    };
    onUpdateSavedTheme(themeId, {
      colors: colorsSnapshot,
      savedAt: new Date().toISOString(),
    });
    onResetColors();
    setIsSaveChoiceModalOpen(false);
  }

  function handleConfirmSave(name: string, description: string) {
    const colorsSnapshot: ThemeColors = {
      ui: { ...effectiveTheme.ui },
      map: {
        ...effectiveTheme.map,
        roads: { ...effectiveTheme.map.roads },
      },
    };
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `saved-${crypto.randomUUID()}`
        : `saved-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newTheme: SavedTheme = {
      id,
      name,
      description,
      colors: colorsSnapshot,
      savedAt: new Date().toISOString(),
    };
    onAddSavedTheme(newTheme);
    onThemeChange(id);
    setIsSaveModalOpen(false);
  }

  const editorKey = activeColorKey || defaultColorKey;
  const editorChoices = activeColorKey
    ? activeColorChoices
    : buildDynamicColorChoices(
        currentThemePalette[0] || "",
        currentThemePalette,
      );
  const editorColor =
    customColors[editorKey] ??
    (getThemeColorByPath(selectedTheme, editorKey) ||
      currentThemePalette[0] ||
      "");
  const originalEditorColor =
    normalizeHexColor(getThemeColorByPath(selectedTheme, editorKey)) ||
    normalizeHexColor(currentThemePalette[0]) ||
    "";
  const normalizedEditorColor = normalizeHexColor(editorColor) || "";
  const canResetEditorColor = Boolean(
    originalEditorColor &&
      normalizedEditorColor &&
      originalEditorColor !== normalizedEditorColor,
  );

  const description =
    selectedThemeOption.description?.trim() || "No description available.";

  return (
    <section className="panel-block design-section">
      {isThemePickerOpen ? (
        <div className="design-theme-picker">
          <div className="template-picker-header">
            <div className="layout-summary-copy">
              <p className="section-summary-label">THEME</p>
            </div>
            <button
              type="button"
              className="theme-edit-done-btn"
              onClick={() => setIsThemePickerOpen(false)}
            >
              Done
            </button>
          </div>

          <ThemePickerView
            isActive={isThemePickerOpen}
            themeId={themeId}
            selectedTheme={selectedTheme}
            themeOptions={themeOptions}
            savedThemes={savedThemes}
            deletedBuiltinThemeIds={deletedBuiltinThemeIds}
            themeDesigner={themeDesigner}
            onThemeChange={onThemeChange}
            onRemoveSavedTheme={onRemoveSavedTheme}
            onDeleteBuiltinTheme={onDeleteBuiltinTheme}
            onSetCustomColors={onSetCustomColors}
            onThemeSwitched={() => {
              setIsThemePickerOpen(false);
              clearColorPickerState();
            }}
          />
        </div>
      ) : activeColorKey ? (
        <section className="panel-block color-editor-screen">
          <h2>Color Editor</h2>
          <div className="color-editor-header">
            <p className="theme-active-label">Editing: {activeColorLabel}</p>
            <div className="theme-edit-actions">
              <button
                type="button"
                className="theme-edit-done-btn"
                onClick={clearColorPickerState}
              >
                Done
              </button>
            </div>
          </div>

          <ColorPicker
            currentColor={editorColor}
            suggestedColors={editorChoices.suggestedColors}
            moreColors={editorChoices.moreColors}
            onChange={(color: string) => onColorChange(editorKey, color)}
            onResetColor={() => handleResetSingleColor(editorKey)}
            canResetColor={canResetEditorColor}
          />
        </section>
      ) : (
        <div className="design-section__home">
          <div className="design-current-theme-block">
            <p className="section-summary-label">THEME</p>
            <ThemeCard
              themeOption={currentThemeCardOption}
              compact
              isSelected
              outlineState={isThemeDesignDirty ? "red" : "green"}
              onDoubleClick={() => setIsThemePickerOpen(true)}
              title="Double-click to choose a theme"
            />
            <p className="template-current-description">{description}</p>
          </div>

          <div className="design-color-editor-block">
            <div className="design-color-editor-header">
              <p className="section-summary-label">COLOR EDITOR</p>
              <div className="theme-edit-actions">
                <button
                  type="button"
                  className="theme-save-btn"
                  onClick={handleOpenSaveModal}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="theme-reset-all-btn"
                  onClick={handleResetThemeColors}
                  disabled={!hasCustomColors}
                >
                  Reset All
                </button>
              </div>
            </div>

            <div className="color-editor-target-grid">
              {colorTargets.map((target) => (
                <button
                  key={target.key}
                  type="button"
                  className={`color-editor-target${target.isActive ? " is-active" : ""}`}
                  onClick={() => handleSwatchClick(target.key)}
                  aria-pressed={target.isActive}
                  aria-label={`${target.label}: ${target.color}`}
                >
                  <span
                    className="color-editor-target-swatch"
                    style={{ backgroundColor: target.color }}
                  />
                  <span className="color-editor-target-name">
                    {target.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <RouteStylingSection />
        </div>
      )}

      {isSaveChoiceModalOpen ? (
        <SaveChoiceModal
          themeName={selectedThemeOption.name}
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
          suggestedDescription={selectedThemeOption.description ?? ""}
          existingNames={savedThemes.map((t) => t.name)}
          onConfirm={handleConfirmSave}
          onCancel={() => setIsSaveModalOpen(false)}
        />
      ) : null}
    </section>
  );
}
