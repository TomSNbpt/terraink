import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  posterReducer,
  type PosterState,
  type PosterAction,
  type PosterForm,
} from "../application/posterReducer";
import type { ResolvedTheme } from "@/features/theme/domain/types";
import { getTheme } from "@/features/theme/infrastructure/themeRepository";
import { applyThemeColorOverrides } from "@/features/theme/domain/colorPaths";
import { generateMapStyle } from "@/features/map/infrastructure/maplibreStyle";
import type { StyleSpecification } from "maplibre-gl";
import type { MapInstanceRef } from "@/features/map/domain/types";
import { createDefaultMarkerSettings } from "@/features/markers/infrastructure/helpers";
import {
  loadCustomMarkerIcons,
  saveCustomMarkerIcons,
} from "@/features/markers/infrastructure/customIconStorage";
import { createDefaultRouteSettings } from "@/features/routes/infrastructure/helpers";
import {
  loadSavedThemes,
  saveSavedThemes,
} from "@/features/theme/infrastructure/savedThemesStorage";
import {
  loadUserDefaults,
  saveUserDefaults,
} from "@/features/settings/infrastructure/userDefaultsStorage";
import type { PresetSnapshot } from "@/features/presets/domain/types";
import {
  cloneSnapshot,
  loadPresets,
  savePresets,
} from "@/features/presets/infrastructure/presetsStorage";

/* ────── Default form (moved from appConfig) ────── */

import {
  defaultLayoutId,
  getLayoutOption,
  instantiateLayoutGuides,
} from "@/features/layout/infrastructure/layoutRepository";
import { formatLayoutCm } from "@/features/layout/domain/layoutMatcher";
import { defaultThemeName } from "@/features/theme/infrastructure/themeRepository";
import {
  DEFAULT_POSTER_WIDTH_CM,
  DEFAULT_POSTER_HEIGHT_CM,
  DEFAULT_DISTANCE_METERS,
  DEFAULT_LAT,
  DEFAULT_LON,
} from "@/core/config";

const defaultLayoutOption = getLayoutOption(defaultLayoutId);
const defaultLayoutWidthCm = Number(
  defaultLayoutOption?.widthCm ?? DEFAULT_POSTER_WIDTH_CM,
);
const defaultLayoutHeightCm = Number(
  defaultLayoutOption?.heightCm ?? DEFAULT_POSTER_HEIGHT_CM,
);
const DEFAULT_LOCATION_LABEL =
  "Hanover, Region Hannover, Lower Saxony, Germany";

export const DEFAULT_FORM: PosterForm = {
  location: DEFAULT_LOCATION_LABEL,
  latitude: DEFAULT_LAT.toFixed(6),
  longitude: DEFAULT_LON.toFixed(6),
  distance: String(DEFAULT_DISTANCE_METERS),
  width: String(defaultLayoutWidthCm),
  height: String(defaultLayoutHeightCm),
  customSizeUnit: "in",
  theme: defaultThemeName,
  layout: defaultLayoutId,
  displayCity: "Hanover",
  displayCountry: "Germany",
  displayContinent: "Europe",
  fontFamily: "",
  showPosterText: true,
  includeCredits: true,
  includeLandcover: true,
  includeBuildings: false,
  includeWater: true,
  includeParks: true,
  includeAeroway: true,
  includeRail: true,
  includeRoads: true,
  includeRoadPath: true,
  includeRoadMinorLow: true,
  includeRoadOutline: true,
  showMarkers: true,
  showRoutes: true,
};

export function createFallbackPresetSnapshot(): PresetSnapshot {
  const defaultThemeTextColor = getTheme(defaultThemeName).ui.text;
  return {
    form: { ...DEFAULT_FORM },
    customColors: {},
    displayNameOverrides: {
      city: false,
      country: false,
    },
    markers: [],
    markerDefaults: {
      ...createDefaultMarkerSettings(),
      color: defaultThemeTextColor,
    },
    routes: [],
    routeDefaults: {
      ...createDefaultRouteSettings(),
      color: defaultThemeTextColor,
    },
    guides: instantiateLayoutGuides(defaultLayoutOption),
    showGuides: true,
    bearing: 0,
  };
}

function buildInitialState(): PosterState {
  const userDefaults = loadUserDefaults();
  const savedThemes = loadSavedThemes();
  const fallbackSnapshot = createFallbackPresetSnapshot();
  const presets = loadPresets(fallbackSnapshot);
  const defaultPreset = presets[0];
  const initialSnap = cloneSnapshot(defaultPreset.snapshot);

  const mergedSavedThemes =
    initialSnap.savedThemeFallback &&
    !savedThemes.some((t) => t.id === initialSnap.savedThemeFallback!.id)
      ? [...savedThemes, initialSnap.savedThemeFallback]
      : savedThemes;

  return {
    form: initialSnap.form,
    customColors: initialSnap.customColors,
    savedThemes: mergedSavedThemes,
    userDefaults,
    presets,
    activePresetId: defaultPreset.id,
    presetLoadSeq: 0,
    targetBearing:
      typeof initialSnap.bearing === "number" &&
      Number.isFinite(initialSnap.bearing)
        ? initialSnap.bearing
        : 0,
    markers: initialSnap.markers,
    customMarkerIcons: [],
    markerDefaults: initialSnap.markerDefaults,
    isMarkerEditorActive: false,
    activeMarkerId: null,
    routes: initialSnap.routes,
    routeDefaults: initialSnap.routeDefaults,
    guides: initialSnap.guides,
    showGuides: initialSnap.showGuides,
    showCenterGuides: false,
    showBleedPreview: false,
    error: "",
    isExporting: false,
    isLocationFocused: false,
    selectedLocation: null,
    userLocation: null,
    displayNameOverrides: initialSnap.displayNameOverrides,
  };
}

/* ────── Context shapes ────── */

interface PosterDispatchContextValue {
  dispatch: React.Dispatch<PosterAction>;
}

const PosterDispatchContext = createContext<PosterDispatchContextValue | null>(null);

interface PosterContextValue {
  state: PosterState;
  dispatch: React.Dispatch<PosterAction>;
  selectedTheme: ResolvedTheme;
  effectiveTheme: ResolvedTheme;
  mapStyle: StyleSpecification;
  mapRef: MapInstanceRef;
}

const PosterContext = createContext<PosterContextValue | null>(null);

/* ────── Provider ────── */

export function PosterProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(
    posterReducer,
    undefined,
    buildInitialState,
  );
  const mapRef = useRef(null) as MapInstanceRef;
  const lastSyncedMarkerThemeColorRef = useRef<string | null>(null);
  const lastSyncedRouteThemeColorRef = useRef<string | null>(null);
  const lastMarkerPresetSeqRef = useRef<number>(state.presetLoadSeq);
  const lastRoutePresetSeqRef = useRef<number>(state.presetLoadSeq);
  const hasLoadedCustomIconsRef = useRef(false);
  const initialUserDefaultsRef = useRef(state.userDefaults);
  const initialPresetsRef = useRef(state.presets);

  // The map opens on the DEFAULT preset coordinates. Reading the visitor's
  // position here would raise a permission prompt nobody asked for, so
  // locating stays behind the "use my location" control.

  const selectedTheme = useMemo(() => {
    const saved = state.savedThemes.find((t) => t.id === state.form.theme);
    if (saved) {
      return {
        name: saved.name,
        description: "Saved theme",
        ui: { ...saved.colors.ui },
        map: {
          ...saved.colors.map,
          roads: { ...saved.colors.map.roads },
        },
      };
    }
    return getTheme(state.form.theme);
  }, [state.form.theme, state.savedThemes]);

  const effectiveTheme = useMemo(() => {
    if (Object.keys(state.customColors).length === 0) {
      return selectedTheme;
    }
    return applyThemeColorOverrides(selectedTheme, state.customColors);
  }, [selectedTheme, state.customColors]);

  useEffect(() => {
    const markerThemeColor = effectiveTheme.ui.text;
    const previouslySynced = lastSyncedMarkerThemeColorRef.current;

    if (
      previouslySynced === null ||
      lastMarkerPresetSeqRef.current !== state.presetLoadSeq
    ) {
      lastSyncedMarkerThemeColorRef.current = markerThemeColor;
      lastMarkerPresetSeqRef.current = state.presetLoadSeq;
      return;
    }

    if (previouslySynced === markerThemeColor) {
      return;
    }

    lastSyncedMarkerThemeColorRef.current = markerThemeColor;
    dispatch({
      type: "SET_MARKER_DEFAULTS",
      defaults: { color: markerThemeColor },
      applyToMarkers: true,
    });
  }, [dispatch, effectiveTheme.ui.text, state.presetLoadSeq]);

  useEffect(() => {
    const routeThemeColor = effectiveTheme.ui.text;
    const previouslySynced = lastSyncedRouteThemeColorRef.current;

    if (
      previouslySynced === null ||
      lastRoutePresetSeqRef.current !== state.presetLoadSeq
    ) {
      lastSyncedRouteThemeColorRef.current = routeThemeColor;
      lastRoutePresetSeqRef.current = state.presetLoadSeq;
      return;
    }

    if (previouslySynced === routeThemeColor) {
      return;
    }

    lastSyncedRouteThemeColorRef.current = routeThemeColor;
    dispatch({
      type: "SET_ROUTE_DEFAULTS",
      defaults: { color: routeThemeColor },
      applyToRoutes: true,
    });
  }, [dispatch, effectiveTheme.ui.text, state.presetLoadSeq]);

  useEffect(() => {
    let isCancelled = false;

    void loadCustomMarkerIcons()
      .then((icons) => {
        if (isCancelled) {
          return;
        }
        hasLoadedCustomIconsRef.current = true;
        dispatch({ type: "SET_CUSTOM_MARKER_ICONS", icons });
      })
      .catch(() => {
        hasLoadedCustomIconsRef.current = true;
        // Ignore storage read failures.
      });

    return () => {
      isCancelled = true;
    };
  }, [dispatch]);

  useEffect(() => {
    if (!hasLoadedCustomIconsRef.current) {
      return;
    }
    void saveCustomMarkerIcons(state.customMarkerIcons).catch(() => {
      // Ignore storage write failures.
    });
  }, [state.customMarkerIcons]);

  useEffect(() => {
    saveSavedThemes(state.savedThemes);
  }, [state.savedThemes]);

  useEffect(() => {
    if (state.presets === initialPresetsRef.current) return;
    savePresets(state.presets);
  }, [state.presets]);

  useEffect(() => {
    if (state.userDefaults === initialUserDefaultsRef.current) return;
    saveUserDefaults(state.userDefaults);
  }, [state.userDefaults]);

  const mapStyle = useMemo(
    () =>
      generateMapStyle(effectiveTheme, {
        includeLandcover: state.form.includeLandcover,
        includeBuildings: state.form.includeBuildings,
        includeWater: state.form.includeWater,
        includeParks: state.form.includeParks,
        includeAeroway: state.form.includeAeroway,
        includeRail: state.form.includeRail,
        includeRoads: state.form.includeRoads,
        includeRoadPath: state.form.includeRoadPath,
        includeRoadMinorLow: state.form.includeRoadMinorLow,
        includeRoadOutline: state.form.includeRoadOutline,
        distanceMeters: Number(state.form.distance),
      }),
    [
      effectiveTheme,
      state.form.includeLandcover,
      state.form.includeBuildings,
      state.form.includeWater,
      state.form.includeParks,
      state.form.includeAeroway,
      state.form.includeRail,
      state.form.includeRoads,
      state.form.includeRoadPath,
      state.form.includeRoadMinorLow,
      state.form.includeRoadOutline,
      state.form.distance,
    ],
  );

  const dispatchValue = useMemo<PosterDispatchContextValue>(
    () => ({ dispatch }),
    [dispatch],
  );

  const value = useMemo<PosterContextValue>(
    () => ({
      state,
      dispatch,
      selectedTheme,
      effectiveTheme,
      mapStyle,
      mapRef,
    }),
    [state, selectedTheme, effectiveTheme, mapStyle],
  );

  return (
    <PosterDispatchContext.Provider value={dispatchValue}>
      <PosterContext.Provider value={value}>{children}</PosterContext.Provider>
    </PosterDispatchContext.Provider>
  );
}

/* ────── Hook ────── */

export function usePosterContext(): PosterContextValue {
  const ctx = useContext(PosterContext);
  if (!ctx) {
    throw new Error("usePosterContext must be used within a PosterProvider");
  }
  return ctx;
}

export function usePosterDispatch(): PosterDispatchContextValue {
  const ctx = useContext(PosterDispatchContext);
  if (!ctx) {
    throw new Error("usePosterDispatch must be used within a PosterProvider");
  }
  return ctx;
}
