import type { MapPlace } from "@/components/map/amap-map";
import { priceRangeFor } from "@/lib/discovery-options";
import { sceneTagLabels } from "@/lib/mark-options";

export type DiscoverySort = "recommended" | "distance" | "recent";
export type PriceRange = "under_50" | "50_100" | "100_200" | "200_400" | "over_400";

export type SearchState = {
  cityId: string;
  query?: string;
  areaIds: string[];
  cuisineIds: string[];
  sceneTagIds: string[];
  priceRange?: PriceRange;
  minRating?: 4 | 4.5;
  wishlistOnly?: boolean;
  sort: DiscoverySort;
  selectedPlaceId?: string;
  quickFilter?: "coffee" | "date" | "rating";
};

export const defaultSearchState: SearchState = {
  cityId: "beijing",
  areaIds: [],
  cuisineIds: [],
  sceneTagIds: [],
  sort: "recommended",
};

const validPrices = new Set<PriceRange>(["under_50", "50_100", "100_200", "200_400", "over_400"]);
const validSorts = new Set<DiscoverySort>(["recommended", "distance", "recent"]);

function split(value: string | null) {
  return [...new Set((value ?? "").split(",").map((item) => item.trim()).filter(Boolean))].slice(0, 12);
}

export function searchStateFromParams(params: URLSearchParams): SearchState {
  const minRating = params.get("rating");
  const price = params.get("price");
  const sort = params.get("sort");
  const quick = params.get("quick");
  return {
    ...defaultSearchState,
    query: params.get("q")?.trim().slice(0, 80) || undefined,
    areaIds: split(params.get("area")),
    cuisineIds: split(params.get("cuisine")),
    sceneTagIds: split(params.get("scene")),
    priceRange: price && validPrices.has(price as PriceRange) ? price as PriceRange : undefined,
    minRating: minRating === "4.5" ? 4.5 : minRating === "4" ? 4 : undefined,
    sort: sort && validSorts.has(sort as DiscoverySort) ? sort as DiscoverySort : "recommended",
    selectedPlaceId: params.get("place")?.trim() || undefined,
    quickFilter: quick === "coffee" || quick === "date" || quick === "rating" ? quick : undefined,
  };
}

export function searchStateToParams(state: SearchState) {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.areaIds.length) params.set("area", state.areaIds.join(","));
  if (state.cuisineIds.length) params.set("cuisine", state.cuisineIds.join(","));
  if (state.sceneTagIds.length) params.set("scene", state.sceneTagIds.join(","));
  if (state.priceRange) params.set("price", state.priceRange);
  if (state.minRating) params.set("rating", String(state.minRating));
  if (state.sort !== "recommended") params.set("sort", state.sort);
  if (state.selectedPlaceId) params.set("place", state.selectedPlaceId);
  if (state.quickFilter) params.set("quick", state.quickFilter);
  return params;
}

export function hasActiveSearch(state: SearchState) {
  return Boolean(state.query || state.areaIds.length || state.cuisineIds.length || state.sceneTagIds.length || state.priceRange || state.minRating || state.quickFilter);
}

function markedAt(place: MapPlace) {
  return place.lastMarkedAt ? new Date(place.lastMarkedAt).getTime() : 0;
}

export function filterDiscoveryPlaces(places: MapPlace[], state: SearchState, cuisineLabels: Record<string, string>) {
  const needle = state.query?.toLocaleLowerCase("zh-CN") ?? "";
  return places.filter((place) => {
    if (state.quickFilter === "coffee" && place.category !== "cafe" && !place.cuisineSlugs?.includes("coffee_tea")) return false;
    if (state.quickFilter === "date" && !place.sceneTags.includes("date")) return false;
    if (state.quickFilter === "rating" && place.averageRating < 4) return false;
    if (state.areaIds.length && !state.areaIds.some((id) => place.geoEntityIds?.includes(id))) return false;
    if (state.cuisineIds.length && !state.cuisineIds.some((id) => place.cuisineSlugs?.includes(id))) return false;
    if (state.sceneTagIds.length && !state.sceneTagIds.some((id) => place.sceneTags.includes(id))) return false;
    if (state.priceRange && priceRangeFor(place.pricePerPerson) !== state.priceRange) return false;
    if (state.minRating && place.averageRating < state.minRating) return false;
    if (!needle) return true;
    const searchable = [
      place.name, place.city, place.district, place.address, ...(place.geoLabels ?? []),
      ...(place.cuisineSlugs?.map((slug) => cuisineLabels[slug] ?? slug) ?? []),
      ...place.sceneTags.map((slug) => sceneTagLabels[slug] ?? slug), ...(place.recommendedItems ?? []), place.review,
    ].filter(Boolean).join(" ").toLocaleLowerCase("zh-CN");
    return searchable.includes(needle);
  }).sort((left, right) => {
    if (state.sort === "recent") return markedAt(right) - markedAt(left);
    // Location is intentionally not sorted here: exact user coordinates never
    // enter shared URLs. A future map adapter can provide an in-memory origin.
    return right.averageRating - left.averageRating || (right.recommendCount ?? 0) - (left.recommendCount ?? 0) || right.markCount - left.markCount || markedAt(right) - markedAt(left);
  });
}
