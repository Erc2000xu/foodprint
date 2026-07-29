"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type PhotoDeleteResult = { error?: string };
export type VisitDeleteResult = { error?: string; success?: string };
export type ModerationResult = { error?: string; success?: string };

export async function deleteMyPhoto(_: PhotoDeleteResult, formData: FormData): Promise<PhotoDeleteResult> {
  const parsedId = z.string().uuid().safeParse(formData.get("photo_id"));
  if (!parsedId.success) return { error: "照片信息无效。" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "请先登录。" };

  const { data: photo, error: photoError } = await supabase
    .from("photos")
    .select("id, group_place_id, object_key")
    .eq("id", parsedId.data)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (photoError || !photo) return { error: "找不到这张照片，或你没有删除权限。" };

  const { error: storageError } = await supabase.storage.from("place-photos").remove([photo.object_key]);
  if (storageError) return { error: `照片文件删除失败：${storageError.message}` };
  const { error: updateError } = await supabase.from("photos").update({ deleted_at: new Date().toISOString() }).eq("id", photo.id);
  if (updateError) return { error: `照片记录删除失败：${updateError.message}` };

  revalidatePath(`/place/${photo.group_place_id}`);
  return {};
}

export async function deleteMyVisit(_: VisitDeleteResult, formData: FormData): Promise<VisitDeleteResult> {
  const visitRecordId = z.string().uuid().safeParse(formData.get("visit_record_id"));
  if (!visitRecordId.success) return { error: "到访记录无效。" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_my_visit_record", { p_visit_record_id: visitRecordId.data });
  const result = data?.[0];
  if (error || !result?.group_place_id) return { error: error?.message ?? "无法删除这条到访记录。" };
  if (result.object_keys?.length) {
    const { error: storageError } = await supabase.storage.from("place-photos").remove(result.object_keys);
    if (storageError) return { error: `记录已隐藏，但照片文件尚未清理：${storageError.message}` };
  }
  revalidatePath("/");
  revalidatePath("/activity");
  revalidatePath(`/place/${result.group_place_id}`);
  return { success: "这条到访记录已删除。" };
}

export async function hideGroupContent(_: ModerationResult, formData: FormData): Promise<ModerationResult> {
  const contentType = z.enum(["visit", "photo"]).safeParse(formData.get("content_type"));
  const contentId = z.string().uuid().safeParse(formData.get("content_id"));
  const reason = z.string().trim().min(1, "请填写隐藏原因。").max(280).safeParse(formData.get("reason"));
  if (!contentType.success || !contentId.success || !reason.success) return { error: reason.success ? "内容信息无效。" : reason.error.issues[0]?.message };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(contentType.data === "visit" ? "hide_group_visit_record" : "hide_group_photo", {
    [contentType.data === "visit" ? "p_visit_record_id" : "p_photo_id"]: contentId.data,
    p_reason: reason.data,
  });
  if (error || !data) return { error: error?.message ?? "无法隐藏这项内容。" };
  revalidatePath("/");
  revalidatePath("/activity");
  revalidatePath(`/place/${data}`);
  return { success: "内容已从普通小组视图隐藏。" };
}
