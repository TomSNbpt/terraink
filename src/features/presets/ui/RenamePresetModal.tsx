import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "@/shared/ui/Icons";
import { DEFAULT_PRESET_NAME, type UserPreset } from "../domain/types";

interface RenamePresetModalProps {
  preset: UserPreset;
  existingPresets: UserPreset[];
  onRename: (newName: string) => void;
  onCancel: () => void;
}

export default function RenamePresetModal({
  preset,
  existingPresets,
  onRename,
  onCancel,
}: RenamePresetModalProps) {
  const [name, setName] = useState(preset.name);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const otherPresetsByLowerName = useMemo(() => {
    const map = new Map<string, UserPreset>();
    for (const item of existingPresets) {
      if (item.id === preset.id) continue;
      map.set(item.name.trim().toLowerCase(), item);
    }
    return map;
  }, [existingPresets, preset.id]);

  const trimmedName = name.trim();
  const isEmpty = trimmedName.length === 0;
  const isReservedDefault =
    trimmedName.toUpperCase() === DEFAULT_PRESET_NAME;
  const conflictPreset = !isEmpty
    ? otherPresetsByLowerName.get(trimmedName.toLowerCase()) ?? null
    : null;
  const isUnchanged = trimmedName === preset.name;

  const errorMessage = isReservedDefault
    ? `"${DEFAULT_PRESET_NAME}" is reserved for the startup product.`
    : conflictPreset
      ? `A product named "${conflictPreset.name}" already exists.`
      : null;

  const canSubmit = !isEmpty && !isUnchanged && errorMessage === null;

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    onRename(trimmedName);
  }

  return createPortal(
    <div
      className="picker-modal-backdrop"
      role="presentation"
      onClick={onCancel}
    >
      <div
        className="picker-modal save-theme-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-preset-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="picker-modal-header">
          <h3 id="rename-preset-modal-title">Rename Product</h3>
          <button
            type="button"
            className="picker-modal-close"
            onClick={onCancel}
            aria-label="Cancel"
          >
            <CloseIcon />
          </button>
        </div>

        <form className="save-theme-modal-body" onSubmit={handleSubmit}>
          <label className="save-theme-field">
            <span className="save-theme-field-label">Product Name</span>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="e.g. Print Poster — Tokyo"
            />
          </label>

          {errorMessage ? (
            <p className="save-theme-error" role="alert">
              {errorMessage}
            </p>
          ) : (
            <p className="save-theme-hint">
              Updates the product name in your session and Settings config
              snapshot.
            </p>
          )}

          <div className="save-theme-actions">
            <button
              type="button"
              className="save-theme-cancel"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="save-theme-confirm"
              disabled={!canSubmit}
            >
              Rename
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
