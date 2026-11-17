import type { PosterState } from "@/features/poster/application/posterReducer";
import { getTheme } from "@/features/theme/infrastructure/themeRepository";
import {
  applyThemeColorOverrides,
  getThemeColorByPath,
} from "@/features/theme/domain/colorPaths";
import type {
  ResolvedTheme,
  SavedTheme,
  ThemeColorKey,
} from "@/features/theme/domain/types";
import {
  createCustomLayoutOption,
  getLayoutOption,
} from "@/features/layout/infrastructure/layoutRepository";
import type { PresetSnapshot } from "../domain/types";
import { cloneSnapshot } from "../infrastructure/presetsStorage";

const PRESET_SWATCH_KEYS: ThemeColorKey[] = [
  "ui.text",
  "map.land",
  "map.roads.major",
  "map.roads.minor_high",
  "map.roads.minor_mid",
];

export function captureSnapshotFromState(
  state: PosterState,
  bearing = 0,
): PresetSnapshot {
  const savedTheme = state.savedThemes.find((t) => t.id === state.form.theme);

  return cloneSnapshot({
    form: { ...state.form },
    customColors: { ...state.customColors },
    displayNameOverrides: { ...state.displayNameOverrides },
    markers: state.markers,
    markerDefaults: state.markerDefaults,
    routes: state.routes,
    routeDefaults: state.routeDefaults,
    bearing: Number.isFinite(bearing) ? bearing : 0,
    ...(savedTheme ? { savedThemeFallback: savedTheme } : {}),
  });
}

export function resolveSnapshotPalette(
  snapshot: PresetSnapshot,
  savedThemes: SavedTheme[],
): string[] {
  let baseTheme: ResolvedTheme;
  const saved =
    savedThemes.find((t) => t.id === snapshot.form.theme) ??
    snapshot.savedThemeFallback;

  if (saved) {
    baseTheme = {
      name: saved.name,
      description: saved.description || "Saved theme",
      ui: { ...saved.colors.ui },
      map: {
        ...saved.colors.map,
        roads: { ...saved.colors.map.roads },
      },
    };
  } else {
    baseTheme = getTheme(snapshot.form.theme);
  }

  const effective =
    Object.keys(snapshot.customColors).length > 0
      ? applyThemeColorOverrides(baseTheme, snapshot.customColors)
      : baseTheme;

  const seen = new Set<string>();
  const colors: string[] = [];
  for (const key of PRESET_SWATCH_KEYS) {
    const color = getThemeColorByPath(effective, key);
    if (color && !seen.has(color)) {
      seen.add(color);
      colors.push(color);
    }
  }
  return colors;
}

export function resolveSnapshotLayoutName(snapshot: PresetSnapshot): string {
  const match = getLayoutOption(snapshot.form.layout);
  if (match) return match.name;
  const fallback = createCustomLayoutOption(
    Number(snapshot.form.width),
    Number(snapshot.form.height),
    snapshot.form.customSizeUnit,
  );
  return fallback.name;
}

export function createPresetId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `preset-${crypto.randomUUID()}`;
  }
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
