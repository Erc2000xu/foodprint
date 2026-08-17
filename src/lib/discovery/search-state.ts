import type { BowlStrength, DiscoveryPlace } from "@/lib/discovery/types";
import { cuisineOptions, priceRangeFor } from "@/lib/discovery-options";
import { categoryOptions, sceneTagLabels, sceneTags } from "@/lib/mark-options";

export type DiscoverySort = "recommended" | "distance" | "recent";
export type PriceRange = "under_50" | "50_100" | "100_200" | "200_400" | "over_400";
export type DiscoveryLocationFilter = {
  id: string;
  name: string;
  kind: "district" | "business_district" | "metro_station";
  latitude?: number;
  longitude?: number;
};

export type SearchState = {
  cityId: string;
  query?: string;
  areaIds: string[];
  categoryIds: string[];
  cuisineIds: string[];
  sceneTagIds: string[];
  recommendationLevels: BowlStrength[];
  priceRange?: PriceRange;
  wishlistOnly?: boolean;
  sort: DiscoverySort;
  quickFilter?: "coffee" | "date";
  locationFilter?: DiscoveryLocationFilter;
};

export const defaultSearchState: SearchState = {
  cityId: "beijing",
  areaIds: [],
  categoryIds: [],
  cuisineIds: [],
  sceneTagIds: [],
  recommendationLevels: [],
  sort: "recommended",
};

const validPrices = new Set<PriceRange>(["under_50", "50_100", "100_200", "200_400", "over_400"]);
const validSorts = new Set<DiscoverySort>(["recommended", "distance", "recent"]);
const validLocationKinds = new Set<DiscoveryLocationFilter["kind"]>(["district", "business_district", "metro_station"]);
const validCategoryIds = new Set(categoryOptions.map(([id]) => id));
const validCuisineIds = new Set(cuisineOptions.map(([id]) => id));
const validSceneIds = new Set(sceneTags.map(([id]) => id));
const validRecommendationLevels = new Set<BowlStrength>([1, 2, 3]);

function split(value: string | null) {
  return [...new Set((value ?? "").split(",").map((item) => item.trim()).filter(Boolean))].slice(0, 12);
}

function splitAllowed<T extends string | number>(value: string | null, allowed: ReadonlySet<T>) {
  return split(value).flatMap((item) => {
    const candidate = typeof [...allowed][0] === "number" ? Number(item) : item;
    return allowed.has(candidate as T) ? [candidate as T] : [];
  }).slice(0, 12);
}

export function searchStateFromParams(params: URLSearchParams): SearchState {
  const price = params.get("price");
  const sort = params.get("sort");
  const quick = params.get("quick");
  const locationKind = params.get("locationKind");
  const locationName = params.get("locationName")?.trim().slice(0, 80);
  const locationId = params.get("locationId")?.trim().slice(0, 160);
  const locationLatitude = Number(params.get("locationLat"));
  const locationLongitude = Number(params.get("locationLng"));
  const hasCoordinates = Number.isFinite(locationLatitude) && Number.isFinite(locationLongitude)
    && Math.abs(locationLatitude) <= 90 && Math.abs(locationLongitude) <= 180;
  const locationFilter = locationKind && validLocationKinds.has(locationKind as DiscoveryLocationFilter["kind"]) && locationName && locationId
    ? {
        kind: locationKind as DiscoveryLocationFilter["kind"],
        name: locationName,
        id: locationId,
        ...(hasCoordinates ? { latitude: locationLatitude, longitude: locationLongitude } : {}),
      }
    : undefined;
  return {
    ...defaultSearchState,
    query: params.get("q")?.trim().slice(0, 80) || undefined,
    areaIds: split(params.get("area")),
    categoryIds: splitAllowed(params.get("category"), validCategoryIds),
    cuisineIds: splitAllowed(params.get("cuisine"), validCuisineIds),
    sceneTagIds: splitAllowed(params.get("scene"), validSceneIds),
    recommendationLevels: splitAllowed(params.get("level"), validRecommendationLevels),
    priceRange: price && validPrices.has(price as PriceRange) ? price as PriceRange : undefined,
    sort: sort && validSorts.has(sort as DiscoverySort) ? sort as DiscoverySort : "recommended",
    quickFilter: quick === "coffee" || quick === "date" ? quick : undefined,
    locationFilter,
  };
}

export function searchStateToParams(state: SearchState) {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.areaIds.length) params.set("area", state.areaIds.join(","));
  if (state.categoryIds.length) params.set("category", state.categoryIds.join(","));
  if (state.cuisineIds.length) params.set("cuisine", state.cuisineIds.join(","));
  if (state.sceneTagIds.length) params.set("scene", state.sceneTagIds.join(","));
  if (state.recommendationLevels.length) params.set("level", state.recommendationLevels.join(","));
  if (state.priceRange) params.set("price", state.priceRange);
  if (state.sort !== "recommended") params.set("sort", state.sort);
  if (state.quickFilter) params.set("quick", state.quickFilter);
  if (state.locationFilter) {
    params.set("locationKind", state.locationFilter.kind);
    params.set("locationName", state.locationFilter.name);
    params.set("locationId", state.locationFilter.id);
    if (Number.isFinite(state.locationFilter.latitude) && Number.isFinite(state.locationFilter.longitude)) {
      params.set("locationLat", String(state.locationFilter.latitude));
      params.set("locationLng", String(state.locationFilter.longitude));
    }
  }
  return params;
}

export function hasActiveSearch(state: SearchState) {
  return Boolean(state.query || state.areaIds.length || state.categoryIds.length || state.cuisineIds.length || state.sceneTagIds.length || state.recommendationLevels.length || state.priceRange || state.quickFilter || state.locationFilter);
}

function markedAt(place: Pick<DiscoveryPlace, "lastMarkedAt">) {
  return place.lastMarkedAt ? new Date(place.lastMarkedAt).getTime() : 0;
}

export function discoveryDistanceMeters(from: { latitude: number; longitude: number }, place: Pick<DiscoveryPlace, "latitude" | "longitude">) {
  if (place.latitude === null || place.longitude === null) return Number.POSITIVE_INFINITY;
  const radians = Math.PI / 180;
  const radius = 6_371_000;
  const latitudeDelta = (place.latitude - from.latitude) * radians;
  const longitudeDelta = (place.longitude - from.longitude) * radians;
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(from.latitude * radians) * Math.cos(place.latitude * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function matchesDiscoveryLocation(place: DiscoveryPlace, filter?: DiscoveryLocationFilter) {
  if (!filter) return true;
  if (filter.kind === "district") {
    const district = place.district?.trim() ?? "";
    return district === filter.name || district.endsWith(filter.name);
  }
  if (!Number.isFinite(filter.latitude) || !Number.isFinite(filter.longitude)) return false;
  const radius = filter.kind === "metro_station" ? 1_500 : 3_000;
  return discoveryDistanceMeters({ latitude: filter.latitude!, longitude: filter.longitude! }, place) <= radius;
}

export function filterDiscoveryPlaces(places: DiscoveryPlace[], state: SearchState, cuisineLabels: Record<string, string>) {
  const needle = state.query?.toLocaleLowerCase("zh-CN") ?? "";
  return places.filter((place) => {
    if (state.quickFilter === "coffee" && place.category !== "cafe" && !place.cuisineSlugs?.includes("coffee_tea")) return false;
    if (state.quickFilter === "date" && !place.sceneTags.includes("date")) return false;
    if (state.areaIds.length && !state.areaIds.some((id) => place.geoEntityIds?.includes(id))) return false;
    if (!matchesDiscoveryLocation(place, state.locationFilter)) return false;
    if (state.categoryIds.length && !state.categoryIds.includes(place.category)) return false;
    if (state.cuisineIds.length && !state.cuisineIds.some((id) => place.cuisineSlugs?.includes(id))) return false;
    if (state.sceneTagIds.length && !state.sceneTagIds.some((id) => place.sceneTags.includes(id))) return false;
    if (state.recommendationLevels.length && (place.bowlStrength === null || place.bowlStrength === undefined || !state.recommendationLevels.includes(place.bowlStrength))) return false;
    if (state.priceRange && priceRangeFor(place.pricePerPerson) !== state.priceRange) return false;
    if (!needle) return true;
    const searchable = [
      place.name, place.city, place.district, place.address, place.businessAreaName, ...(place.geoLabels ?? []),
      ...(place.cuisineSlugs?.map((slug) => cuisineLabels[slug] ?? slug) ?? []),
      ...place.sceneTags.map((slug) => sceneTagLabels[slug] ?? slug), ...(place.recommendedItems ?? []), place.review,
    ].filter(Boolean).join(" ").toLocaleLowerCase("zh-CN");
    return searchable.includes(needle);
  }).sort((left, right) => {
    if (state.sort === "recent") return markedAt(right) - markedAt(left) || left.id.localeCompare(right.id);
    // Location is intentionally not sorted here: exact user coordinates never
    // enter shared URLs. A future map adapter can provide an in-memory origin.
    return (right.bowlStrength ?? 0) - (left.bowlStrength ?? 0)
      || (right.recommendCount ?? 0) - (left.recommendCount ?? 0)
      || (right.markCount ?? 0) - (left.markCount ?? 0)
      || markedAt(right) - markedAt(left)
      || left.id.localeCompare(right.id);
  });
}
