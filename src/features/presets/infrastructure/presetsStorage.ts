import type { PosterForm } from "@/features/poster/application/posterReducer";
import seededPresetsManifest from "@/data/config.json";
import {
  DEFAULT_PRESET_ID,
  DEFAULT_PRESET_NAME,
  type PresetSnapshot,
  type UserPreset,
} from "../domain/types";
import type { LayoutGuide } from "@/features/layout/domain/types";
import type { Route } from "@/features/routes/domain/types";
import {
  doesRouteMatchBundledGpx,
  getBundledGpxSegments,
  normalizeGpxFilename,
} from "@/features/routes/infrastructure/gpxLibrary";

const STORAGE_KEY = "terraink:presets";
const DISMISSED_SEEDED_STORAGE_KEY = "terraink:dismissed-seeded-presets";

function isBrowserStorageAvailable(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function cloneSnapshot(snapshot: PresetSnapshot): PresetSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as PresetSnapshot;
}

function normalizeSnapshot(
  raw: unknown,
  fallbackForm: PosterForm,
  fallbackSnapshot: PresetSnapshot,
): PresetSnapshot | null {
  if (!isObject(raw) || !isObject(raw.form)) {
    return null;
  }

  const rawForm = raw.form;
  const mergedForm: PosterForm = {
    ...fallbackForm,
    ...(typeof rawForm.location === "string" ? { location: rawForm.location } : {}),
    ...(typeof rawForm.latitude === "string" ? { latitude: rawForm.latitude } : {}),
    ...(typeof rawForm.longitude === "string" ? { longitude: rawForm.longitude } : {}),
    ...(typeof rawForm.distance === "string" ? { distance: rawForm.distance } : {}),
    ...(typeof rawForm.width === "string" ? { width: rawForm.width } : {}),
    ...(typeof rawForm.height === "string" ? { height: rawForm.height } : {}),
    ...(rawForm.customSizeUnit === "in" || rawForm.customSizeUnit === "px"
      ? { customSizeUnit: rawForm.customSizeUnit }
      : {}),
    ...(typeof rawForm.theme === "string" ? { theme: rawForm.theme } : {}),
    ...(typeof rawForm.layout === "string" ? { layout: rawForm.layout } : {}),
    ...(typeof rawForm.displayCity === "string"
      ? { displayCity: rawForm.displayCity }
      : {}),
    ...(typeof rawForm.displayCountry === "string"
      ? { displayCountry: rawForm.displayCountry }
      : {}),
    ...(typeof rawForm.displayContinent === "string"
      ? { displayContinent: rawForm.displayContinent }
      : {}),
    ...(typeof rawForm.fontFamily === "string"
      ? { fontFamily: rawForm.fontFamily }
      : {}),
    ...(typeof rawForm.showPosterText === "boolean"
      ? { showPosterText: rawForm.showPosterText }
      : {}),
    ...(typeof rawForm.includeCredits === "boolean"
      ? { includeCredits: rawForm.includeCredits }
      : {}),
    ...(typeof rawForm.includeLandcover === "boolean"
      ? { includeLandcover: rawForm.includeLandcover }
      : {}),
    ...(typeof rawForm.includeBuildings === "boolean"
      ? { includeBuildings: rawForm.includeBuildings }
      : {}),
    ...(typeof rawForm.includeWater === "boolean"
      ? { includeWater: rawForm.includeWater }
      : {}),
    ...(typeof rawForm.includeParks === "boolean"
      ? { includeParks: rawForm.includeParks }
      : {}),
    ...(typeof rawForm.includeAeroway === "boolean"
      ? { includeAeroway: rawForm.includeAeroway }
      : {}),
    ...(typeof rawForm.includeRail === "boolean"
      ? { includeRail: rawForm.includeRail }
      : {}),
    ...(typeof rawForm.includeRoads === "boolean"
      ? { includeRoads: rawForm.includeRoads }
      : {}),
    ...(typeof rawForm.includeRoadPath === "boolean"
      ? { includeRoadPath: rawForm.includeRoadPath }
      : {}),
    ...(typeof rawForm.includeRoadMinorLow === "boolean"
      ? { includeRoadMinorLow: rawForm.includeRoadMinorLow }
      : {}),
    ...(typeof rawForm.includeRoadOutline === "boolean"
      ? { includeRoadOutline: rawForm.includeRoadOutline }
      : {}),
    ...(typeof rawForm.showMarkers === "boolean"
      ? { showMarkers: rawForm.showMarkers }
      : {}),
    ...(typeof rawForm.showRoutes === "boolean"
      ? { showRoutes: rawForm.showRoutes }
      : {}),
  };

  const customColors: Record<string, string> = {};
  if (isObject(raw.customColors)) {
    for (const [k, v] of Object.entries(raw.customColors)) {
      if (typeof v === "string") {
        customColors[k] = v;
      }
    }
  }

  const rawOverrides = isObject(raw.displayNameOverrides)
    ? raw.displayNameOverrides
    : {};
  const displayNameOverrides = {
    city:
      typeof rawOverrides.city === "boolean"
        ? rawOverrides.city
        : fallbackSnapshot.displayNameOverrides.city,
    country:
      typeof rawOverrides.country === "boolean"
        ? rawOverrides.country
        : fallbackSnapshot.displayNameOverrides.country,
  };

  const markers = Array.isArray(raw.markers)
    ? cloneSnapshot({ ...fallbackSnapshot, markers: raw.markers }).markers
    : [];

  const markerDefaults = isObject(raw.markerDefaults)
    ? {
        ...fallbackSnapshot.markerDefaults,
        ...(typeof raw.markerDefaults.size === "number"
          ? { size: raw.markerDefaults.size }
          : {}),
        ...(typeof raw.markerDefaults.color === "string"
          ? { color: raw.markerDefaults.color }
          : {}),
      }
    : { ...fallbackSnapshot.markerDefaults };

  const routes: Route[] = Array.isArray(raw.routes)
    ? raw.routes
        .map((item): Route | null => {
          if (!isObject(item)) return null;
          const cloned = JSON.parse(JSON.stringify(item)) as Partial<Route> & {
            gpxFile?: unknown;
          };
          const rawGpxFile =
            typeof cloned.gpxFile === "string" && cloned.gpxFile.trim().length > 0
              ? cloned.gpxFile.trim()
              : typeof cloned.sourceFilename === "string" &&
                  cloned.sourceFilename.trim().length > 0
                ? cloned.sourceFilename.trim()
                : undefined;

          const hasInlineSegments =
            Array.isArray(cloned.segments) &&
            cloned.segments.some((seg) => Array.isArray(seg) && seg.length >= 2);

          const resolvedSegments = hasInlineSegments
            ? cloned.segments!
            : rawGpxFile
              ? getBundledGpxSegments(rawGpxFile)
              : null;

          if (!resolvedSegments || resolvedSegments.length === 0) {
            return null;
          }

          return {
            ...(cloned as Route),
            ...(rawGpxFile
              ? {
                  sourceFilename: cloned.sourceFilename ?? rawGpxFile,
                  gpxFile: rawGpxFile,
                }
              : {}),
            segments: resolvedSegments,
          };
        })
        .filter((route): route is Route => route !== null)
    : [];

  const routeDefaults = isObject(raw.routeDefaults)
    ? {
        ...fallbackSnapshot.routeDefaults,
        ...(typeof raw.routeDefaults.color === "string"
          ? { color: raw.routeDefaults.color }
          : {}),
        ...(typeof raw.routeDefaults.strokeWidth === "number"
          ? { strokeWidth: raw.routeDefaults.strokeWidth }
          : {}),
        ...(typeof raw.routeDefaults.opacity === "number"
          ? { opacity: raw.routeDefaults.opacity }
          : {}),
        ...(typeof raw.routeDefaults.lineStyle === "string"
          ? { lineStyle: raw.routeDefaults.lineStyle as PresetSnapshot["routeDefaults"]["lineStyle"] }
          : {}),
        ...(typeof raw.routeDefaults.startIconId === "string"
          ? { startIconId: raw.routeDefaults.startIconId }
          : {}),
        ...(typeof raw.routeDefaults.finishIconId === "string"
          ? { finishIconId: raw.routeDefaults.finishIconId }
          : {}),
      }
    : { ...fallbackSnapshot.routeDefaults };

  const guides: LayoutGuide[] = Array.isArray(raw.guides)
    ? raw.guides
        .filter(
          (item): item is LayoutGuide =>
            isObject(item) &&
            typeof item.id === "string" &&
            item.id.trim().length > 0 &&
            (item.axis === "x" || item.axis === "y") &&
            typeof item.offsetCm === "number" &&
            Number.isFinite(item.offsetCm) &&
            item.offsetCm >= 0,
        )
        .map((item) => ({
          id: item.id,
          axis: item.axis,
          offsetCm: item.offsetCm,
        }))
    : [];

  const showGuides =
    typeof raw.showGuides === "boolean" ? raw.showGuides : true;

  const bearing =
    typeof raw.bearing === "number" && Number.isFinite(raw.bearing)
      ? raw.bearing
      : 0;

  const savedThemeFallback =
    isObject(raw.savedThemeFallback) &&
    typeof raw.savedThemeFallback.id === "string" &&
    typeof raw.savedThemeFallback.name === "string" &&
    isObject(raw.savedThemeFallback.colors)
      ? (JSON.parse(JSON.stringify(raw.savedThemeFallback)) as PresetSnapshot["savedThemeFallback"])
      : undefined;

  return {
    form: mergedForm,
    customColors,
    displayNameOverrides,
    markers,
    markerDefaults,
    routes,
    routeDefaults,
    guides,
    showGuides,
    bearing,
    ...(savedThemeFallback ? { savedThemeFallback } : {}),
  };
}

function normalizePreset(
  raw: unknown,
  fallbackSnapshot: PresetSnapshot,
): UserPreset | null {
  if (!isObject(raw)) return null;
  if (typeof raw.id !== "string" || typeof raw.name !== "string") return null;
  const trimmedName = raw.name.trim();
  if (!trimmedName) return null;

  const snapshot = normalizeSnapshot(
    raw.snapshot,
    fallbackSnapshot.form,
    fallbackSnapshot,
  );
  if (!snapshot) return null;

  const now = new Date().toISOString();
  const isDefault =
    raw.id === DEFAULT_PRESET_ID ||
    trimmedName.toUpperCase() === DEFAULT_PRESET_NAME;

  return {
    id: isDefault ? DEFAULT_PRESET_ID : raw.id,
    name: isDefault ? DEFAULT_PRESET_NAME : trimmedName,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : now,
    snapshot,
  };
}

export function buildDefaultPreset(snapshot: PresetSnapshot): UserPreset {
  const now = new Date().toISOString();
  return {
    id: DEFAULT_PRESET_ID,
    name: DEFAULT_PRESET_NAME,
    createdAt: now,
    updatedAt: now,
    snapshot: cloneSnapshot(snapshot),
  };
}

export function ensureDefaultPresetFirst(
  presets: UserPreset[],
  fallbackSnapshot: PresetSnapshot,
): UserPreset[] {
  let defaultEntry: UserPreset | null = null;
  const others: UserPreset[] = [];
  const seenIds = new Set<string>();

  for (const preset of presets) {
    const isDefault =
      preset.id === DEFAULT_PRESET_ID ||
      preset.name.trim().toUpperCase() === DEFAULT_PRESET_NAME;
    if (isDefault) {
      if (!defaultEntry) {
        defaultEntry = {
          ...preset,
          id: DEFAULT_PRESET_ID,
          name: DEFAULT_PRESET_NAME,
        };
      }
      continue;
    }
    if (!seenIds.has(preset.id)) {
      seenIds.add(preset.id);
      others.push(preset);
    }
  }

  return [defaultEntry ?? buildDefaultPreset(fallbackSnapshot), ...others];
}

export function buildSeededPresets(
  fallbackSnapshot: PresetSnapshot,
): UserPreset[] {
  const rawList = Array.isArray((seededPresetsManifest as { presets?: unknown }).presets)
    ? (seededPresetsManifest as { presets: unknown[] }).presets
    : Array.isArray(seededPresetsManifest)
      ? (seededPresetsManifest as unknown[])
      : [];

  const normalized = rawList
    .map((item) => normalizePreset(item, fallbackSnapshot))
    .filter((item): item is UserPreset => item !== null);

  if (normalized.length === 0) {
    return [buildDefaultPreset(fallbackSnapshot)];
  }

  return ensureDefaultPresetFirst(normalized, fallbackSnapshot);
}

function loadDismissedSeededIds(): Set<string> {
  if (!isBrowserStorageAvailable()) return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISSED_SEEDED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((item): item is string => typeof item === "string" && item.length > 0),
    );
  } catch {
    return new Set();
  }
}

function saveDismissedSeededIds(ids: Set<string>): void {
  if (!isBrowserStorageAvailable()) return;
  try {
    if (ids.size === 0) {
      window.localStorage.removeItem(DISMISSED_SEEDED_STORAGE_KEY);
    } else {
      window.localStorage.setItem(
        DISMISSED_SEEDED_STORAGE_KEY,
        JSON.stringify(Array.from(ids)),
      );
    }
  } catch {
    // Ignore quota / serialization errors.
  }
}

function getSeededNonDefaultIds(): Set<string> {
  const rawList = Array.isArray((seededPresetsManifest as { presets?: unknown }).presets)
    ? (seededPresetsManifest as { presets: unknown[] }).presets
    : Array.isArray(seededPresetsManifest)
      ? (seededPresetsManifest as unknown[])
      : [];

  const ids = new Set<string>();
  for (const item of rawList) {
    if (!isObject(item) || typeof item.id !== "string") continue;
    const trimmedName = typeof item.name === "string" ? item.name.trim() : "";
    const isDefault =
      item.id === DEFAULT_PRESET_ID ||
      trimmedName.toUpperCase() === DEFAULT_PRESET_NAME;
    if (!isDefault) {
      ids.add(item.id);
    }
  }
  return ids;
}

function syncDismissedSeededIds(presets: UserPreset[]): void {
  const seededIds = getSeededNonDefaultIds();
  if (seededIds.size === 0) return;

  const presentIds = new Set(presets.map((preset) => preset.id));
  const dismissed = loadDismissedSeededIds();

  for (const seededId of seededIds) {
    if (presentIds.has(seededId)) {
      dismissed.delete(seededId);
    } else {
      dismissed.add(seededId);
    }
  }

  saveDismissedSeededIds(dismissed);
}

function isNewerTimestamp(candidateIso: string, existingIso: string): boolean {
  const candidateMs = Date.parse(candidateIso);
  const existingMs = Date.parse(existingIso);
  return (
    Number.isFinite(candidateMs) &&
    Number.isFinite(existingMs) &&
    candidateMs > existingMs
  );
}

function mergeSeededPresets(
  cachedPresets: UserPreset[],
  seededPresets: UserPreset[],
  dismissedSeededIds: Set<string>,
): { presets: UserPreset[]; changed: boolean } {
  const next = cachedPresets.slice();
  const indexById = new Map<string, number>();
  next.forEach((preset, index) => {
    indexById.set(preset.id, index);
  });

  let changed = false;

  for (const seeded of seededPresets) {
    const existingIndex = indexById.get(seeded.id);
    if (existingIndex === undefined) {
      if (seeded.id !== DEFAULT_PRESET_ID && dismissedSeededIds.has(seeded.id)) {
        continue;
      }
      indexById.set(seeded.id, next.length);
      next.push(seeded);
      changed = true;
      continue;
    }

    const existing = next[existingIndex];
    if (isNewerTimestamp(seeded.updatedAt, existing.updatedAt)) {
      next[existingIndex] = seeded;
      changed = true;
    }
  }

  return { presets: next, changed };
}

export function loadPresets(fallbackSnapshot: PresetSnapshot): UserPreset[] {
  const fallbackList = buildSeededPresets(fallbackSnapshot);
  if (!isBrowserStorageAvailable()) {
    return fallbackList;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      savePresets(fallbackList);
      return fallbackList;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      savePresets(fallbackList);
      return fallbackList;
    }

    const normalized = parsed
      .map((item) => normalizePreset(item, fallbackSnapshot))
      .filter((item): item is UserPreset => item !== null);

    if (normalized.length === 0) {
      savePresets(fallbackList);
      return fallbackList;
    }

    const dismissedSeededIds = loadDismissedSeededIds();
    const { presets: merged, changed } = mergeSeededPresets(
      normalized,
      fallbackList,
      dismissedSeededIds,
    );
    const ordered = ensureDefaultPresetFirst(merged, fallbackSnapshot);
    if (changed || ordered.length !== normalized.length) {
      savePresets(ordered);
    }
    return ordered;
  } catch {
    return fallbackList;
  }
}

function compactPresetsForStorage(presets: UserPreset[]): unknown[] {
  return presets.map((preset) => {
    const routes = preset.snapshot.routes.map((route) => {
      if (route.source !== "gpx") return route;
      const gpxFilename = route.gpxFile ?? route.sourceFilename;
      if (
        gpxFilename &&
        doesRouteMatchBundledGpx(gpxFilename, route.segments)
      ) {
        const canonicalFilename = normalizeGpxFilename(gpxFilename, route.label);
        const { segments: _omitted, ...rest } = route;
        return {
          ...rest,
          sourceFilename: route.sourceFilename ?? canonicalFilename,
          gpxFile: canonicalFilename,
        };
      }
      return route;
    });

    return {
      ...preset,
      snapshot: {
        ...preset.snapshot,
        routes,
      },
    };
  });
}

export function savePresets(presets: UserPreset[]): void {
  if (!isBrowserStorageAvailable()) return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(compactPresetsForStorage(presets)),
    );
  } catch {
    // Ignore quota / serialization errors.
  }
  syncDismissedSeededIds(presets);
}
