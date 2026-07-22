"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type PoiLookup = { error?: string; found?: boolean };
export type MarkResult = { error?: string; success?: string };

const rating = z.coerce.number().min(1).max(5).refine((value) => Number.isInteger(value * 2), "评分必须以 0.5 为步进。");
const optionalRating = z.preprocess((value) => value === "" || value === null ? undefined : value, rating.optional());
const optionalDate = z.preprocess((value) => value === "" || value === null ? undefined : value, z.string().date().optional());
const optionalRevisit = z.preprocess((value) => value === "" || value === null ? undefined : value, z.enum(["yes", "maybe", "no"]).optional());

async function getActiveGroupId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, error: "请先登录。" as const };
  const { data: memberships } = await supabase.from("group_members").select("group_id").eq("user_id", user.id).eq("status", "active").limit(1);
  const groupId = memberships?.[0]?.group_id;
  return groupId ? { supabase, groupId } : { supabase, error: "你尚未加入共同地图。" as const };
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
  }).safeParse(Object.fromEntries(formData));
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
  revalidatePath("/");
  return { success: "真实标记已保存，地点已加入共同地图。" };
}
