import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import {
  createFallbackPresetSnapshot,
  usePosterContext,
} from "@/features/poster/ui/PosterContext";
import {
  AddIcon,
  CheckIcon,
  CloseIcon,
  CopyIcon,
  DownloadIcon,
  RefreshIcon,
  StarIcon,
  TrashIcon,
  UploadIcon,
} from "@/shared/ui/Icons";
import ConfirmModal from "@/shared/ui/ConfirmModal";
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
import {
  cloneSnapshot,
  parseImportedPresets,
  serializePresetsForExport,
} from "../infrastructure/presetsStorage";

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

interface ImportPreviewState {
  filename: string;
  presets: UserPreset[];
}

export default function PresetsSection() {
  const { state, dispatch, mapRef } = usePosterContext();
  const { presets, activePresetId, savedThemes } = state;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [highlightedPresetId, setHighlightedPresetId] = useState<string | null>(
    null,
  );
  const [saveModal, setSaveModal] = useState<SaveModalState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreviewState | null>(
    null,
  );
  const [statusError, setStatusError] = useState<string | null>(null);

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
    setStatusError(null);
    const city = state.form.displayCity.trim();
    const suggestedName = city ? `${city} Preset` : "My Preset";
    setSaveModal({
      mode: "create",
      suggestedName,
      snapshot: captureCurrentSnapshot(),
    });
  }

  function handleOpenDuplicate(preset: UserPreset) {
    setStatusError(null);
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

  function handleExportJson() {
    setStatusError(null);
    const json = serializePresetsForExport(presets);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "terraink-presets.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function handleImportClick() {
    setStatusError(null);
    fileInputRef.current?.click();
  }

  async function handleImportFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = parseImportedPresets(
        text,
        createFallbackPresetSnapshot(),
      );
      if (parsed.ok === false) {
        setStatusError(parsed.error);
        return;
      }
      setStatusError(null);
      setImportPreview({
        filename: file.name,
        presets: parsed.presets,
      });
    } catch {
      setStatusError("Could not read the selected JSON file.");
    }
  }

  function handleImportReplace() {
    if (!importPreview) return;
    dispatch({ type: "SET_PRESETS", presets: importPreview.presets });
    setImportPreview(null);
  }

  function handleImportMerge() {
    if (!importPreview) return;
    const existingById = new Set(presets.map((p) => p.id));
    const existingByName = new Set(
      presets.map((p) => p.name.trim().toLowerCase()),
    );
    const additions: UserPreset[] = [];
    for (const candidate of importPreview.presets) {
      if (candidate.id === DEFAULT_PRESET_ID) continue;
      if (existingByName.has(candidate.name.trim().toLowerCase())) continue;
      const safeId = existingById.has(candidate.id)
        ? createPresetId()
        : candidate.id;
      existingById.add(safeId);
      existingByName.add(candidate.name.trim().toLowerCase());
      additions.push({ ...candidate, id: safeId });
    }
    dispatch({ type: "SET_PRESETS", presets: [...presets, ...additions] });
    setImportPreview(null);
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

        <div className="presets-io-actions">
          <button
            type="button"
            className="presets-io-btn"
            onClick={handleImportClick}
            title="Import presets from JSON file"
          >
            <UploadIcon aria-hidden="true" />
            <span>Import</span>
          </button>
          <button
            type="button"
            className="presets-io-btn"
            onClick={handleExportJson}
            title="Export all presets to JSON file"
          >
            <DownloadIcon aria-hidden="true" />
            <span>Export</span>
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="presets-file-input"
          onChange={(e) => void handleImportFileChange(e)}
        />
      </div>

      {statusError ? (
        <p className="save-theme-error" role="alert">
          {statusError}
        </p>
      ) : null}

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
                  <span className="preset-card-layout">{layoutName}</span>
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

      {importPreview
        ? createPortal(
            <div
              className="picker-modal-backdrop"
              role="presentation"
              onClick={() => setImportPreview(null)}
            >
              <div
                className="picker-modal save-choice-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="import-presets-modal-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="picker-modal-header">
                  <h3 id="import-presets-modal-title">Import Presets</h3>
                  <button
                    type="button"
                    className="picker-modal-close"
                    onClick={() => setImportPreview(null)}
                    aria-label="Cancel"
                  >
                    <CloseIcon />
                  </button>
                </div>
                <p className="save-choice-message">
                  Found <strong>{importPreview.presets.length}</strong> preset(s)
                  in <strong>{importPreview.filename}</strong>. Replace all
                  existing presets (including DEFAULT), or merge new presets into
                  your current list?
                </p>
                <div className="save-choice-actions">
                  <button
                    type="button"
                    className="save-theme-cancel"
                    onClick={() => setImportPreview(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="save-theme-cancel"
                    onClick={handleImportMerge}
                  >
                    Merge New
                  </button>
                  <button
                    type="button"
                    className="save-theme-confirm"
                    onClick={handleImportReplace}
                  >
                    Overwrite All
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
