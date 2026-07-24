import type { MapPlace } from "@/components/map/amap-map";
import type { GeoOption } from "@/components/map/map-browser";

type SupabaseLike = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;
type MarkRow = { id: string; group_place_id: string; price_per_person: number | null; recommended_items: string[] | null; short_review: string | null; updated_at: string };
type PhotoRow = { id: string; group_place_id: string; object_key: string; sort_order: number };

export async function getActiveDiscoveryGroup(supabase: SupabaseLike) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("group_members").select("group_id").eq("user_id", user.id).eq("status", "active").limit(1);
  return data?.[0]?.group_id ?? null;
}

/** The single server-side read model used by the homepage and versioned API. */
export async function loadDiscoveryData(supabase: SupabaseLike, groupId: string) {
  const { data: groupPlaces, error: groupPlacesError } = await supabase.from("group_places").select("id, place_id, primary_category").eq("group_id", groupId).eq("status", "active").limit(100);
  if (groupPlacesError || !groupPlaces?.length) return { places: [] as MapPlace[], geoOptions: [] as GeoOption[] };
  const groupPlaceIds = groupPlaces.map((place) => place.id);
  const placeIds = groupPlaces.map((place) => place.place_id);
  const [{ data: rawPlaces }, { data: stats }, { data: marks }, { data: cuisines }, { data: photos }] = await Promise.all([
    supabase.from("places").select("id, name, address, city, district, latitude, longitude").in("id", placeIds),
    supabase.from("group_place_stats").select("group_place_id, average_rating, mark_count, recommend_count").in("group_place_id", groupPlaceIds),
    supabase.from("place_marks").select("id, group_place_id, price_per_person, recommended_items, short_review, updated_at").in("group_place_id", groupPlaceIds).is("deleted_at", null).order("updated_at", { ascending: false }),
    supabase.from("place_cuisines").select("group_place_id, cuisine_slug").in("group_place_id", groupPlaceIds),
    supabase.from("photos").select("id, group_place_id, object_key, sort_order").in("group_place_id", groupPlaceIds).is("deleted_at", null).order("sort_order"),
  ]);
  const markRows = (marks ?? []) as MarkRow[];
  const markIds = markRows.map((mark) => mark.id);
  const { data: markSceneTags } = markIds.length ? await supabase.from("place_mark_scene_tags").select("place_mark_id, scene_tag_slug").in("place_mark_id", markIds) : { data: [] };
  const placeById = new Map((rawPlaces ?? []).map((place) => [place.id, place]));
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
  const photosByGroupPlace = new Map<string, PhotoRow>();
  ((photos ?? []) as PhotoRow[]).forEach((photo) => { if (!photosByGroupPlace.has(photo.group_place_id)) photosByGroupPlace.set(photo.group_place_id, photo); });
  const coverRows = [...photosByGroupPlace.values()];
  const { data: signedPhotoData } = coverRows.length ? await supabase.storage.from("place-photos").createSignedUrls(coverRows.map((photo) => photo.object_key), 60 * 15) : { data: [] };
  const signedByObjectKey = new Map((signedPhotoData ?? []).map((photo) => [photo.path, photo.signedUrl]));
  const places: MapPlace[] = groupPlaces.flatMap((groupPlace) => {
    const place = placeById.get(groupPlace.place_id); const stat = statByGroupPlace.get(groupPlace.id); const mark = latestMark.get(groupPlace.id);
    if (!place || !stat || stat.mark_count < 1 || stat.average_rating === null) return [];
    const cover = photosByGroupPlace.get(groupPlace.id);
    return [{ id: groupPlace.id, name: place.name, category: groupPlace.primary_category, latitude: Number(place.latitude), longitude: Number(place.longitude), averageRating: Number(stat.average_rating), markCount: Number(stat.mark_count), recommendCount: Number(stat.recommend_count ?? 0), sceneTags: scenesByGroupPlace.get(groupPlace.id) ?? [], city: place.city ?? undefined, district: place.district ?? undefined, address: place.address ?? undefined, cuisineSlugs: cuisineByGroupPlace.get(groupPlace.id) ?? [], pricePerPerson: mark?.price_per_person === null || mark?.price_per_person === undefined ? null : Number(mark.price_per_person), recommendedItems: mark?.recommended_items ?? [], review: mark?.short_review ?? null, lastMarkedAt: mark?.updated_at ?? null, coverPhotoUrl: cover ? signedByObjectKey.get(cover.object_key) ?? null : null }];
  });
  return { places, geoOptions: [] as GeoOption[] };
}
