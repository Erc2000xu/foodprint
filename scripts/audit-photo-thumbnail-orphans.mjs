import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error("需要 NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY；不会打印密钥。");
const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const dbKeys = new Set();
let cursor = "";
let dbRows = 0;
while (true) {
  const query = admin.from("photos").select("id, thumbnail_object_key").not("thumbnail_object_key", "is", null).order("id", { ascending: true }).limit(1000);
  const { data, error } = cursor ? await query.gt("id", cursor) : await query;
  if (error) throw error;
  const rows = data ?? [];
  dbRows += rows.length;
  rows.forEach((row) => { if (row.thumbnail_object_key) dbKeys.add(row.thumbnail_object_key); });
  if (rows.length < 1000) break;
  cursor = rows.at(-1).id;
}

const storageKeys = new Set();
async function walk(prefix) {
  let offset = 0;
  while (true) {
    const { data, error } = await admin.storage.from("place-photos").list(prefix, { limit: 1000, offset });
    if (error) throw error;
    const items = data ?? [];
    for (const item of items) {
      const key = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id || item.metadata) storageKeys.add(key);
      else await walk(key);
    }
    if (items.length < 1000) break;
    offset += items.length;
  }
}
await walk("groups");
const orphanThumbnails = [...storageKeys].filter((key) => key.endsWith("/thumb.webp") && !dbKeys.has(key));
const missingThumbnails = [...dbKeys].filter((key) => !storageKeys.has(key));
console.log(JSON.stringify({ dbThumbnailRows: dbRows, storageObjects: storageKeys.size, orphanThumbnailObjects: orphanThumbnails.length, missingThumbnailObjects: missingThumbnails.length }));
if (orphanThumbnails.length || missingThumbnails.length) process.exitCode = 1;
