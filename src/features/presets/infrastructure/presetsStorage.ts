import type { PosterForm } from "@/features/poster/application/posterReducer";
import seededPresetsManifest from "@/data/presets.json";
import {
  DEFAULT_PRESET_ID,
  DEFAULT_PRESET_NAME,
  type PresetSnapshot,
  type UserPreset,
} from "../domain/types";

const STORAGE_KEY = "terraink:presets";

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

  const routes = Array.isArray(raw.routes)
    ? cloneSnapshot({ ...fallbackSnapshot, routes: raw.routes }).routes
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

    const ordered = ensureDefaultPresetFirst(normalized, fallbackSnapshot);
    if (ordered.length !== normalized.length) {
      savePresets(ordered);
    }
    return ordered;
  } catch {
    return fallbackList;
  }
}

export function savePresets(presets: UserPreset[]): void {
  if (!isBrowserStorageAvailable()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // Ignore quota / serialization errors.
  }
}

export function serializePresetsForExport(presets: UserPreset[]): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      presets,
    },
    null,
    2,
  );
}

export function parseImportedPresets(
  jsonText: string,
  fallbackSnapshot: PresetSnapshot,
): { ok: true; presets: UserPreset[] } | { ok: false; error: string } {
  try {
    const parsed: unknown = JSON.parse(jsonText);
    const listCandidate = Array.isArray(parsed)
      ? parsed
      : isObject(parsed) && Array.isArray(parsed.presets)
        ? parsed.presets
        : null;

    if (!listCandidate) {
      return {
        ok: false,
        error: "Invalid presets file. Expected a JSON array or { presets: [...] }.",
      };
    }

    const normalized = listCandidate
      .map((item) => normalizePreset(item, fallbackSnapshot))
      .filter((item): item is UserPreset => item !== null);

    if (normalized.length === 0) {
      return {
        ok: false,
        error: "No valid presets were found in the selected JSON file.",
      };
    }

    return {
      ok: true,
      presets: normalized,
    };
  } catch {
    return {
      ok: false,
      error: "Could not parse JSON file. Please check the file format.",
    };
  }
}
