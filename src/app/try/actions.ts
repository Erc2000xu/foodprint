"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { userFacingError } from "@/lib/user-facing-error";

export type CandidateResult = { error?: string; success?: string };

async function getActiveGroupId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, error: "请先登录后再继续。" as const };
  const { data: memberships } = await supabase.from("group_members").select("group_id").eq("user_id", user.id).eq("status", "active").limit(1);
  const groupId = memberships?.[0]?.group_id;
  return groupId ? { supabase, groupId } : { supabase, error: "你还没有加入共同地图。" as const };
}

const candidateFields = z.object({
  poi_id: z.string().trim().min(1).max(160),
  name: z.string().trim().min(1).max(160),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(80).optional(),
  district: z.string().trim().max(80).optional(),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  heard_from: z.string().trim().max(120).optional(),
  expectation: z.string().trim().max(280).optional(),
});

export async function createPlaceCandidate(_: CandidateResult, formData: FormData): Promise<CandidateResult> {
  const activeGroup = await getActiveGroupId();
  if ("error" in activeGroup) return { error: activeGroup.error };
  const fields = candidateFields.safeParse(Object.fromEntries(formData));
  if (!fields.success) return { error: fields.error.issues[0]?.message ?? "请检查地点信息。" };
  const value = fields.data;
  const { data, error } = await activeGroup.supabase.rpc("create_place_candidate", {
    p_group_id: activeGroup.groupId, p_source_poi_id: value.poi_id, p_name: value.name,
    p_address: value.address ?? null, p_city: value.city ?? null, p_district: value.district ?? null,
    p_latitude: value.latitude, p_longitude: value.longitude, p_heard_from: value.heard_from ?? null, p_expectation: value.expectation ?? null,
  });
  if (error) return { error: error.message.includes("already recommended") ? "这家已在发现中，无需再加入去试试。" : error.message.includes("cannot be added again") ? "这家暂时不能重复加入候选。" : userFacingError(error) };
  const { data: place } = await activeGroup.supabase.from("places").select("id").eq("source_provider", "amap").eq("source_poi_id", value.poi_id).maybeSingle();
  // AMap cache is display-only: its failure must never prevent a valid private
  // candidate from being saved. The edge function throttles repeated requests.
  if (place?.id) await activeGroup.supabase.functions.invoke("amap-poi-search", {
    body: { operation: "business_area_backfill", placeId: place.id },
  }).catch(() => undefined);
  revalidatePath("/try");
  return { success: data?.[0]?.created ? "已加入去试试。" : "这家已经在去试试列表中。" };
}

const candidateId = z.string().uuid();

export async function dismissPlaceCandidate(candidateIdValue: string, experienceAttested: boolean): Promise<CandidateResult> {
  const parsed = candidateId.safeParse(candidateIdValue);
  if (!parsed.success || !experienceAttested) return { error: experienceAttested ? "候选地点信息无效。" : "请先确认这是你的真实体验。" };
  const activeGroup = await getActiveGroupId();
  if ("error" in activeGroup) return { error: activeGroup.error };
  const { error } = await activeGroup.supabase.rpc("dismiss_place_candidate", {
    p_candidate_id: parsed.data, p_experience_attested: true,
  });
  if (error) return { error: userFacingError(error) };
  revalidatePath("/try");
  return { success: "已从去试试移除；这次选择不会对外显示。" };
}

export async function updatePlaceCandidate(candidateIdValue: string, heardFrom: string, expectation: string): Promise<CandidateResult> {
  const parsed = candidateId.safeParse(candidateIdValue);
  if (!parsed.success) return { error: "候选地点信息无效。" };
  if (heardFrom.trim().length > 120 || expectation.trim().length > 280) return { error: "来源最多 120 字，期待最多 280 字。" };
  const activeGroup = await getActiveGroupId();
  if ("error" in activeGroup) return { error: activeGroup.error };
  const { error } = await activeGroup.supabase.rpc("update_place_candidate", { p_candidate_id: parsed.data, p_heard_from: heardFrom, p_expectation: expectation });
  if (error) return { error: userFacingError(error) };
  revalidatePath("/try");
  return { success: "候选信息已更新。" };
}

export async function deletePlaceCandidate(candidateIdValue: string, reason?: string): Promise<CandidateResult> {
  const parsed = candidateId.safeParse(candidateIdValue);
  if (!parsed.success) return { error: "候选地点信息无效。" };
  const activeGroup = await getActiveGroupId();
  if ("error" in activeGroup) return { error: activeGroup.error };
  const { error } = await activeGroup.supabase.rpc("remove_place_candidate", { p_candidate_id: parsed.data, p_reason: reason?.trim() || null });
  if (error) return { error: userFacingError(error) };
  revalidatePath("/try");
  return { success: "已从去试试移除。" };
}
