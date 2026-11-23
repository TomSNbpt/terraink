import { useEffect } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "@/shared/ui/Icons";

interface ThemeSwitchModalProps {
  targetThemeName: string;
  onSavePresetAndSwitch: () => void;
  onSwitchWithoutSaving: () => void;
  onCancel: () => void;
}

export default function ThemeSwitchModal({
  targetThemeName,
  onSavePresetAndSwitch,
  onSwitchWithoutSaving,
  onCancel,
}: ThemeSwitchModalProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return createPortal(
    <div
      className="picker-modal-backdrop"
      role="presentation"
      onClick={onCancel}
    >
      <div
        className="picker-modal save-choice-modal theme-switch-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="theme-switch-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="picker-modal-header">
          <h3 id="theme-switch-modal-title">Switch to “{targetThemeName}”?</h3>
          <button
            type="button"
            className="picker-modal-close"
            onClick={onCancel}
            aria-label="Cancel"
          >
            <CloseIcon />
          </button>
        </div>

        <p className="save-choice-message">
          You have unsaved design changes on the current theme. Would you like
          to save your current design as a new product before switching to{" "}
          <strong>“{targetThemeName}”</strong>?
        </p>

        <div className="theme-switch-modal-actions">
          <button
            type="button"
            className="save-theme-confirm"
            onClick={onSavePresetAndSwitch}
          >
            Save Product &amp; Switch
          </button>
          <button
            type="button"
            className="confirm-modal-destructive"
            onClick={onSwitchWithoutSaving}
          >
            Switch Without Saving
          </button>
          <button
            type="button"
            className="save-theme-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
