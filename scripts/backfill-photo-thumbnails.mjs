import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error("需要 NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY；不会打印密钥。");

const execute = process.argv.includes("--execute");
const batchSize = Math.min(20, Math.max(1, Number(process.env.PHOTO_BACKFILL_BATCH_SIZE ?? 20)));
const concurrency = Math.min(2, Math.max(1, Number(process.env.PHOTO_BACKFILL_CONCURRENCY ?? 2)));
const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function loadSharp() {
  try {
    const sharpModule = await import("sharp");
    return sharpModule.default;
  } catch {
    throw new Error("执行回填需要已在目标运行时验证过的 sharp；当前仅可安全执行 dry-run。");
  }
}

async function makeThumbnail(sharp, body) {
  let quality = 76;
  let width = 640;
  let height = 640;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const image = sharp(body, { failOn: "error", limitInputPixels: 24_000_000 }).rotate();
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) throw new Error("invalid_image_metadata");
    const scale = Math.min(1, 640 / Math.max(metadata.width, metadata.height));
    width = Math.max(1, Math.round(metadata.width * scale));
    height = Math.max(1, Math.round(metadata.height * scale));
    const output = await image.resize(width, height, { fit: "inside", withoutEnlargement: true }).webp({ quality, effort: 4 }).toBuffer();
    if (output.length <= 120 * 1024) return { output, width, height };
    if (quality > 48) quality -= 8;
    else { width = Math.max(1, Math.round(width * 0.86)); height = Math.max(1, Math.round(height * 0.86)); }
  }
  throw new Error("thumbnail_over_limit");
}

async function processPhoto(sharp, photo) {
  if (!photo.visit_record_id) throw new Error("missing_visit_record_id");
  const thumbnailKey = `groups/${photo.group_id}/users/${photo.user_id}/visits/${photo.visit_record_id}/photos/${photo.id}/thumb.webp`;
  const downloaded = await admin.storage.from("place-photos").download(photo.object_key);
  if (downloaded.error || !downloaded.data) throw new Error("canonical_download_failed");
  const body = Buffer.from(await downloaded.data.arrayBuffer());
  const thumbnail = await makeThumbnail(sharp, body);
  const upload = await admin.storage.from("place-photos").upload(thumbnailKey, thumbnail.output, { contentType: "image/webp", upsert: false });
  const alreadyExists = Boolean(upload.error);
  if (upload.error && !/already exists|duplicate/i.test(upload.error.message)) throw new Error("thumbnail_upload_failed");
  const registered = await admin.rpc("register_photo_thumbnail", {
    p_photo_id: photo.id,
    p_thumbnail_object_key: thumbnailKey,
    p_thumbnail_width: thumbnail.width,
    p_thumbnail_height: thumbnail.height,
    p_thumbnail_size_bytes: thumbnail.output.length,
  });
  if (registered.error) {
    if (!alreadyExists) await admin.storage.from("place-photos").remove([thumbnailKey]);
    throw new Error("thumbnail_metadata_registration_failed");
  }
  return alreadyExists ? 0 : thumbnail.output.length;
}

let cursor = process.env.PHOTO_BACKFILL_AFTER_ID ?? "";
let scanned = 0;
let eligible = 0;
let completed = 0;
let failed = 0;
let totalThumbnailBytes = 0;
let pages = 0;
const startedAt = Date.now();
const sharp = execute ? await loadSharp() : null;

while (true) {
  const query = admin.from("photos")
    .select("id, group_id, user_id, visit_record_id, object_key, thumbnail_object_key")
    .is("deleted_at", null)
    .is("hidden_at", null)
    .is("thumbnail_object_key", null)
    .order("id", { ascending: true })
    .limit(batchSize);
  const { data, error } = cursor ? await query.gt("id", cursor) : await query;
  if (error) throw error;
  const rows = data ?? [];
  pages += 1;
  if (!rows.length) break;
  scanned += rows.length;
  eligible += rows.length;
  if (!execute) {
    cursor = rows.at(-1).id;
    continue;
  }
  let index = 0;
  async function worker() {
    while (index < rows.length) {
      const photo = rows[index];
      index += 1;
      try {
        totalThumbnailBytes += await processPhoto(sharp, photo);
        completed += 1;
      } catch {
        failed += 1;
      }
      if (failed > 0 && failed / Math.max(1, completed + failed) > 0.01) {
        throw new Error("failure_rate_above_1_percent");
      }
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, () => worker()));
  } catch (error) {
    const message = error instanceof Error ? error.message : "backfill_failed";
    console.error(`photo-thumbnail-backfill: stopped after ${completed} success and ${failed} failures (${message})`);
    process.exit(1);
  }
  cursor = rows.at(-1).id;
  if (rows.length < batchSize) break;
}

console.log(JSON.stringify({ mode: execute ? "execute" : "dry-run", pages, scanned, eligible, completed, failed, totalThumbnailBytes, elapsedMs: Date.now() - startedAt }));
