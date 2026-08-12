import type { MapPlace } from "@/components/map/amap-map";
import type { GeoOption } from "@/components/map/map-browser";
import type { ActiveGroupContext } from "@/lib/auth/active-group-context";
import { getActiveGroupContext } from "@/lib/auth/active-group-context";
import { measureServerOperation, recordServerMetric } from "@/lib/performance/server";

type SupabaseLike = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;
type MarkRow = { id: string; group_place_id: string; price_per_person: number | null; recommended_items: string[] | null; short_review: string | null; updated_at: string };
type PhotoRow = { id: string; group_place_id: string; thumbnail_object_key: string | null; thumbnail_width: number | null; thumbnail_height: number | null; sort_order: number };
type OpinionSummary = { group_place_id: string; bowl_strength: number; friend_count: number; tasty_count: number; comfortable_count: number; good_for_chat_count: number; good_value_count: number; last_visited_at: string | null };

export type DiscoveryRequestContext = ActiveGroupContext;

export const discoveryReadLimits = {
  places: 20,
  marks: 400,
  cuisines: 400,
  photos: 40,
  sceneTags: 400,
  businessAreas: 120,
  coverPlaces: 12,
} as const;

function stableCoverIndex(groupPlaceId: string, count: number) {
  if (count <= 1) return 0;
  const seed = `${groupPlaceId}-${new Date().toISOString().slice(0, 10)}`;
  return Array.from(seed).reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 7) % count;
}

/** Reads the authenticated user and active membership exactly once per request. */
export async function getDiscoveryRequestContext(supabase: SupabaseLike, route = "/") {
  return getActiveGroupContext(supabase, route);
}

/**
 * The homepage read model. Shared group data and the user-specific wishlist
 * are read in one explicit phase, with bounded result sets and only the first
 * visible cards receiving signed cover URLs.
 */
export async function loadDiscoveryData(supabase: SupabaseLike, context: DiscoveryRequestContext) {
  const route = "/";
  const startedAt = performance.now();
  const readModelStartedAt = performance.now();
  const { data: readModelRows, error: readModelError } = await supabase.rpc("list_discovery_cards_v2", { p_limit: discoveryReadLimits.places, p_before_created_at: null, p_before_id: null });
  if (!readModelError && Array.isArray(readModelRows)) {
    const rows = readModelRows as Array<Record<string, unknown>>;
    const keys = rows.map((row) => typeof row.thumbnail_object_key === "string" ? row.thumbnail_object_key : null).filter((key): key is string => Boolean(key));
    const signedResult = keys.length ? await measureServerOperation(route, "discovery.photo_sign_batch", () => supabase.storage.from("place-photos").createSignedUrls(keys, 60 * 15)) : { data: [] };
    const signedByPath = new Map((signedResult.data ?? []).map((item) => [item.path, item.signedUrl]));
    const places: MapPlace[] = rows.map((row) => ({
      id: String(row.group_place_id), name: String(row.place_name ?? ""), category: String(row.primary_category ?? "other_food_drink"),
      latitude: Number(row.latitude), longitude: Number(row.longitude), averageRating: Number(row.average_rating ?? 0), markCount: Number(row.mark_count ?? 0), recommendCount: Number(row.recommend_count ?? 0),
      sceneTags: [], city: typeof row.city === "string" ? row.city : undefined, district: typeof row.district === "string" ? row.district : undefined, address: typeof row.address === "string" ? row.address : undefined,
      cuisineSlugs: Array.isArray(row.cuisine_slugs) ? row.cuisine_slugs.map(String) : [], pricePerPerson: row.price_per_person === null || row.price_per_person === undefined ? null : Number(row.price_per_person),
      recommendedItems: Array.isArray(row.recommended_items) ? row.recommended_items.map(String) : [], review: typeof row.short_review === "string" ? row.short_review : null, lastMarkedAt: typeof row.last_marked_at === "string" ? row.last_marked_at : null,
      coverPhotoUrl: typeof row.thumbnail_object_key === "string" ? signedByPath.get(row.thumbnail_object_key) ?? null : null, coverPhotoId: typeof row.cover_photo_id === "string" ? row.cover_photo_id : null,
      coverPhotoWidth: row.thumbnail_width === null || row.thumbnail_width === undefined ? null : Number(row.thumbnail_width), coverPhotoHeight: row.thumbnail_height === null || row.thumbnail_height === undefined ? null : Number(row.thumbnail_height),
      savedForLater: Boolean(row.saved_for_later), bowlStrength: row.bowl_strength === null || row.bowl_strength === undefined ? null : Number(row.bowl_strength),
      goodTagCounts: { tasty: Number(row.tasty_count ?? 0), comfortable: Number(row.comfortable_count ?? 0), good_for_chat: Number(row.good_for_chat_count ?? 0), good_value: Number(row.good_value_count ?? 0) },
    }));
    recordServerMetric("discovery.core_read_model", { route, durationMs: performance.now() - readModelStartedAt, outcome: "ok", count: places.length });
    recordServerMetric("discovery.total", { route, durationMs: performance.now() - startedAt, outcome: places.length ? "ok" : "empty", count: places.length });
    return { places, geoOptions: [] as GeoOption[] };
  }
  recordServerMetric("discovery.core_read_model", { route, durationMs: performance.now() - readModelStartedAt, outcome: "error" });
  const groupPlacesResult = await measureServerOperation(route, "discovery.group_places", () => supabase.from("group_places").select("id, place_id, primary_category, created_at").eq("group_id", context.groupId).eq("status", "active").order("created_at", { ascending: false }).limit(discoveryReadLimits.places));
  const { data: groupPlaces, error: groupPlacesError } = groupPlacesResult;
  if (groupPlacesError || !groupPlaces?.length) {
    recordServerMetric("discovery.total", { route, durationMs: performance.now() - startedAt, outcome: groupPlacesError ? "error" : "empty", count: 0 });
    return { places: [] as MapPlace[], geoOptions: [] as GeoOption[] };
  }

  const groupPlaceIds = groupPlaces.map((place) => place.id);
  const placeIds = groupPlaces.map((place) => place.place_id);
  const coverPlaceIds = groupPlaceIds.slice(0, discoveryReadLimits.coverPlaces);
  const parallelStartedAt = performance.now();
  const [rawPlacesResult, statsResult, marksResult, cuisinesResult, photosResult, wishlistResult, opinionSummariesResult, businessAreaCachesResult] = await Promise.all([
    measureServerOperation(route, "discovery.places", () => supabase.from("places").select("id, name, address, city, district, latitude, longitude").in("id", placeIds).limit(discoveryReadLimits.places)),
    measureServerOperation(route, "discovery.stats", () => supabase.from("group_place_stats").select("group_place_id, average_rating, mark_count, recommend_count").in("group_place_id", groupPlaceIds).limit(discoveryReadLimits.places)),
    measureServerOperation(route, "discovery.marks", () => supabase.from("place_marks").select("id, group_place_id, price_per_person, recommended_items, short_review, updated_at").in("group_place_id", groupPlaceIds).is("deleted_at", null).order("updated_at", { ascending: false }).limit(discoveryReadLimits.marks)),
    measureServerOperation(route, "discovery.cuisines", () => supabase.from("place_cuisines").select("group_place_id, cuisine_slug").in("group_place_id", groupPlaceIds).limit(discoveryReadLimits.cuisines)),
    measureServerOperation(route, "discovery.photo_metadata", () => supabase.from("photos").select("id, group_place_id, thumbnail_object_key, thumbnail_width, thumbnail_height, sort_order").in("group_place_id", coverPlaceIds).is("deleted_at", null).is("hidden_at", null).not("thumbnail_object_key", "is", null).order("sort_order").limit(discoveryReadLimits.photos)),
    measureServerOperation(route, "discovery.wishlist", () => supabase.from("wishlist_items").select("group_place_id").eq("user_id", context.userId).in("group_place_id", groupPlaceIds).limit(discoveryReadLimits.places)),
    measureServerOperation(route, "discovery.opinion_summary", () => supabase.rpc("list_group_place_opinion_summaries", { p_group_id: context.groupId }).limit(discoveryReadLimits.places)),
    measureServerOperation(route, "discovery.business_area", () => supabase.from("place_amap_business_area_cache").select("place_id, business_area_name, adcode").in("place_id", placeIds).eq("status", "success").limit(discoveryReadLimits.businessAreas)),
  ]);
  recordServerMetric("discovery.parallel_queries", { route, durationMs: performance.now() - parallelStartedAt, outcome: "ok", count: groupPlaceIds.length });

  const { data: rawPlaces } = rawPlacesResult;
  const { data: stats } = statsResult;
  const { data: marks } = marksResult;
  const { data: cuisines } = cuisinesResult;
  const { data: photos } = photosResult;
  const { data: wishlist } = wishlistResult;
  const { data: opinionSummaries } = opinionSummariesResult;
  const { data: businessAreaCaches } = businessAreaCachesResult;
  const markRows = (marks ?? []) as MarkRow[];
  const markIds = markRows.map((mark) => mark.id);
  const markSceneTagsResult = markIds.length
    ? await measureServerOperation(route, "discovery.scene_tags", () => supabase.from("place_mark_scene_tags").select("place_mark_id, scene_tag_slug").in("place_mark_id", markIds).limit(discoveryReadLimits.sceneTags))
    : { data: [] };
  const { data: markSceneTags } = markSceneTagsResult;

  const placeById = new Map((rawPlaces ?? []).map((place) => [place.id, place]));
  const businessAreaByPlaceId = new Map((businessAreaCaches ?? []).map((cache) => [cache.place_id, cache]));
  const statByGroupPlace = new Map((stats ?? []).map((stat) => [stat.group_place_id, stat]));
  const latestMark = new Map<string, MarkRow>();
  markRows.forEach((mark) => { if (!latestMark.has(mark.group_place_id)) latestMark.set(mark.group_place_id, mark); });
  const groupPlaceByMark = new Map(markRows.map((mark) => [mark.id, mark.group_place_id]));
  const scenesByGroupPlace = new Map<string, string[]>();
  (markSceneTags ?? []).forEach((tag) => {
    const groupPlaceId = groupPlaceByMark.get(tag.place_mark_id);
    if (groupPlaceId) scenesByGroupPlace.set(groupPlaceId, [...new Set([...(scenesByGroupPlace.get(groupPlaceId) ?? []), tag.scene_tag_slug])]);
  });
  const cuisineByGroupPlace = new Map<string, string[]>();
  (cuisines ?? []).forEach((cuisine) => cuisineByGroupPlace.set(cuisine.group_place_id, [...(cuisineByGroupPlace.get(cuisine.group_place_id) ?? []), cuisine.cuisine_slug]));
  const photosByGroupPlace = new Map<string, PhotoRow[]>();
  ((photos ?? []) as PhotoRow[]).forEach((photo) => photosByGroupPlace.set(photo.group_place_id, [...(photosByGroupPlace.get(photo.group_place_id) ?? []), photo]));
  const coverRows = coverPlaceIds.flatMap((groupPlaceId) => {
    const groupPhotos = photosByGroupPlace.get(groupPlaceId) ?? [];
    const cover = groupPhotos[stableCoverIndex(groupPlaceId, groupPhotos.length)];
    return cover?.thumbnail_object_key ? [cover] : [];
  });
  const signedPhotoResult = coverRows.length
    ? await measureServerOperation(route, "discovery.photo_sign_batch", () => supabase.storage.from("place-photos").createSignedUrls(coverRows.map((photo) => photo.thumbnail_object_key as string), 60 * 15))
    : { data: [] };
  const { data: signedPhotoData } = signedPhotoResult;
  const signedByObjectKey = new Map((signedPhotoData ?? []).map((photo) => [photo.path, photo.signedUrl]));
  const coverByGroupPlace = new Map(coverRows.map((photo) => [photo.group_place_id, photo]));
  const wishlistIds = new Set((wishlist ?? []).map((item) => item.group_place_id));
  const opinionSummaryByGroupPlace = new Map(((opinionSummaries ?? []) as OpinionSummary[]).map((summary) => [summary.group_place_id, summary]));
  const places: MapPlace[] = groupPlaces.flatMap((groupPlace) => {
    const place = placeById.get(groupPlace.place_id); const stat = statByGroupPlace.get(groupPlace.id); const mark = latestMark.get(groupPlace.id); const opinion = opinionSummaryByGroupPlace.get(groupPlace.id);
    if (!place || !stat) return [];
    const cover = coverByGroupPlace.get(groupPlace.id);
    const goodTagCounts: Record<string, number> = opinion ? { tasty: Number(opinion.tasty_count), comfortable: Number(opinion.comfortable_count), good_for_chat: Number(opinion.good_for_chat_count), good_value: Number(opinion.good_value_count) } : {};
    const businessArea = businessAreaByPlaceId.get(place.id);
    return [{ id: groupPlace.id, name: place.name, category: groupPlace.primary_category, latitude: Number(place.latitude), longitude: Number(place.longitude), averageRating: Number(stat.average_rating ?? 0), markCount: Number(opinion?.friend_count ?? stat.mark_count ?? 0), recommendCount: Number(opinion?.friend_count ?? stat.recommend_count ?? 0), sceneTags: scenesByGroupPlace.get(groupPlace.id) ?? [], city: place.city ?? undefined, district: place.district ?? undefined, businessAreaName: businessArea?.business_area_name ?? undefined, businessAreaAdcode: businessArea?.adcode ?? undefined, address: place.address ?? undefined, cuisineSlugs: cuisineByGroupPlace.get(groupPlace.id) ?? [], pricePerPerson: mark?.price_per_person === null || mark?.price_per_person === undefined ? null : Number(mark.price_per_person), recommendedItems: mark?.recommended_items ?? [], review: mark?.short_review ?? null, lastMarkedAt: opinion?.last_visited_at ?? mark?.updated_at ?? groupPlace.created_at, coverPhotoUrl: cover?.thumbnail_object_key ? signedByObjectKey.get(cover.thumbnail_object_key) ?? null : null, coverPhotoId: cover?.id ?? null, coverPhotoWidth: cover?.thumbnail_width ?? null, coverPhotoHeight: cover?.thumbnail_height ?? null, savedForLater: wishlistIds.has(groupPlace.id), bowlStrength: opinion?.bowl_strength ?? null, goodTagCounts }];
  });
  recordServerMetric("discovery.total", { route, durationMs: performance.now() - startedAt, outcome: "ok", count: places.length });
  return { places, geoOptions: [] as GeoOption[] };
}
