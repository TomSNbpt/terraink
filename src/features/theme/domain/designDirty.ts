import type { PosterForm } from "@/features/poster/application/posterReducer";
import type {
  Route,
  RouteDefaults,
  RouteEndpointMarker,
  RouteLineStyle,
} from "@/features/routes/domain/types";
import {
  DISPLAY_PALETTE_KEYS,
  type ResolvedTheme,
} from "@/features/theme/domain/types";
import { getThemeColorByPath } from "@/features/theme/domain/colorPaths";
import { normalizeHexColor } from "@/shared/utils/color";

export interface LayerToggleSnapshot {
  includeLandcover: boolean;
  includeBuildings: boolean;
  includeWater: boolean;
  includeParks: boolean;
  includeAeroway: boolean;
  includeRail: boolean;
  includeRoads: boolean;
  includeRoadPath: boolean;
  includeRoadMinorLow: boolean;
  includeRoadOutline: boolean;
}

export interface TypographyDesignSnapshot {
  showPosterText: boolean;
  showMarkers: boolean;
  displayCity: string;
  displayCountry: string;
  fontFamily: string;
}

export interface RouteStyleSnapshot {
  color: string;
  strokeWidth: number;
  outlineEnabled?: boolean;
  outlineColor?: string;
  outlineWidth?: number;
  outline2Enabled?: boolean;
  outline2Color?: string;
  outline2Width?: number;
  opacity: number;
  lineStyle: RouteLineStyle;
  showEndpoints?: boolean;
  startMarker?: RouteEndpointMarker;
  finishMarker?: RouteEndpointMarker;
}

export interface ThemeDesignBaseline {
  layers: LayerToggleSnapshot;
  typography: TypographyDesignSnapshot;
  routeStyles: Record<string, RouteStyleSnapshot>;
  routeDefaults: RouteDefaults;
}

function cloneEndpointMarker(
  marker: RouteEndpointMarker | undefined,
): RouteEndpointMarker | undefined {
  return marker ? { ...marker } : undefined;
}

export function captureRouteStyleSnapshot(route: Route): RouteStyleSnapshot {
  return {
    color: route.color,
    strokeWidth: route.strokeWidth,
    outlineEnabled: route.outlineEnabled,
    outlineColor: route.outlineColor,
    outlineWidth: route.outlineWidth,
    outline2Enabled: route.outline2Enabled,
    outline2Color: route.outline2Color,
    outline2Width: route.outline2Width,
    opacity: route.opacity,
    lineStyle: route.lineStyle,
    showEndpoints: route.showEndpoints,
    startMarker: cloneEndpointMarker(route.startMarker),
    finishMarker: cloneEndpointMarker(route.finishMarker),
  };
}

export function captureThemeDesignBaseline(
  form: PosterForm,
  routes: Route[],
  routeDefaults: RouteDefaults,
): ThemeDesignBaseline {
  const routeStyles: Record<string, RouteStyleSnapshot> = {};
  for (const route of routes) {
    routeStyles[route.id] = captureRouteStyleSnapshot(route);
  }
  return {
    layers: {
      includeLandcover: form.includeLandcover,
      includeBuildings: form.includeBuildings,
      includeWater: form.includeWater,
      includeParks: form.includeParks,
      includeAeroway: form.includeAeroway,
      includeRail: form.includeRail,
      includeRoads: form.includeRoads,
      includeRoadPath: form.includeRoadPath,
      includeRoadMinorLow: form.includeRoadMinorLow,
      includeRoadOutline: form.includeRoadOutline,
    },
    typography: {
      showPosterText: form.showPosterText,
      showMarkers: form.showMarkers,
      displayCity: form.displayCity,
      displayCountry: form.displayCountry,
      fontFamily: form.fontFamily,
    },
    routeStyles,
    routeDefaults: { ...routeDefaults },
  };
}

function sameEndpointMarker(
  a: RouteEndpointMarker | undefined,
  b: RouteEndpointMarker | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.iconId === b.iconId &&
    a.size === b.size &&
    a.color.toLowerCase() === b.color.toLowerCase() &&
    Boolean(a.outlineEnabled) === Boolean(b.outlineEnabled)
  );
}

function sameRouteStyle(route: Route, baseline: RouteStyleSnapshot): boolean {
  return (
    route.color.toLowerCase() === baseline.color.toLowerCase() &&
    route.strokeWidth === baseline.strokeWidth &&
    Boolean(route.outlineEnabled) === Boolean(baseline.outlineEnabled) &&
    (route.outlineColor ?? "").toLowerCase() ===
      (baseline.outlineColor ?? "").toLowerCase() &&
    (route.outlineWidth ?? 0) === (baseline.outlineWidth ?? 0) &&
    Boolean(route.outline2Enabled) === Boolean(baseline.outline2Enabled) &&
    (route.outline2Color ?? "").toLowerCase() ===
      (baseline.outline2Color ?? "").toLowerCase() &&
    (route.outline2Width ?? 0) === (baseline.outline2Width ?? 0) &&
    route.opacity === baseline.opacity &&
    route.lineStyle === baseline.lineStyle &&
    Boolean(route.showEndpoints) === Boolean(baseline.showEndpoints) &&
    sameEndpointMarker(route.startMarker, baseline.startMarker) &&
    sameEndpointMarker(route.finishMarker, baseline.finishMarker)
  );
}

export function isThemeDesignModified({
  form,
  customColors,
  selectedTheme,
  activeGeneratedThemeId,
  routes,
  baseline,
}: {
  form: PosterForm;
  customColors: Record<string, string>;
  selectedTheme: ResolvedTheme;
  activeGeneratedThemeId: string | null;
  routes: Route[];
  baseline: ThemeDesignBaseline;
}): boolean {
  if (activeGeneratedThemeId !== null) {
    return true;
  }

  for (const key of DISPLAY_PALETTE_KEYS) {
    const override = normalizeHexColor(customColors[key]);
    if (!override) continue;
    const baseColor = normalizeHexColor(getThemeColorByPath(selectedTheme, key));
    if (override !== baseColor) {
      return true;
    }
  }

  const l = baseline.layers;
  if (
    form.includeLandcover !== l.includeLandcover ||
    form.includeBuildings !== l.includeBuildings ||
    form.includeWater !== l.includeWater ||
    form.includeParks !== l.includeParks ||
    form.includeAeroway !== l.includeAeroway ||
    form.includeRail !== l.includeRail ||
    form.includeRoads !== l.includeRoads ||
    form.includeRoadPath !== l.includeRoadPath ||
    form.includeRoadMinorLow !== l.includeRoadMinorLow ||
    form.includeRoadOutline !== l.includeRoadOutline
  ) {
    return true;
  }

  const t = baseline.typography;
  if (
    form.showPosterText !== t.showPosterText ||
    form.showMarkers !== t.showMarkers ||
    form.displayCity !== t.displayCity ||
    form.displayCountry !== t.displayCountry ||
    form.fontFamily !== t.fontFamily
  ) {
    return true;
  }

  for (const route of routes) {
    const routeBase = baseline.routeStyles[route.id];
    if (routeBase && !sameRouteStyle(route, routeBase)) {
      return true;
    }
  }

  return false;
}
