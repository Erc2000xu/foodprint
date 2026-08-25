export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (process.env.E2E_PHOTO_UPLOAD !== "1") return Response.json({ error: "not_found" }, { status: 404 });
  const formData = await request.formData();
  const photos = formData.getAll("photos").filter((value): value is File => value instanceof File);
  const thumbnails = formData.getAll("photo_thumbnails").filter((value): value is File => value instanceof File);
  return Response.json({
    photos: photos.length,
    thumbnails: thumbnails.length,
    dimensions: formData.getAll("photo_dimensions"),
    thumbnailDimensions: formData.getAll("thumbnail_dimensions"),
    photoTypes: photos.map((file) => file.type),
    thumbnailTypes: thumbnails.map((file) => file.type),
    photoBytes: photos.map((file) => file.size),
    thumbnailBytes: thumbnails.map((file) => file.size),
  }, { headers: { "Cache-Control": "no-store" } });
}
