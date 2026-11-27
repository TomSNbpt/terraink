import {
  DISPLAY_PALETTE_KEYS,
  type ThemeColors,
  type ThemeOption,
} from "@/features/theme/domain/types";
import { getThemeColorByPath } from "@/features/theme/domain/colorPaths";

import type { Coordinate } from "@/shared/geo/types";
import type { RouteBounds } from "@/features/routes/domain/types";

export interface ResolvedRouteOverlay {
  label: string;
  sourceFilename: string;
  segments: Coordinate[][];
  bounds: RouteBounds;
  pointCount: number;
  sourceMethod: "gpx-url" | "osm-relation" | "street-routed" | "waypoints";
}

export interface BrandSourceInfo {
  name: string;
  url: string;
  domain: string;
  logoColors: string[];
  siteColors: string[];
}

export interface DesignerMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  generatedThemeIds?: string[];
  addedRouteSummary?: string;
  brandSource?: BrandSourceInfo;
  isError?: boolean;
  errorSummary?: string;
  retryable?: boolean;
}

export interface GeneratedTheme {
  id: string;
  name: string;
  description: string;
  colors: ThemeColors;
  createdAt: string;
  savedThemeId?: string;
}

export interface ThemeDesignerSession {
  messages: DesignerMessage[];
  generatedThemes: GeneratedTheme[];
  activeGeneratedThemeId: string | null;
}

export function createEmptyThemeDesignerSession(): ThemeDesignerSession {
  return {
    messages: [],
    generatedThemes: [],
    activeGeneratedThemeId: null,
  };
}

export function generatedThemeToOption(theme: GeneratedTheme): ThemeOption {
  const palette = DISPLAY_PALETTE_KEYS.map(
    (key) => getThemeColorByPath(theme.colors, key) || "",
  );
  return {
    id: theme.id,
    name: theme.name,
    description: theme.description,
    palette,
  };
}

export function themeColorsToOverrides(
  colors: ThemeColors,
): Record<string, string> {
  const overrides: Record<string, string> = {};
  for (const key of DISPLAY_PALETTE_KEYS) {
    const color = getThemeColorByPath(colors, key);
    if (color) {
      overrides[key] = color;
    }
  }
  return overrides;
}
