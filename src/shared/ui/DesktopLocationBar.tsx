import { useRef, useState } from "react";
import { usePosterContext } from "@/features/poster/ui/PosterContext";
import { useFormHandlers } from "@/features/poster/application/useFormHandlers";
import { useLocationAutocomplete } from "@/features/location/application/useLocationAutocomplete";
import { useCurrentLocation } from "@/features/location/application/useCurrentLocation";
import { useRecentLocations } from "@/features/location/application/useRecentLocations";
import LocationSuggestionsDropdown from "@/features/location/ui/LocationSuggestionsDropdown";
import { useMapSync } from "@/features/map/application/useMapSync";
import {
  PLACEHOLDER_LOCATION_SEARCH,
  PLACEHOLDER_EXAMPLE_LATITUDE,
  PLACEHOLDER_EXAMPLE_LONGITUDE,
} from "@/features/location/ui/constants";
import type { SearchResult } from "@/features/location/domain/types";
import { MyLocationIcon, LocationIcon, SearchIcon } from "@/shared/ui/Icons";

/**
 * Floating location bar for desktop and mobile.
 * Collapses the search input to a magnifying glass icon button matching the
 * GPS and lat/lon toggle buttons, and expands horizontally when clicked.
 */
export default function DesktopLocationBar() {
  const { state, dispatch, mapRef } = usePosterContext();
  const {
    handleChange,
    handleLocationSelect: handleLocationSelectBase,
    setLocationFocused,
  } = useFormHandlers();
  const { locationSuggestions, isLocationSearching, searchNow } = useLocationAutocomplete(
    state.form.location,
    state.isLocationFocused,
  );
  const { flyToLocation } = useMapSync(state, dispatch, mapRef);
  const { handleUseCurrentLocation, isLocatingUser, locationPermissionMessage } =
    useCurrentLocation(flyToLocation);
  const { recent, removeRecent, clearRecent } = useRecentLocations();

  const [showSearch, setShowSearch] = useState(false);
  const [showCoords, setShowCoords] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const openSearch = () => {
    setShowSearch(true);
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  };

  const closeSearch = () => {
    setShowSearch(false);
    setLocationFocused(false);
  };

  const onLocationSelect = (location: SearchResult) => {
    handleLocationSelectBase(location);
    flyToLocation(location.lat, location.lon);
  };

  return (
    <div
      className={`dsk-loc-bar${showSearch ? " show-search" : ""}${showCoords ? " show-coords" : ""}`}
    >
      <div className="location-autocomplete">
        <div className="location-search-stack">
          <div className="location-search-main-row">
            {showSearch ? (
              <div className="location-search-row">
                <button
                  type="button"
                  className="location-search-icon"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={closeSearch}
                  aria-label="Hide location search"
                  title="Hide location search"
                >
                  <SearchIcon />
                </button>
                <div className="location-input-wrap">
                  <input
                    ref={searchInputRef}
                    className="form-control-tall"
                    name="location"
                    value={state.form.location}
                    onChange={handleChange}
                    onFocus={() => setLocationFocused(true)}
                    onBlur={() => setLocationFocused(false)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        void searchNow(e.currentTarget.value);
                      } else if (e.key === "Escape") {
                        closeSearch();
                      }
                    }}
                    placeholder={PLACEHOLDER_LOCATION_SEARCH}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="location-clear-btn"
                    aria-label="Close location search"
                    title="Close location search"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={closeSearch}
                  >
                    x
                  </button>
                </div>
              </div>
            ) : null}

            <div className="location-search-icons">
              {!showSearch ? (
                <button
                  type="button"
                  className="icon-only-btn location-row-icon-btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={openSearch}
                  aria-label="Search location"
                  title="Search location"
                >
                  <SearchIcon />
                </button>
              ) : null}
              <button
                type="button"
                className={`icon-only-btn location-row-icon-btn${isLocatingUser ? " is-locating" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleUseCurrentLocation}
                disabled={isLocatingUser}
                aria-label="Use current location"
                title="Use current location"
              >
                <MyLocationIcon className="location-current-icon" />
              </button>
              <button
                type="button"
                className={`icon-only-btn location-row-icon-btn${showCoords ? " is-active" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShowCoords((v) => !v)}
                aria-label="Toggle coordinate fields"
                title="Show/hide lat & lon"
              >
                <LocationIcon />
              </button>
            </div>
          </div>

          {showSearch ? (
            <LocationSuggestionsDropdown
              query={state.form.location}
              isFocused={state.isLocationFocused}
              suggestions={locationSuggestions}
              isSearching={isLocationSearching}
              onSelect={onLocationSelect}
              recent={recent}
              onRecentSelect={onLocationSelect}
              onRecentRemove={removeRecent}
              onClearRecent={clearRecent}
            />
          ) : null}
        </div>

        {locationPermissionMessage ? (
          <p className="location-permission-message">{locationPermissionMessage}</p>
        ) : null}

        <div className="dsk-loc-coords">
          <label>
            Latitude
            <input
              className="form-control-tall"
              name="latitude"
              value={state.form.latitude}
              onChange={handleChange}
              placeholder={PLACEHOLDER_EXAMPLE_LATITUDE}
            />
          </label>
          <label>
            Longitude
            <input
              className="form-control-tall"
              name="longitude"
              value={state.form.longitude}
              onChange={handleChange}
              placeholder={PLACEHOLDER_EXAMPLE_LONGITUDE}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
