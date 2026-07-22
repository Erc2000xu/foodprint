"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type WishlistResult = { error?: string; wanted?: boolean };

export async function toggleWishlistItem(groupPlaceId: string, wanted: boolean): Promise<WishlistResult> {
  const parsedId = z.string().uuid().safeParse(groupPlaceId);
  if (!parsedId.success) return { error: "地点信息无效。" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "请先登录。" };
  const { error } = await supabase.rpc("set_wishlist_item", { p_group_place_id: parsedId.data, p_wanted: wanted });
  if (error) return { error: error.message };
  revalidatePath("/discover");
  revalidatePath(`/place/${parsedId.data}`);
  return { wanted };
}
