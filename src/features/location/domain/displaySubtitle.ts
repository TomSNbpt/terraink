export interface DisplaySubtitleSource {
  state?: string;
  country?: string;
  countryCode?: string;
}

const US_COUNTRY_NAMES = new Set([
  "united states",
  "united states of america",
  "usa",
  "u.s.a.",
  "u.s.",
]);

export function isUnitedStatesLocation(source: DisplaySubtitleSource): boolean {
  const code = String(source.countryCode ?? "").trim().toUpperCase();
  if (code === "US") {
    return true;
  }
  const country = String(source.country ?? "").trim().toLowerCase();
  return US_COUNTRY_NAMES.has(country);
}

/**
 * Resolves the poster subtitle ("Display state / country") for a geocoded place:
 * - United States locations -> full state name (falling back to country if absent)
 * - International locations -> country name
 */
export function resolveDisplaySubtitle(source: DisplaySubtitleSource): string {
  const state = String(source.state ?? "").trim();
  const country = String(source.country ?? "").trim();

  if (isUnitedStatesLocation(source) && state) {
    return state;
  }

  return country || state;
}

export function formatLocationLabel(
  city: string,
  subtitle: string,
  fallbackLabel = "",
): string {
  const trimmedCity = city.trim();
  const trimmedSubtitle = subtitle.trim();
  if (
    trimmedCity &&
    trimmedSubtitle &&
    trimmedCity.toLowerCase() !== trimmedSubtitle.toLowerCase()
  ) {
    return `${trimmedCity}, ${trimmedSubtitle}`;
  }
  return trimmedCity || trimmedSubtitle || fallbackLabel.trim();
}
