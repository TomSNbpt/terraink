import { useEffect, useMemo, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { normalizeHexColor, toUniqueHexColors } from "@/shared/utils/color";

const FULL_SIX_DIGIT_HEX_INPUT = /^#?[0-9a-fA-F]{6}$/;

interface ColorPickerProps {
  currentColor: string;
  suggestedColors?: string[];
  moreColors?: string[];
  onChange: (color: string) => void;
  onResetColor: () => void;
  canResetColor?: boolean;
}

export default function ColorPicker({
  currentColor,
  suggestedColors = [],
  moreColors = [],
  onChange,
  onResetColor,
  canResetColor = true,
}: ColorPickerProps) {
  const suggestionList = useMemo(
    () => toUniqueHexColors(suggestedColors).slice(0, 10),
    [suggestedColors],
  );

  const additionalList = useMemo(() => {
    const initialSet = new Set(suggestionList);
    return toUniqueHexColors(moreColors)
      .filter((color) => !initialSet.has(color))
      .slice(0, 15);
  }, [moreColors, suggestionList]);

  const normalizedCurrentColor =
    normalizeHexColor(currentColor) ||
    suggestionList[0] ||
    additionalList[0] ||
    "#000000";
  const [hexInput, setHexInput] = useState(normalizedCurrentColor);
  const [showMoreColors, setShowMoreColors] = useState(false);
  const isHexFocusedRef = useRef(false);

  const visiblePalette = showMoreColors
    ? [...suggestionList, ...additionalList]
    : suggestionList;

  useEffect(() => {
    if (!isHexFocusedRef.current) {
      setHexInput(normalizedCurrentColor);
    }
  }, [normalizedCurrentColor]);

  useEffect(() => {
    if (additionalList.length === 0) {
      setShowMoreColors(false);
    }
  }, [additionalList]);

  function handlePresetClick(color: string) {
    isHexFocusedRef.current = false;
    setHexInput(color);
    onChange(color);
  }

  function handlePickerChange(nextColor: string) {
    const normalized = normalizeHexColor(nextColor);
    if (!normalized || normalized === normalizedCurrentColor) {
      return;
    }

    setHexInput(normalized);
    onChange(normalized);
  }

  function handleHexInput(event: React.ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value;
    setHexInput(nextValue);

    const trimmed = nextValue.trim();
    if (!FULL_SIX_DIGIT_HEX_INPUT.test(trimmed)) {
      return;
    }

    const normalized = normalizeHexColor(
      trimmed.startsWith("#") ? trimmed : `#${trimmed}`,
    );
    if (normalized && normalized !== normalizedCurrentColor) {
      onChange(normalized);
    }
  }

  function commitHexInput() {
    const trimmed = hexInput.trim();
    const normalized = normalizeHexColor(
      trimmed.startsWith("#") ? trimmed : `#${trimmed}`,
    );
    if (normalized) {
      setHexInput(normalized);
      if (normalized !== normalizedCurrentColor) {
        onChange(normalized);
      }
      return;
    }
    setHexInput(normalizedCurrentColor);
  }

  function handleHexFocus() {
    isHexFocusedRef.current = true;
  }

  function handleHexBlur() {
    isHexFocusedRef.current = false;
    commitHexInput();
  }

  function handleHexKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitHexInput();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setHexInput(normalizedCurrentColor);
      event.currentTarget.blur();
    }
  }

  function handleResetClick() {
    isHexFocusedRef.current = false;
    setHexInput(normalizedCurrentColor);
    onResetColor();
  }

  return (
    <div className="color-picker-popup">
      <div className="color-preset-grid">
        {visiblePalette.map((color) => (
          <button
            key={color}
            type="button"
            className={`color-preset-cell${normalizedCurrentColor === color ? " is-active" : ""}`}
            style={{ backgroundColor: color }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handlePresetClick(color)}
            aria-label={color}
            title={color}
          />
        ))}
      </div>

      <div className="color-picker-actions">
        <button
          type="button"
          className={`color-grid-action${showMoreColors ? " is-active" : ""}`}
          onClick={() => setShowMoreColors((prev) => !prev)}
          disabled={additionalList.length === 0}
        >
          {showMoreColors ? "Less" : "More"}
        </button>
        <button
          type="button"
          className="color-grid-action color-grid-reset"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleResetClick}
          disabled={!canResetColor}
        >
          Reset Color
        </button>
      </div>

      <div className="color-manual-panel color-custom-panel">
        <div className="color-picker-frame">
          <HexColorPicker color={normalizedCurrentColor} onChange={handlePickerChange} />
        </div>

        <label className="color-field-label color-hex-only-field">
          Hex
          <input
            type="text"
            className="color-hex-input"
            value={hexInput}
            onChange={handleHexInput}
            onFocus={handleHexFocus}
            onBlur={handleHexBlur}
            onKeyDown={handleHexKeyDown}
            maxLength={16}
            spellCheck={false}
            autoComplete="off"
          />
        </label>
      </div>
    </div>
  );
}
