"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type PhotoDeleteResult = { error?: string };

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
