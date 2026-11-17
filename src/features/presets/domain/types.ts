import type { PosterForm } from "@/features/poster/application/posterReducer";
import type { MarkerDefaults, MarkerItem } from "@/features/markers/domain/types";
import type { Route, RouteDefaults } from "@/features/routes/domain/types";
import type { SavedTheme } from "@/features/theme/domain/types";

export const DEFAULT_PRESET_ID = "default";
export const DEFAULT_PRESET_NAME = "DEFAULT";

export interface PresetSnapshot {
  form: PosterForm;
  customColors: Record<string, string>;
  displayNameOverrides: {
    city: boolean;
    country: boolean;
  };
  markers: MarkerItem[];
  markerDefaults: MarkerDefaults;
  routes: Route[];
  routeDefaults: RouteDefaults;
  bearing?: number;
  savedThemeFallback?: SavedTheme;
}

export interface UserPreset {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  snapshot: PresetSnapshot;
}
