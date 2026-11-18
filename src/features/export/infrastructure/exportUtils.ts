import maplibregl, {
  type Map as MaplibreMap,
  type StyleSpecification,
} from "maplibre-gl";
import type { MarkerProjectionInput } from "@/features/markers/domain/types";
import { MAP_OVERZOOM_SCALE } from "@/features/map/infrastructure/constants";

const EXPORT_MAP_TIMEOUT_MS = 15_000;

/**
 * Waits for MapLibre to finish rendering (idle, no active movement).
 * Rejects if tiles don't settle within the timeout.
 */
export function waitForMapIdle(map: MaplibreMap): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Timed out while waiting for map tiles to render."));
    }, EXPORT_MAP_TIMEOUT_MS);

    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve();
    };

    if (map.loaded() && !map.isMoving()) {
      finish();
      return;
    }

    map.once("idle", finish);
  });
}

/**
 * Creates a fixed, invisible offscreen container for the export map.
 * Caller is responsible for appending to the DOM and removing when done.
 */
export function createOffscreenContainer(
  width: number,
  height: number,
): HTMLDivElement {
  const el = document.createElement("div");
  el.style.position = "fixed";
  el.style.left = "-100000px";
  el.style.top = "0";
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
  el.style.pointerEvents = "none";
  el.style.opacity = "0";
  return el;
}

export interface ExportRenderParams {
  center: maplibregl.LngLat;
  zoom: number;
  pitch: number;
  bearing: number;
  style: StyleSpecification;
  previewWidth: number;
  previewHeight: number;
  renderWidth: number;
  renderHeight: number;
  pixelRatio: number;
  markerProjection: MarkerProjectionInput;
  markerScaleX: number;
  markerScaleY: number;
  markerSizeScale: number;
}

export interface ExportBleedRenderOptions {
  bleedRatioX?: number;
  bleedRatioY?: number;
  isBleedPreviewActive?: boolean;
}

/**
 * Derives all render dimensions and marker projection data needed to create
 * an offscreen export map that matches the live preview framing.
 */
export function resolveExportRenderParams(
  map: MaplibreMap,
  exportWidth: number,
  exportHeight: number,
  bleedOptions: ExportBleedRenderOptions = {},
): ExportRenderParams {
  const internalMapContainer = map.getContainer();
  const visibleContainer = internalMapContainer.parentElement;

  const bleedRatioX = Math.max(0, Number(bleedOptions.bleedRatioX) || 0);
  const bleedRatioY = Math.max(0, Number(bleedOptions.bleedRatioY) || 0);
  const exportScaleFactorX = 1 + 2 * bleedRatioX;
  const exportScaleFactorY = 1 + 2 * bleedRatioY;
  const previewScaleFactorX = bleedOptions.isBleedPreviewActive
    ? exportScaleFactorX
    : 1;
  const previewScaleFactorY = bleedOptions.isBleedPreviewActive
    ? exportScaleFactorY
    : 1;

  // Derive the actual overzoom scale from the DOM so the export matches the
  // live preview even when adaptive overzoom has scaled beyond the static
  // MAP_OVERZOOM_SCALE (e.g. on small mobile viewports).
  const actualOverzoomScale =
    visibleContainer && visibleContainer.clientWidth > 0
      ? internalMapContainer.clientWidth / visibleContainer.clientWidth
      : MAP_OVERZOOM_SCALE;

  const rawVisibleWidth =
    visibleContainer?.clientWidth ||
    Math.round(internalMapContainer.clientWidth / actualOverzoomScale);
  const rawVisibleHeight =
    visibleContainer?.clientHeight ||
    Math.round(internalMapContainer.clientHeight / actualOverzoomScale);

  const previewWidth = Math.max(rawVisibleWidth / previewScaleFactorX, 1);
  const previewHeight = Math.max(rawVisibleHeight / previewScaleFactorY, 1);

  const center = map.getCenter();
  const zoom = map.getZoom();
  const pitch = map.getPitch();
  const bearing = map.getBearing();
  const style = map.getStyle() as StyleSpecification;

  const trimExportWidth = exportWidth / exportScaleFactorX;
  const trimExportHeight = exportHeight / exportScaleFactorY;
  const widthScale = Math.max(trimExportWidth / previewWidth, 1);
  const heightScale = Math.max(trimExportHeight / previewHeight, 1);
  const basePixelRatio = Math.max(widthScale, heightScale, 1);

  const renderWidth = Math.max(
    1,
    Math.round(previewWidth * actualOverzoomScale * exportScaleFactorX),
  );
  const renderHeight = Math.max(
    1,
    Math.round(previewHeight * actualOverzoomScale * exportScaleFactorY),
  );
  const pixelRatio = Math.max(basePixelRatio / actualOverzoomScale, 1);

  const markerProjection: MarkerProjectionInput = {
    centerLat: center.lat,
    centerLon: center.lng,
    zoom,
    bearingDeg: bearing,
    canvasWidth: renderWidth,
    canvasHeight: renderHeight,
  };

  return {
    center,
    zoom,
    pitch,
    bearing,
    style,
    previewWidth,
    previewHeight,
    renderWidth,
    renderHeight,
    pixelRatio,
    markerProjection,
    markerScaleX: exportWidth / renderWidth,
    markerScaleY: exportHeight / renderHeight,
    markerSizeScale: actualOverzoomScale,
  };
}
