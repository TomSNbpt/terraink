import { useMemo, useState } from "react";
import { usePosterContext } from "@/features/poster/ui/PosterContext";
import {
  AddIcon,
  CheckIcon,
  CopyIcon,
  EditIcon,
  RefreshIcon,
  StarIcon,
  TrashIcon,
} from "@/shared/ui/Icons";
import ConfirmModal from "@/shared/ui/ConfirmModal";
import RenamePresetModal from "./RenamePresetModal";
import SavePresetModal from "./SavePresetModal";
import {
  DEFAULT_PRESET_ID,
  type PresetSnapshot,
  type UserPreset,
} from "../domain/types";
import {
  captureSnapshotFromState,
  createPresetId,
  resolveSnapshotLayoutName,
  resolveSnapshotPalette,
} from "../application/presetHelpers";
import { cloneSnapshot } from "../infrastructure/presetsStorage";

type SaveModalState =
  | { mode: "create"; suggestedName: string; snapshot: PresetSnapshot }
  | {
      mode: "duplicate";
      sourceName: string;
      suggestedName: string;
      snapshot: PresetSnapshot;
    };

type ConfirmState =
  | { kind: "load"; preset: UserPreset }
  | { kind: "update"; preset: UserPreset }
  | { kind: "set-default"; preset: UserPreset }
  | { kind: "delete"; preset: UserPreset };

export default function PresetsSection() {
  const { state, dispatch, mapRef } = usePosterContext();
  const { presets, activePresetId, savedThemes } = state;

  const [highlightedPresetId, setHighlightedPresetId] = useState<string | null>(
    null,
  );
  const [saveModal, setSaveModal] = useState<SaveModalState | null>(null);
  const [renamePreset, setRenamePreset] = useState<UserPreset | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const presetMetaById = useMemo(() => {
    const map = new Map<
      string,
      { palette: string[]; layoutName: string }
    >();
    for (const preset of presets) {
      map.set(preset.id, {
        palette: resolveSnapshotPalette(preset.snapshot, savedThemes),
        layoutName: resolveSnapshotLayoutName(preset.snapshot),
      });
    }
    return map;
  }, [presets, savedThemes]);

  function captureCurrentSnapshot(): PresetSnapshot {
    const bearing = mapRef.current ? mapRef.current.getBearing() : 0;
    return captureSnapshotFromState(state, bearing);
  }

  function handleOpenNewPreset() {
    const city = state.form.displayCity.trim();
    const suggestedName = city ? `${city} Preset` : "My Preset";
    setSaveModal({
      mode: "create",
      suggestedName,
      snapshot: captureCurrentSnapshot(),
    });
  }

  function handleOpenDuplicate(preset: UserPreset) {
    setSaveModal({
      mode: "duplicate",
      sourceName: preset.name,
      suggestedName: `${preset.name} Copy`,
      snapshot: cloneSnapshot(preset.snapshot),
    });
  }

  function handleSaveModalCreate(name: string) {
    if (!saveModal) return;
    const now = new Date().toISOString();
    const newPreset: UserPreset = {
      id: createPresetId(),
      name,
      createdAt: now,
      updatedAt: now,
      snapshot: cloneSnapshot(saveModal.snapshot),
    };
    dispatch({
      type: "ADD_PRESET",
      preset: newPreset,
      setActive: saveModal.mode === "create",
    });
    setSaveModal(null);
  }

  function handleSaveModalOverwrite(existingPreset: UserPreset) {
    if (!saveModal) return;
    dispatch({
      type: "UPDATE_PRESET",
      presetId: existingPreset.id,
      snapshot: cloneSnapshot(saveModal.snapshot),
    });
    setSaveModal(null);
  }

  function handleConfirmAction() {
    if (!confirmState) return;
    if (confirmState.kind === "load") {
      dispatch({
        type: "APPLY_PRESET",
        presetId: confirmState.preset.id,
      });
    } else if (confirmState.kind === "update") {
      dispatch({
        type: "UPDATE_PRESET",
        presetId: confirmState.preset.id,
        snapshot: captureCurrentSnapshot(),
      });
    } else if (confirmState.kind === "set-default") {
      dispatch({
        type: "SET_DEFAULT_PRESET",
        snapshot: cloneSnapshot(confirmState.preset.snapshot),
      });
    } else if (confirmState.kind === "delete") {
      dispatch({
        type: "REMOVE_PRESET",
        presetId: confirmState.preset.id,
      });
    }
    setConfirmState(null);
  }

  return (
    <section className="panel-block presets-section">
      <h2>Presets</h2>
      <p className="presets-note">
        Save snapshots of your complete map setup (location, scale, theme,
        layout, layers, style, markers, and routes). The app always opens to{" "}
        <strong>DEFAULT</strong>.
      </p>

      <div className="presets-toolbar">
        <button
          type="button"
          className="presets-new-btn"
          onClick={handleOpenNewPreset}
        >
          <AddIcon aria-hidden="true" />
          <span>New Preset</span>
        </button>
      </div>

      <div className="presets-list" role="list" aria-label="Saved presets">
        {presets.map((preset) => {
          const isDefault = preset.id === DEFAULT_PRESET_ID;
          const isLoaded = preset.id === activePresetId;
          const isHighlighted = preset.id === highlightedPresetId;
          const meta = presetMetaById.get(preset.id);
          const palette = meta?.palette ?? [];
          const layoutName = meta?.layoutName ?? preset.snapshot.form.layout;

          return (
            <div
              key={preset.id}
              className={`preset-card${isLoaded ? " is-selected" : ""}${
                isHighlighted ? " is-highlighted" : ""
              }${isDefault ? " is-default" : ""}`}
              role="listitem"
            >
              <button
                type="button"
                className="preset-card-main"
                onClick={() =>
                  setHighlightedPresetId((prev) =>
                    prev === preset.id ? null : preset.id,
                  )
                }
                aria-pressed={isHighlighted}
              >
                <div className="preset-card-swatch" aria-hidden="true">
                  {palette.map((color, idx) => (
                    <span
                      key={`${preset.id}-${color}-${idx}`}
                      className="preset-card-swatch-chip"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>

                <div className="preset-card-meta">
                  <div className="preset-card-title-row">
                    <span className="preset-card-name">{preset.name}</span>
                    {isDefault ? (
                      <span className="preset-default-badge">Startup</span>
                    ) : null}
                    {isLoaded ? (
                      <span className="preset-active-badge">Loaded</span>
                    ) : null}
                  </div>
                  <span className="preset-card-layout" title={layoutName}>
                    {layoutName}
                  </span>
                </div>
              </button>

              <div className="preset-card-actions">
                <button
                  type="button"
                  className="preset-action-btn preset-action-btn--load"
                  onClick={() => setConfirmState({ kind: "load", preset })}
                  title={`Load "${preset.name}" onto the map`}
                  aria-label={`Load ${preset.name}`}
                >
                  <CheckIcon aria-hidden="true" />
                  <span>Load</span>
                </button>

                <button
                  type="button"
                  className="preset-action-btn"
                  onClick={() => setConfirmState({ kind: "update", preset })}
                  title={`Overwrite "${preset.name}" with current settings`}
                  aria-label={`Update ${preset.name}`}
                >
                  <RefreshIcon aria-hidden="true" />
                  <span>Update</span>
                </button>

                {!isDefault ? (
                  <button
                    type="button"
                    className="preset-action-btn"
                    onClick={() =>
                      setConfirmState({ kind: "set-default", preset })
                    }
                    title={`Copy "${preset.name}" into DEFAULT`}
                    aria-label={`Set ${preset.name} as DEFAULT`}
                  >
                    <StarIcon aria-hidden="true" />
                    <span>Set Default</span>
                  </button>
                ) : null}

                {!isDefault ? (
                  <button
                    type="button"
                    className="preset-action-btn preset-action-btn--icon"
                    onClick={() => setRenamePreset(preset)}
                    title={`Rename "${preset.name}"`}
                    aria-label={`Rename ${preset.name}`}
                  >
                    <EditIcon aria-hidden="true" />
                  </button>
                ) : null}

                <button
                  type="button"
                  className="preset-action-btn preset-action-btn--icon"
                  onClick={() => handleOpenDuplicate(preset)}
                  title={`Duplicate "${preset.name}"`}
                  aria-label={`Duplicate ${preset.name}`}
                >
                  <CopyIcon aria-hidden="true" />
                </button>

                {!isDefault ? (
                  <button
                    type="button"
                    className="preset-action-btn preset-action-btn--icon preset-action-btn--delete"
                    onClick={() => setConfirmState({ kind: "delete", preset })}
                    title={`Delete "${preset.name}"`}
                    aria-label={`Delete ${preset.name}`}
                  >
                    <TrashIcon aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {saveModal ? (
        <SavePresetModal
          title={
            saveModal.mode === "duplicate"
              ? `Duplicate "${saveModal.sourceName}"`
              : "New Preset"
          }
          suggestedName={saveModal.suggestedName}
          existingPresets={presets}
          onCreate={handleSaveModalCreate}
          onOverwrite={handleSaveModalOverwrite}
          onCancel={() => setSaveModal(null)}
        />
      ) : null}

      {renamePreset ? (
        <RenamePresetModal
          preset={renamePreset}
          existingPresets={presets}
          onRename={(newName) => {
            dispatch({
              type: "RENAME_PRESET",
              presetId: renamePreset.id,
              name: newName,
            });
            setRenamePreset(null);
          }}
          onCancel={() => setRenamePreset(null)}
        />
      ) : null}

      {confirmState?.kind === "load" ? (
        <ConfirmModal
          title="Load Preset"
          message={`Load "${confirmState.preset.name}"? Any unsaved changes to your current map and poster setup will be replaced.`}
          confirmLabel="Load Preset"
          cancelLabel="Cancel"
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmState(null)}
        />
      ) : null}

      {confirmState?.kind === "update" ? (
        <ConfirmModal
          title="Overwrite Preset"
          message={`Overwrite "${confirmState.preset.name}" with your current map and poster settings?`}
          confirmLabel="Overwrite"
          cancelLabel="Cancel"
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmState(null)}
        />
      ) : null}

      {confirmState?.kind === "set-default" ? (
        <ConfirmModal
          title="Overwrite DEFAULT Preset"
          message={`Copy all settings from "${confirmState.preset.name}" into DEFAULT?\n\n"${confirmState.preset.name}" will remain in your preset list.`}
          confirmLabel="Set as DEFAULT"
          cancelLabel="Cancel"
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmState(null)}
        />
      ) : null}

      {confirmState?.kind === "delete" ? (
        <ConfirmModal
          title="Delete Preset"
          message={`Delete preset "${confirmState.preset.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          destructive
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmState(null)}
        />
      ) : null}

    </section>
  );
}
