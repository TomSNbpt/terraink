import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { MapInstanceRef } from "@/features/map/domain/types";
import type { Route } from "@/features/routes/domain/types";
import { DEFAULT_ROUTE_ENDPOINT_OUTLINE_ENABLED } from "@/features/routes/domain/constants";
import type { MarkerIconDefinition } from "@/features/markers/domain/types";
import { findMarkerIcon } from "@/features/markers/infrastructure/iconRegistry";
import MarkerVisual from "@/features/markers/ui/MarkerVisual";
import {
  resolveRouteOutline,
  resolveRouteOutline2,
  routeEndpoints,
} from "@/features/routes/infrastructure/helpers";

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
    return routes.flatMap((route) => {
      if (!route.visible || !route.showEndpoints) return [];
      const endpoints = routeEndpoints(route);
      if (!endpoints) return [];
      const outline = resolveRouteOutline(route);
      const outline2 = resolveRouteOutline2(route);
      const startHasStroke =
        (route.startMarker.outlineEnabled ??
          DEFAULT_ROUTE_ENDPOINT_OUTLINE_ENABLED) &&
        outline.width > 0;
      const finishHasStroke =
        (route.finishMarker.outlineEnabled ??
          DEFAULT_ROUTE_ENDPOINT_OUTLINE_ENABLED) &&
        outline.width > 0;

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
      }[] = [];
      const projectPoint = (lat: number, lon: number) => {
        try {
          const p = map.project([lon, lat]);
          return { x: p.x / overzoomScale, y: p.y / overzoomScale };
        } catch {
          return null;
        }
      };
      const startIcon = findMarkerIcon(route.startMarker.iconId, customIcons);
      if (startIcon) {
        const p = projectPoint(endpoints.start.lat, endpoints.start.lon);
        if (p) {
          items.push({
            key: `${route.id}-start`,
            x: p.x,
            y: p.y,
            icon: startIcon,
            color: route.startMarker.color,
            size: route.startMarker.size,
            ...(startHasStroke
              ? {
                  strokeColor: outline.color,
                  strokeWidth: outline.width,
                  ...(outline2.active
                    ? {
                        outerStrokeColor: outline2.color,
                        outerStrokeWidth: outline2.width,
                      }
                    : {}),
                }
              : {}),
          });
        }
      }
      const finishIcon = findMarkerIcon(route.finishMarker.iconId, customIcons);
      if (finishIcon) {
        const p = projectPoint(endpoints.finish.lat, endpoints.finish.lon);
        if (p) {
          items.push({
            key: `${route.id}-finish`,
            x: p.x,
            y: p.y,
            icon: finishIcon,
            color: route.finishMarker.color,
            size: route.finishMarker.size,
            ...(finishHasStroke
              ? {
                  strokeColor: outline.color,
                  strokeWidth: outline.width,
                  ...(outline2.active
                    ? {
                        outerStrokeColor: outline2.color,
                        outerStrokeWidth: outline2.width,
                      }
                    : {}),
                }
              : {}),
          });
        }
      }
      return items;
    });
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
            />
          </div>
        ),
      )}
    </div>
  );
}
