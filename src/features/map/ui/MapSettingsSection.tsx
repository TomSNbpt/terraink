import { useEffect, useMemo, useRef, useState } from "react";
import { usePosterContext } from "@/features/poster/ui/PosterContext";
import {
  createCustomLayoutOption,
  defaultLayoutId,
  formatLayoutDimensions,
  mergeLayoutGroups,
} from "@/features/layout/infrastructure/layoutRepository";
import type {
  ResolvedTheme,
  SavedTheme,
  ThemeColors,
  ThemeOption,
} from "@/features/theme/domain/types";
import LayoutCard from "@/features/layout/ui/LayoutCard";
import LayoutGuidesSection from "@/features/layout/ui/LayoutGuidesSection";
import CreateTemplateForm from "@/features/layout/ui/CreateTemplateForm";
import ThemePickerView from "@/features/theme/ui/ThemePickerView";
import ThemeDesignerPanel from "@/features/theme-designer/ui/ThemeDesignerPanel";
import ConfirmModal from "@/shared/ui/ConfirmModal";
import { AddIcon, DesignerIcon } from "@/shared/ui/Icons";
import type {
  DesignerMessage,
  GeneratedTheme,
  ResolvedRouteOverlay,
  ThemeDesignerSession,
} from "@/features/theme-designer/domain/types";
import type {
  CustomTemplate,
  Layout,
  LayoutGroup,
} from "@/features/layout/domain/types";
import type { CustomSizeUnit } from "@/features/poster/application/posterReducer";

interface MapSettingsForm {
  theme: string;
  layout: string;
  width: string;
  height: string;
  distance: string;
  customSizeUnit?: CustomSizeUnit;
  includeBuildings: boolean;
  includeWater: boolean;
  includeParks: boolean;
  includeAeroway: boolean;
  includeRail: boolean;
  includeRoads: boolean;
  includeRoadPath: boolean;
  includeRoadMinorLow: boolean;
  includeRoadOutline: boolean;
}

interface MapSettingsSectionProps {
  activeMobileTab?: string;
  layoutControlsSlot?: React.ReactNode;
  form: MapSettingsForm;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onNumericFieldBlur: (event: React.FocusEvent<HTMLInputElement>) => void;
  onThemeChange: (themeId: string) => void;
  onLayoutChange: (layoutId: string) => void;
  onCustomUnitChange?: (unit: CustomSizeUnit) => void;
  selectedTheme: ResolvedTheme;
  effectiveTheme: ResolvedTheme;
  themeOptions: ThemeOption[];
  layoutGroups: LayoutGroup[];
  minPosterCm: number;
  maxPosterCm: number;
  customColors: Record<string, string>;
  savedThemes: SavedTheme[];
  deletedBuiltinThemeIds: string[];
  onAddSavedTheme: (theme: SavedTheme) => void;
  onRemoveSavedTheme: (themeId: string) => void;
  onDeleteBuiltinTheme: (themeId: string) => void;
  onSetCustomColors: (colors: Record<string, string>) => void;
  themeDesigner: ThemeDesignerSession;
  onAddDesignerMessage: (message: DesignerMessage) => void;
  onAddDesignerResponse: (
    message: DesignerMessage,
    themes: GeneratedTheme[],
  ) => void;
  onAddAiRouteOverlay: (overlay: ResolvedRouteOverlay) => void;
  onSelectGeneratedTheme: (themeId: string | null) => void;
  onMarkGeneratedThemeSaved: (
    generatedThemeId: string,
    savedThemeId: string,
  ) => void;
  onClearThemeDesigner: () => void;
}

export default function MapSettingsSection({
  activeMobileTab,
  layoutControlsSlot,
  form,
  onThemeChange,
  onLayoutChange,
  selectedTheme,
  effectiveTheme,
  themeOptions,
  layoutGroups,
  savedThemes,
  deletedBuiltinThemeIds,
  onAddSavedTheme,
  onRemoveSavedTheme,
  onDeleteBuiltinTheme,
  onSetCustomColors,
  themeDesigner,
  onAddDesignerMessage,
  onAddDesignerResponse,
  onAddAiRouteOverlay,
  onSelectGeneratedTheme,
  onMarkGeneratedThemeSaved,
  onClearThemeDesigner,
}: MapSettingsSectionProps) {
  const { state, dispatch } = usePosterContext();

  const [isThemeDesignerOpen, setIsThemeDesignerOpen] = useState(false);
  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [pendingLoadTemplate, setPendingLoadTemplate] = useState<Layout | null>(
    null,
  );
  const [pendingDeleteTemplate, setPendingDeleteTemplate] =
    useState<Layout | null>(null);

  const layoutGroupsRef = useRef<HTMLDivElement | null>(null);

  const mergedLayoutGroups = useMemo(
    () => mergeLayoutGroups(layoutGroups, state.customTemplates),
    [layoutGroups, state.customTemplates],
  );

  const layoutOptions = useMemo(
    () => mergedLayoutGroups.flatMap((g) => g.options),
    [mergedLayoutGroups],
  );

  const existingTemplateIds = useMemo(
    () => new Set(layoutOptions.map((option) => option.id)),
    [layoutOptions],
  );

  const selectedLayoutOption = useMemo(() => {
    const match = layoutOptions.find((lo) => lo.id === form.layout);
    if (match) return match;
    return createCustomLayoutOption(
      Number(form.width),
      Number(form.height),
      form.customSizeUnit ?? "in",
    );
  }, [form.customSizeUnit, form.height, form.layout, form.width, layoutOptions]);

  const selectedLayoutDescription =
    selectedLayoutOption.id === "custom"
      ? "Your custom template."
      : selectedLayoutOption.description?.trim() || "No description available.";

  useEffect(() => {
    if (activeMobileTab && activeMobileTab !== "layout") {
      setIsTemplatePickerOpen(false);
      setIsCreatingTemplate(false);
    }
    if (activeMobileTab && activeMobileTab !== "theme") {
      setIsThemeDesignerOpen(false);
    }
  }, [activeMobileTab]);

  useEffect(() => {
    if (!isTemplatePickerOpen || isCreatingTemplate) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      const selectedLayoutCard =
        layoutGroupsRef.current?.querySelector<HTMLElement>(
          ".layout-card.is-selected",
        );
      selectedLayoutCard?.scrollIntoView({
        behavior: "auto",
        block: "nearest",
        inline: "start",
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [isTemplatePickerOpen, isCreatingTemplate]);

  function handleSaveGeneratedTheme(
    generatedTheme: GeneratedTheme,
    name: string,
    description: string,
  ) {
    const colorsSnapshot: ThemeColors = {
      ui: { ...generatedTheme.colors.ui },
      map: {
        ...generatedTheme.colors.map,
        roads: { ...generatedTheme.colors.map.roads },
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
    onMarkGeneratedThemeSaved(generatedTheme.id, id);
  }

  function handleRequestLoadTemplate(layoutOption: Layout) {
    if (layoutOption.id === form.layout) {
      setIsTemplatePickerOpen(false);
      return;
    }
    setPendingLoadTemplate(layoutOption);
  }

  function handleConfirmLoadTemplate() {
    if (!pendingLoadTemplate) return;
    const targetId = pendingLoadTemplate.id;
    setPendingLoadTemplate(null);
    onLayoutChange(targetId);
    setIsTemplatePickerOpen(false);
  }

  function handleCreateCustomTemplate(template: CustomTemplate) {
    dispatch({ type: "ADD_CUSTOM_TEMPLATE", template });
    setIsCreatingTemplate(false);
  }

  function handleConfirmDeleteTemplate() {
    if (!pendingDeleteTemplate) return;
    const templateId = pendingDeleteTemplate.id;
    if (form.layout === templateId) {
      onLayoutChange(defaultLayoutId);
    }
    dispatch({ type: "REMOVE_CUSTOM_TEMPLATE", templateId });
    setPendingDeleteTemplate(null);
  }

  function handleOpenTemplatePicker() {
    setIsCreatingTemplate(false);
    setIsTemplatePickerOpen(true);
  }

  function handleCloseTemplatePicker() {
    setIsCreatingTemplate(false);
    setIsTemplatePickerOpen(false);
  }

  const generatedThemeCount = themeDesigner.generatedThemes.length;

  return (
    <section className="panel-block">
      <div className="map-settings-theme-part">
        {isThemeDesignerOpen ? (
          <ThemeDesignerPanel
            session={themeDesigner}
            savedThemes={savedThemes}
            currentMapTheme={effectiveTheme}
            onClose={() => setIsThemeDesignerOpen(false)}
            onAddUserMessage={onAddDesignerMessage}
            onAddAssistantResponse={onAddDesignerResponse}
            onAddAiRouteOverlay={onAddAiRouteOverlay}
            onSelectGeneratedTheme={onSelectGeneratedTheme}
            onSaveGeneratedTheme={handleSaveGeneratedTheme}
            onClearSession={onClearThemeDesigner}
          />
        ) : (
          <>
            <h2>Theme</h2>

            <div className="theme-designer-launch-row">
              <button
                type="button"
                className="theme-designer-launch-btn"
                onClick={() => setIsThemeDesignerOpen(true)}
              >
                <DesignerIcon aria-hidden="true" />
                <span>
                  Theme Designer
                  {generatedThemeCount > 0 ? ` · ${generatedThemeCount}` : ""}
                </span>
              </button>
            </div>

            <ThemePickerView
              isActive={activeMobileTab === "theme"}
              themeId={form.theme}
              selectedTheme={selectedTheme}
              themeOptions={themeOptions}
              savedThemes={savedThemes}
              deletedBuiltinThemeIds={deletedBuiltinThemeIds}
              themeDesigner={themeDesigner}
              onThemeChange={onThemeChange}
              onRemoveSavedTheme={onRemoveSavedTheme}
              onDeleteBuiltinTheme={onDeleteBuiltinTheme}
              onSetCustomColors={onSetCustomColors}
            />
          </>
        )}
      </div>

      {pendingLoadTemplate ? (
        <ConfirmModal
          title="Load Template"
          message={`Load "${pendingLoadTemplate.name}" (${formatLayoutDimensions(pendingLoadTemplate)})? This will update your map dimensions and guides.`}
          confirmLabel="Load Template"
          cancelLabel="Cancel"
          onConfirm={handleConfirmLoadTemplate}
          onCancel={() => setPendingLoadTemplate(null)}
        />
      ) : null}

      {pendingDeleteTemplate ? (
        <ConfirmModal
          title="Delete Template"
          message={`Delete custom template "${pendingDeleteTemplate.name}"? This cannot be undone.`}
          confirmLabel="Delete Template"
          cancelLabel="Cancel"
          destructive
          onConfirm={handleConfirmDeleteTemplate}
          onCancel={() => setPendingDeleteTemplate(null)}
        />
      ) : null}

      <div className="map-settings-layout-part">
        <h2>Layout</h2>

        {isTemplatePickerOpen ? (
          isCreatingTemplate ? (
            <CreateTemplateForm
              layoutGroups={mergedLayoutGroups}
              existingTemplateIds={existingTemplateIds}
              onCreateTemplate={handleCreateCustomTemplate}
              onCancel={() => setIsCreatingTemplate(false)}
            />
          ) : (
            <>
              <div className="template-picker-header">
                <div className="layout-summary-copy">
                  <p className="section-summary-label">TEMPLATE</p>
                  <p className="theme-interaction-hint">
                    Double-click a template to load
                  </p>
                </div>
                <button
                  type="button"
                  className="theme-edit-done-btn"
                  onClick={handleCloseTemplatePicker}
                >
                  Done
                </button>
              </div>

              <div className="layout-inline-groups" ref={layoutGroupsRef}>
                {mergedLayoutGroups.map((group) => (
                  <section key={group.id} className="layout-inline-group">
                    <h3>{group.name}</h3>
                    <div className="layout-inline-list card-scroll-list">
                      {group.options.map((layoutOption) => (
                        <LayoutCard
                          key={layoutOption.id}
                          layoutOption={layoutOption}
                          isSelected={layoutOption.id === form.layout}
                          onDoubleClick={() =>
                            handleRequestLoadTemplate(layoutOption)
                          }
                          onDelete={
                            layoutOption.isCustom
                              ? () => setPendingDeleteTemplate(layoutOption)
                              : undefined
                          }
                          title={
                            layoutOption.id === form.layout
                              ? `${layoutOption.name} (active)`
                              : `Double-click to load ${layoutOption.name}`
                          }
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>

              <div className="template-picker-create-row">
                <button
                  type="button"
                  className="create-template-submit-btn"
                  onClick={() => setIsCreatingTemplate(true)}
                >
                  <AddIcon aria-hidden="true" />
                  <span>CREATE NEW TEMPLATE</span>
                </button>
              </div>
            </>
          )
        ) : (
          <>
            <p className="section-summary-label">TEMPLATE</p>

            <div className="template-current-card-wrap">
              <LayoutCard
                layoutOption={selectedLayoutOption}
                isSelected
                onClick={handleOpenTemplatePicker}
              />
              <p className="template-current-description">
                {selectedLayoutDescription}
              </p>
            </div>

            {layoutControlsSlot ? (
              <div className="layout-controls-slot">{layoutControlsSlot}</div>
            ) : null}

            <LayoutGuidesSection />
          </>
        )}
      </div>
    </section>
  );
}
