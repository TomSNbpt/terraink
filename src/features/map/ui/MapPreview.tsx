import { useCallback, useEffect, useRef, type CSSProperties } from "react";
import maplibregl from "maplibre-gl";
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MapInstanceRef } from "@/features/map/domain/types";
import {
  MAP_CENTER_SYNC_EPSILON,
  MAP_FINE_WHEEL_ZOOM_STEP,
  MAP_ZOOM_SYNC_EPSILON,
} from "@/features/map/infrastructure";

/**
 * Apply style changes incrementally via setPaintProperty / setLayoutProperty
 * instead of calling setStyle() which triggers a full style diff.
 */
function applyIncrementalStyleUpdate(
  map: maplibregl.Map,
  prev: StyleSpecification,
  next: StyleSpecification,
): void {
  const prevLayerMap = new Map(
    prev.layers.map((l) => [l.id, l] as [string, LayerSpecification]),
  );

  for (const layer of next.layers) {
    const prevLayer = prevLayerMap.get(layer.id);
    if (!prevLayer) continue;

    // Diff paint properties
    const nextPaint = (layer as Record<string, unknown>).paint as
      | Record<string, unknown>
      | undefined;
    const prevPaint = (prevLayer as Record<string, unknown>).paint as
      | Record<string, unknown>
      | undefined;
    if (nextPaint) {
      for (const key of Object.keys(nextPaint)) {
        if (JSON.stringify(nextPaint[key]) !== JSON.stringify(prevPaint?.[key])) {
          map.setPaintProperty(layer.id, key, nextPaint[key]);
        }
      }
    }

    // Diff layout properties
    const nextLayout = (layer as Record<string, unknown>).layout as
      | Record<string, unknown>
      | undefined;
    const prevLayout = (prevLayer as Record<string, unknown>).layout as
      | Record<string, unknown>
      | undefined;
    if (nextLayout) {
      for (const key of Object.keys(nextLayout)) {
        if (
          JSON.stringify(nextLayout[key]) !== JSON.stringify(prevLayout?.[key])
        ) {
          map.setLayoutProperty(layer.id, key, nextLayout[key]);
        }
      }
    }

    // Diff minzoom / maxzoom
    const nextAny = layer as Record<string, unknown>;
    const prevAny = prevLayer as Record<string, unknown>;
    if (nextAny.minzoom !== prevAny.minzoom || nextAny.maxzoom !== prevAny.maxzoom) {
      map.setLayerZoomRange(
        layer.id,
        (nextAny.minzoom as number) ?? 0,
        (nextAny.maxzoom as number) ?? 24,
      );
    }
  }
}

interface MapPreviewProps {
  style: StyleSpecification;
  center: [lon: number, lat: number];
  zoom: number;
  bearing?: number;
  presetLoadSeq?: number;
  mapRef: MapInstanceRef;
  interactive?: boolean;
  allowRotation?: boolean;
  minZoom?: number;
  maxZoom?: number;
  onMoveEnd?: (center: [number, number], zoom: number) => void;
  onMove?: (center: [number, number], zoom: number) => void;
  containerStyle?: CSSProperties;
  overzoomScale?: number;
}

/**
 * MapLibre preview wrapper.
 *
 * - Keeps `preserveDrawingBuffer` enabled for export snapshots.
 * - Syncs controlled style/center/zoom from form state.
 * - Exposes full map instance via a shared ref for export/controls.
 */
export default function MapPreview({
  style,
  center,
  zoom,
  bearing = 0,
  presetLoadSeq = 0,
  mapRef,
  interactive = false,
  allowRotation = false,
  minZoom,
  maxZoom,
  onMoveEnd,
  onMove,
  containerStyle,
  overzoomScale = 1,
}: MapPreviewProps) {
  const outerContainerRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isSyncing = useRef(false);
  const hasMountedStyleRef = useRef(false);
  const prevStyleRef = useRef<StyleSpecification | null>(null);
  const lastPresetLoadSeqRef = useRef(presetLoadSeq);
  const centerRef = useRef(center);
  const zoomRef = useRef(zoom);
  const onMoveEndRef = useRef(onMoveEnd);
  const onMoveRef = useRef(onMove);
  const overzoomScaleRef = useRef(overzoomScale);
  const fineWheelDeltaAccumRef = useRef(0);
  centerRef.current = center;
  zoomRef.current = zoom;
  onMoveEndRef.current = onMoveEnd;
  onMoveRef.current = onMove;
  overzoomScaleRef.current = overzoomScale;

  const runSyncing = useCallback((fn: () => void) => {
    const prev = isSyncing.current;
    isSyncing.current = true;
    try {
      fn();
    } finally {
      isSyncing.current = prev;
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style,
      center,
      zoom,
      bearing,
      interactive: false,
      attributionControl: false,
      trackResize: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });

    mapRef.current = map;

    map.on("moveend", () => {
      if (isSyncing.current) return;
      const currentCenter = map.getCenter();
      onMoveEndRef.current?.([currentCenter.lng, currentCenter.lat], map.getZoom());
    });
    map.on("move", () => {
      if (isSyncing.current) return;
      const currentCenter = map.getCenter();
      onMoveRef.current?.([currentCenter.lng, currentCenter.lat], map.getZoom());
    });

    // Tell MapLibre to re-measure its canvas whenever the outer frame or
    // overzoomed container resizes, and re-anchor the controlled camera so
    // layout/aspect-ratio transitions never leave the map off-center or emit
    // spurious moveend updates back into form state.
    const resizeObserver = new ResizeObserver(() => {
      runSyncing(() => {
        map.resize();
        if (!map.isMoving()) {
          map.jumpTo({
            center: centerRef.current,
            zoom: zoomRef.current,
            bearing: map.getBearing(),
            pitch: 0,
          });
        }
      });
    });
    if (outerContainerRef.current) {
      resizeObserver.observe(outerContainerRef.current);
    }
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      mapRef.current = null;
      map.remove();
    };
    // Mount once; follow-up updates are handled by effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (interactive) {
      map.scrollZoom.enable();
      map.dragPan.enable();
      map.touchZoomRotate.enable();
      map.doubleClickZoom.enable();
      map.keyboard.enable();
      if (allowRotation) {
        map.dragRotate.enable();
        map.touchZoomRotate.enableRotation();
      } else {
        map.dragRotate.disable();
        map.touchZoomRotate.disableRotation();
      }
    } else {
      map.scrollZoom.disable();
      map.dragPan.disable();
      map.touchZoomRotate.disable();
      map.doubleClickZoom.disable();
      map.keyboard.disable();
      map.touchZoomRotate.disableRotation();
      map.dragRotate.disable();
    }
  }, [interactive, allowRotation, mapRef]);

  useEffect(() => {
    const outerContainer = outerContainerRef.current;
    if (!outerContainer || !interactive) {
      fineWheelDeltaAccumRef.current = 0;
      return;
    }

    const FINE_WHEEL_PIXEL_THRESHOLD = 40;

    const handleWheel = (event: WheelEvent) => {
      if (!event.shiftKey) return;

      const map = mapRef.current;
      if (!map) return;

      event.preventDefault();
      event.stopPropagation();

      // Some browsers convert Shift + vertical wheel into deltaX.
      const rawDelta =
        Math.abs(event.deltaY) >= Math.abs(event.deltaX)
          ? event.deltaY
          : event.deltaX;
      if (!Number.isFinite(rawDelta) || rawDelta === 0) return;

      let steps = 0;
      if (event.deltaMode !== 0) {
        steps = -Math.sign(rawDelta);
        fineWheelDeltaAccumRef.current = 0;
      } else {
        if (
          fineWheelDeltaAccumRef.current !== 0 &&
          Math.sign(fineWheelDeltaAccumRef.current) !== Math.sign(rawDelta)
        ) {
          fineWheelDeltaAccumRef.current = 0;
        }
        fineWheelDeltaAccumRef.current += rawDelta;

        if (Math.abs(fineWheelDeltaAccumRef.current) >= FINE_WHEEL_PIXEL_THRESHOLD) {
          steps = -Math.sign(fineWheelDeltaAccumRef.current);
          fineWheelDeltaAccumRef.current = 0;
        }
      }

      if (steps === 0) return;

      const rect = outerContainer.getBoundingClientRect();
      const scale = Math.max(1, overzoomScaleRef.current);
      const internalX = (event.clientX - rect.left) * scale;
      const internalY = (event.clientY - rect.top) * scale;
      const around = map.unproject([internalX, internalY]);

      const currentZoom = map.getZoom();
      const targetZoom = Math.min(
        map.getMaxZoom(),
        Math.max(
          map.getMinZoom(),
          currentZoom + steps * MAP_FINE_WHEEL_ZOOM_STEP,
        ),
      );
      if (Math.abs(targetZoom - currentZoom) < 0.0001) return;

      map.zoomTo(targetZoom, { duration: 0, around });
    };

    outerContainer.addEventListener("wheel", handleWheel, {
      passive: false,
      capture: true,
    });
    return () => {
      fineWheelDeltaAccumRef.current = 0;
      outerContainer.removeEventListener("wheel", handleWheel, {
        capture: true,
      });
    };
  }, [interactive, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (typeof minZoom === "number") {
      map.setMinZoom(minZoom);
    }
    if (typeof maxZoom === "number") {
      map.setMaxZoom(maxZoom);
    }
  }, [minZoom, maxZoom, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Initial style is already provided in map constructor — record it and skip.
    if (!hasMountedStyleRef.current) {
      hasMountedStyleRef.current = true;
      prevStyleRef.current = style;
      return;
    }

    // If the map hasn't finished loading the initial style yet, queue a full setStyle.
    if (!map.isStyleLoaded()) {
      const applyWhenReady = () => {
        map.setStyle(style);
        prevStyleRef.current = style;
      };
      map.once("load", applyWhenReady);
      return () => {
        map.off("load", applyWhenReady);
      };
    }

    // Fast path: apply only the changed paint/layout/zoom properties directly,
    // avoiding a full setStyle diff and any risk of source re-initialisation.
    if (
      prevStyleRef.current &&
      JSON.stringify(prevStyleRef.current.sources) ===
        JSON.stringify(style.sources)
    ) {
      applyIncrementalStyleUpdate(map, prevStyleRef.current, style);
    } else {
      map.setStyle(style);
    }

    prevStyleRef.current = style;
  }, [style, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const presetChanged = lastPresetLoadSeqRef.current !== presetLoadSeq;
    if (presetChanged) {
      lastPresetLoadSeqRef.current = presetLoadSeq;
    }

    const currentCenter = map.getCenter();
    const centerDelta = Math.max(
      Math.abs(currentCenter.lng - center[0]),
      Math.abs(currentCenter.lat - center[1]),
    );
    const zoomDelta = Math.abs(map.getZoom() - zoom);
    const bearingDelta = Math.abs(map.getBearing() - bearing);

    const container = containerRef.current;
    const canvas = map.getCanvas();
    const needsResize = Boolean(
      container &&
        container.clientWidth > 0 &&
        container.clientHeight > 0 &&
        (Math.abs(container.clientWidth - canvas.clientWidth) > 1 ||
          Math.abs(container.clientHeight - canvas.clientHeight) > 1),
    );

    if (
      !presetChanged &&
      !needsResize &&
      centerDelta < MAP_CENTER_SYNC_EPSILON &&
      zoomDelta < MAP_ZOOM_SYNC_EPSILON
    ) {
      return;
    }

    if (
      presetChanged &&
      !needsResize &&
      centerDelta < MAP_CENTER_SYNC_EPSILON &&
      zoomDelta < MAP_ZOOM_SYNC_EPSILON &&
      bearingDelta < 0.05
    ) {
      return;
    }

    runSyncing(() => {
      map.stop();
      if (needsResize) {
        map.resize();
      }
      map.jumpTo({
        center,
        zoom,
        ...(presetChanged ? { bearing, pitch: 0 } : {}),
      });
    });
  }, [center, zoom, bearing, presetLoadSeq, overzoomScale, mapRef, runSyncing]);

  const normalizedOverzoomScale = Math.max(1, overzoomScale);
  const innerStyle: CSSProperties =
    normalizedOverzoomScale === 1
      ? { width: "100%", height: "100%" }
      : {
          width: `${normalizedOverzoomScale * 100}%`,
          height: `${normalizedOverzoomScale * 100}%`,
          transform: `scale(${1 / normalizedOverzoomScale})`,
          transformOrigin: "top left",
        };

  return (
    <div
      ref={outerContainerRef}
      className="map-container"
      style={{ ...containerStyle, overflow: "hidden" }}
    >
      <div ref={containerRef} style={innerStyle} />
    </div>
  );
}
