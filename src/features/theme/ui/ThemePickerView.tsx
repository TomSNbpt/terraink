import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePosterContext } from "@/features/poster/ui/PosterContext";
import {
  DISPLAY_PALETTE_KEYS,
  type ResolvedTheme,
  type SavedTheme,
  type ThemeOption,
} from "../domain/types";
import { getThemeColorByPath } from "../domain/colorPaths";
import { createFallbackThemeOption } from "../domain/colorSuggestions";
import ThemeSummarySection from "./ThemeSummarySection";
import ThemeSwitchModal from "./ThemeSwitchModal";
import SavePresetModal from "@/features/presets/ui/SavePresetModal";
import {
  captureSnapshotFromState,
  createPresetId,
} from "@/features/presets/application/presetHelpers";
import { cloneSnapshot } from "@/features/presets/infrastructure/presetsStorage";
import type {
  PresetSnapshot,
  UserPreset,
} from "@/features/presets/domain/types";
import ConfirmModal from "@/shared/ui/ConfirmModal";
import type { ThemeDesignerSession } from "@/features/theme-designer/domain/types";

interface SaveBeforeSwitchState {
  targetThemeId: string;
  suggestedName: string;
  snapshot: PresetSnapshot;
}

interface ThemePickerViewProps {
  isActive: boolean;
  themeId: string;
  selectedTheme: ResolvedTheme;
  themeOptions: ThemeOption[];
  savedThemes: SavedTheme[];
  deletedBuiltinThemeIds: string[];
  themeDesigner: ThemeDesignerSession;
  onThemeChange: (themeId: string) => void;
  onRemoveSavedTheme: (themeId: string) => void;
  onDeleteBuiltinTheme: (themeId: string) => void;
  onSetCustomColors: (colors: Record<string, string>) => void;
  onThemeSwitched?: () => void;
}

export default function ThemePickerView({
  isActive,
  themeId,
  selectedTheme,
  themeOptions,
  savedThemes,
  deletedBuiltinThemeIds,
  themeDesigner,
  onThemeChange,
  onRemoveSavedTheme,
  onDeleteBuiltinTheme,
  onSetCustomColors,
  onThemeSwitched,
}: ThemePickerViewProps) {
  const {
    state,
    dispatch,
    mapRef,
    previewThemeId,
    setPreviewThemeId,
    isThemeDesignDirty,
  } = usePosterContext();

  const [pendingDeleteThemeId, setPendingDeleteThemeId] = useState<
    string | null
  >(null);
  const [pendingDeleteBuiltinThemeId, setPendingDeleteBuiltinThemeId] =
    useState<string | null>(null);
  const [pendingSwitchThemeId, setPendingSwitchThemeId] = useState<
    string | null
  >(null);
  const [saveBeforeSwitch, setSaveBeforeSwitch] =
    useState<SaveBeforeSwitchState | null>(null);
  const [isResetActiveThemeModalOpen, setIsResetActiveThemeModalOpen] =
    useState(false);

  const themeListRef = useRef<HTMLDivElement | null>(null);

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

  const resolveThemeNameById = useCallback(
    (id: string): string => {
      const builtin = visibleThemeOptions.find((t) => t.id === id);
      if (builtin) return builtin.name;
      const unsaved = savedThemes.find((t) => t.id === id);
      if (unsaved) return unsaved.name;
      return id;
    },
    [savedThemes, visibleThemeOptions],
  );

  const handlePreviewStart = useCallback(
    (targetThemeId: string) => {
      setPreviewThemeId(targetThemeId);
    },
    [setPreviewThemeId],
  );

  const handlePreviewEnd = useCallback(() => {
    setPreviewThemeId(null);
  }, [setPreviewThemeId]);

  useEffect(() => {
    if (!isActive) {
      setPreviewThemeId(null);
    }
  }, [isActive, setPreviewThemeId]);

  useEffect(() => {
    return () => {
      setPreviewThemeId(null);
    };
  }, [setPreviewThemeId]);

  useEffect(() => {
    if (!isActive) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      const selectedThemeCard = themeListRef.current?.querySelector<HTMLElement>(
        ".theme-card.is-selected",
      );
      selectedThemeCard?.scrollIntoView({
        behavior: "auto",
        block: "nearest",
        inline: "start",
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [isActive]);

  function handleThemeDoubleClick(targetThemeId: string) {
    setPreviewThemeId(null);

    const isActiveTheme = targetThemeId === themeId;

    if (isActiveTheme) {
      if (isThemeDesignDirty) {
        setIsResetActiveThemeModalOpen(true);
      }
      return;
    }

    if (!isThemeDesignDirty) {
      onThemeChange(targetThemeId);
      onThemeSwitched?.();
      return;
    }

    setPendingSwitchThemeId(targetThemeId);
  }

  function handleConfirmResetActiveTheme() {
    dispatch({
      type: "RESET_ACTIVE_THEME_DESIGN",
    });
    setIsResetActiveThemeModalOpen(false);
    onThemeSwitched?.();
  }

  function handleSwitchWithoutSaving() {
    if (!pendingSwitchThemeId) return;
    const targetId = pendingSwitchThemeId;
    setPendingSwitchThemeId(null);
    onThemeChange(targetId);
    onThemeSwitched?.();
  }

  function handleOpenSavePresetBeforeSwitch() {
    if (!pendingSwitchThemeId) return;
    const targetThemeId = pendingSwitchThemeId;
    const bearing = mapRef.current ? mapRef.current.getBearing() : 0;
    const snapshot = captureSnapshotFromState(state, bearing);
    const city = state.form.displayCity.trim();
    const themeName = selectedThemeOption.name.trim();
    const suggestedName =
      city && themeName
        ? `${city} — ${themeName}`
        : city
          ? `${city} Product`
          : themeName || "My Product";

    setPendingSwitchThemeId(null);
    setSaveBeforeSwitch({
      targetThemeId,
      suggestedName,
      snapshot,
    });
  }

  function handleSaveBeforeSwitchCreate(name: string) {
    if (!saveBeforeSwitch) return;
    const now = new Date().toISOString();
    const newPreset: UserPreset = {
      id: createPresetId(),
      name,
      createdAt: now,
      updatedAt: now,
      snapshot: cloneSnapshot(saveBeforeSwitch.snapshot),
    };
    const targetId = saveBeforeSwitch.targetThemeId;
    dispatch({
      type: "ADD_PRESET",
      preset: newPreset,
      setActive: false,
    });
    setSaveBeforeSwitch(null);
    onThemeChange(targetId);
    onThemeSwitched?.();
  }

  function handleSaveBeforeSwitchOverwrite(existingPreset: UserPreset) {
    if (!saveBeforeSwitch) return;
    const targetId = saveBeforeSwitch.targetThemeId;
    dispatch({
      type: "UPDATE_PRESET",
      presetId: existingPreset.id,
      snapshot: cloneSnapshot(saveBeforeSwitch.snapshot),
    });
    setSaveBeforeSwitch(null);
    onThemeChange(targetId);
    onThemeSwitched?.();
  }

  function handleConfirmDeleteSavedTheme() {
    const targetId = pendingDeleteThemeId;
    if (!targetId) return;

    if (themeId === targetId) {
      const deleted = savedThemes.find((t) => t.id === targetId);
      const fallbackBaseThemeId =
        visibleThemeOptions.find((t) => t.id !== targetId)?.id ??
        themeOptions.find((t) => t.id !== targetId)?.id ??
        themeId;
      onThemeChange(fallbackBaseThemeId);
      if (deleted) {
        const colorOverrides: Record<string, string> = {};
        for (const key of DISPLAY_PALETTE_KEYS) {
          const color = getThemeColorByPath(deleted.colors, key);
          if (color) colorOverrides[key] = color;
        }
        onSetCustomColors(colorOverrides);
      }
    }

    onRemoveSavedTheme(targetId);
    setPendingDeleteThemeId(null);
  }

  function handleRequestDeleteBuiltin(targetId: string) {
    if (visibleThemeOptions.length <= 1) return;
    setPreviewThemeId(null);
    setPendingDeleteBuiltinThemeId(targetId);
  }

  function handleConfirmDeleteBuiltinTheme() {
    const targetId = pendingDeleteBuiltinThemeId;
    if (!targetId) return;

    const remaining = visibleThemeOptions.filter((t) => t.id !== targetId);
    if (remaining.length === 0) {
      setPendingDeleteBuiltinThemeId(null);
      return;
    }

    if (themeId === targetId) {
      onThemeChange(remaining[0].id);
    }

    onDeleteBuiltinTheme(targetId);
    setPendingDeleteBuiltinThemeId(null);
  }

  return (
    <>
      <ThemeSummarySection
        listRef={themeListRef}
        themeOptions={visibleThemeOptions}
        selectedThemeId={themeId}
        isThemeDesignDirty={isThemeDesignDirty}
        previewThemeId={previewThemeId}
        onPreviewStart={handlePreviewStart}
        onPreviewEnd={handlePreviewEnd}
        onThemeDoubleClick={handleThemeDoubleClick}
        onDeleteBuiltinTheme={handleRequestDeleteBuiltin}
        savedThemes={savedThemes}
        onDeleteSavedTheme={(id) => {
          setPreviewThemeId(null);
          setPendingDeleteThemeId(id);
        }}
      />

      {pendingSwitchThemeId ? (
        <ThemeSwitchModal
          targetThemeName={resolveThemeNameById(pendingSwitchThemeId)}
          onSavePresetAndSwitch={handleOpenSavePresetBeforeSwitch}
          onSwitchWithoutSaving={handleSwitchWithoutSaving}
          onCancel={() => setPendingSwitchThemeId(null)}
        />
      ) : null}

      {saveBeforeSwitch ? (
        <SavePresetModal
          title="Save Product Before Switching"
          suggestedName={saveBeforeSwitch.suggestedName}
          existingPresets={state.presets}
          onCreate={handleSaveBeforeSwitchCreate}
          onOverwrite={handleSaveBeforeSwitchOverwrite}
          onCancel={() => setSaveBeforeSwitch(null)}
        />
      ) : null}

      {isResetActiveThemeModalOpen ? (
        <ConfirmModal
          title="Reset theme design"
          message={`Reset all design changes back to the defaults for "${selectedThemeOption.name}"?`}
          confirmLabel="Reset Theme"
          cancelLabel="Cancel"
          destructive
          onConfirm={handleConfirmResetActiveTheme}
          onCancel={() => setIsResetActiveThemeModalOpen(false)}
        />
      ) : null}

      {pendingDeleteThemeId ? (
        <ConfirmModal
          title="Delete unsaved theme"
          message={`Delete "${
            savedThemes.find((t) => t.id === pendingDeleteThemeId)?.name ??
            "this theme"
          }" from Unsaved Themes? This cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          destructive
          onConfirm={handleConfirmDeleteSavedTheme}
          onCancel={() => setPendingDeleteThemeId(null)}
        />
      ) : null}

      {pendingDeleteBuiltinThemeId ? (
        <ConfirmModal
          title="Delete saved theme"
          message={`Remove "${
            visibleThemeOptions.find(
              (t) => t.id === pendingDeleteBuiltinThemeId,
            )?.name ?? "this theme"
          }" from Saved Themes? Export and save src/data/config.json in Settings to make this deletion permanent.`}
          confirmLabel="Delete Theme"
          cancelLabel="Cancel"
          destructive
          onConfirm={handleConfirmDeleteBuiltinTheme}
          onCancel={() => setPendingDeleteBuiltinThemeId(null)}
        />
      ) : null}
    </>
  );
}
