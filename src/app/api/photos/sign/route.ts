import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ photoIds: z.array(z.string().uuid()).min(1).max(20) }).strict();

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_photo_ids" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "authentication_required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const { data: photos, error } = await supabase.from("photos").select("id, thumbnail_object_key, thumbnail_width, thumbnail_height").in("id", [...new Set(parsed.data.photoIds)]).is("deleted_at", null).is("hidden_at", null);
  if (error) return Response.json({ error: "photo_lookup_failed" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const eligible = (photos ?? []).filter((photo) => photo.thumbnail_object_key);
  const { data: signed, error: signedError } = eligible.length
    ? await supabase.storage.from("place-photos").createSignedUrls(eligible.map((photo) => photo.thumbnail_object_key as string), 60 * 15)
    : { data: [], error: null };
  if (signedError) return Response.json({ error: "photo_sign_failed" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const signedByPath = new Map((signed ?? []).map((item) => [item.path, item.signedUrl]));
  return Response.json({ photos: eligible.flatMap((photo) => { const signedUrl = signedByPath.get(photo.thumbnail_object_key as string); return signedUrl ? [{ id: photo.id, signedUrl, width: photo.thumbnail_width, height: photo.thumbnail_height }] : []; }) }, { headers: { "Cache-Control": "no-store" } });
}
