import { useEffect, useRef, useState } from "react";
import { usePosterContext } from "@/features/poster/ui/PosterContext";
import type { CustomSizeUnit } from "@/features/poster/application/posterReducer";
import { DEFAULT_POSTER_HEIGHT_CM, DEFAULT_POSTER_WIDTH_CM } from "@/core/config";
import type { GuideAxis, LayoutGuide } from "../domain/types";
import {
  clampGuideOffsetCm,
  cmToGuideDisplayString,
  createGuideId,
  formatGuideReadout,
  guideDisplayValueToCm,
} from "../domain/guides";
import {
  AddIcon,
  EyeIcon,
  EyeOffIcon,
  TrashIcon,
} from "@/shared/ui/Icons";

export default function LayoutGuidesSection() {
  const { state, dispatch } = usePosterContext();
  const { form, guides, showGuides } = state;

  const unit: CustomSizeUnit = form.customSizeUnit ?? "in";
  const widthCm =
    Number(form.width) > 0 ? Number(form.width) : DEFAULT_POSTER_WIDTH_CM;
  const heightCm =
    Number(form.height) > 0 ? Number(form.height) : DEFAULT_POSTER_HEIGHT_CM;

  const [axis, setAxis] = useState<GuideAxis>("x");
  const [offsetDraft, setOffsetDraft] = useState("");
  const [validationError, setValidationError] = useState("");
  const [guideDrafts, setGuideDrafts] = useState<Record<string, string>>({});
  const focusedGuideIdRef = useRef<string | null>(null);
  const prevUnitRef = useRef<CustomSizeUnit>(unit);

  useEffect(() => {
    const prevUnit = prevUnitRef.current;
    if (prevUnit !== unit) {
      prevUnitRef.current = unit;
      setOffsetDraft((current) => {
        const trimmed = current.trim();
        if (!trimmed) return "";
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed) || parsed < 0) return current;
        const cm = guideDisplayValueToCm(parsed, prevUnit);
        return cmToGuideDisplayString(cm, unit);
      });
    }
  }, [unit]);

  useEffect(() => {
    setGuideDrafts((prev) => {
      const next: Record<string, string> = {};
      for (const guide of guides) {
        if (focusedGuideIdRef.current === guide.id && prev[guide.id] !== undefined) {
          next[guide.id] = prev[guide.id];
        } else {
          next[guide.id] = cmToGuideDisplayString(guide.offsetCm, unit);
        }
      }
      return next;
    });
  }, [guides, unit]);

  const activeMaxCm = axis === "x" ? widthCm : heightCm;
  const maxLabel = formatGuideReadout(activeMaxCm, unit);

  function handleUnitSwitch(nextUnit: CustomSizeUnit) {
    if (nextUnit === unit) return;
    dispatch({ type: "SET_FIELD", name: "customSizeUnit", value: nextUnit });
  }

  function handleToggleVisibility() {
    dispatch({ type: "SET_SHOW_GUIDES", show: !showGuides });
  }

  function handleAddGuide() {
    const trimmed = offsetDraft.trim();
    if (!trimmed) {
      setValidationError("Enter an offset from the top-left (0, 0) corner.");
      return;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setValidationError("Offset must be 0 or greater.");
      return;
    }

    const rawCm = guideDisplayValueToCm(parsed, unit);
    const clampedCm = clampGuideOffsetCm(rawCm, activeMaxCm);

    dispatch({
      type: "ADD_GUIDE",
      guide: {
        id: createGuideId(),
        axis,
        offsetCm: clampedCm,
      },
    });
    setOffsetDraft("");
    setValidationError("");
  }

  function handleGuideDraftChange(guide: LayoutGuide, rawValue: string) {
    setGuideDrafts((prev) => ({ ...prev, [guide.id]: rawValue }));

    const trimmed = rawValue.trim();
    if (!trimmed) return;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) return;

    const maxForAxis = guide.axis === "x" ? widthCm : heightCm;
    const cm = clampGuideOffsetCm(guideDisplayValueToCm(parsed, unit), maxForAxis);
    dispatch({
      type: "UPDATE_GUIDE",
      guideId: guide.id,
      offsetCm: cm,
    });
  }

  function handleGuideDraftBlur(guide: LayoutGuide) {
    focusedGuideIdRef.current = null;
    const rawValue = guideDrafts[guide.id] ?? "";
    const trimmed = rawValue.trim();
    const parsed = Number(trimmed);
    const maxForAxis = guide.axis === "x" ? widthCm : heightCm;

    if (!trimmed || !Number.isFinite(parsed) || parsed < 0) {
      setGuideDrafts((prev) => ({
        ...prev,
        [guide.id]: cmToGuideDisplayString(guide.offsetCm, unit),
      }));
      return;
    }

    const clampedCm = clampGuideOffsetCm(
      guideDisplayValueToCm(parsed, unit),
      maxForAxis,
    );
    dispatch({
      type: "UPDATE_GUIDE",
      guideId: guide.id,
      offsetCm: clampedCm,
    });
    setGuideDrafts((prev) => ({
      ...prev,
      [guide.id]: cmToGuideDisplayString(clampedCm, unit),
    }));
  }

  return (
    <div className="layout-guides-block">
      <p className="section-summary-label">GUIDES</p>
      <div className="layout-guides-header">
        <div className="layout-guides-title-group">
          <span className="layout-guides-origin">(0, 0) top-left</span>
        </div>

        <div className="layout-guides-header-actions">
          <div
            className="layout-guides-unit-switch"
            role="group"
            aria-label="Guide units"
          >
            <button
              type="button"
              className={`layout-guides-unit-btn${unit === "in" ? " is-active" : ""}`}
              aria-pressed={unit === "in"}
              onClick={() => handleUnitSwitch("in")}
            >
              in
            </button>
            <button
              type="button"
              className={`layout-guides-unit-btn${unit === "px" ? " is-active" : ""}`}
              aria-pressed={unit === "px"}
              onClick={() => handleUnitSwitch("px")}
            >
              px
            </button>
          </div>

          <button
            type="button"
            className={`layout-guides-visibility-btn${showGuides ? " is-active" : ""}`}
            aria-pressed={showGuides}
            onClick={handleToggleVisibility}
            title={showGuides ? "Hide preview guides" : "Show preview guides"}
          >
            {showGuides ? (
              <EyeIcon aria-hidden="true" />
            ) : (
              <EyeOffIcon aria-hidden="true" />
            )}
            <span>{showGuides ? "Show" : "Hidden"}</span>
          </button>
        </div>
      </div>

      <div className="layout-guides-creator">
        <div
          className="layout-guides-axis-switch"
          role="group"
          aria-label="Guide orientation"
        >
          <button
            type="button"
            className={`layout-guides-axis-btn${axis === "x" ? " is-active" : ""}`}
            aria-pressed={axis === "x"}
            onClick={() => {
              setAxis("x");
              setValidationError("");
            }}
          >
            Vertical (X)
          </button>
          <button
            type="button"
            className={`layout-guides-axis-btn${axis === "y" ? " is-active" : ""}`}
            aria-pressed={axis === "y"}
            onClick={() => {
              setAxis("y");
              setValidationError("");
            }}
          >
            Horizontal (Y)
          </button>
        </div>

        <div className="layout-guides-input-row">
          <label className="layout-guides-offset-label">
            <span className="layout-guides-offset-caption">
              {axis === "x" ? `From left (${unit})` : `From top (${unit})`}
            </span>
            <input
              type="number"
              className="layout-guides-offset-input"
              min={0}
              step={unit === "px" ? 1 : "any"}
              placeholder={unit === "px" ? "e.g. 600" : "e.g. 1.5"}
              value={offsetDraft}
              onChange={(event) => {
                setOffsetDraft(event.target.value);
                if (validationError) setValidationError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAddGuide();
                }
              }}
            />
          </label>

          <button
            type="button"
            className="layout-guides-add-btn"
            onClick={handleAddGuide}
          >
            <AddIcon aria-hidden="true" />
            <span>Add</span>
          </button>
        </div>

        <div className="layout-guides-meta-row">
          <span>
            {axis === "x"
              ? `0 to ${maxLabel} (left → right)`
              : `0 to ${maxLabel} (top → bottom)`}
          </span>
          {unit === "px" ? <span>300 DPI</span> : null}
        </div>

        {validationError ? (
          <p className="layout-guides-error" role="alert">
            {validationError}
          </p>
        ) : null}
      </div>

      {guides.length === 0 ? (
        <p className="layout-guides-empty">
          No guides added. Preview-only lines help align maps and never appear in
          exports.
        </p>
      ) : (
        <div className="layout-guides-list-wrap">
          <div className="layout-guides-list-head">
            <span>
              {guides.length} {guides.length === 1 ? "guide" : "guides"}
              {!showGuides ? " · hidden on preview" : ""}
            </span>
            <button
              type="button"
              className="layout-guides-clear-btn"
              onClick={() => dispatch({ type: "CLEAR_GUIDES" })}
            >
              Clear all
            </button>
          </div>

          <ul className="layout-guides-list" aria-label="Layout guides">
            {guides.map((guide) => {
              const axisMaxCm = guide.axis === "x" ? widthCm : heightCm;
              const isOutside = guide.offsetCm > axisMaxCm + 0.001;
              return (
                <li
                  key={guide.id}
                  className={`layout-guide-row${isOutside ? " is-outside" : ""}`}
                >
                  <span className="layout-guide-axis">
                    {guide.axis === "x" ? "X · Left" : "Y · Top"}
                  </span>

                  <div className="layout-guide-value-wrap">
                    <input
                      type="number"
                      className="layout-guide-value-input"
                      min={0}
                      step={unit === "px" ? 1 : "any"}
                      value={
                        guideDrafts[guide.id] ??
                        cmToGuideDisplayString(guide.offsetCm, unit)
                      }
                      aria-label={
                        guide.axis === "x"
                          ? `Vertical guide offset from left in ${unit}`
                          : `Horizontal guide offset from top in ${unit}`
                      }
                      onFocus={() => {
                        focusedGuideIdRef.current = guide.id;
                      }}
                      onChange={(event) =>
                        handleGuideDraftChange(guide, event.target.value)
                      }
                      onBlur={() => handleGuideDraftBlur(guide)}
                    />
                    <span className="layout-guide-unit">{unit}</span>
                  </div>

                  {isOutside ? (
                    <span className="layout-guide-outside-note">Outside</span>
                  ) : null}

                  <button
                    type="button"
                    className="layout-guide-remove-btn"
                    onClick={() =>
                      dispatch({ type: "REMOVE_GUIDE", guideId: guide.id })
                    }
                    aria-label="Remove guide"
                    title="Remove guide"
                  >
                    <TrashIcon aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
