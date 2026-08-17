import type { MapDiscoveryPlace } from "@/lib/discovery/types";

export type MapPinData = {
  lnglat: [number, number];
  placeIndex: number;
  placeId: string;
  extData: { placeIndex: number; placeId: string };
};

export type MapPlaceReference = { placeId?: string; placeIndex?: number };

export function createMapPinData(places: readonly MapDiscoveryPlace[]): MapPinData[] {
  return places.map((place, placeIndex) => ({
    lnglat: [place.longitude, place.latitude],
    placeIndex,
    placeId: place.id,
    extData: { placeIndex, placeId: place.id },
  }));
}

function objectValue(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function integerValue(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

/** Reads only stable business references; names and coordinates are never keys. */
export function readMapPlaceReference(value: unknown, depth = 0): MapPlaceReference {
  if (depth > 3) return {};
  if (Array.isArray(value)) {
    for (const item of value) {
      const reference = readMapPlaceReference(item, depth + 1);
      if (reference.placeId || reference.placeIndex !== undefined) return reference;
    }
    return {};
  }
  const object = objectValue(value);
  if (!object) return {};
  const placeId = typeof object.placeId === "string" && object.placeId ? object.placeId : undefined;
  const placeIndex = integerValue(object.placeIndex);
  if (placeId || placeIndex !== undefined) return { placeId, placeIndex };
  for (const nested of [object.extData, object.data, object.properties, object.rawData]) {
    const reference = readMapPlaceReference(nested, depth + 1);
    if (reference.placeId || reference.placeIndex !== undefined) return reference;
  }
  return {};
}

export function mapCoordinateKey(longitude: number, latitude: number) {
  return `${longitude.toFixed(6)},${latitude.toFixed(6)}`;
}

export function buildMapCoordinateBuckets(places: readonly MapDiscoveryPlace[]) {
  const buckets = new Map<string, number[]>();
  places.forEach((place, index) => {
    const key = mapCoordinateKey(place.longitude, place.latitude);
    buckets.set(key, [...(buckets.get(key) ?? []), index]);
  });
  return buckets;
}

export function resolveMapPlaceIndex(
  value: unknown,
  places: readonly MapDiscoveryPlace[],
  coordinateBuckets: ReadonlyMap<string, number[]>,
  position?: { longitude: number; latitude: number } | null,
  usedIndices: ReadonlySet<number> = new Set(),
) {
  const reference = readMapPlaceReference(value);
  if (reference.placeId) {
    const index = places.findIndex((place) => place.id === reference.placeId);
    if (index >= 0) return index;
  }
  if (reference.placeIndex !== undefined && places[reference.placeIndex]) return reference.placeIndex;
  if (!position) return null;
  const candidates = (coordinateBuckets.get(mapCoordinateKey(position.longitude, position.latitude)) ?? []).filter((index) => !usedIndices.has(index));
  return candidates.length === 1 ? candidates[0] : null;
}
