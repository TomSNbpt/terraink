import type { RefObject } from "react";
import ThemeCard from "./ThemeCard";
import {
  DISPLAY_PALETTE_KEYS,
  type SavedTheme,
  type ThemeOption,
} from "../domain/types";
import { getThemeColorByPath } from "../domain/colorPaths";

interface ThemeSummarySectionProps {
  listRef?: RefObject<HTMLDivElement>;
  themeOptions: ThemeOption[];
  selectedThemeId: string;
  isThemeDesignDirty: boolean;
  previewThemeId: string | null;
  onPreviewStart: (themeId: string) => void;
  onPreviewEnd: () => void;
  onThemeDoubleClick: (themeId: string) => void;
  onDeleteBuiltinTheme: (themeId: string) => void;
  savedThemes: SavedTheme[];
  onDeleteSavedTheme: (themeId: string) => void;
}

function savedThemeToOption(saved: SavedTheme): ThemeOption {
  const palette = DISPLAY_PALETTE_KEYS.map(
    (key) => getThemeColorByPath(saved.colors, key) || "",
  );
  return {
    id: saved.id,
    name: saved.name,
    description: saved.description,
    palette,
  };
}

export default function ThemeSummarySection({
  listRef,
  themeOptions,
  selectedThemeId,
  isThemeDesignDirty,
  previewThemeId,
  onPreviewStart,
  onPreviewEnd,
  onThemeDoubleClick,
  onDeleteBuiltinTheme,
  savedThemes,
  onDeleteSavedTheme,
}: ThemeSummarySectionProps) {
  const canDeleteSavedConfigTheme = themeOptions.length > 1;

  function buildCardTitle(isSelected: boolean): string {
    if (isSelected) {
      return isThemeDesignDirty
        ? "Active theme (unsaved design changes) · Double-click to reset"
        : "Active theme";
    }
    return "Hold to preview · Double-click to switch";
  }

  return (
    <div className="theme-summary-view">
      <p className="theme-interaction-hint">
        Hold a theme to preview · Double-click to switch
      </p>

      <section className="theme-section theme-section--saved">
        <h3 className="theme-section-heading">Unsaved Themes</h3>
        {savedThemes.length === 0 ? (
          <div className="saved-themes-empty" role="status">
            <p className="saved-themes-empty-text">
              Themes customized during this session appear here until exported
              to config.json.
            </p>
          </div>
        ) : (
          <div
            className="theme-card-list card-scroll-list saved-themes-list"
            role="list"
            aria-label="Unsaved themes"
          >
            {savedThemes.map((saved) => {
              const isSelected = saved.id === selectedThemeId;
              return (
                <ThemeCard
                  key={saved.id}
                  themeOption={savedThemeToOption(saved)}
                  isSelected={isSelected}
                  outlineState={
                    isSelected
                      ? isThemeDesignDirty
                        ? "red"
                        : "green"
                      : undefined
                  }
                  isPreviewing={previewThemeId === saved.id}
                  title={buildCardTitle(isSelected)}
                  onPreviewStart={
                    !isSelected ? () => onPreviewStart(saved.id) : undefined
                  }
                  onPreviewEnd={onPreviewEnd}
                  onDoubleClick={() => onThemeDoubleClick(saved.id)}
                  onDelete={() => onDeleteSavedTheme(saved.id)}
                  deleteAriaLabel={`Delete unsaved theme ${saved.name}`}
                />
              );
            })}
          </div>
        )}
      </section>

      <section className="theme-section theme-section--builtin">
        <h3 className="theme-section-heading">Saved Themes</h3>
        <div
          className="theme-card-list card-scroll-list"
          role="list"
          aria-label="Saved themes"
          ref={listRef}
        >
          {themeOptions.map((themeOption) => {
            const isSelected = themeOption.id === selectedThemeId;
            return (
              <ThemeCard
                key={themeOption.id}
                themeOption={themeOption}
                isSelected={isSelected}
                outlineState={
                  isSelected
                    ? isThemeDesignDirty
                      ? "red"
                      : "green"
                    : undefined
                }
                isPreviewing={previewThemeId === themeOption.id}
                title={buildCardTitle(isSelected)}
                onPreviewStart={
                  !isSelected ? () => onPreviewStart(themeOption.id) : undefined
                }
                onPreviewEnd={onPreviewEnd}
                onDoubleClick={() => onThemeDoubleClick(themeOption.id)}
                onDelete={
                  canDeleteSavedConfigTheme
                    ? () => onDeleteBuiltinTheme(themeOption.id)
                    : undefined
                }
                deleteAriaLabel={`Delete saved theme ${themeOption.name}`}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}
