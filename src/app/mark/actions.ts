"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sceneTags } from "@/lib/mark-options";
import { createClient } from "@/lib/supabase/server";

export type PoiLookup = { error?: string; found?: boolean };
export type MarkResult = { error?: string; success?: string };
export type PoiSearchCandidate = { poiId: string; name: string; address: string; city: string; district: string; latitude: number; longitude: number };
export type PoiSearchResult = { candidates: PoiSearchCandidate[]; error?: string };

const rating = z.coerce.number().min(1).max(5).refine((value) => Number.isInteger(value * 2), "评分必须以 0.5 为步进。");
const optionalRating = z.preprocess((value) => value === "" || value === null ? undefined : value, rating.optional());
const optionalDate = z.preprocess((value) => value === "" || value === null ? undefined : value, z.string().date().optional());
const optionalRevisit = z.preprocess((value) => value === "" || value === null ? undefined : value, z.enum(["yes", "maybe", "no"]).optional());
const sceneTagSlugs = sceneTags.map(([slug]) => slug) as [string, ...string[]];

async function getActiveGroupId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, error: "请先登录。" as const };
  const { data: memberships } = await supabase.from("group_members").select("group_id").eq("user_id", user.id).eq("status", "active").limit(1);
  const groupId = memberships?.[0]?.group_id;
  return groupId ? { supabase, groupId, userId: user.id } : { supabase, error: "你尚未加入共同地图。" as const };
}

export async function searchAmapPoiTips(keyword: string): Promise<PoiSearchResult> {
  const parsedKeyword = z.string().trim().min(2).max(80).safeParse(keyword);
  if (!parsedKeyword.success) return { candidates: [], error: "请输入 2 至 80 个字符的地点名称。" };
  if (!process.env.AMAP_WEBSERVICE_KEY) return { candidates: [], error: "地点搜索服务尚未配置。" };

  const activeGroup = await getActiveGroupId();
  if ("error" in activeGroup) return { candidates: [], error: activeGroup.error };

  const upstream = new URL("https://restapi.amap.com/v3/assistant/inputtips");
  upstream.searchParams.set("key", process.env.AMAP_WEBSERVICE_KEY);
  upstream.searchParams.set("keywords", parsedKeyword.data);
  upstream.searchParams.set("city", "全国");
  upstream.searchParams.set("datatype", "all");

  try {
    const response = await fetch(upstream, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    const payload = await response.json() as { status?: string; info?: string; infocode?: string; tips?: Array<{ id?: string; name?: string; address?: string; district?: string; location?: string }> };
    if (!response.ok || payload.status !== "1") return { candidates: [], error: `${payload.info ?? "高德地点搜索失败。"}${payload.infocode ? `（${payload.infocode}）` : ""}` };
    const candidates = (payload.tips ?? []).flatMap((tip) => {
      const [longitude, latitude] = (tip.location ?? "").split(",").map(Number);
      return tip.id && tip.name && Number.isFinite(latitude) && Number.isFinite(longitude)
        ? [{ poiId: tip.id, name: tip.name, address: tip.address ?? "", city: "", district: tip.district ?? "", latitude, longitude }]
        : [];
    }).slice(0, 10);
    return { candidates };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("AMap POI search failed", { message });
    return { candidates: [], error: "高德地点搜索服务暂时无法连接。" };
  }
}

export async function lookupAmapPoi(poiId: string): Promise<PoiLookup> {
  const parsedPoiId = z.string().trim().min(1).max(160).safeParse(poiId);
  if (!parsedPoiId.success) return { error: "地点信息无效。" };
  const activeGroup = await getActiveGroupId();
  if ("error" in activeGroup) return { error: activeGroup.error };
  const { data: places } = await activeGroup.supabase.from("places").select("id").eq("source_provider", "amap").eq("source_poi_id", parsedPoiId.data).limit(1);
  if (!places?.[0]) return { found: false };
  const { data: groupPlaces } = await activeGroup.supabase.from("group_places").select("id").eq("group_id", activeGroup.groupId).eq("place_id", places[0].id).neq("status", "archived").limit(1);
  return { found: Boolean(groupPlaces?.[0]) };
}

export async function savePlaceMark(_: MarkResult, formData: FormData): Promise<MarkResult> {
  const activeGroup = await getActiveGroupId();
  if ("error" in activeGroup) return { error: activeGroup.error };
  const fields = z.object({
    poi_id: z.string().trim().min(1).max(160), name: z.string().trim().min(1).max(160), branch_name: z.string().trim().max(100).optional(),
    address: z.string().trim().max(300).optional(), city: z.string().trim().max(80).optional(), district: z.string().trim().max(80).optional(),
    latitude: z.coerce.number().min(-90).max(90), longitude: z.coerce.number().min(-180).max(180), primary_category: z.enum(["restaurant", "cafe", "drinks", "bar", "bakery_dessert", "street_food", "other_food_drink"]),
    overall_rating: rating, quality_rating: optionalRating, value_rating: optionalRating, environment_rating: optionalRating, service_rating: optionalRating, uniqueness_rating: optionalRating,
    would_recommend: z.enum(["true", "false"]), would_revisit: optionalRevisit, first_visited_on: optionalDate, last_visited_on: optionalDate,
    short_review: z.string().trim().max(1000).optional(), recommended_items: z.string().max(400).optional(), price_per_person: z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().min(0).max(100000).optional()), attested: z.literal("on"),
    scene_tags: z.array(z.enum(sceneTagSlugs)).max(sceneTagSlugs.length),
  }).safeParse({ ...Object.fromEntries(formData), scene_tags: formData.getAll("scene_tags") });
  if (!fields.success) return { error: fields.error.issues[0]?.message ?? "请检查填写内容。" };
  const value = fields.data;
  const { data, error } = await activeGroup.supabase.rpc("save_place_mark", {
    p_group_id: activeGroup.groupId, p_source_provider: "amap", p_source_poi_id: value.poi_id, p_name: value.name, p_branch_name: value.branch_name ?? null,
    p_address: value.address ?? null, p_city: value.city ?? null, p_district: value.district ?? null, p_latitude: value.latitude, p_longitude: value.longitude,
    p_coordinate_system: "GCJ-02", p_primary_category: value.primary_category, p_overall_rating: value.overall_rating, p_would_recommend: value.would_recommend === "true",
    p_experience_attested: true, p_first_visited_on: value.first_visited_on || null, p_last_visited_on: value.last_visited_on || null, p_short_review: value.short_review ?? null,
    p_recommended_items: (value.recommended_items ?? "").split(/[,，]/).map((item) => item.trim()).filter(Boolean).slice(0, 12), p_price_per_person: value.price_per_person ?? null,
    p_quality_rating: value.quality_rating ?? null, p_value_rating: value.value_rating ?? null, p_environment_rating: value.environment_rating ?? null,
    p_service_rating: value.service_rating ?? null, p_uniqueness_rating: value.uniqueness_rating ?? null, p_would_revisit: value.would_revisit ?? null,
  });
  if (error || !data?.[0]?.mark_id) return { error: error?.message ?? "保存标记失败。" };
  const { error: sceneTagError } = await activeGroup.supabase.rpc("set_place_mark_scene_tags", {
    p_mark_id: data[0].mark_id,
    p_scene_tag_slugs: value.scene_tags,
  });
  if (sceneTagError) return { error: `真实标记已保存，但场景标签暂未保存：${sceneTagError.message}` };
  const photos = formData.getAll("photos").filter((value): value is File => value instanceof File && value.size > 0);
  const photoDimensions = formData.getAll("photo_dimensions").map((value) => typeof value === "string" ? /^([1-9]\d{0,4})x([1-9]\d{0,4})$/.exec(value) : null);
  if (photos.length > 9) return { error: "真实标记已保存，但单次最多上传 9 张照片。" };
  if (photos.length) {
    const { count, error: countError } = await activeGroup.supabase.from("photos").select("id", { count: "exact", head: true }).eq("place_mark_id", data[0].mark_id).is("deleted_at", null);
    if (countError) return { error: `真实标记已保存，但无法读取已有照片：${countError.message}` };
    if ((count ?? 0) + photos.length > 9) return { error: `真实标记已保存；该条标记已有 ${count ?? 0} 张照片，最多保留 9 张。` };
  }
  for (const [sortOrder, photo] of photos.entries()) {
    if (photo.type !== "image/webp" || photo.size > 1_572_864) return { error: "真实标记已保存，但照片格式或大小不符合要求。" };
    const dimensions = photoDimensions[sortOrder];
    const width = dimensions ? Number(dimensions[1]) : null;
    const height = dimensions ? Number(dimensions[2]) : null;
    const objectKey = `groups/${activeGroup.groupId}/users/${activeGroup.userId}/marks/${data[0].mark_id}/${crypto.randomUUID()}.webp`;
    const { error: uploadError } = await activeGroup.supabase.storage.from("place-photos").upload(objectKey, photo, { contentType: "image/webp", upsert: false });
    if (uploadError) return { error: `真实标记已保存，但第 ${sortOrder + 1} 张照片上传失败：${uploadError.message}` };
    const { error: photoError } = await activeGroup.supabase.from("photos").insert({
      group_id: activeGroup.groupId, group_place_id: data[0].group_place_id, user_id: activeGroup.userId,
      place_mark_id: data[0].mark_id, storage_provider: "supabase", object_key: objectKey, width, height, size_bytes: photo.size, sort_order: sortOrder,
    });
    if (photoError) {
      await activeGroup.supabase.storage.from("place-photos").remove([objectKey]);
      return { error: `真实标记已保存，但第 ${sortOrder + 1} 张照片登记失败：${photoError.message}` };
    }
  }
  revalidatePath("/");
  revalidatePath("/discover");
  revalidatePath(`/place/${data[0].group_place_id}`);
  return { success: "真实标记已保存，地点已加入共同地图。" };
}
