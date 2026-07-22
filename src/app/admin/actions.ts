"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type InviteResult = { error?: string; inviteUrl?: string };

export async function createInvitation(_: InviteResult, formData: FormData): Promise<InviteResult> {
  const groupId = z.string().uuid().safeParse(formData.get("group_id"));
  if (!groupId.success) return { error: "小组信息无效，请刷新后重试。" };
  const days = z.coerce.number().int().min(1).max(30).safeParse(formData.get("expires_in_days"));
  const maxUses = z.coerce.number().int().min(1).max(100).safeParse(formData.get("max_uses"));
  if (!days.success || !maxUses.success) return { error: "有效期或使用次数无效。" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invitation", {
    p_group_id: groupId.data,
    p_expires_at: new Date(Date.now() + days.data * 86_400_000).toISOString(),
    p_max_uses: maxUses.data,
  });
  if (error || !data?.[0]?.token) return { error: error?.message ?? "创建邀请失败。" };
  revalidatePath("/admin");
  return { inviteUrl: `${process.env.NEXT_PUBLIC_APP_URL}/join/${data[0].token}` };
}
