import { useEffect, useMemo, useRef, useState } from "react";
import { usePosterContext } from "@/features/poster/ui/PosterContext";
import {
  DEFAULT_POSTER_HEIGHT_CM,
  DEFAULT_POSTER_WIDTH_CM,
} from "@/core/config";
import { DEFAULT_BLEED_INCHES } from "@/features/settings/domain/types";
import {
  computeBleedLayoutMetrics,
  formatInchesNumber,
  normalizeBleedInches,
  resolveBleedInches,
} from "@/features/layout/domain/bleed";
import { OUTPUT_DPI } from "@/features/poster/infrastructure/renderer/constants";
import { CheckIcon, CopyIcon, DownloadIcon } from "@/shared/ui/Icons";
import {
  buildConfigSnapshot,
  type SnapshotGpxFile,
} from "@/features/settings/infrastructure/configSnapshot";

export default function SettingsSection() {
  const { state, dispatch } = usePosterContext();

  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const copyTimerRef = useRef<number | null>(null);

  const {
    userDefaults,
    savedThemes,
    deletedBuiltinThemeIds,
    customTemplates,
    presets,
    form,
    routes,
  } = state;
  const bleedInches = resolveBleedInches(userDefaults);
  const [bleedDraft, setBleedDraft] = useState(() =>
    formatInchesNumber(bleedInches),
  );
  const isBleedFocusedRef = useRef(false);

  const configSnapshot = useMemo(
    () =>
      buildConfigSnapshot({
        presets,
        savedThemes,
        deletedBuiltinThemeIds,
        customTemplates,
        activeRoutes: routes,
      }),
    [presets, savedThemes, deletedBuiltinThemeIds, customTemplates, routes],
  );
  const newGpxFiles = useMemo(
    () => configSnapshot.gpxFiles.filter((file) => !file.isBundled),
    [configSnapshot.gpxFiles],
  );

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isBleedFocusedRef.current) {
      setBleedDraft(formatInchesNumber(bleedInches));
    }
  }, [bleedInches]);

  const trimWidthCm = Number(form.width) || DEFAULT_POSTER_WIDTH_CM;
  const trimHeightCm = Number(form.height) || DEFAULT_POSTER_HEIGHT_CM;
  const bleedMetrics = useMemo(
    () => computeBleedLayoutMetrics(trimWidthCm, trimHeightCm, bleedInches),
    [trimWidthCm, trimHeightCm, bleedInches],
  );
  const bleedPxPerEdge = Math.round(bleedInches * OUTPUT_DPI);

  function handleBleedInputChange(rawValue: string) {
    setBleedDraft(rawValue);
    const trimmed = rawValue.trim();
    if (!trimmed) return;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    dispatch({
      type: "SET_BLEED_INCHES",
      bleedInches: normalizeBleedInches(parsed),
    });
  }

  function handleBleedInputBlur() {
    isBleedFocusedRef.current = false;
    const trimmed = bleedDraft.trim();
    const parsed = Number(trimmed);
    if (!trimmed || !Number.isFinite(parsed) || parsed < 0) {
      setBleedDraft(formatInchesNumber(bleedInches));
      return;
    }
    const normalized = normalizeBleedInches(parsed);
    dispatch({ type: "SET_BLEED_INCHES", bleedInches: normalized });
    setBleedDraft(formatInchesNumber(normalized));
  }

  function handleResetBleed() {
    dispatch({ type: "SET_BLEED_INCHES", bleedInches: DEFAULT_BLEED_INCHES });
    setBleedDraft(formatInchesNumber(DEFAULT_BLEED_INCHES));
  }

  async function handleCopyConfigSnapshot() {
    let copied = false;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(configSnapshot.json);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = configSnapshot.json;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        textarea.style.pointerEvents = "none";
        document.body.appendChild(textarea);
        textarea.select();
        copied = document.execCommand("copy");
        textarea.remove();
      } catch {
        copied = false;
      }
    }

    setCopyStatus(copied ? "copied" : "error");
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => {
      setCopyStatus("idle");
      copyTimerRef.current = null;
    }, 2200);
  }

  function handleDownloadGpxFile(file: SnapshotGpxFile) {
    const blob = new Blob([file.xml], {
      type: "application/gpx+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="panel-block settings-section">
      <h2>Settings</h2>

      <div className="settings-defaults-list">
        <div className="settings-default-row settings-snapshot-card">
          <div className="settings-snapshot-head">
            <span className="settings-default-label">
              Config snapshot (<code>src/data/config.json</code>)
            </span>
          </div>

          <p className="settings-bleed-hint">
            Snapshot of all themes, templates, and products saved in this
            session. Copy and paste into <code>src/data/config.json</code> to
            make your changes permanent.
          </p>

          <p className="settings-snapshot-meta">
            <span>{configSnapshot.themeCount} themes</span>
            <span aria-hidden="true">&middot;</span>
            <span>{configSnapshot.layoutCount} templates</span>
            <span aria-hidden="true">&middot;</span>
            <span>{configSnapshot.presetCount} products</span>
          </p>

          {configSnapshot.promotedThemeCount > 0 ? (
            <p className="settings-snapshot-note">
              Includes {configSnapshot.promotedThemeCount} custom theme
              {configSnapshot.promotedThemeCount === 1 ? "" : "s"} merged into{" "}
              <code>themes</code> with product IDs aligned automatically.
            </p>
          ) : null}

          {configSnapshot.deletedThemeCount > 0 ? (
            <p className="settings-snapshot-note">
              Excludes {configSnapshot.deletedThemeCount} deleted saved theme
              {configSnapshot.deletedThemeCount === 1 ? "" : "s"} from{" "}
              <code>themes</code>. Copy and save to make permanent.
            </p>
          ) : null}

          {configSnapshot.addedTemplateCount > 0 ? (
            <p className="settings-snapshot-note">
              Includes {configSnapshot.addedTemplateCount} custom template
              {configSnapshot.addedTemplateCount === 1 ? "" : "s"} merged into{" "}
              <code>layouts</code>. Copy and save to make permanent.
            </p>
          ) : null}

          <div
            className={`settings-snapshot-file-row${
              configSnapshot.hasChanges ? " is-dirty" : ""
            }`}
          >
            <div className="settings-snapshot-gpx-info">
              <span
                className="settings-snapshot-gpx-name"
                title="src/data/config.json"
              >
                src/data/config.json
              </span>
              <span className="settings-snapshot-gpx-meta">
                {(configSnapshot.byteLength / 1024).toFixed(1)} KB &middot;{" "}
                {configSnapshot.hasChanges
                  ? "Unsaved changes — copy to save"
                  : "Matches src/data/config.json"}
              </span>
            </div>
            <button
              type="button"
              className={`settings-snapshot-copy-btn${
                copyStatus === "copied" ? " is-copied" : ""
              }`}
              onClick={() => void handleCopyConfigSnapshot()}
              title="Copy config.json to clipboard"
              aria-label="Copy config.json to clipboard"
            >
              {copyStatus === "copied" ? (
                <>
                  <CheckIcon aria-hidden="true" />
                  <span>Copied</span>
                </>
              ) : copyStatus === "error" ? (
                <>
                  <CopyIcon aria-hidden="true" />
                  <span>Copy failed</span>
                </>
              ) : (
                <>
                  <CopyIcon aria-hidden="true" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          {configSnapshot.gpxFiles.length > 0 ? (
            <div className="settings-snapshot-gpx">
              <span className="settings-snapshot-gpx-title">
                Referenced GPX files (<code>src/data/gpx/</code>)
              </span>
              {newGpxFiles.length > 0 ? (
                <p className="settings-snapshot-note settings-snapshot-note--warning">
                  Highlighted <code>.gpx</code>{" "}
                  {newGpxFiles.length === 1 ? "file is" : "files are"} not saved
                  in <code>src/data/gpx/</code> yet — download and place{" "}
                  {newGpxFiles.length === 1 ? "it" : "them"} in{" "}
                  <code>src/data/gpx/</code> alongside{" "}
                  <code>config.json</code>.
                </p>
              ) : null}
              <ul className="settings-snapshot-gpx-list">
                {configSnapshot.gpxFiles.map((file) => (
                  <li
                    key={file.filename}
                    className={`settings-snapshot-gpx-row${
                      file.isBundled ? " is-bundled" : " is-new"
                    }`}
                  >
                    <div className="settings-snapshot-gpx-info">
                      <span
                        className="settings-snapshot-gpx-name"
                        title={file.filename}
                      >
                        {file.filename}
                      </span>
                      <span className="settings-snapshot-gpx-meta">
                        {file.pointCount.toLocaleString()} pts &middot;{" "}
                        {file.isBundled
                          ? "In src/data/gpx/"
                          : "Not in src/data/gpx/ — download"}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="settings-snapshot-gpx-btn"
                      onClick={() => handleDownloadGpxFile(file)}
                      title={`Download ${file.filename}`}
                      aria-label={`Download ${file.filename}`}
                    >
                      <DownloadIcon aria-hidden="true" />
                      <span>Download</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="settings-default-row">
          <div className="settings-bleed-header">
            <label
              className="settings-default-label"
              htmlFor="settings-bleed-input"
            >
              Print bleed (all 4 edges)
            </label>
            <button
              type="button"
              className="settings-inline-reset-btn"
              onClick={handleResetBleed}
              disabled={Math.abs(bleedInches - DEFAULT_BLEED_INCHES) < 0.001}
              title={`Reset print bleed to ${DEFAULT_BLEED_INCHES} inches`}
            >
              Reset ({DEFAULT_BLEED_INCHES}&Prime;)
            </button>
          </div>

          <div className="settings-bleed-input-row">
            <input
              id="settings-bleed-input"
              type="number"
              className="settings-bleed-input"
              min={0}
              max={24}
              step="any"
              value={bleedDraft}
              onFocus={() => {
                isBleedFocusedRef.current = true;
              }}
              onChange={(event) => handleBleedInputChange(event.target.value)}
              onBlur={handleBleedInputBlur}
            />
            <span className="settings-bleed-unit">in</span>
          </div>

          <p className="settings-bleed-meta">
            <span>
              Trim {formatInchesNumber(bleedMetrics.trimWidthInches)} &times;{" "}
              {formatInchesNumber(bleedMetrics.trimHeightInches)} in
            </span>
            <span aria-hidden="true">&middot;</span>
            <span>
              Export {formatInchesNumber(bleedMetrics.totalWidthInches)} &times;{" "}
              {formatInchesNumber(bleedMetrics.totalHeightInches)} in
            </span>
            <span aria-hidden="true">&middot;</span>
            <span>
              {bleedInches > 0
                ? `${bleedPxPerEdge} px/edge @ 300 DPI`
                : "Bleed disabled"}
            </span>
          </p>
          <p className="settings-bleed-hint">
            Added around all four edges on SVG, RSVG, PNG, and PDF exports. Use
            the Bleed toggle under the preview to inspect it on screen.
          </p>
        </div>
      </div>
    </section>
  );
}
