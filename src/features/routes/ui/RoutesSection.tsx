import { useCallback, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { usePosterContext } from "@/features/poster/ui/PosterContext";
import { useGpxUpload } from "@/features/routes/application/useGpxUpload";
import type { Route, RouteBounds } from "@/features/routes/domain/types";
import {
  resolveRouteOutline,
  resolveRouteOutline2,
  routeLengthMeters,
} from "@/features/routes/infrastructure/helpers";
import { listBundledGpxEntries } from "@/features/routes/infrastructure/gpxLibrary";
import { CheckIcon, CloseIcon } from "@/shared/ui/Icons";

function formatRouteDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return "—";
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(2)} km` : `${km.toFixed(1)} km`;
}

interface PendingConfirmation {
  pendingRoute: Route;
  newBounds: RouteBounds;
  replaceOnly?: boolean;
}

function RouteBoundsWarningModal({
  replaceOnly = false,
  onCancel,
  onContinue,
  onReplace,
}: {
  replaceOnly?: boolean;
  onCancel: () => void;
  onContinue: () => void;
  onReplace: () => void;
}) {
  return createPortal(
    <div
      className="picker-modal-backdrop"
      role="presentation"
      onClick={onCancel}
    >
      <div
        className="picker-modal marker-delete-confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="route-bounds-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="marker-delete-modal__body">
          <p
            className="marker-delete-modal__headline"
            id="route-bounds-modal-title"
          >
            This route is far from your current area
          </p>
          <p className="marker-delete-modal__text">
            {replaceOnly
              ? "This route is too far from your existing routes to show together. Replace your existing routes with this one?"
              : "Adding it will zoom the poster out to fit everything. You can also replace your existing routes with this one to keep a tighter view."}
          </p>
          <div className="marker-delete-modal__actions">
            <button
              type="button"
              className="marker-delete-modal__cancel"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className={
                replaceOnly
                  ? "marker-delete-modal__confirm"
                  : "marker-delete-modal__cancel"
              }
              onClick={onReplace}
            >
              Replace existing
            </button>
            {!replaceOnly ? (
              <button
                type="button"
                className="marker-delete-modal__confirm"
                onClick={onContinue}
              >
                Add anyway
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function RoutesSection() {
  const { state, dispatch } = usePosterContext();
  const { form, routes } = state;
  const {
    uploadGpxFile,
    addBundledGpxFile,
    confirmAddRoute,
    confirmReplaceRoutes,
  } = useGpxUpload();

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);

  const bundledGpxEntries = useMemo(() => listBundledGpxEntries(), []);

  const activeGpxFilenames = useMemo(() => {
    const set = new Set<string>();
    for (const route of routes) {
      const candidate = route.gpxFile ?? route.sourceFilename;
      if (candidate) {
        set.add(candidate.trim().toLowerCase());
      }
    }
    return set;
  }, [routes]);

  const handleUploadClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleUploadChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      setUploadError(null);
      setIsUploading(true);
      try {
        const result = await uploadGpxFile(file);
        if (result.status === "needs-confirmation") {
          setPendingConfirmation({
            pendingRoute: result.pendingRoute,
            newBounds: result.newBounds,
            replaceOnly: result.replaceOnly,
          });
        }
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setIsUploading(false);
      }
    },
    [uploadGpxFile],
  );

  const handleSelectBundledGpx = useCallback(
    (filename: string) => {
      setUploadError(null);
      try {
        const result = addBundledGpxFile(filename);
        if (result.status === "needs-confirmation") {
          setPendingConfirmation({
            pendingRoute: result.pendingRoute,
            newBounds: result.newBounds,
            replaceOnly: result.replaceOnly,
          });
        }
      } catch (err) {
        setUploadError(
          err instanceof Error ? err.message : "Could not load GPX file.",
        );
      }
    },
    [addBundledGpxFile],
  );

  const removeRoute = useCallback(
    (routeId: string) => {
      dispatch({ type: "REMOVE_ROUTE", routeId });
    },
    [dispatch],
  );

  const toggleShowAll = useCallback(() => {
    dispatch({
      type: "SET_FIELD",
      name: "showRoutes",
      value: !form.showRoutes,
    });
  }, [dispatch, form.showRoutes]);

  return (
    <section className="panel-block routes-settings-screen">
      {pendingConfirmation ? (
        <RouteBoundsWarningModal
          replaceOnly={pendingConfirmation.replaceOnly}
          onCancel={() => setPendingConfirmation(null)}
          onContinue={() => {
            confirmAddRoute(
              pendingConfirmation.pendingRoute,
              pendingConfirmation.newBounds,
            );
            setPendingConfirmation(null);
          }}
          onReplace={() => {
            confirmReplaceRoutes(
              pendingConfirmation.pendingRoute,
              pendingConfirmation.newBounds,
            );
            setPendingConfirmation(null);
          }}
        />
      ) : null}

      <div className="markers-section-head">
        <p className="section-summary-label">ROUTES</p>
        <div className="markers-section-head-actions">
          <button
            type="button"
            className="marker-row__icon-btn marker-header-action-btn"
            onClick={toggleShowAll}
            title={form.showRoutes ? "Hide routes" : "Show routes"}
            disabled={routes.length === 0}
          >
            <span className="marker-row__icon-btn-label">
              {form.showRoutes ? "Hide All" : "Show All"}
            </span>
          </button>
          {bundledGpxEntries.length > 0 ? (
            <button
              type="button"
              className={`marker-row__icon-btn marker-header-action-btn${
                isLibraryOpen ? " is-active" : ""
              }`}
              onClick={() => setIsLibraryOpen((open) => !open)}
              aria-expanded={isLibraryOpen}
              title="Choose a GPX file from src/data/gpx/"
            >
              <span className="marker-row__icon-btn-label">Library</span>
            </button>
          ) : null}
          <button
            type="button"
            className="marker-row__icon-btn marker-header-action-btn"
            onClick={handleUploadClick}
            title="Upload GPX file"
            disabled={isUploading}
          >
            <span className="marker-row__icon-btn-label">
              {isUploading ? "Uploading…" : "Upload GPX"}
            </span>
          </button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".gpx,application/gpx+xml,application/xml,text/xml"
        onChange={handleUploadChange}
        style={{ display: "none" }}
      />

      {uploadError ? (
        <p className="routes-section__error" role="alert">
          {uploadError}
        </p>
      ) : null}

      {isLibraryOpen && bundledGpxEntries.length > 0 ? (
        <div
          className="routes-library"
          role="region"
          aria-label="Saved GPX library"
        >
          <div className="routes-library__header">
            <span className="routes-library__title">
              GPX Library (<code>src/data/gpx/</code>)
            </span>
            <button
              type="button"
              className="routes-library__close"
              onClick={() => setIsLibraryOpen(false)}
              title="Close library"
              aria-label="Close GPX library"
            >
              <CloseIcon />
            </button>
          </div>
          <ul className="routes-library__list">
            {bundledGpxEntries.map((entry) => {
              const isAdded = activeGpxFilenames.has(
                entry.filename.toLowerCase(),
              );
              return (
                <li
                  key={entry.filename}
                  className={`routes-library__row${
                    isAdded ? " is-added" : ""
                  }`}
                >
                  <div className="routes-library__info">
                    <span
                      className="routes-library__name"
                      title={entry.filename}
                    >
                      {entry.label}
                    </span>
                    <span className="routes-library__meta">
                      {formatRouteDistance(entry.distanceMeters)} &middot;{" "}
                      {entry.pointCount.toLocaleString()} pts
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`routes-library__btn${
                      isAdded ? " is-added" : ""
                    }`}
                    onClick={() => handleSelectBundledGpx(entry.filename)}
                    disabled={isAdded}
                    title={
                      isAdded
                        ? `${entry.filename} is already on the map`
                        : `Add ${entry.filename}`
                    }
                  >
                    {isAdded ? (
                      <>
                        <CheckIcon aria-hidden="true" />
                        <span>Added</span>
                      </>
                    ) : (
                      <span>Add</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="routes-section__content routes-section__content--list">
        {routes.length === 0 ? (
          <p className="routes-section__empty">
            Choose a saved route from <strong>Library</strong> or upload a{" "}
            <code>.gpx</code> file to draw a route on the poster.
          </p>
        ) : null}

        {routes.map((route) => {
          const outline = resolveRouteOutline(route);
          const outline2 = resolveRouteOutline2(route);
          const distanceLabel = formatRouteDistance(routeLengthMeters(route));

          return (
            <article key={route.id} className="route-card route-card--static">
              <button
                type="button"
                className="route-card__delete"
                onClick={() => removeRoute(route.id)}
                title="Remove route"
                aria-label={`Remove ${route.label}`}
              >
                <CloseIcon />
              </button>

              <div className="route-card__summary route-card__summary--static">
                <span
                  className="route-card__swatch"
                  style={{
                    backgroundColor: route.color,
                    opacity: route.opacity,
                    boxShadow: outline2.active
                      ? `inset 0 0 0 1.5px ${outline2.color}, inset 0 0 0 3px ${outline.color}`
                      : outline.enabled && outline.width > 0
                        ? `inset 0 0 0 2px ${outline.color}`
                        : undefined,
                  }}
                  aria-hidden="true"
                />
                <span className="route-card__meta">
                  <span className="route-card__label">{route.label}</span>
                  <span className="route-card__distance">{distanceLabel}</span>
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
