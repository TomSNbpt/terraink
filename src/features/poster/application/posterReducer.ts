import type { SearchResult } from "@/features/location/domain/types";
import { resolveDisplaySubtitle } from "@/features/location/domain/displaySubtitle";
import type {
  MarkerDefaults,
  MarkerIconDefinition,
  MarkerItem,
} from "@/features/markers/domain/types";
import {
  MAX_MARKER_SIZE,
  MIN_MARKER_SIZE,
} from "@/features/markers/domain/constants";
import { createDefaultMarkerSettings } from "@/features/markers/infrastructure/helpers";
import { featuredMarkerIcons } from "@/features/markers/infrastructure/iconRegistry";
import { clamp } from "@/shared/geo/math";
import type { Route, RouteDefaults } from "@/features/routes/domain/types";
import {
  MAX_ROUTE_OPACITY,
  MAX_ROUTE_OUTLINE_WIDTH,
  MAX_ROUTE_STROKE_WIDTH,
  MIN_ROUTE_OPACITY,
  MIN_ROUTE_OUTLINE_WIDTH,
  MIN_ROUTE_STROKE_WIDTH,
} from "@/features/routes/domain/constants";
import type { SavedTheme } from "@/features/theme/domain/types";
import {
  captureRouteStyleSnapshot,
  captureThemeDesignBaseline,
  type ThemeDesignBaseline,
} from "@/features/theme/domain/designDirty";
import {
  createEmptyThemeDesignerSession,
  themeColorsToOverrides,
  type DesignerMessage,
  type GeneratedTheme,
  type ThemeDesignerSession,
} from "@/features/theme-designer/domain/types";
import type { UserDefaults } from "@/features/settings/domain/types";
import {
  DEFAULT_PRESET_ID,
  DEFAULT_PRESET_NAME,
  type PresetSnapshot,
  type UserPreset,
} from "@/features/presets/domain/types";
import {
  cloneSnapshot,
  ensureDefaultPresetFirst,
} from "@/features/presets/infrastructure/presetsStorage";
import type {
  CustomTemplate,
  LayoutGuide,
} from "@/features/layout/domain/types";
import { normalizeBleedInches } from "@/features/layout/domain/bleed";

/* ────── Form state ────── */

export type CustomSizeUnit = "in" | "px";

export interface PosterForm {
  location: string;
  latitude: string;
  longitude: string;
  distance: string;
  width: string;
  height: string;
  customSizeUnit: CustomSizeUnit;
  theme: string;
  layout: string;
  displayCity: string;
  displayCountry: string;
  displayContinent: string;
  fontFamily: string;
  showPosterText: boolean;
  includeCredits: boolean;
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
  showMarkers: boolean;
  showRoutes: boolean;
}

/* ────── App-level state ────── */

export interface PosterState {
  form: PosterForm;
  customColors: Record<string, string>;
  savedThemes: SavedTheme[];
  deletedBuiltinThemeIds: string[];
  customTemplates: CustomTemplate[];
  themeDesigner: ThemeDesignerSession;
  userDefaults: UserDefaults;
  presets: UserPreset[];
  activePresetId: string | null;
  presetLoadSeq: number;
  themeDesignBaseline: ThemeDesignBaseline;
  targetBearing: number;
  markers: MarkerItem[];
  customMarkerIcons: MarkerIconDefinition[];
  markerDefaults: MarkerDefaults;
  isMarkerEditorActive: boolean;
  activeMarkerId: string | null;
  routes: Route[];
  routeDefaults: RouteDefaults;
  guides: LayoutGuide[];
  showGuides: boolean;
  showCenterGuides: boolean;
  showBleedPreview: boolean;
  error: string;
  isExporting: boolean;
  isLocationFocused: boolean;
  selectedLocation: SearchResult | null;
  userLocation: SearchResult | null;
  displayNameOverrides: {
    city: boolean;
    country: boolean;
  };
}

/* ────── Actions ────── */

export type PosterAction =
  | { type: "SET_FIELD"; name: string; value: string | boolean }
  | {
      type: "SET_FORM_FIELDS";
      fields: Partial<PosterForm>;
      resetDisplayNameOverrides?: boolean;
      clearSelectedLocation?: boolean;
    }
  | { type: "SET_THEME"; themeId: string }
  | {
      type: "SET_LAYOUT";
      layoutId: string;
      widthCm: string;
      heightCm: string;
      guides?: LayoutGuide[];
    }
  | { type: "SET_COLOR"; key: string; value: string }
  | { type: "SET_CUSTOM_COLORS"; colors: Record<string, string> }
  | { type: "RESET_COLORS" }
  | { type: "RESET_ACTIVE_THEME_DESIGN" }
  | { type: "SET_USER_DEFAULTS"; defaults: UserDefaults }
  | { type: "RESET_USER_DEFAULTS" }
  | { type: "SET_SAVED_THEMES"; themes: SavedTheme[] }
  | { type: "ADD_SAVED_THEME"; theme: SavedTheme }
  | { type: "UPDATE_SAVED_THEME"; themeId: string; changes: Partial<SavedTheme> }
  | { type: "REMOVE_SAVED_THEME"; themeId: string }
  | { type: "DELETE_BUILTIN_THEME"; themeId: string }
  | { type: "ADD_CUSTOM_TEMPLATE"; template: CustomTemplate }
  | { type: "REMOVE_CUSTOM_TEMPLATE"; templateId: string }
  | { type: "ADD_DESIGNER_MESSAGE"; message: DesignerMessage }
  | {
      type: "ADD_DESIGNER_RESPONSE";
      message: DesignerMessage;
      themes: GeneratedTheme[];
    }
  | { type: "SELECT_GENERATED_THEME"; themeId: string | null }
  | {
      type: "MARK_GENERATED_THEME_SAVED";
      generatedThemeId: string;
      savedThemeId: string;
    }
  | { type: "CLEAR_THEME_DESIGNER" }
  | { type: "SELECT_LOCATION"; location: SearchResult }
  | { type: "SET_USER_LOCATION"; location: SearchResult | null }
  | { type: "CLEAR_LOCATION" }
  | { type: "SET_LOCATION_FOCUSED"; focused: boolean }
  | { type: "SET_ERROR"; error: string }
  | { type: "SET_EXPORT_STATUS"; exporting: boolean; error?: string }
  | { type: "SET_MARKER_EDITOR_ACTIVE"; active: boolean }
  | { type: "SET_ACTIVE_MARKER"; markerId: string | null }
  | { type: "ADD_MARKER"; marker: MarkerItem }
  | { type: "UPDATE_MARKER"; markerId: string; changes: Partial<MarkerItem> }
  | { type: "REMOVE_MARKER"; markerId: string }
  | { type: "CLEAR_MARKERS" }
  | { type: "ADD_CUSTOM_MARKER_ICON"; icon: MarkerIconDefinition }
  | { type: "SET_CUSTOM_MARKER_ICONS"; icons: MarkerIconDefinition[] }
  | { type: "REMOVE_CUSTOM_MARKER_ICON"; iconId: string }
  | { type: "CLEAR_CUSTOM_MARKER_ICONS" }
  | {
      type: "SET_MARKER_DEFAULTS";
      defaults: Partial<MarkerDefaults>;
      applyToMarkers?: boolean;
    }
  | { type: "RESET_MARKER_DEFAULTS" }
  | { type: "ADD_ROUTE"; route: Route }
  | { type: "UPDATE_ROUTE"; routeId: string; changes: Partial<Route> }
  | { type: "REMOVE_ROUTE"; routeId: string }
  | { type: "REPLACE_ROUTES"; routes: Route[] }
  | { type: "CLEAR_ROUTES" }
  | {
      type: "SET_ROUTE_DEFAULTS";
      defaults: Partial<RouteDefaults>;
      applyToRoutes?: boolean;
      syncBaseline?: boolean;
    }
  | { type: "ADD_GUIDE"; guide: LayoutGuide }
  | { type: "UPDATE_GUIDE"; guideId: string; offsetCm: number }
  | { type: "REMOVE_GUIDE"; guideId: string }
  | { type: "CLEAR_GUIDES" }
  | { type: "SET_SHOW_GUIDES"; show: boolean }
  | { type: "CYCLE_GUIDE_MODE" }
  | { type: "TOGGLE_BLEED_PREVIEW" }
  | { type: "SET_BLEED_INCHES"; bleedInches: number }
  | { type: "SET_PRESETS"; presets: UserPreset[] }
  | { type: "ADD_PRESET"; preset: UserPreset; setActive?: boolean }
  | {
      type: "UPDATE_PRESET";
      presetId: string;
      snapshot: PresetSnapshot;
      name?: string;
    }
  | { type: "RENAME_PRESET"; presetId: string; name: string }
  | { type: "REMOVE_PRESET"; presetId: string }
  | { type: "SET_DEFAULT_PRESET"; snapshot: PresetSnapshot }
  | { type: "APPLY_PRESET"; presetId: string };

/* ────── Reducer ────── */

export function posterReducer(
  state: PosterState,
  action: PosterAction,
): PosterState {
  switch (action.type) {
    case "SET_FIELD": {
      const nextForm = { ...state.form, [action.name]: action.value };
      const nextDisplayNameOverrides = { ...state.displayNameOverrides };

      if (action.name === "location" && typeof action.value === "string") {
        nextDisplayNameOverrides.city = false;
        nextDisplayNameOverrides.country = false;
      }

      if (action.name === "latitude" || action.name === "longitude") {
        nextDisplayNameOverrides.city = false;
        nextDisplayNameOverrides.country = false;
      }

      if (action.name === "displayCity") {
        nextDisplayNameOverrides.city = true;
      }

      if (action.name === "displayCountry") {
        nextDisplayNameOverrides.country = true;
      }

      return {
        ...state,
        form: nextForm,
        displayNameOverrides: nextDisplayNameOverrides,
        // Clear selected location when location/lat/lon field changes
        ...(["location", "latitude", "longitude"].includes(action.name)
          ? { selectedLocation: null }
          : {}),
      };
    }

    case "SET_FORM_FIELDS": {
      const nextForm = { ...state.form, ...action.fields };
      const shouldSyncDisplayNames =
        "displayCity" in action.fields || "displayCountry" in action.fields;
      return {
        ...state,
        form: nextForm,
        displayNameOverrides: action.resetDisplayNameOverrides
          ? { city: false, country: false }
          : state.displayNameOverrides,
        ...(action.clearSelectedLocation ? { selectedLocation: null } : {}),
        ...(shouldSyncDisplayNames
          ? {
              themeDesignBaseline: {
                ...state.themeDesignBaseline,
                typography: {
                  ...state.themeDesignBaseline.typography,
                  displayCity: nextForm.displayCity,
                  displayCountry: nextForm.displayCountry,
                },
              },
            }
          : {}),
      };
    }

    case "SET_THEME": {
      const nextForm = { ...state.form, theme: action.themeId };
      return {
        ...state,
        form: nextForm,
        customColors: {},
        themeDesignBaseline: captureThemeDesignBaseline(
          nextForm,
          state.routes,
          state.routeDefaults,
        ),
        themeDesigner: {
          ...state.themeDesigner,
          activeGeneratedThemeId: null,
        },
      };
    }

    case "SET_LAYOUT":
      return {
        ...state,
        form: {
          ...state.form,
          layout: action.layoutId,
          width: action.widthCm,
          height: action.heightCm,
        },
        ...(action.guides !== undefined
          ? {
              guides: action.guides,
              ...(action.guides.length > 0 ? { showGuides: true } : {}),
            }
          : {}),
      };

    case "SET_COLOR":
      return {
        ...state,
        customColors: { ...state.customColors, [action.key]: action.value },
      };

    case "SET_CUSTOM_COLORS":
      return { ...state, customColors: { ...action.colors } };

    case "RESET_COLORS":
      return { ...state, customColors: {} };

    case "RESET_ACTIVE_THEME_DESIGN": {
      const baseline = state.themeDesignBaseline;
      const nextForm: PosterForm = {
        ...state.form,
        ...baseline.layers,
        ...baseline.typography,
      };
      const nextRouteDefaults: RouteDefaults = {
        ...baseline.routeDefaults,
      };
      const nextRoutes = state.routes.map((route) => {
        const routeBase = baseline.routeStyles[route.id];
        if (!routeBase) {
          return route;
        }
        return {
          ...route,
          color: routeBase.color,
          strokeWidth: routeBase.strokeWidth,
          outlineEnabled: routeBase.outlineEnabled,
          outlineColor: routeBase.outlineColor,
          outlineWidth: routeBase.outlineWidth,
          outline2Enabled: routeBase.outline2Enabled,
          outline2Color: routeBase.outline2Color,
          outline2Width: routeBase.outline2Width,
          opacity: routeBase.opacity,
          lineStyle: routeBase.lineStyle,
          showEndpoints: routeBase.showEndpoints,
          startMarker: routeBase.startMarker
            ? { ...routeBase.startMarker }
            : undefined,
          finishMarker: routeBase.finishMarker
            ? { ...routeBase.finishMarker }
            : undefined,
        };
      });
      return {
        ...state,
        form: nextForm,
        customColors: {},
        routeDefaults: nextRouteDefaults,
        routes: nextRoutes,
        themeDesignBaseline: captureThemeDesignBaseline(
          nextForm,
          nextRoutes,
          nextRouteDefaults,
        ),
        themeDesigner: {
          ...state.themeDesigner,
          activeGeneratedThemeId: null,
        },
      };
    }

    case "SET_USER_DEFAULTS":
      return { ...state, userDefaults: action.defaults };

    case "RESET_USER_DEFAULTS":
      return { ...state, userDefaults: {} };

    case "SET_SAVED_THEMES":
      return { ...state, savedThemes: action.themes };

    case "ADD_SAVED_THEME":
      return { ...state, savedThemes: [...state.savedThemes, action.theme] };

    case "UPDATE_SAVED_THEME":
      return {
        ...state,
        savedThemes: state.savedThemes.map((t) =>
          t.id === action.themeId
            ? { ...t, ...action.changes, id: t.id }
            : t,
        ),
      };

    case "REMOVE_SAVED_THEME": {
      const nextSaved = state.savedThemes.filter(
        (t) => t.id !== action.themeId,
      );
      // If user is currently on the deleted saved theme, reducer leaves
      // form.theme alone — caller decides whether to switch themes.
      return { ...state, savedThemes: nextSaved };
    }

    case "DELETE_BUILTIN_THEME": {
      if (state.deletedBuiltinThemeIds.includes(action.themeId)) {
        return state;
      }
      return {
        ...state,
        deletedBuiltinThemeIds: [
          ...state.deletedBuiltinThemeIds,
          action.themeId,
        ],
      };
    }

    case "ADD_CUSTOM_TEMPLATE": {
      if (state.customTemplates.some((t) => t.id === action.template.id)) {
        return state;
      }
      return {
        ...state,
        customTemplates: [...state.customTemplates, action.template],
      };
    }

    case "REMOVE_CUSTOM_TEMPLATE": {
      return {
        ...state,
        customTemplates: state.customTemplates.filter(
          (t) => t.id !== action.templateId,
        ),
      };
    }

    case "ADD_DESIGNER_MESSAGE":
      return {
        ...state,
        themeDesigner: {
          ...state.themeDesigner,
          messages: [...state.themeDesigner.messages, action.message],
        },
      };

    case "ADD_DESIGNER_RESPONSE":
      return {
        ...state,
        themeDesigner: {
          ...state.themeDesigner,
          messages: [...state.themeDesigner.messages, action.message],
          generatedThemes: [
            ...state.themeDesigner.generatedThemes,
            ...action.themes,
          ],
        },
      };

    case "SELECT_GENERATED_THEME": {
      if (!action.themeId) {
        return {
          ...state,
          themeDesigner: {
            ...state.themeDesigner,
            activeGeneratedThemeId: null,
          },
        };
      }
      const target = state.themeDesigner.generatedThemes.find(
        (t) => t.id === action.themeId,
      );
      if (!target) return state;
      return {
        ...state,
        customColors: themeColorsToOverrides(target.colors),
        themeDesigner: {
          ...state.themeDesigner,
          activeGeneratedThemeId: target.id,
        },
      };
    }

    case "MARK_GENERATED_THEME_SAVED":
      return {
        ...state,
        themeDesigner: {
          ...state.themeDesigner,
          generatedThemes: state.themeDesigner.generatedThemes.map((t) =>
            t.id === action.generatedThemeId
              ? { ...t, savedThemeId: action.savedThemeId }
              : t,
          ),
        },
      };

    case "CLEAR_THEME_DESIGNER": {
      const wasPreviewingGenerated =
        state.themeDesigner.activeGeneratedThemeId !== null;
      return {
        ...state,
        ...(wasPreviewingGenerated ? { customColors: {} } : {}),
        themeDesigner: createEmptyThemeDesignerSession(),
      };
    }

    case "SELECT_LOCATION": {
      const nextDisplayCountry = resolveDisplaySubtitle(action.location);
      return {
        ...state,
        selectedLocation: action.location,
        isLocationFocused: false,
        displayNameOverrides: { city: false, country: false },
        form: {
          ...state.form,
          location: action.location.label,
          latitude: action.location.lat.toFixed(6),
          longitude: action.location.lon.toFixed(6),
          displayCity: action.location.city,
          displayCountry: nextDisplayCountry,
          displayContinent: action.location.continent || "",
        },
        themeDesignBaseline: {
          ...state.themeDesignBaseline,
          typography: {
            ...state.themeDesignBaseline.typography,
            displayCity: action.location.city,
            displayCountry: nextDisplayCountry,
          },
        },
      };
    }

    case "SET_USER_LOCATION":
      return {
        ...state,
        userLocation: action.location,
      };

    case "CLEAR_LOCATION":
      return {
        ...state,
        selectedLocation: null,
        form: {
          ...state.form,
          location: "",
        },
      };

    case "SET_LOCATION_FOCUSED":
      return { ...state, isLocationFocused: action.focused };

    case "SET_ERROR":
      return { ...state, error: action.error };

    case "SET_EXPORT_STATUS":
      return {
        ...state,
        isExporting: action.exporting,
        error: action.exporting ? "" : (action.error ?? state.error),
      };

    case "SET_MARKER_EDITOR_ACTIVE":
      return {
        ...state,
        isMarkerEditorActive: action.active,
        activeMarkerId: action.active ? state.activeMarkerId : null,
      };

    case "SET_ACTIVE_MARKER":
      return {
        ...state,
        activeMarkerId: action.markerId,
      };

    case "ADD_MARKER":
      return {
        ...state,
        markers: [...state.markers, action.marker],
      };

    case "UPDATE_MARKER":
      return {
        ...state,
        markers: state.markers.map((marker) =>
          marker.id === action.markerId
            ? {
                ...marker,
                ...action.changes,
                id: marker.id,
                size:
                  typeof action.changes.size === "number"
                    ? clamp(action.changes.size, MIN_MARKER_SIZE, MAX_MARKER_SIZE)
                    : marker.size,
              }
            : marker,
        ),
      };

    case "REMOVE_MARKER":
      return {
        ...state,
        markers: state.markers.filter((marker) => marker.id !== action.markerId),
        activeMarkerId:
          state.activeMarkerId === action.markerId ? null : state.activeMarkerId,
      };

    case "CLEAR_MARKERS":
      return {
        ...state,
        markers: [],
        activeMarkerId: null,
        isMarkerEditorActive: false,
      };

    case "ADD_CUSTOM_MARKER_ICON":
      return {
        ...state,
        customMarkerIcons: [...state.customMarkerIcons, action.icon],
      };

    case "SET_CUSTOM_MARKER_ICONS":
      return {
        ...state,
        customMarkerIcons: action.icons,
      };

    case "REMOVE_CUSTOM_MARKER_ICON": {
      const fallbackIconId = featuredMarkerIcons[0]?.id ?? state.markers[0]?.iconId ?? "pin";
      return {
        ...state,
        customMarkerIcons: state.customMarkerIcons.filter(
          (icon) => icon.id !== action.iconId,
        ),
        markers: state.markers.map((marker) =>
          marker.iconId === action.iconId
            ? { ...marker, iconId: fallbackIconId }
            : marker,
        ),
      };
    }

    case "CLEAR_CUSTOM_MARKER_ICONS": {
      const fallbackIconId = featuredMarkerIcons[0]?.id ?? state.markers[0]?.iconId ?? "pin";
      const customIconIdSet = new Set(state.customMarkerIcons.map((icon) => icon.id));
      return {
        ...state,
        customMarkerIcons: [],
        markers: state.markers.map((marker) =>
          customIconIdSet.has(marker.iconId)
            ? { ...marker, iconId: fallbackIconId }
            : marker,
        ),
      };
    }

    case "SET_MARKER_DEFAULTS": {
      const hasSizeUpdate =
        typeof action.defaults.size === "number" &&
        Number.isFinite(action.defaults.size);
      const hasColorUpdate =
        typeof action.defaults.color === "string" &&
        action.defaults.color.trim().length > 0;
      const nextDefaults = {
        ...state.markerDefaults,
        ...(hasSizeUpdate
          ? {
              size: clamp(
                Number(action.defaults.size),
                MIN_MARKER_SIZE,
                MAX_MARKER_SIZE,
              ),
            }
          : {}),
        ...(hasColorUpdate ? { color: String(action.defaults.color) } : {}),
      };

      return {
        ...state,
        markerDefaults: nextDefaults,
        markers: action.applyToMarkers
          ? state.markers.map((marker) => ({
              ...marker,
              ...(hasSizeUpdate ? { size: nextDefaults.size } : {}),
              ...(hasColorUpdate ? { color: nextDefaults.color } : {}),
            }))
          : state.markers,
      };
    }

    case "RESET_MARKER_DEFAULTS": {
      const defaults = createDefaultMarkerSettings();
      return {
        ...state,
        markerDefaults: defaults,
        markers: state.markers.map((marker) => ({
          ...marker,
          size: defaults.size,
          color: defaults.color,
        })),
      };
    }

    case "ADD_ROUTE":
      return {
        ...state,
        routes: [...state.routes, action.route],
        themeDesignBaseline: {
          ...state.themeDesignBaseline,
          routeStyles: {
            ...state.themeDesignBaseline.routeStyles,
            [action.route.id]: captureRouteStyleSnapshot(action.route),
          },
        },
      };

    case "UPDATE_ROUTE":
      return {
        ...state,
        routes: state.routes.map((route) =>
          route.id === action.routeId
            ? {
                ...route,
                ...action.changes,
                id: route.id,
                segments: route.segments,
                strokeWidth:
                  typeof action.changes.strokeWidth === "number"
                    ? clamp(
                        action.changes.strokeWidth,
                        MIN_ROUTE_STROKE_WIDTH,
                        MAX_ROUTE_STROKE_WIDTH,
                      )
                    : route.strokeWidth,
                outlineWidth:
                  typeof action.changes.outlineWidth === "number"
                    ? clamp(
                        action.changes.outlineWidth,
                        MIN_ROUTE_OUTLINE_WIDTH,
                        MAX_ROUTE_OUTLINE_WIDTH,
                      )
                    : route.outlineWidth,
                outline2Width:
                  typeof action.changes.outline2Width === "number"
                    ? clamp(
                        action.changes.outline2Width,
                        MIN_ROUTE_OUTLINE_WIDTH,
                        MAX_ROUTE_OUTLINE_WIDTH,
                      )
                    : route.outline2Width,
                opacity:
                  typeof action.changes.opacity === "number"
                    ? clamp(
                        action.changes.opacity,
                        MIN_ROUTE_OPACITY,
                        MAX_ROUTE_OPACITY,
                      )
                    : route.opacity,
              }
            : route,
        ),
      };

    case "REMOVE_ROUTE": {
      const nextRouteStyles = { ...state.themeDesignBaseline.routeStyles };
      delete nextRouteStyles[action.routeId];
      return {
        ...state,
        routes: state.routes.filter((route) => route.id !== action.routeId),
        themeDesignBaseline: {
          ...state.themeDesignBaseline,
          routeStyles: nextRouteStyles,
        },
      };
    }

    case "REPLACE_ROUTES": {
      const nextRouteStyles: Record<
        string,
        ReturnType<typeof captureRouteStyleSnapshot>
      > = {};
      for (const route of action.routes) {
        nextRouteStyles[route.id] = captureRouteStyleSnapshot(route);
      }
      return {
        ...state,
        routes: action.routes,
        themeDesignBaseline: {
          ...state.themeDesignBaseline,
          routeStyles: nextRouteStyles,
        },
      };
    }

    case "CLEAR_ROUTES":
      return {
        ...state,
        routes: [],
        themeDesignBaseline: {
          ...state.themeDesignBaseline,
          routeStyles: {},
        },
      };

    case "SET_ROUTE_DEFAULTS": {
      const { defaults: partial } = action;
      const nextDefaults: RouteDefaults = {
        color: partial.color ?? state.routeDefaults.color,
        strokeWidth:
          typeof partial.strokeWidth === "number"
            ? clamp(
                partial.strokeWidth,
                MIN_ROUTE_STROKE_WIDTH,
                MAX_ROUTE_STROKE_WIDTH,
              )
            : state.routeDefaults.strokeWidth,
        outlineEnabled:
          typeof partial.outlineEnabled === "boolean"
            ? partial.outlineEnabled
            : state.routeDefaults.outlineEnabled,
        outlineColor: partial.outlineColor ?? state.routeDefaults.outlineColor,
        outlineWidth:
          typeof partial.outlineWidth === "number"
            ? clamp(
                partial.outlineWidth,
                MIN_ROUTE_OUTLINE_WIDTH,
                MAX_ROUTE_OUTLINE_WIDTH,
              )
            : state.routeDefaults.outlineWidth,
        outline2Enabled:
          typeof partial.outline2Enabled === "boolean"
            ? partial.outline2Enabled
            : state.routeDefaults.outline2Enabled,
        outline2Color:
          partial.outline2Color ?? state.routeDefaults.outline2Color,
        outline2Width:
          typeof partial.outline2Width === "number"
            ? clamp(
                partial.outline2Width,
                MIN_ROUTE_OUTLINE_WIDTH,
                MAX_ROUTE_OUTLINE_WIDTH,
              )
            : state.routeDefaults.outline2Width,
        opacity:
          typeof partial.opacity === "number"
            ? clamp(partial.opacity, MIN_ROUTE_OPACITY, MAX_ROUTE_OPACITY)
            : state.routeDefaults.opacity,
        lineStyle: partial.lineStyle ?? state.routeDefaults.lineStyle,
        startIconId: partial.startIconId ?? state.routeDefaults.startIconId,
        finishIconId: partial.finishIconId ?? state.routeDefaults.finishIconId,
      };

      const nextRoutes = action.applyToRoutes
        ? state.routes.map((route) => ({
            ...route,
            color: nextDefaults.color,
            strokeWidth: nextDefaults.strokeWidth,
            opacity: nextDefaults.opacity,
            lineStyle: nextDefaults.lineStyle,
          }))
        : state.routes;

      const nextBaseline = action.syncBaseline
        ? {
            ...state.themeDesignBaseline,
            routeDefaults: {
              ...state.themeDesignBaseline.routeDefaults,
              color: nextDefaults.color,
            },
            routeStyles: Object.fromEntries(
              Object.entries(state.themeDesignBaseline.routeStyles).map(
                ([id, snap]) => [
                  id,
                  action.applyToRoutes
                    ? { ...snap, color: nextDefaults.color }
                    : snap,
                ],
              ),
            ),
          }
        : state.themeDesignBaseline;

      return {
        ...state,
        routeDefaults: nextDefaults,
        routes: nextRoutes,
        themeDesignBaseline: nextBaseline,
      };
    }

    case "SET_PRESETS": {
      const fallbackSnapshot: PresetSnapshot = {
        form: { ...state.form },
        customColors: { ...state.customColors },
        displayNameOverrides: { ...state.displayNameOverrides },
        markers: state.markers,
        markerDefaults: state.markerDefaults,
        routes: state.routes,
        routeDefaults: state.routeDefaults,
        guides: state.guides,
        showGuides: state.showGuides,
        bearing: state.targetBearing,
      };
      const normalized = ensureDefaultPresetFirst(
        action.presets,
        fallbackSnapshot,
      );
      const stillHasActive =
        state.activePresetId !== null &&
        normalized.some((p) => p.id === state.activePresetId);
      return {
        ...state,
        presets: normalized,
        activePresetId: stillHasActive ? state.activePresetId : DEFAULT_PRESET_ID,
      };
    }

    case "ADD_PRESET": {
      const nextPreset: UserPreset = {
        ...action.preset,
        snapshot: cloneSnapshot(action.preset.snapshot),
      };
      return {
        ...state,
        presets: [...state.presets, nextPreset],
        activePresetId: action.setActive ? nextPreset.id : state.activePresetId,
      };
    }

    case "UPDATE_PRESET": {
      const now = new Date().toISOString();
      const cloned = cloneSnapshot(action.snapshot);
      return {
        ...state,
        presets: state.presets.map((preset) =>
          preset.id === action.presetId
            ? {
                ...preset,
                ...(action.name && preset.id !== DEFAULT_PRESET_ID
                  ? { name: action.name.trim() }
                  : {}),
                updatedAt: now,
                snapshot: cloned,
              }
            : preset,
        ),
      };
    }

    case "RENAME_PRESET": {
      if (action.presetId === DEFAULT_PRESET_ID) {
        return state;
      }
      const trimmedName = action.name.trim();
      if (
        !trimmedName ||
        trimmedName.toUpperCase() === DEFAULT_PRESET_NAME
      ) {
        return state;
      }
      const target = state.presets.find((p) => p.id === action.presetId);
      if (!target || target.name === trimmedName) {
        return state;
      }
      const lowerName = trimmedName.toLowerCase();
      const hasDuplicate = state.presets.some(
        (p) =>
          p.id !== action.presetId &&
          p.name.trim().toLowerCase() === lowerName,
      );
      if (hasDuplicate) {
        return state;
      }
      const now = new Date().toISOString();
      return {
        ...state,
        presets: state.presets.map((preset) =>
          preset.id === action.presetId
            ? {
                ...preset,
                name: trimmedName,
                updatedAt: now,
              }
            : preset,
        ),
      };
    }

    case "REMOVE_PRESET": {
      if (action.presetId === DEFAULT_PRESET_ID) {
        return state;
      }
      const nextPresets = state.presets.filter((p) => p.id !== action.presetId);
      return {
        ...state,
        presets: nextPresets,
        activePresetId:
          state.activePresetId === action.presetId ? null : state.activePresetId,
      };
    }

    case "SET_DEFAULT_PRESET": {
      const now = new Date().toISOString();
      const cloned = cloneSnapshot(action.snapshot);
      const hasDefault = state.presets.some((p) => p.id === DEFAULT_PRESET_ID);
      const nextPresets = hasDefault
        ? state.presets.map((preset) =>
            preset.id === DEFAULT_PRESET_ID
              ? {
                  ...preset,
                  name: DEFAULT_PRESET_NAME,
                  updatedAt: now,
                  snapshot: cloned,
                }
              : preset,
          )
        : [
            {
              id: DEFAULT_PRESET_ID,
              name: DEFAULT_PRESET_NAME,
              createdAt: now,
              updatedAt: now,
              snapshot: cloned,
            },
            ...state.presets,
          ];
      return {
        ...state,
        presets: nextPresets,
      };
    }

    case "APPLY_PRESET": {
      const target = state.presets.find((p) => p.id === action.presetId);
      if (!target) {
        return state;
      }
      const snap = cloneSnapshot(target.snapshot);
      let nextSavedThemes = state.savedThemes;
      if (
        snap.savedThemeFallback &&
        !state.savedThemes.some((t) => t.id === snap.savedThemeFallback!.id)
      ) {
        nextSavedThemes = [...state.savedThemes, snap.savedThemeFallback];
      }

      return {
        ...state,
        form: snap.form,
        customColors: snap.customColors,
        savedThemes: nextSavedThemes,
        displayNameOverrides: snap.displayNameOverrides,
        markers: snap.markers,
        markerDefaults: snap.markerDefaults,
        routes: snap.routes,
        routeDefaults: snap.routeDefaults,
        guides: snap.guides,
        showGuides: snap.showGuides,
        targetBearing:
          typeof snap.bearing === "number" && Number.isFinite(snap.bearing)
            ? snap.bearing
            : 0,
        activePresetId: target.id,
        presetLoadSeq: state.presetLoadSeq + 1,
        themeDesignBaseline: captureThemeDesignBaseline(
          snap.form,
          snap.routes,
          snap.routeDefaults,
        ),
        isMarkerEditorActive: false,
        activeMarkerId: null,
        selectedLocation: null,
        themeDesigner: {
          ...state.themeDesigner,
          activeGeneratedThemeId: null,
        },
        error: "",
      };
    }

    case "ADD_GUIDE":
      return {
        ...state,
        guides: [...state.guides, action.guide],
        showGuides: true,
      };

    case "UPDATE_GUIDE":
      return {
        ...state,
        guides: state.guides.map((guide) =>
          guide.id === action.guideId
            ? {
                ...guide,
                offsetCm:
                  Number.isFinite(action.offsetCm) && action.offsetCm >= 0
                    ? action.offsetCm
                    : guide.offsetCm,
              }
            : guide,
        ),
      };

    case "REMOVE_GUIDE":
      return {
        ...state,
        guides: state.guides.filter((guide) => guide.id !== action.guideId),
      };

    case "CLEAR_GUIDES":
      return {
        ...state,
        guides: [],
      };

    case "SET_SHOW_GUIDES":
      return {
        ...state,
        showGuides: action.show,
        ...(action.show ? {} : { showCenterGuides: false }),
      };

    case "CYCLE_GUIDE_MODE": {
      if (!state.showGuides && !state.showCenterGuides) {
        return {
          ...state,
          showGuides: true,
          showCenterGuides: false,
        };
      }
      if (state.showGuides && !state.showCenterGuides) {
        return {
          ...state,
          showGuides: true,
          showCenterGuides: true,
        };
      }
      return {
        ...state,
        showGuides: false,
        showCenterGuides: false,
      };
    }

    case "TOGGLE_BLEED_PREVIEW":
      return {
        ...state,
        showBleedPreview: !state.showBleedPreview,
      };

    case "SET_BLEED_INCHES": {
      const normalized = normalizeBleedInches(action.bleedInches);
      return {
        ...state,
        userDefaults: {
          ...state.userDefaults,
          bleedInches: normalized,
        },
        ...(normalized <= 0 ? { showBleedPreview: false } : {}),
      };
    }

    default:
      return state;
  }
}
