"use server";
import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { encryptInvitationToken } from "@/lib/invitations/token-crypto";
import { createClient } from "@/lib/supabase/server";
import { userFacingError } from "@/lib/user-facing-error";

export type InviteResult = { error?: string; inviteUrl?: string };
export type ManagementResult = { error?: string; success?: string };
export type PlaceManagementResult = ManagementResult;

export async function runBusinessAreaBackfill(previousState: ManagementResult): Promise<ManagementResult> {
  void previousState;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "请先登录后再继续。" };
  const { data: membership } = await supabase.from("group_members").select("role").eq("user_id", user.id).eq("status", "active").eq("role", "owner").limit(1).maybeSingle();
  if (!membership) return { error: "只有 Owner 可以整理地点商圈信息。" };
  const { data, error } = await supabase.functions.invoke("amap-poi-search", { body: { operation: "business_area_backfill" } });
  if (error) return { error: userFacingError(error, "商圈整理暂时无法完成。") };
  revalidatePath("/");
  revalidatePath("/admin");
  return { success: `已处理 ${Number((data as { processed?: number } | null)?.processed ?? 0)} 个待补充地点。` };
}

export async function archiveGroupPlace(_: PlaceManagementResult, formData: FormData): Promise<PlaceManagementResult> {
  const groupPlaceId = z.string().uuid().safeParse(formData.get("group_place_id"));
  const reason = z.string().trim().min(1).max(280).safeParse(formData.get("reason"));
  const understood = formData.get("understood") === "on";
  if (!groupPlaceId.success || !reason.success || !understood) return { error: "请填写下架原因，并确认这是对整个小组地点的操作。" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_group_place", { p_group_place_id: groupPlaceId.data, p_reason: reason.data });
  if (error) return { error: userFacingError(error) };
  revalidatePath("/"); revalidatePath("/admin"); revalidatePath(`/place/${groupPlaceId.data}`); revalidatePath("/activity");
  return { success: "地点已下架；历史内容已保留，可在地点与内容管理中恢复。" };
}

export async function restoreGroupPlace(_: PlaceManagementResult, formData: FormData): Promise<PlaceManagementResult> {
  const groupPlaceId = z.string().uuid().safeParse(formData.get("group_place_id"));
  if (!groupPlaceId.success) return { error: "地点信息无效。" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restore_group_place", { p_group_place_id: groupPlaceId.data });
  if (error) return { error: userFacingError(error) };
  revalidatePath("/"); revalidatePath("/admin"); revalidatePath(`/place/${groupPlaceId.data}`); revalidatePath("/activity");
  return { success: data?.[0]?.current_status === "inactive_no_marks" ? "地点已恢复，等待朋友留下推荐。" : "地点已恢复到发现和地图。" };
}

export async function restoreHiddenContent(_: PlaceManagementResult, formData: FormData): Promise<PlaceManagementResult> {
  const id = z.string().uuid().safeParse(formData.get("content_id")); const type = z.enum(["visit", "photo"]).safeParse(formData.get("content_type"));
  if (!id.success || !type.success) return { error: "内容信息无效。" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(type.data === "visit" ? "restore_group_visit_record" : "restore_group_photo", { [type.data === "visit" ? "p_visit_record_id" : "p_photo_id"]: id.data });
  if (error) return { error: userFacingError(error) };
  revalidatePath("/"); revalidatePath("/admin"); revalidatePath("/activity"); if (data) revalidatePath(`/place/${data}`);
  return { success: "内容已恢复显示。" };
}

export async function restorePlaceCandidate(_: PlaceManagementResult, formData: FormData): Promise<PlaceManagementResult> {
  const id = z.string().uuid().safeParse(formData.get("candidate_id"));
  if (!id.success) return { error: "候选地点信息无效。" };
  const supabase = await createClient(); const { error } = await supabase.rpc("restore_place_candidate", { p_candidate_id: id.data });
  if (error) return { error: userFacingError(error) };
  revalidatePath("/try"); revalidatePath("/admin");
  return { success: "候选已恢复到去试试。" };
}

export async function leaveActiveGroup(_: ManagementResult, formData: FormData): Promise<ManagementResult> {
  const groupId = z.string().uuid().safeParse(formData.get("group_id"));
  if (!groupId.success) return { error: "共同地图信息无效，请刷新后重试。" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_active_group", { p_group_id: groupId.data });
  if (error) return { error: error.message === "transfer ownership before leaving this group" ? "Owner 请先转让所有权后再退出。" : userFacingError(error) };
  revalidatePath("/");
  revalidatePath("/admin");
  return { success: "你已退出共同地图。你留下的地点、笔记、照片和体验会保留，并显示为“已离开成员”。" };
}

export async function createInvitation(_: InviteResult, formData: FormData): Promise<InviteResult> {
  const groupId = z.string().uuid().safeParse(formData.get("group_id"));
  if (!groupId.success) return { error: "小组信息无效，请刷新后重试。" };
  const days = z.coerce.number().int().min(1).max(30).safeParse(formData.get("expires_in_days"));
  const maxUses = z.coerce.number().int().min(1).max(100).safeParse(formData.get("max_uses"));
  if (!days.success || !maxUses.success) return { error: "有效期或使用次数无效。" };
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!appUrl) return { error: "网站地址未配置，暂时无法创建邀请链接。" };
  const supabase = await createClient();
  const token = randomBytes(32).toString("hex");
  let tokenCiphertext: string;
  try {
    tokenCiphertext = encryptInvitationToken(token);
  } catch (error) {
    return { error: userFacingError(error, "邀请链接加密配置无效。") };
  }
  const { data, error } = await supabase.rpc("create_managed_invitation", {
    p_group_id: groupId.data,
    p_expires_at: new Date(Date.now() + days.data * 86_400_000).toISOString(),
    p_max_uses: maxUses.data,
    p_token_hash: createHash("sha256").update(token).digest("hex"),
    p_token_ciphertext: tokenCiphertext,
  });
  if (error || !data?.[0]?.id) return { error: error ? userFacingError(error, "创建邀请失败。") : "创建邀请失败。" };
  revalidatePath("/admin");
  return { inviteUrl: `${appUrl}/join/${token}` };
}

export async function revokeInvitation(_: ManagementResult, formData: FormData): Promise<ManagementResult> {
  const invitationId = z.string().uuid().safeParse(formData.get("invitation_id"));
  if (!invitationId.success) return { error: "邀请信息无效，请刷新后重试。" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_invitation", { p_invitation_id: invitationId.data });
  if (error) return { error: userFacingError(error) };
  revalidatePath("/admin");
  return { success: "邀请链接已撤销。" };
}

export async function updateMemberStatus(_: ManagementResult, formData: FormData): Promise<ManagementResult> {
  const groupId = z.string().uuid().safeParse(formData.get("group_id"));
  const userId = z.string().uuid().safeParse(formData.get("user_id"));
  const status = z.enum(["active", "suspended"]).safeParse(formData.get("status"));
  if (!groupId.success || !userId.success || !status.success) return { error: "成员信息无效，请刷新后重试。" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_member_status", {
    p_group_id: groupId.data,
    p_user_id: userId.data,
    p_status: status.data,
  });
  if (error) return { error: userFacingError(error) };
  revalidatePath("/admin");
  return { success: status.data === "suspended" ? "成员已暂停使用。" : "成员已恢复使用。" };
}

export async function setMemberRole(_: ManagementResult, formData: FormData): Promise<ManagementResult> {
  const groupId = z.string().uuid().safeParse(formData.get("group_id"));
  const userId = z.string().uuid().safeParse(formData.get("user_id"));
  const role = z.enum(["admin", "member"]).safeParse(formData.get("role"));
  if (!groupId.success || !userId.success || !role.success) return { error: "成员或角色信息无效。" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_role", {
    p_group_id: groupId.data,
    p_user_id: userId.data,
    p_role: role.data,
  });
  if (error) return { error: userFacingError(error) };
  revalidatePath("/admin");
  return { success: role.data === "admin" ? "已设为 Admin。" : "已设为普通成员。" };
}

export async function completePlaceCuisine(_: ManagementResult, formData: FormData): Promise<ManagementResult> {
  const groupPlaceId = z.string().uuid().safeParse(formData.get("group_place_id"));
  const cuisineSlug = z.string().regex(/^[a-z0-9_]+$/).safeParse(formData.get("cuisine_slug"));
  if (!groupPlaceId.success || !cuisineSlug.success) return { error: "地点或菜系信息无效。" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "请先登录后再继续。" };
  const { data: groupPlace } = await supabase.from("group_places").select("group_id").eq("id", groupPlaceId.data).maybeSingle();
  if (!groupPlace) return { error: "地点不存在或无权访问。" };
  const { data: membership } = await supabase.from("group_members").select("role").eq("group_id", groupPlace.group_id).eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership || !["owner", "admin"].includes(membership.role)) return { error: "只有 Owner 或 Admin 可以完善历史地点。" };
  const { error } = await supabase.rpc("set_group_place_cuisines", { p_group_place_id: groupPlaceId.data, p_cuisine_slugs: [cuisineSlug.data] });
  if (error) return { error: userFacingError(error) };
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/");
  return { success: "已补充菜系信息。" };
}
