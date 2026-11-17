import { useEffect, useRef, useState } from "react";
import {
  CM_PER_INCH,
  MIN_DISTANCE_METERS,
  MAX_DISTANCE_METERS,
} from "@/core/config";
import { OUTPUT_DPI } from "@/features/poster/infrastructure/renderer/constants";
import type { CustomSizeUnit } from "@/features/poster/application/posterReducer";

interface MapDimensionForm {
  width: string;
  height: string;
  distance: string;
  customSizeUnit?: CustomSizeUnit;
}

interface MapDimensionFieldsProps {
  form: MapDimensionForm;
  minPosterCm?: number;
  maxPosterCm?: number;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onNumericFieldBlur: (event: React.FocusEvent<HTMLInputElement>) => void;
  onCustomSizeUnitChange?: (unit: CustomSizeUnit) => void;
  customSizeUnit?: CustomSizeUnit;
  showSizeFields?: boolean;
  showDistanceField?: boolean;
}

function cmToDisplayValue(cm: number, unit: CustomSizeUnit): string {
  if (!Number.isFinite(cm) || cm <= 0) return "";
  if (unit === "px") {
    return String(Math.max(1, Math.round((cm / CM_PER_INCH) * OUTPUT_DPI)));
  }
  const inches = Math.round((cm / CM_PER_INCH) * 100) / 100;
  return String(inches);
}

function displayValueToCm(value: number, unit: CustomSizeUnit): number {
  if (unit === "px") {
    return (value / OUTPUT_DPI) * CM_PER_INCH;
  }
  return value * CM_PER_INCH;
}

export default function MapDimensionFields({
  form,
  onChange,
  onNumericFieldBlur,
  onCustomSizeUnitChange,
  customSizeUnit,
  showSizeFields = true,
  showDistanceField = true,
}: MapDimensionFieldsProps) {
  const unit: CustomSizeUnit = customSizeUnit ?? form.customSizeUnit ?? "in";
  const [widthDraft, setWidthDraft] = useState(() =>
    cmToDisplayValue(Number(form.width), unit),
  );
  const [heightDraft, setHeightDraft] = useState(() =>
    cmToDisplayValue(Number(form.height), unit),
  );
  const focusedFieldRef = useRef<"width" | "height" | null>(null);

  useEffect(() => {
    if (focusedFieldRef.current !== "width") {
      setWidthDraft(cmToDisplayValue(Number(form.width), unit));
    }
  }, [form.width, unit]);

  useEffect(() => {
    if (focusedFieldRef.current !== "height") {
      setHeightDraft(cmToDisplayValue(Number(form.height), unit));
    }
  }, [form.height, unit]);

  const emitSizeChange = (name: "width" | "height", rawDisplay: string) => {
    if (name === "width") {
      setWidthDraft(rawDisplay);
    } else {
      setHeightDraft(rawDisplay);
    }

    const trimmed = rawDisplay.trim();
    if (!trimmed) return;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed <= 0) return;

    const cmValue = displayValueToCm(parsed, unit);
    const syntheticEvent = {
      target: {
        name,
        value: String(cmValue),
        type: "number",
      },
    } as React.ChangeEvent<HTMLInputElement>;
    onChange(syntheticEvent);
  };

  const emitSizeBlur = (name: "width" | "height", rawDisplay: string) => {
    focusedFieldRef.current = null;
    const trimmed = rawDisplay.trim();
    const parsed = Number(trimmed);
    if (!trimmed || !Number.isFinite(parsed) || parsed <= 0) {
      const currentCm = Number(name === "width" ? form.width : form.height);
      const resetDisplay = cmToDisplayValue(currentCm, unit);
      if (name === "width") {
        setWidthDraft(resetDisplay);
      } else {
        setHeightDraft(resetDisplay);
      }
      return;
    }

    const cmValue = displayValueToCm(parsed, unit);
    const syntheticBlur = {
      target: {
        name,
        value: String(cmValue),
        type: "number",
      },
    } as React.FocusEvent<HTMLInputElement>;
    onNumericFieldBlur(syntheticBlur);
  };

  const SLIDER_MIN = 0;
  const SLIDER_MAX = 1000;

  const clampDistance = (value: number) =>
    Math.min(Math.max(value, MIN_DISTANCE_METERS), MAX_DISTANCE_METERS);

  const getDistanceStep = (distanceMeters: number) => {
    if (distanceMeters < 100_000) return 100;
    if (distanceMeters < 1_000_000) return 1_000;
    if (distanceMeters < 10_000_000) return 10_000;
    return 50_000;
  };

  const snapDistanceToAdaptiveStep = (distanceMeters: number) => {
    const bounded = clampDistance(distanceMeters);
    const step = getDistanceStep(bounded);
    return clampDistance(Math.round(bounded / step) * step);
  };

  const distanceToSliderValue = (distanceMeters: number) => {
    const minLog = Math.log(MIN_DISTANCE_METERS);
    const maxLog = Math.log(MAX_DISTANCE_METERS);
    const ratio =
      (Math.log(clampDistance(distanceMeters)) - minLog) / (maxLog - minLog);
    return Math.round(SLIDER_MIN + ratio * (SLIDER_MAX - SLIDER_MIN));
  };

  const sliderValueToDistance = (sliderValue: number) => {
    const minLog = Math.log(MIN_DISTANCE_METERS);
    const maxLog = Math.log(MAX_DISTANCE_METERS);
    const ratio = (sliderValue - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN);
    const distance = Math.exp(minLog + ratio * (maxLog - minLog));
    return snapDistanceToAdaptiveStep(distance);
  };

  const formatDistance = (distanceMeters: number) => {
    if (distanceMeters >= 1_000_000) {
      const millions = distanceMeters / 1_000_000;
      const text = Number.isInteger(millions)
        ? millions.toString()
        : millions.toFixed(1).replace(/\.0$/, "");
      return `${text}M m`;
    }

    if (distanceMeters >= 100_000) {
      const thousands = distanceMeters / 1_000;
      const text = Number.isInteger(thousands)
        ? thousands.toString()
        : thousands.toFixed(1).replace(/\.0$/, "");
      return `${text}K m`;
    }

    return `${Math.round(distanceMeters).toLocaleString()} m`;
  };

  const emitDistanceChange = (nextDistance: number) => {
    const syntheticEvent = {
      target: {
        name: "distance",
        value: String(snapDistanceToAdaptiveStep(nextDistance)),
        type: "range",
      },
    } as React.ChangeEvent<HTMLInputElement>;

    onChange(syntheticEvent);
  };

  const parsedDistance = Number(form.distance);
  const distanceValue = Number.isFinite(parsedDistance)
    ? clampDistance(parsedDistance)
    : MIN_DISTANCE_METERS;
  const sliderValue = distanceToSliderValue(distanceValue);

  const sliderMetaMarks = [
    MIN_DISTANCE_METERS,
    100_000,
    1_000_000,
    MAX_DISTANCE_METERS,
  ];

  const sliderPositionPercent = (distanceMeters: number) =>
    ((distanceToSliderValue(distanceMeters) - SLIDER_MIN) /
      (SLIDER_MAX - SLIDER_MIN)) *
    100;

  return (
    <div className="map-dimension-fields">
      {showSizeFields ? (
        <>
          {onCustomSizeUnitChange ? (
            <div className="layout-unit-switcher-row">
              <span className="layout-unit-switcher-label">Units</span>
              <div
                className="layout-unit-switcher"
                role="group"
                aria-label="Custom layout units"
              >
                <button
                  type="button"
                  className={`layout-unit-btn${unit === "in" ? " is-active" : ""}`}
                  aria-pressed={unit === "in"}
                  onClick={() => onCustomSizeUnitChange("in")}
                >
                  Inches (in)
                </button>
                <button
                  type="button"
                  className={`layout-unit-btn${unit === "px" ? " is-active" : ""}`}
                  aria-pressed={unit === "px"}
                  onClick={() => onCustomSizeUnitChange("px")}
                >
                  Pixels (px)
                </button>
              </div>
            </div>
          ) : null}
          <div className="map-size-fields-row">
            <label>
              Width ({unit})
              <input
                className="form-control-tall"
                name="width"
                type="number"
                min={unit === "px" ? 1 : 0.01}
                step={unit === "px" ? 1 : "any"}
                value={widthDraft}
                onFocus={() => {
                  focusedFieldRef.current = "width";
                }}
                onChange={(event) => emitSizeChange("width", event.target.value)}
                onBlur={(event) => emitSizeBlur("width", event.target.value)}
              />
            </label>
            <label>
              Height ({unit})
              <input
                className="form-control-tall"
                name="height"
                type="number"
                min={unit === "px" ? 1 : 0.01}
                step={unit === "px" ? 1 : "any"}
                value={heightDraft}
                onFocus={() => {
                  focusedFieldRef.current = "height";
                }}
                onChange={(event) =>
                  emitSizeChange("height", event.target.value)
                }
                onBlur={(event) => emitSizeBlur("height", event.target.value)}
              />
            </label>
          </div>
        </>
      ) : null}

      {showDistanceField ? (
        <label className="distance-slider-field">
          <span>
            <span>Distance (m)</span>
            <input
              className="distance-slider-input"
              name="distance"
              type="number"
              min={MIN_DISTANCE_METERS}
              max={MAX_DISTANCE_METERS}
              step="any"
              value={form.distance}
              onChange={onChange}
              onBlur={onNumericFieldBlur}
              aria-label="Distance in meters"
            />
          </span>
          <input
            className="distance-slider"
            name="distance-slider-log"
            type="range"
            min={SLIDER_MIN}
            max={SLIDER_MAX}
            step={1}
            value={sliderValue}
            onChange={(event) =>
              emitDistanceChange(
                sliderValueToDistance(Number(event.target.value)),
              )
            }
            aria-label="Distance in meters"
          />
          <span className="distance-slider-meta">
            {sliderMetaMarks.map((mark, index) => {
              const isFirst = index === 0;
              const isLast = index === sliderMetaMarks.length - 1;
              const left = sliderPositionPercent(mark);
              return (
                <span
                  key={mark}
                  className="distance-slider-meta-mark"
                  style={{
                    left: `${left}%`,
                    transform: isFirst
                      ? "translateX(0)"
                      : isLast
                        ? "translateX(-100%)"
                        : "translateX(-50%)",
                  }}
                >
                  {formatDistance(mark)}
                </span>
              );
            })}
          </span>
        </label>
      ) : null}
    </div>
  );
}
