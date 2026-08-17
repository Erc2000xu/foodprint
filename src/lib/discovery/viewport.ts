import type { DiscoveryPlace, MapBounds, MapDiscoveryPlace, MapViewport } from "@/lib/discovery/types";
import { isValidGcj02Coordinate } from "@/lib/discovery/types";

function validLngLat(value: { longitude: number; latitude: number }) {
  return Number.isFinite(value.longitude)
    && Number.isFinite(value.latitude)
    && value.longitude >= -180
    && value.longitude <= 180
    && value.latitude >= -90
    && value.latitude <= 90;
}

export function isValidMapBounds(bounds: MapBounds | null | undefined): bounds is MapBounds {
  if (!bounds || !validLngLat(bounds.southWest) || !validLngLat(bounds.northEast)) return false;
  return bounds.southWest.latitude <= bounds.northEast.latitude;
}

export function placesWithinBounds(
  places: readonly DiscoveryPlace[],
  bounds: MapBounds,
): DiscoveryPlace[] {
  if (!isValidMapBounds(bounds)) return [];
  const { southWest, northEast } = bounds;
  const crossesDateline = southWest.longitude > northEast.longitude;
  return places.filter((place) => {
    if (!isValidGcj02Coordinate(place)) return false;
    const latitudeInside = place.latitude >= southWest.latitude && place.latitude <= northEast.latitude;
    const longitudeInside = crossesDateline
      ? place.longitude >= southWest.longitude || place.longitude <= northEast.longitude
      : place.longitude >= southWest.longitude && place.longitude <= northEast.longitude;
    return latitudeInside && longitudeInside;
  });
}

export function mapViewportIds(places: readonly DiscoveryPlace[], viewport: MapViewport | null | undefined) {
  return viewport && isValidMapBounds(viewport.bounds)
    ? placesWithinBounds(places, viewport.bounds).map((place) => place.id)
    : [];
}

export function sortedByStableIds(places: readonly DiscoveryPlace[]) {
  return [...places].sort((left, right) => left.id.localeCompare(right.id));
}

export function boundsForPlaces(places: readonly MapDiscoveryPlace[]): MapBounds | null {
  if (!places.length) return null;
  const longitudes = places.map((place) => place.longitude);
  const latitudes = places.map((place) => place.latitude);
  return {
    southWest: { longitude: Math.min(...longitudes), latitude: Math.min(...latitudes) },
    northEast: { longitude: Math.max(...longitudes), latitude: Math.max(...latitudes) },
  };
}
