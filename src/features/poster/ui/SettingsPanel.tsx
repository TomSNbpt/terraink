import { useState } from "react";
import { usePosterContext } from "@/features/poster/ui/PosterContext";
import { useFormHandlers } from "@/features/poster/application/useFormHandlers";
import { useLocationAutocomplete } from "@/features/location/application/useLocationAutocomplete";
import { useCurrentLocation } from "@/features/location/application/useCurrentLocation";
import { useMapSync } from "@/features/map/application/useMapSync";
import { useGpxUpload } from "@/features/routes/application/useGpxUpload";
import type { MobileTab } from "@/shared/ui/MobileNavBar";

import LocationSection from "@/features/location/ui/LocationSection";
import MapSettingsSection from "@/features/map/ui/MapSettingsSection";
import SettingsSection from "@/features/settings/ui/SettingsSection";
import LayersSection from "@/features/map/ui/LayersSection";
import MarkersSection from "@/features/markers/ui/MarkersSection";
import RoutesSection from "@/features/routes/ui/RoutesSection";
import PresetsSection from "@/features/presets/ui/PresetsSection";
import TypographySection from "@/features/poster/ui/TypographySection";
import DesignSection from "@/features/poster/ui/DesignSection";
import ColorSection from "@/features/poster/ui/ColorSection";
import {
  LocationIcon,
  ThemeIcon,
  LayoutIcon,
  LayersIcon,
  MarkersIcon,
  RouteIcon,
  PresetsIcon,
  DesignIcon,
  ColorIcon,
  ChevronDownIcon,
} from "@/shared/ui/Icons";

import { themeOptions } from "@/features/theme/infrastructure/themeRepository";
import { layoutGroups } from "@/features/layout/infrastructure/layoutRepository";
import {
  MIN_POSTER_CM,
  MAX_POSTER_CM,
  FONT_OPTIONS,
} from "@/core/config";
import type { SearchResult } from "@/features/location/domain/types";

type SectionId =
  | "location"
  | "layout"
  | "theme"
  | "style"
  | "color"
  | "layers"
  | "markers"
  | "routes"
  | "presets";

const accordionSections: {
  id: SectionId;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "location", label: "Location", Icon: LocationIcon },
  { id: "layout", label: "Layout", Icon: LayoutIcon },
  { id: "theme", label: "Theme", Icon: ThemeIcon },
  { id: "style", label: "Design", Icon: DesignIcon },
  { id: "color", label: "Color", Icon: ColorIcon },
  { id: "layers", label: "Layers", Icon: LayersIcon },
  { id: "markers", label: "Markers", Icon: MarkersIcon },
  { id: "routes", label: "Routes", Icon: RouteIcon },
  { id: "presets", label: "Products", Icon: PresetsIcon },
];

export default function SettingsPanel({
  mobileTab,
  activeTab,
}: {
  mobileTab?: MobileTab;
  activeTab?: MobileTab;
}) {
  const { state, dispatch, mapRef, selectedTheme, effectiveTheme } =
    usePosterContext();
  const {
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
    handleLocationSelect,
    handleClearLocation,
    setLocationFocused,
  } = useFormHandlers();
  const { locationSuggestions, isLocationSearching, searchNow } =
    useLocationAutocomplete(state.form.location, state.isLocationFocused);
  const { flyToLocation } = useMapSync(state, dispatch, mapRef);
  const {
    handleUseCurrentLocation,
    isLocatingUser,
    locationPermissionMessage,
  } = useCurrentLocation(flyToLocation);
  const { addAiRouteOverlay } = useGpxUpload();

  const [openSections, setOpenSections] = useState<Set<SectionId>>(
    new Set(["location", "layout", "theme", "style"]),
  );

  const toggleSection = (id: SectionId) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const onLocationSelect = (location: SearchResult) => {
    handleLocationSelect(location);
    flyToLocation(location.lat, location.lon);
  };

  const handleAddDesignerMessage = (
    message: import("@/features/theme-designer/domain/types").DesignerMessage,
  ) => {
    dispatch({ type: "ADD_DESIGNER_MESSAGE", message });
  };

  const handleAddDesignerResponse = (
    message: import("@/features/theme-designer/domain/types").DesignerMessage,
    themes: import("@/features/theme-designer/domain/types").GeneratedTheme[],
  ) => {
    dispatch({ type: "ADD_DESIGNER_RESPONSE", message, themes });
  };

  const handleSelectGeneratedTheme = (themeId: string | null) => {
    dispatch({ type: "SELECT_GENERATED_THEME", themeId });
  };

  const handleMarkGeneratedThemeSaved = (
    generatedThemeId: string,
    savedThemeId: string,
  ) => {
    dispatch({
      type: "MARK_GENERATED_THEME_SAVED",
      generatedThemeId,
      savedThemeId,
    });
  };

  const handleClearThemeDesigner = () => {
    dispatch({ type: "CLEAR_THEME_DESIGNER" });
  };

  if (activeTab === "settings") {
    return (
      <form className="settings-panel" onSubmit={(e) => e.preventDefault()}>
        <SettingsSection />
      </form>
    );
  }

  return (
    <form className="settings-panel" onSubmit={(e) => e.preventDefault()}>
      <div
        className={`mobile-section mobile-section--location accordion-item${openSections.has("location") ? " accordion-item--open" : ""}`}
      >
        <AccordionHeader
          sectionId="location"
          label={accordionSections[0].label}
          Icon={accordionSections[0].Icon}
          isOpen={openSections.has("location")}
          onToggle={toggleSection}
        />
        <div
          className={`accordion-body${openSections.has("location") ? " is-open" : ""}`}
        >
          <div className="accordion-body-inner">
            <LocationSection
              form={state.form}
              onChange={handleChange}
              onLocationFocus={() => setLocationFocused(true)}
              onLocationBlur={() => setLocationFocused(false)}
              searchNow={searchNow}
              isLocationFocused={state.isLocationFocused}
              locationSuggestions={locationSuggestions}
              isLocationSearching={isLocationSearching}
              onLocationSelect={onLocationSelect}
              onClearLocation={handleClearLocation}
              onUseCurrentLocation={handleUseCurrentLocation}
              isLocatingUser={isLocatingUser}
              locationPermissionMessage={locationPermissionMessage}
            />
          </div>
        </div>
      </div>

      <div
        className={`mobile-section mobile-section--layout-settings accordion-item${openSections.has("layout") ? " accordion-item--open" : ""}`}
      >
        <AccordionHeader
          sectionId="layout"
          label={accordionSections[1].label}
          Icon={accordionSections[1].Icon}
          isOpen={openSections.has("layout")}
          onToggle={toggleSection}
        />
        <div
          className={`accordion-body${openSections.has("layout") ? " is-open" : ""}`}
        >
          <div className="accordion-body-inner">
            <MapSettingsSection
              activeMobileTab={mobileTab ?? activeTab}
              layoutControlsSlot={
                <TypographySection
                  form={state.form}
                  onChange={handleChange}
                  fontOptions={FONT_OPTIONS}
                />
              }
              form={state.form}
              onChange={handleChange}
              onNumericFieldBlur={handleNumericFieldBlur}
              onThemeChange={handleThemeChange}
              onLayoutChange={handleLayoutChange}
              onCustomUnitChange={handleCustomSizeUnitChange}
              selectedTheme={selectedTheme}
              effectiveTheme={effectiveTheme}
              themeOptions={themeOptions}
              layoutGroups={layoutGroups}
              minPosterCm={MIN_POSTER_CM}
              maxPosterCm={MAX_POSTER_CM}
              customColors={state.customColors}
              savedThemes={state.savedThemes}
              deletedBuiltinThemeIds={state.deletedBuiltinThemeIds}
              onAddSavedTheme={handleAddSavedTheme}
              onRemoveSavedTheme={handleRemoveSavedTheme}
              onDeleteBuiltinTheme={handleDeleteBuiltinTheme}
              onSetCustomColors={handleSetCustomColors}
              themeDesigner={state.themeDesigner}
              onAddDesignerMessage={handleAddDesignerMessage}
              onAddDesignerResponse={handleAddDesignerResponse}
              onAddAiRouteOverlay={addAiRouteOverlay}
              onSelectGeneratedTheme={handleSelectGeneratedTheme}
              onMarkGeneratedThemeSaved={handleMarkGeneratedThemeSaved}
              onClearThemeDesigner={handleClearThemeDesigner}
            />
          </div>
        </div>
      </div>

      <div
        className={`mobile-section mobile-section--theme-settings accordion-item${openSections.has("theme") ? " accordion-item--open" : ""}`}
      >
        <AccordionHeader
          sectionId="theme"
          label={accordionSections[2].label}
          Icon={accordionSections[2].Icon}
          isOpen={openSections.has("theme")}
          onToggle={toggleSection}
        />
        <div
          className={`accordion-body${openSections.has("theme") ? " is-open" : ""}`}
        >
          <div className="accordion-body-inner">
            <MapSettingsSection
              activeMobileTab={mobileTab ?? activeTab}
              form={state.form}
              onChange={handleChange}
              onNumericFieldBlur={handleNumericFieldBlur}
              onThemeChange={handleThemeChange}
              onLayoutChange={handleLayoutChange}
              onCustomUnitChange={handleCustomSizeUnitChange}
              selectedTheme={selectedTheme}
              effectiveTheme={effectiveTheme}
              themeOptions={themeOptions}
              layoutGroups={layoutGroups}
              minPosterCm={MIN_POSTER_CM}
              maxPosterCm={MAX_POSTER_CM}
              customColors={state.customColors}
              savedThemes={state.savedThemes}
              deletedBuiltinThemeIds={state.deletedBuiltinThemeIds}
              onAddSavedTheme={handleAddSavedTheme}
              onRemoveSavedTheme={handleRemoveSavedTheme}
              onDeleteBuiltinTheme={handleDeleteBuiltinTheme}
              onSetCustomColors={handleSetCustomColors}
              themeDesigner={state.themeDesigner}
              onAddDesignerMessage={handleAddDesignerMessage}
              onAddDesignerResponse={handleAddDesignerResponse}
              onAddAiRouteOverlay={addAiRouteOverlay}
              onSelectGeneratedTheme={handleSelectGeneratedTheme}
              onMarkGeneratedThemeSaved={handleMarkGeneratedThemeSaved}
              onClearThemeDesigner={handleClearThemeDesigner}
            />
          </div>
        </div>
      </div>

      <div
        className={`mobile-section mobile-section--style accordion-item${openSections.has("style") ? " accordion-item--open" : ""}`}
      >
        <AccordionHeader
          sectionId="style"
          label={accordionSections[3].label}
          Icon={accordionSections[3].Icon}
          isOpen={openSections.has("style")}
          onToggle={toggleSection}
        />
        <div
          className={`accordion-body${openSections.has("style") ? " is-open" : ""}`}
        >
          <div className="accordion-body-inner">
            <DesignSection
              activeTab={mobileTab ?? activeTab}
              themeId={state.form.theme}
              selectedTheme={selectedTheme}
              effectiveTheme={effectiveTheme}
              themeOptions={themeOptions}
              deletedBuiltinThemeIds={state.deletedBuiltinThemeIds}
              savedThemes={state.savedThemes}
              customColors={state.customColors}
              onThemeChange={handleThemeChange}
              onColorChange={handleColorChange}
              onResetColors={handleResetColors}
              onAddSavedTheme={handleAddSavedTheme}
              onUpdateSavedTheme={handleUpdateSavedTheme}
              onRemoveSavedTheme={handleRemoveSavedTheme}
              onDeleteBuiltinTheme={handleDeleteBuiltinTheme}
              onSetCustomColors={handleSetCustomColors}
              themeDesigner={state.themeDesigner}
            />
          </div>
        </div>
      </div>

      <div
        className={`mobile-section mobile-section--color accordion-item${openSections.has("color") ? " accordion-item--open" : ""}`}
      >
        <AccordionHeader
          sectionId="color"
          label={accordionSections[4].label}
          Icon={accordionSections[4].Icon}
          isOpen={openSections.has("color")}
          onToggle={toggleSection}
        />
        <div
          className={`accordion-body${openSections.has("color") ? " is-open" : ""}`}
        >
          <div className="accordion-body-inner">
            <ColorSection />
          </div>
        </div>
      </div>

      <div
        className={`mobile-section mobile-section--layers accordion-item${openSections.has("layers") ? " accordion-item--open" : ""}`}
      >
        <AccordionHeader
          sectionId="layers"
          label={accordionSections[5].label}
          Icon={accordionSections[5].Icon}
          isOpen={openSections.has("layers")}
          onToggle={toggleSection}
        />
        <div
          className={`accordion-body${openSections.has("layers") ? " is-open" : ""}`}
        >
          <div className="accordion-body-inner">
            <LayersSection
              form={state.form}
              onChange={handleChange}
              minPosterCm={MIN_POSTER_CM}
              maxPosterCm={MAX_POSTER_CM}
              onNumericFieldBlur={handleNumericFieldBlur}
            />
          </div>
        </div>
      </div>

      <div
        className={`mobile-section mobile-section--markers accordion-item${openSections.has("markers") ? " accordion-item--open" : ""}`}
      >
        <AccordionHeader
          sectionId="markers"
          label={accordionSections[6].label}
          Icon={accordionSections[6].Icon}
          isOpen={openSections.has("markers")}
          onToggle={toggleSection}
        />
        <div
          className={`accordion-body${openSections.has("markers") ? " is-open" : ""}`}
        >
          <div className="accordion-body-inner">
            <MarkersSection />
          </div>
        </div>
      </div>

      <div
        className={`mobile-section mobile-section--routes accordion-item${openSections.has("routes") ? " accordion-item--open" : ""}`}
      >
        <AccordionHeader
          sectionId="routes"
          label={accordionSections[7].label}
          Icon={accordionSections[7].Icon}
          isOpen={openSections.has("routes")}
          onToggle={toggleSection}
        />
        <div
          className={`accordion-body${openSections.has("routes") ? " is-open" : ""}`}
        >
          <div className="accordion-body-inner">
            <RoutesSection />
          </div>
        </div>
      </div>

      <div
        className={`mobile-section mobile-section--presets accordion-item${openSections.has("presets") ? " accordion-item--open" : ""}`}
      >
        <AccordionHeader
          sectionId="presets"
          label={accordionSections[8].label}
          Icon={accordionSections[8].Icon}
          isOpen={openSections.has("presets")}
          onToggle={toggleSection}
        />
        <div
          className={`accordion-body${openSections.has("presets") ? " is-open" : ""}`}
        >
          <div className="accordion-body-inner">
            <PresetsSection />
          </div>
        </div>
      </div>

      {state.error ? <p className="error">{state.error}</p> : null}
    </form>
  );
}

function AccordionHeader({
  sectionId,
  label,
  Icon,
  isOpen,
  onToggle,
}: {
  sectionId: SectionId;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  isOpen: boolean;
  onToggle: (id: SectionId) => void;
}) {
  return (
    <button
      type="button"
      className={`accordion-header${isOpen ? " is-open" : ""}`}
      onClick={() => onToggle(sectionId)}
      aria-expanded={isOpen}
    >
      <Icon className="accordion-icon" />
      <span className="accordion-label">{label}</span>
      <ChevronDownIcon className="accordion-chevron" />
    </button>
  );
}
