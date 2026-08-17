import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { selectPhotoResource } from "@/lib/photos/photo-resource";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ photoIds: z.array(z.string().uuid()).min(1).max(20) }).strict();

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_photo_ids" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "authentication_required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const requestedIds = [...new Set(parsed.data.photoIds)];
  const { data: photos, error } = await supabase.from("photos").select("id, object_key, width, height, thumbnail_object_key, thumbnail_width, thumbnail_height").in("id", requestedIds).is("deleted_at", null).is("hidden_at", null);
  if (error) return Response.json({ error: "photo_lookup_failed" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const resources = (photos ?? []).flatMap((photo) => {
    const resource = selectPhotoResource(photo);
    return resource ? [{ photo, resource }] : [];
  });
  const { data: signed, error: signedError } = resources.length
    ? await supabase.storage.from("place-photos").createSignedUrls(resources.map(({ resource }) => resource.key), 60 * 15)
    : { data: [], error: null };
  if (signedError) return Response.json({ error: "photo_sign_failed" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const signedByPath = new Map((signed ?? []).map((item) => [item.path, item.signedUrl]));
  const visibleIds = new Set((photos ?? []).map((photo) => photo.id));
  const signedPhotos = resources.flatMap(({ photo, resource }) => {
    const signedUrl = signedByPath.get(resource.key);
    return signedUrl ? [{ id: photo.id, signedUrl, width: resource.width, height: resource.height, resource: resource.resource }] : [];
  });
  const unavailablePhotoIds = requestedIds.filter((id) => !visibleIds.has(id) || !signedPhotos.some((photo) => photo.id === id));
  return Response.json({ photos: signedPhotos, unavailablePhotoIds }, { headers: { "Cache-Control": "no-store" } });
}
