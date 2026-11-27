import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { MapInstanceRef } from "@/features/map/domain/types";
import type { Route } from "@/features/routes/domain/types";
import type { MarkerIconDefinition } from "@/features/markers/domain/types";
import { findMarkerIcon } from "@/features/markers/infrastructure/iconRegistry";
import MarkerVisual from "@/features/markers/ui/MarkerVisual";
import { routeEndpointMarkerItems } from "@/features/routes/infrastructure/helpers";

interface RouteEndpointsOverlayProps {
  routes: Route[];
  customIcons: MarkerIconDefinition[];
  mapRef: MapInstanceRef;
  visible: boolean;
  overzoomScale: number;
}

export default function RouteEndpointsOverlay({
  routes,
  customIcons,
  mapRef,
  visible,
  overzoomScale,
}: RouteEndpointsOverlayProps) {
  const [renderTick, setRenderTick] = useState(0);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const sync = () => setRenderTick((value) => value + 1);

    map.on("move", sync);
    map.on("moveend", sync);
    map.on("rotate", sync);
    map.on("resize", sync);
    map.on("load", sync);

    return () => {
      map.off("move", sync);
      map.off("moveend", sync);
      map.off("rotate", sync);
      map.off("resize", sync);
      map.off("load", sync);
    };
  }, [mapRef]);

  const map = mapRef.current;
  const projected = useMemo(() => {
    if (!map || !visible) return [];

    const projectPoint = (lat: number, lon: number) => {
      try {
        const p = map.project([lon, lat]);
        return { x: p.x / overzoomScale, y: p.y / overzoomScale };
      } catch {
        return null;
      }
    };

    const markerItems = routeEndpointMarkerItems(routes, {
      project: projectPoint,
      sizeScale: 1,
      strokeScale: 1,
    });

    const items: {
      key: string;
      x: number;
      y: number;
      icon: MarkerIconDefinition;
      color: string;
      size: number;
      strokeColor?: string;
      strokeWidth?: number;
      outerStrokeColor?: string;
      outerStrokeWidth?: number;
      labelText?: string;
      labelColor?: string;
    }[] = [];

    for (const marker of markerItems) {
      const icon = findMarkerIcon(marker.iconId, customIcons);
      if (!icon) continue;
      const p = projectPoint(marker.lat, marker.lon);
      if (!p) continue;
      items.push({
        key: marker.id,
        x: p.x + (marker.offsetX ?? 0),
        y: p.y + (marker.offsetY ?? 0),
        icon,
        color: marker.color,
        size: marker.size,
        strokeColor: marker.strokeColor,
        strokeWidth: marker.strokeWidth,
        outerStrokeColor: marker.outerStrokeColor,
        outerStrokeWidth: marker.outerStrokeWidth,
        labelText: marker.labelText,
        labelColor: marker.labelColor,
      });
    }

    return items;
    // renderTick drives recomputation when the map view changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, routes, customIcons, visible, overzoomScale, renderTick]);

  if (!visible || projected.length === 0) {
    return null;
  }

  return (
    <div className="poster-route-endpoints" aria-hidden="true">
      {projected.map(
        ({
          key,
          x,
          y,
          icon,
          color,
          size,
          strokeColor,
          strokeWidth,
          outerStrokeColor,
          outerStrokeWidth,
          labelText,
          labelColor,
        }) => (
          <div
            key={key}
            className="poster-route-endpoint"
            style={{ left: `${x}px`, top: `${y}px` } as CSSProperties}
          >
            <MarkerVisual
              icon={icon}
              size={size}
              color={color}
              strokeColor={strokeColor}
              strokeWidth={strokeWidth}
              outerStrokeColor={outerStrokeColor}
              outerStrokeWidth={outerStrokeWidth}
              labelText={labelText}
              labelColor={labelColor}
            />
          </div>
        ),
      )}
    </div>
  );
}
