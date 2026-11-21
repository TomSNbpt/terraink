export function getLocationSearchCacheKey(
  lookup: string,
  limit: number,
): string {
  return `location-search:v2:${lookup.toLowerCase()}:limit:${limit}`;
}

export function getGeocodeCacheKey(lookup: string): string {
  return `geocode:v2:location:${lookup.toLowerCase()}`;
}

export function getReverseGeocodeCacheKey(lat: number, lon: number): string {
  const roundedLat = lat.toFixed(4);
  const roundedLon = lon.toFixed(4);
  return `geocode:v2:reverse:${roundedLat},${roundedLon}`;
}
