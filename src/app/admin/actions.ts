"use server";
import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { encryptInvitationToken } from "@/lib/invitations/token-crypto";
import { createClient } from "@/lib/supabase/server";

export type InviteResult = { error?: string; inviteUrl?: string };
export type ManagementResult = { error?: string; success?: string };

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
    return { error: error instanceof Error ? error.message : "邀请链接加密配置无效。" };
  }
  const { data, error } = await supabase.rpc("create_managed_invitation", {
    p_group_id: groupId.data,
    p_expires_at: new Date(Date.now() + days.data * 86_400_000).toISOString(),
    p_max_uses: maxUses.data,
    p_token_hash: createHash("sha256").update(token).digest("hex"),
    p_token_ciphertext: tokenCiphertext,
  });
  if (error || !data?.[0]?.id) return { error: error?.message ?? "创建邀请失败。" };
  revalidatePath("/admin");
  return { inviteUrl: `${appUrl}/join/${token}` };
}

export async function revokeInvitation(_: ManagementResult, formData: FormData): Promise<ManagementResult> {
  const invitationId = z.string().uuid().safeParse(formData.get("invitation_id"));
  if (!invitationId.success) return { error: "邀请信息无效，请刷新后重试。" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_invitation", { p_invitation_id: invitationId.data });
  if (error) return { error: error.message };
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
  if (error) return { error: error.message };
  revalidatePath("/admin");
  return { success: status.data === "suspended" ? "成员已暂停。" : "成员已恢复。" };
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
  if (error) return { error: error.message };
  revalidatePath("/admin");
  return { success: role.data === "admin" ? "已设为 Admin。" : "已设为普通成员。" };
}

export async function completePlaceCuisine(_: ManagementResult, formData: FormData): Promise<ManagementResult> {
  const groupPlaceId = z.string().uuid().safeParse(formData.get("group_place_id"));
  const cuisineSlug = z.string().regex(/^[a-z0-9_]+$/).safeParse(formData.get("cuisine_slug"));
  if (!groupPlaceId.success || !cuisineSlug.success) return { error: "地点或菜系信息无效。" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "请先登录。" };
  const { data: groupPlace } = await supabase.from("group_places").select("group_id").eq("id", groupPlaceId.data).maybeSingle();
  if (!groupPlace) return { error: "地点不存在或无权访问。" };
  const { data: membership } = await supabase.from("group_members").select("role").eq("group_id", groupPlace.group_id).eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership || !["owner", "admin"].includes(membership.role)) return { error: "只有 Owner 或 Admin 可以完善历史地点。" };
  const { error } = await supabase.rpc("set_group_place_cuisines", { p_group_place_id: groupPlaceId.data, p_cuisine_slugs: [cuisineSlug.data] });
  if (error) return { error: error.message };
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/discover");
  return { success: "已补充菜系信息。" };
}
