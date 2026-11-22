import type { RefObject } from "react";
import ThemeCard from "./ThemeCard";
import { DesignerIcon, EditIcon, TrashIcon } from "@/shared/ui/Icons";
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
  selectedThemeOption: ThemeOption;
  onThemeSelect: (themeId: string) => void;
  onCustomize: () => void;
  onOpenThemeDesigner: () => void;
  generatedThemeCount: number;
  canDeleteSelectedBuiltin: boolean;
  onRequestDeleteSelectedBuiltin: () => void;
  savedThemes: SavedTheme[];
  onApplySavedTheme: (themeId: string) => void;
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
  selectedThemeOption,
  onThemeSelect,
  onCustomize,
  onOpenThemeDesigner,
  generatedThemeCount,
  canDeleteSelectedBuiltin,
  onRequestDeleteSelectedBuiltin,
  savedThemes,
  onApplySavedTheme,
  onDeleteSavedTheme,
}: ThemeSummarySectionProps) {
  const description =
    selectedThemeOption.description?.trim() || "No description available.";

  return (
    <div className="theme-summary-view">
      <div className="theme-designer-launch-row">
        <button
          type="button"
          className="theme-designer-launch-btn"
          onClick={onOpenThemeDesigner}
        >
          <DesignerIcon aria-hidden="true" />
          <span>
            Theme Designer
            {generatedThemeCount > 0 ? ` · ${generatedThemeCount}` : ""}
          </span>
        </button>
      </div>

      <div className="theme-summary-head">
        <div className="theme-summary-copy">
          <p className="theme-summary-label">
            Theme:{" "}
            <span className="theme-summary-label-name">
              {selectedThemeOption.name}
            </span>
          </p>
          <p className="theme-card-description">{description}</p>
        </div>
        <div className="theme-summary-head-actions">
          <button
            type="button"
            className="theme-customize-btn"
            onClick={onCustomize}
            title={`Customize ${selectedThemeOption.name} colors`}
            aria-label={`Customize ${selectedThemeOption.name} colors`}
          >
            <span className="theme-customize-icon" aria-hidden="true">
              <EditIcon />
            </span>
          </button>
          {canDeleteSelectedBuiltin ? (
            <button
              type="button"
              className="theme-delete-builtin-btn"
              onClick={onRequestDeleteSelectedBuiltin}
              title={`Delete built-in theme ${selectedThemeOption.name}`}
              aria-label={`Delete Theme ${selectedThemeOption.name}`}
            >
              <TrashIcon aria-hidden="true" />
              <span>Delete Theme</span>
            </button>
          ) : null}
        </div>
      </div>

      <section className="theme-section theme-section--saved">
        <h3 className="theme-section-heading">Saved Themes</h3>
        {savedThemes.length === 0 ? (
          <div className="saved-themes-empty" role="status">
            <p className="saved-themes-empty-text">
              Customize and save a theme to see it here.
            </p>
          </div>
        ) : (
          <div
            className="theme-card-list card-scroll-list saved-themes-list"
            role="list"
            aria-label="Saved themes"
          >
            {savedThemes.map((saved) => (
              <ThemeCard
                key={saved.id}
                themeOption={savedThemeToOption(saved)}
                isSelected={saved.id === selectedThemeId}
                onClick={() => onApplySavedTheme(saved.id)}
                onDelete={() => onDeleteSavedTheme(saved.id)}
                deleteAriaLabel={`Delete saved theme ${saved.name}`}
              />
            ))}
          </div>
        )}
      </section>

      <section className="theme-section theme-section--builtin">
        <h3 className="theme-section-heading">Built-in Themes</h3>
        <div
          className="theme-card-list card-scroll-list"
          role="list"
          aria-label="Theme options"
          ref={listRef}
        >
          {themeOptions.map((themeOption) => (
            <ThemeCard
              key={themeOption.id}
              themeOption={themeOption}
              isSelected={themeOption.id === selectedThemeId}
              onClick={() => onThemeSelect(themeOption.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
