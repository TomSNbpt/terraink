import appConfig from "@/data/config.json";
import type { UserPreset } from "@/features/presets/domain/types";
import type { Route } from "@/features/routes/domain/types";
import {
  doesRouteMatchBundledGpx,
  normalizeGpxFilename,
  serializeRouteToGpxXml,
} from "@/features/routes/infrastructure/gpxLibrary";
import type { SavedTheme } from "@/features/theme/domain/types";
import type { Coordinate } from "@/shared/geo/types";

export interface SnapshotGpxFile {
  filename: string;
  label: string;
  pointCount: number;
  xml: string;
  isBundled: boolean;
}

export interface ConfigSnapshotResult {
  json: string;
  byteLength: number;
  hasChanges: boolean;
  themeCount: number;
  promotedThemeCount: number;
  layoutCount: number;
  presetCount: number;
  gpxFiles: SnapshotGpxFile[];
}

function slugifyThemeId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "custom_theme";
}

function isSameThemeColors(
  existing: Record<string, unknown>,
  candidate: SavedTheme["colors"],
): boolean {
  try {
    return (
      JSON.stringify({ ui: existing.ui, map: existing.map }) ===
      JSON.stringify({ ui: candidate.ui, map: candidate.map })
    );
  } catch {
    return false;
  }
}

function isSameSegments(a: Coordinate[][], b: Coordinate[][]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const segA = a[i];
    const segB = b[i];
    if (!segA || !segB || segA.length !== segB.length) return false;
    if (segA.length === 0) continue;
    const firstA = segA[0];
    const firstB = segB[0];
    const lastA = segA[segA.length - 1];
    const lastB = segB[segB.length - 1];
    if (
      Math.abs(firstA.lat - firstB.lat) > 1e-6 ||
      Math.abs(firstA.lon - firstB.lon) > 1e-6 ||
      Math.abs(lastA.lat - lastB.lat) > 1e-6 ||
      Math.abs(lastA.lon - lastB.lon) > 1e-6
    ) {
      return false;
    }
  }
  return true;
}

function countSegmentPoints(segments: Coordinate[][]): number {
  return segments.reduce((sum, seg) => sum + seg.length, 0);
}

function disambiguateFilename(baseFilename: string, suffix: number): string {
  const stem = baseFilename.replace(/\.gpx$/i, "");
  return `${stem}-${suffix}.gpx`;
}

function canonicalizeForComparison(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeForComparison);
  }
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) {
        sorted[key] = canonicalizeForComparison(entry);
      }
    }
    return sorted;
  }
  return value;
}

function normalizeBaselineForComparison(): string {
  const raw = appConfig as {
    version?: number;
    themes?: Record<string, unknown>;
    layouts?: unknown;
    presets?: Array<Record<string, unknown>>;
  };

  const normalizedPresets = Array.isArray(raw.presets)
    ? raw.presets.map((preset) => {
        const cloned = JSON.parse(JSON.stringify(preset)) as Record<
          string,
          unknown
        >;
        const snapshot = cloned.snapshot as Record<string, unknown> | undefined;
        if (snapshot && Array.isArray(snapshot.routes)) {
          snapshot.routes = snapshot.routes.map((route) => {
            if (
              !route ||
              typeof route !== "object" ||
              (route as Record<string, unknown>).source !== "gpx"
            ) {
              return route;
            }
            const r = route as Record<string, unknown>;
            const gpxFilename = normalizeGpxFilename(
              typeof r.gpxFile === "string"
                ? r.gpxFile
                : typeof r.sourceFilename === "string"
                  ? r.sourceFilename
                  : undefined,
              typeof r.label === "string" ? r.label : undefined,
            );
            const { segments: _omitted, ...rest } = r;
            return {
              ...rest,
              sourceFilename: gpxFilename,
              gpxFile: gpxFilename,
            };
          });
        }
        return cloned;
      })
    : [];

  return JSON.stringify(
    canonicalizeForComparison({
      version: raw.version ?? 1,
      themes: raw.themes ?? {},
      layouts: raw.layouts ?? { defaultLayoutId: "", categories: [] },
      presets: normalizedPresets,
    }),
  );
}

const BUNDLED_CONFIG_SIGNATURE = normalizeBaselineForComparison();

export function buildConfigSnapshot(input: {
  presets: UserPreset[];
  savedThemes: SavedTheme[];
  activeRoutes?: Route[];
}): ConfigSnapshotResult {
  const baseThemes = JSON.parse(
    JSON.stringify((appConfig as { themes?: Record<string, unknown> }).themes ?? {}),
  ) as Record<string, Record<string, unknown>>;

  const baseLayouts = JSON.parse(
    JSON.stringify(
      (
        appConfig as {
          layouts?: {
            defaultLayoutId?: string;
            categories?: Array<{ layouts?: unknown[] }>;
          };
        }
      ).layouts ?? { defaultLayoutId: "", categories: [] },
    ),
  ) as {
    defaultLayoutId?: string;
    categories?: Array<{ layouts?: unknown[] }>;
  };

  const themeIdRemap = new Map<string, string>();
  let promotedThemeCount = 0;

  function registerSavedTheme(saved: SavedTheme): string {
    const alreadyMapped = themeIdRemap.get(saved.id);
    if (alreadyMapped) return alreadyMapped;

    // If saved.id already matches an entry in themes with identical colors, keep it.
    if (
      baseThemes[saved.id] &&
      isSameThemeColors(baseThemes[saved.id], saved.colors)
    ) {
      themeIdRemap.set(saved.id, saved.id);
      return saved.id;
    }

    const baseSlug = slugifyThemeId(saved.name);
    let targetId = baseSlug;
    let suffix = 2;

    while (baseThemes[targetId]) {
      if (isSameThemeColors(baseThemes[targetId], saved.colors)) {
        themeIdRemap.set(saved.id, targetId);
        return targetId;
      }
      targetId = `${baseSlug}_${suffix}`;
      suffix += 1;
    }

    baseThemes[targetId] = {
      name: saved.name.trim() || targetId,
      description: saved.description?.trim() ?? "",
      ui: { ...saved.colors.ui },
      map: {
        ...saved.colors.map,
        roads: { ...saved.colors.map.roads },
      },
    };
    themeIdRemap.set(saved.id, targetId);
    promotedThemeCount += 1;
    return targetId;
  }

  for (const saved of input.savedThemes) {
    registerSavedTheme(saved);
  }

  const gpxByFilename = new Map<
    string,
    {
      label: string;
      segments: Coordinate[][];
      isBundled: boolean;
    }
  >();

  function registerGpxRoute(route: Route): string {
    const baseFilename = normalizeGpxFilename(
      route.gpxFile ?? route.sourceFilename,
      route.label,
    );

    let candidate = baseFilename;
    let suffix = 2;

    while (gpxByFilename.has(candidate)) {
      const existing = gpxByFilename.get(candidate)!;
      if (isSameSegments(existing.segments, route.segments)) {
        return candidate;
      }
      candidate = disambiguateFilename(baseFilename, suffix);
      suffix += 1;
    }

    const isBundled = doesRouteMatchBundledGpx(candidate, route.segments);
    gpxByFilename.set(candidate, {
      label: route.label || candidate.replace(/\.gpx$/i, ""),
      segments: route.segments,
      isBundled,
    });
    return candidate;
  }

  const exportedPresets = input.presets.map((preset) => {
    const cloned = JSON.parse(JSON.stringify(preset)) as UserPreset;
    const rawThemeId = cloned.snapshot.form.theme;

    let resolvedThemeId = themeIdRemap.get(rawThemeId) ?? rawThemeId;
    if (!baseThemes[resolvedThemeId] && cloned.snapshot.savedThemeFallback) {
      resolvedThemeId = registerSavedTheme(cloned.snapshot.savedThemeFallback);
    }

    cloned.snapshot.form.theme = resolvedThemeId;
    if (baseThemes[resolvedThemeId]) {
      delete cloned.snapshot.savedThemeFallback;
    }

    const serializedRoutes = cloned.snapshot.routes.map((route) => {
      if (route.source !== "gpx") {
        return route;
      }
      const gpxFilename = registerGpxRoute(route);
      const { segments: _omitted, ...rest } = route;
      return {
        ...rest,
        sourceFilename: gpxFilename,
        gpxFile: gpxFilename,
      };
    });

    return {
      ...cloned,
      snapshot: {
        ...cloned.snapshot,
        routes: serializedRoutes,
      },
    };
  });

  for (const route of input.activeRoutes ?? []) {
    if (route.source === "gpx") {
      registerGpxRoute(route);
    }
  }

  const payload = {
    version: 1,
    themes: baseThemes,
    layouts: baseLayouts,
    presets: exportedPresets,
  };

  const json = `${JSON.stringify(payload, null, 2)}\n`;
  const byteLength = new TextEncoder().encode(json).length;
  const hasChanges =
    JSON.stringify(canonicalizeForComparison(payload)) !==
    BUNDLED_CONFIG_SIGNATURE;

  const layoutCount = (baseLayouts.categories ?? []).reduce(
    (sum, category) => sum + (Array.isArray(category.layouts) ? category.layouts.length : 0),
    0,
  );

  const gpxFiles: SnapshotGpxFile[] = Array.from(gpxByFilename.entries())
    .map(([filename, entry]) => ({
      filename,
      label: entry.label,
      pointCount: countSegmentPoints(entry.segments),
      xml: serializeRouteToGpxXml(entry.label, entry.segments),
      isBundled: entry.isBundled,
    }))
    .sort((a, b) => {
      if (a.isBundled !== b.isBundled) return a.isBundled ? 1 : -1;
      return a.filename.localeCompare(b.filename);
    });

  return {
    json,
    byteLength,
    hasChanges,
    themeCount: Object.keys(baseThemes).length,
    promotedThemeCount,
    layoutCount,
    presetCount: exportedPresets.length,
    gpxFiles,
  };
}
