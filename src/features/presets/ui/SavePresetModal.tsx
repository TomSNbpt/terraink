import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "@/shared/ui/Icons";
import type { UserPreset } from "../domain/types";

interface SavePresetModalProps {
  title: string;
  suggestedName: string;
  existingPresets: UserPreset[];
  onCreate: (name: string) => void;
  onOverwrite: (existingPreset: UserPreset) => void;
  onCancel: () => void;
}

export default function SavePresetModal({
  title,
  suggestedName,
  existingPresets,
  onCreate,
  onOverwrite,
  onCancel,
}: SavePresetModalProps) {
  const [name, setName] = useState(suggestedName);
  const [conflictPreset, setConflictPreset] = useState<UserPreset | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const presetByLowerName = useMemo(() => {
    const map = new Map<string, UserPreset>();
    for (const preset of existingPresets) {
      map.set(preset.name.trim().toLowerCase(), preset);
    }
    return map;
  }, [existingPresets]);

  const trimmedName = name.trim();
  const isEmpty = trimmedName.length === 0;

  useEffect(() => {
    if (conflictPreset) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [conflictPreset]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (conflictPreset) {
          setConflictPreset(null);
        } else {
          onCancel();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [conflictPreset, onCancel]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isEmpty) return;

    const existing = presetByLowerName.get(trimmedName.toLowerCase());
    if (existing) {
      setConflictPreset(existing);
      return;
    }

    onCreate(trimmedName);
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
        aria-labelledby="save-preset-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="picker-modal-header">
          <h3 id="save-preset-modal-title">
            {conflictPreset ? "Product Already Exists" : title}
          </h3>
          <button
            type="button"
            className="picker-modal-close"
            onClick={onCancel}
            aria-label="Cancel"
          >
            <CloseIcon />
          </button>
        </div>

        {conflictPreset ? (
          <div className="save-theme-modal-body">
            <p className="save-choice-message">
              A product named <strong>{conflictPreset.name}</strong> already
              exists. Would you like to overwrite it or enter a new name?
            </p>
            <div className="save-choice-actions">
              <button
                type="button"
                className="save-theme-cancel"
                onClick={onCancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="save-theme-cancel"
                onClick={() => setConflictPreset(null)}
              >
                New Name
              </button>
              <button
                type="button"
                className="save-theme-confirm"
                onClick={() => onOverwrite(conflictPreset)}
              >
                Overwrite
              </button>
            </div>
          </div>
        ) : (
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

            <p className="save-theme-hint">
              Captures location, map scale, layout, template, theme, layers,
              markers, GPS routes, and route styling.
            </p>

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
                disabled={isEmpty}
              >
                Save Product
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
