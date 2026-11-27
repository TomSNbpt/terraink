import { useEffect, useRef, useState } from "react";
import type React from "react";
import { ResetIcon } from "./Icons";

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Shown after the number, e.g. "%" or "°". */
  unit?: string;
  /** When set, a per-slider reset button sits to the right of the slider. */
  defaultValue?: number;
  /** Optional CSS background for the track (e.g. a color gradient). */
  trackBackground?: string;
  /**
   * When set, dragging updates the slider thumb immediately but commits
   * changes after this pause (or immediately on release), avoiding heavy redraws.
   */
  commitDelayMs?: number;
  onChange: (value: number) => void;
}

/** Labelled range slider with live readout, optional gradient track, and reset button. */
export default function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  defaultValue,
  trackBackground,
  commitDelayMs,
  onChange,
}: SliderFieldProps) {
  const decimals = String(step).split(".")[1]?.length ?? 0;
  const [draft, setDraft] = useState(value);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const commit = (next: number) => {
    window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
    if (next !== value) {
      onChange(next);
    }
  };

  const handleInput = (next: number) => {
    if (!commitDelayMs) {
      onChange(next);
      return;
    }
    setDraft(next);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => commit(next), commitDelayMs);
  };

  const flush = () => {
    if (commitDelayMs && timerRef.current !== undefined) {
      commit(draft);
    }
  };

  const shown = commitDelayMs ? draft : value;
  const fill = max > min ? ((shown - min) / (max - min)) * 100 : 0;
  const formattedValue = `${shown > 0 && min < 0 ? "+" : ""}${shown.toFixed(decimals)}${unit}`;

  return (
    <label className="slider-field">
      <span className="slider-field-head">
        <span>{label}</span>
        <span className="slider-field-value">{formattedValue}</span>
      </span>
      <span className="slider-field-row">
        <input
          className={`distance-slider slider-field-input${trackBackground ? " has-track" : ""}`}
          type="range"
          min={min}
          max={max}
          step={step}
          value={shown}
          style={
            {
              "--slider-fill": `${fill}%`,
              ...(trackBackground
                ? { "--slider-track-bg": trackBackground }
                : {}),
            } as React.CSSProperties
          }
          onChange={(event) => handleInput(Number(event.target.value))}
          onPointerUp={flush}
          onKeyUp={flush}
          onBlur={flush}
        />
        {defaultValue !== undefined ? (
          <button
            type="button"
            className="slider-field-reset"
            title={`Reset ${label.toLowerCase()} to default`}
            aria-label={`Reset ${label.toLowerCase()} to default`}
            disabled={shown === defaultValue}
            onClick={(event) => {
              event.preventDefault();
              window.clearTimeout(timerRef.current);
              timerRef.current = undefined;
              setDraft(defaultValue);
              if (value !== defaultValue) {
                onChange(defaultValue);
              }
            }}
          >
            <ResetIcon aria-hidden="true" />
          </button>
        ) : null}
      </span>
    </label>
  );
}
