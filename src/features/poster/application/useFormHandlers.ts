import { useCallback } from "react";
import { usePosterContext } from "../ui/PosterContext";
import type { SavedTheme } from "@/features/theme/domain/types";
import type { UserDefaults } from "@/features/settings/domain/types";
import { clamp } from "@/shared/geo/math";
import { recordRecentLocation } from "@/features/location/application/useRecentLocations";
import type { SearchResult } from "@/features/location/domain/types";
import type { CustomSizeUnit } from "../application/posterReducer";
import {
  formatLayoutCm,
} from "@/features/layout/domain/layoutMatcher";
import {
  getLayoutOption,
  instantiateLayoutGuides,
} from "@/features/layout/infrastructure/layoutRepository";
import {
  MIN_DISTANCE_METERS,
  MAX_DISTANCE_METERS,
} from "@/core/config";

/**
 * Provides ready-made event handlers for the settings form,
 * replacing the inline handlers previously in App.jsx.
 */
export function useFormHandlers() {
  const { state, dispatch } = usePosterContext();

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const target = event.target as HTMLInputElement;
      const { name, value, type } = target;
      const checked = "checked" in target ? target.checked : false;

      if (type === "checkbox") {
        dispatch({ type: "SET_FIELD", name, value: checked });
        return;
      }

      const fieldValue: string | boolean = value as string;

      // After a suggestion is selected, the reducer sets isLocationFocused=false.
      // If the user starts typing without re-clicking (DOM focus never left),
      // onFocus never fires, so we restore it here on the first keystroke.
      if (name === "location" && !state.isLocationFocused) {
        dispatch({ type: "SET_LOCATION_FOCUSED", focused: true });
      }

      dispatch({ type: "SET_FIELD", name, value: fieldValue });
    },
    [dispatch, state.isLocationFocused],
  );

  const handleNumericFieldBlur = useCallback(
    (event: React.FocusEvent<HTMLInputElement>) => {
      const { name, value } = event.target;
      const trimmed = String(value ?? "").trim();
      if (!trimmed) return;

      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed)) return;

      if (name === "distance") {
        dispatch({
          type: "SET_FIELD",
          name: "distance",
          value: String(
            Math.round(clamp(parsed, MIN_DISTANCE_METERS, MAX_DISTANCE_METERS)),
          ),
        });
        return;
      }

      if (name === "width" || name === "height") {
        if (parsed <= 0) return;

        dispatch({
          type: "SET_FORM_FIELDS",
          fields: {
            [name]: String(parsed),
            layout: "custom",
          },
        });
      }
    },
    [dispatch],
  );

  const handleThemeChange = useCallback(
    (themeId: string) => {
      dispatch({ type: "SET_THEME", themeId });
    },
    [dispatch],
  );

  const handleLayoutChange = useCallback(
    (layoutId: string) => {
      if (layoutId === "custom") {
        dispatch({
          type: "SET_LAYOUT",
          layoutId: "custom",
          widthCm: state.form.width,
          heightCm: state.form.height,
        });
        return;
      }

      const layoutOption = getLayoutOption(layoutId);
      if (!layoutOption) return;

      dispatch({
        type: "SET_LAYOUT",
        layoutId: layoutOption.id,
        widthCm: formatLayoutCm(layoutOption.widthCm),
        heightCm: formatLayoutCm(layoutOption.heightCm),
        guides: instantiateLayoutGuides(layoutOption),
      });
    },
    [dispatch, state.form.height, state.form.width],
  );

  const handleCustomSizeUnitChange = useCallback(
    (unit: CustomSizeUnit) => {
      dispatch({ type: "SET_FIELD", name: "customSizeUnit", value: unit });
    },
    [dispatch],
  );

  const handleColorChange = useCallback(
    (key: string, value: string) => {
      dispatch({ type: "SET_COLOR", key, value });
    },
    [dispatch],
  );

  const handleResetColors = useCallback(() => {
    dispatch({ type: "RESET_COLORS" });
  }, [dispatch]);

  const handleSetCustomColors = useCallback(
    (colors: Record<string, string>) => {
      dispatch({ type: "SET_CUSTOM_COLORS", colors });
    },
    [dispatch],
  );

  const handleAddSavedTheme = useCallback(
    (theme: SavedTheme) => {
      dispatch({ type: "ADD_SAVED_THEME", theme });
    },
    [dispatch],
  );

  const handleUpdateSavedTheme = useCallback(
    (themeId: string, changes: Partial<SavedTheme>) => {
      dispatch({ type: "UPDATE_SAVED_THEME", themeId, changes });
    },
    [dispatch],
  );

  const handleRemoveSavedTheme = useCallback(
    (themeId: string) => {
      dispatch({ type: "REMOVE_SAVED_THEME", themeId });
    },
    [dispatch],
  );

  const handleDeleteBuiltinTheme = useCallback(
    (themeId: string) => {
      dispatch({ type: "DELETE_BUILTIN_THEME", themeId });
    },
    [dispatch],
  );

  const handleSaveCurrentAsDefaults = useCallback(() => {
    const defaults: UserDefaults = {
      theme: state.form.theme,
      layout: state.form.layout,
      fontFamily: state.form.fontFamily,
    };
    dispatch({ type: "SET_USER_DEFAULTS", defaults });
  }, [
    dispatch,
    state.form.fontFamily,
    state.form.layout,
    state.form.theme,
  ]);

  const handleResetUserDefaults = useCallback(() => {
    dispatch({ type: "RESET_USER_DEFAULTS" });
  }, [dispatch]);

  const handleLocationSelect = useCallback(
    (suggestion: SearchResult) => {
      dispatch({ type: "SELECT_LOCATION", location: suggestion });
      recordRecentLocation(suggestion);
    },
    [dispatch],
  );

  const handleClearLocation = useCallback(() => {
    dispatch({ type: "CLEAR_LOCATION" });
  }, [dispatch]);

  const setLocationFocused = useCallback(
    (focused: boolean) => {
      dispatch({ type: "SET_LOCATION_FOCUSED", focused });
    },
    [dispatch],
  );

  const handleCreditsChange = useCallback(
    (value: boolean) => {
      dispatch({ type: "SET_FIELD", name: "includeCredits", value });
    },
    [dispatch],
  );

  return {
    handleChange,
    handleNumericFieldBlur,
    handleThemeChange,
    handleLayoutChange,
    handleCustomSizeUnitChange,
    handleColorChange,
    handleResetColors,
    handleSetCustomColors,
    handleAddSavedTheme,
    handleUpdateSavedTheme,
    handleRemoveSavedTheme,
    handleDeleteBuiltinTheme,
    handleSaveCurrentAsDefaults,
    handleResetUserDefaults,
    handleLocationSelect,
    handleClearLocation,
    setLocationFocused,
    handleCreditsChange,
  };
}
