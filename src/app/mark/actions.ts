"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cuisineOptions } from "@/lib/discovery-options";
import { createClient } from "@/lib/supabase/server";

export type PoiLookup = { error?: string; found?: boolean };
export type MarkResult = { error?: string; success?: string };
export type VisitResult = { error?: string; success?: string; warning?: string };

const cuisineSlugs = cuisineOptions.map(([slug]) => slug) as [string, ...string[]];

function validationMessage(issues: ReadonlyArray<{ path: readonly unknown[]; code: string }>, fallback: string) {
  const issue = issues[0];
  const field = String(issue?.path[0] ?? "");
  if (field === "opinion_tags" || field === "tags") {
    return issue?.code === "too_small" ? "至少选择一项“好在哪儿”。" : "“好在哪儿”最多选择 4 项。";
  }
  if (field === "strength") return "请选择推荐强度。";
  if (field === "visited_on") return "请选择到访日期。";
  if (field === "attested") return "请确认你亲自去过并愿意推荐。";
  if (field === "primary_category") return "请选择地点类型。";
  if (field === "cuisine_slug") return "请选择主菜系。";
  return fallback;
}

async function getActiveGroupId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, error: "请先登录。" as const };
  const { data: memberships } = await supabase.from("group_members").select("group_id").eq("user_id", user.id).eq("status", "active").limit(1);
  const groupId = memberships?.[0]?.group_id;
  return groupId ? { supabase, groupId, userId: user.id } : { supabase, error: "你尚未加入共同地图。" as const };
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
  try {
    const activeGroup = await getActiveGroupId();
  if ("error" in activeGroup) return { error: activeGroup.error };
  const fields = z.object({
    poi_id: z.string().trim().min(1).max(160), name: z.string().trim().min(1).max(160), branch_name: z.string().trim().max(100).optional(),
    address: z.string().trim().max(300).optional(), city: z.string().trim().max(80).optional(), district: z.string().trim().max(80).optional(),
    latitude: z.coerce.number().min(-90).max(90), longitude: z.coerce.number().min(-180).max(180), primary_category: z.enum(["restaurant", "cafe", "drinks", "bar", "bakery_dessert", "other_food_drink"]),
    strength: z.coerce.number().int().min(1).max(3), opinion_tags: z.array(z.enum(["tasty", "comfortable", "good_for_chat", "good_value"])).min(1).max(4), visited_on: z.string().date(),
    note: z.string().trim().max(1000).optional(), dishes: z.string().max(400).optional(), anonymous: z.literal("on").optional(), attested: z.literal("on"),
    cuisine_slug: z.enum(cuisineSlugs),
  }).safeParse({ ...Object.fromEntries(formData), opinion_tags: formData.getAll("opinion_tags") });
  if (!fields.success) return { error: validationMessage(fields.error.issues, "请检查填写内容。") };
  const value = fields.data;
  const photos = formData.getAll("photos").filter((item): item is File => item instanceof File && item.size > 0);
  const photoDimensions = formData.getAll("photo_dimensions").map((item) => typeof item === "string" ? /^([1-9]\d{0,4})x([1-9]\d{0,4})$/.exec(item) : null);
  if (photos.length > 9) return { error: "单次最多上传 9 张照片。" };
  if (photos.some((photo) => photo.type !== "image/webp" || photo.size > 1_572_864)) return { error: "照片需要是 1.5MB 以内的 WebP 图片。" };
  const items = (value.dishes ?? "").split(/[,，]/).map((item) => item.trim()).filter(Boolean).slice(0, 12);
  const { data, error } = await activeGroup.supabase.rpc("save_candidate_promotion_mark", {
    p_group_id: activeGroup.groupId, p_source_provider: "amap", p_source_poi_id: value.poi_id, p_name: value.name, p_branch_name: value.branch_name ?? null,
    p_address: value.address ?? null, p_city: value.city ?? null, p_district: value.district ?? null, p_latitude: value.latitude, p_longitude: value.longitude,
    p_coordinate_system: "GCJ-02", p_primary_category: value.primary_category, p_overall_rating: [3, 4, 5][value.strength - 1], p_would_recommend: true,
    p_experience_attested: true, p_visited_on: value.visited_on, p_short_review: value.note ?? null,
    p_recommended_items: items, p_cuisine_slugs: [value.cuisine_slug], p_strength: value.strength,
    p_tags: value.opinion_tags, p_is_anonymous: value.anonymous === "on",
  });
  if (error || !data?.[0]?.mark_id) return { error: error?.message ?? "保存标记失败。" };
  const visitRecordId = data[0].visit_record_id as string;
  if (photos.length) {
    const { count, error: countError } = await activeGroup.supabase.from("photos").select("id", { count: "exact", head: true }).eq("visit_record_id", visitRecordId).is("deleted_at", null);
    if (countError) return { error: `真实标记已保存，但无法读取已有照片：${countError.message}` };
    if ((count ?? 0) + photos.length > 9) return { error: `这顿饭已保存；该条记录已有 ${count ?? 0} 张照片，最多保留 9 张。` };
  }
  for (const [sortOrder, photo] of photos.entries()) {
    const dimensions = photoDimensions[sortOrder];
    const width = dimensions ? Number(dimensions[1]) : null;
    const height = dimensions ? Number(dimensions[2]) : null;
    const objectKey = `groups/${activeGroup.groupId}/users/${activeGroup.userId}/visits/${visitRecordId}/${crypto.randomUUID()}.webp`;
    const { error: uploadError } = await activeGroup.supabase.storage.from("place-photos").upload(objectKey, photo, { contentType: "image/webp", upsert: false });
    if (uploadError) return { error: `真实标记已保存，但第 ${sortOrder + 1} 张照片上传失败：${uploadError.message}` };
    const { error: photoError } = await activeGroup.supabase.from("photos").insert({
      group_id: activeGroup.groupId, group_place_id: data[0].group_place_id, user_id: activeGroup.userId,
      visit_record_id: visitRecordId, storage_provider: "supabase", object_key: objectKey, width, height, size_bytes: photo.size, sort_order: sortOrder,
    });
    if (photoError) {
      await activeGroup.supabase.storage.from("place-photos").remove([objectKey]);
      return { error: `真实标记已保存，但第 ${sortOrder + 1} 张照片登记失败：${photoError.message}` };
    }
  }
  const { error: discoveryError } = await activeGroup.supabase.rpc("refresh_group_place_discovery_metadata", { p_group_place_id: data[0].group_place_id });
  if (discoveryError) return { error: `真实标记已保存，但检索信息待后台补充：${discoveryError.message}` };
  // Best-effort, provider-owned display cache. A failed lookup must never roll
  // back a valid meal record; the throttled discovery backfill will retry it.
  await activeGroup.supabase.functions.invoke("amap-poi-search", {
    body: { operation: "business_area_backfill", groupPlaceId: data[0].group_place_id },
  }).catch(() => undefined);
  revalidatePath("/");
  revalidatePath("/try");
  revalidatePath(`/place/${data[0].group_place_id}`);
    return { success: "第一顿已记下，地点已加入共同地图。" };
  } catch (error) {
    console.error("savePlaceMark failed", error);
    return { error: "保存失败，请检查网络后重试。" };
  }
}

export async function recordPlaceVisit(_: VisitResult, formData: FormData): Promise<VisitResult> {
  try {
    const fields = z.object({
    group_place_id: z.string().uuid(),
    visited_on: z.string().date(),
    opinion_changed: z.enum(["true", "false"]),
    strength: z.preprocess((value) => value === "" || value === null ? undefined : value, z.coerce.number().int().min(1).max(3).optional()),
    tags: z.array(z.enum(["tasty", "comfortable", "good_for_chat", "good_value"])).max(4),
    note: z.string().trim().max(1000).optional(),
    dishes: z.string().max(400).optional(),
    anonymous: z.literal("on").optional(),
  }).safeParse({ ...Object.fromEntries(formData), tags: formData.getAll("tags") });
  if (!fields.success) return { error: validationMessage(fields.error.issues, "请检查这顿饭的内容。") };

  const value = fields.data;
  const photos = formData.getAll("photos").filter((item): item is File => item instanceof File && item.size > 0);
  const photoDimensions = formData.getAll("photo_dimensions").map((item) => typeof item === "string" ? /^([1-9]\d{0,4})x([1-9]\d{0,4})$/.exec(item) : null);
  if (photos.length > 9) return { error: "单次最多上传 9 张照片。" };
  if (photos.some((photo) => photo.type !== "image/webp" || photo.size > 1_572_864)) return { error: "照片需要是 1.5MB 以内的 WebP 图片。" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_place_visit", {
    p_group_place_id: value.group_place_id,
    p_visited_on: value.visited_on,
    p_opinion_changed: value.opinion_changed === "true",
    p_strength: value.strength ?? null,
    p_tags: value.tags,
    p_note: value.note ?? null,
    p_dishes: (value.dishes ?? "").split(/[,，]/).map((dish) => dish.trim()).filter(Boolean).slice(0, 12),
    p_is_anonymous: value.anonymous === "on",
  });
  if (error || !data?.[0]?.visit_record_id) return { error: error?.message ?? "这顿饭暂时没有保存成功。" };
  const visitRecordId = data[0].visit_record_id as string;
  if (photos.length) {
    const [{ data: groupPlace }, { data: { user } }] = await Promise.all([
      supabase.from("group_places").select("group_id").eq("id", value.group_place_id).maybeSingle(),
      supabase.auth.getUser(),
    ]);
    if (!groupPlace || !user) return { success: "这顿饭已记下，地点时间线也更新了。", warning: "照片暂未上传：无法确认上传权限。" };
    for (const [sortOrder, photo] of photos.entries()) {
      const dimensions = photoDimensions[sortOrder];
      const objectKey = `groups/${groupPlace.group_id}/users/${user.id}/visits/${visitRecordId}/${crypto.randomUUID()}.webp`;
      const { error: uploadError } = await supabase.storage.from("place-photos").upload(objectKey, photo, { contentType: "image/webp", upsert: false });
      if (uploadError) return { success: "这顿饭已记下，地点时间线也更新了。", warning: `第 ${sortOrder + 1} 张照片未上传：${uploadError.message}` };
      const { error: photoError } = await supabase.from("photos").insert({
        group_id: groupPlace.group_id,
        group_place_id: value.group_place_id,
        user_id: user.id,
        visit_record_id: visitRecordId,
        storage_provider: "supabase",
        object_key: objectKey,
        width: dimensions ? Number(dimensions[1]) : null,
        height: dimensions ? Number(dimensions[2]) : null,
        size_bytes: photo.size,
        sort_order: sortOrder,
      });
      if (photoError) {
        await supabase.storage.from("place-photos").remove([objectKey]);
        return { success: "这顿饭已记下，地点时间线也更新了。", warning: `第 ${sortOrder + 1} 张照片未登记：${photoError.message}` };
      }
    }
  }
  revalidatePath("/");
  revalidatePath("/activity");
  revalidatePath(`/place/${value.group_place_id}`);
    return { success: "这顿饭已记下，地点时间线也更新了。" };
  } catch (error) {
    console.error("recordPlaceVisit failed", error);
    return { error: "保存失败，请检查网络后重试。" };
  }
}
