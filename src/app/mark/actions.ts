"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveGroupContext } from "@/lib/auth/active-group-context";
import { cuisineOptions } from "@/lib/discovery-options";
import { isValidWebpFile, readWebpMetadata, type WebpMetadata } from "@/lib/photos/webp-metadata";
import { createClient } from "@/lib/supabase/server";
import { userFacingError } from "@/lib/user-facing-error";
import { recordServerMetric } from "@/lib/performance/server";

export type PoiLookup = { error?: string; found?: boolean };

type ActionErrorState = { status?: undefined; error?: string; success?: string; warning?: string };
export type SaveWithPhotosResult =
  | ActionErrorState
  | { status: "complete"; success: string; warning?: string; groupPlaceId?: string; visitRecordId?: string }
  | { status: "photo_repair_required"; visitRecordId: string; groupPlaceId: string; failedPhotoIds: string[]; message: string }
  | { status: "failed"; error: string };
export type MarkResult = SaveWithPhotosResult;
export type VisitResult = SaveWithPhotosResult;
export type PhotoRepairResult = SaveWithPhotosResult;

const cuisineSlugs = cuisineOptions.map(([slug]) => slug) as [string, ...string[]];

function validationMessage(issues: ReadonlyArray<{ path: readonly unknown[]; code: string }>, fallback: string) {
  const issue = issues[0];
  const field = String(issue?.path[0] ?? "");
  if (field === "opinion_tags" || field === "tags") return issue?.code === "too_small" ? "至少选择一项“好在哪儿”。" : "“好在哪儿”最多选择 4 项。";
  if (field === "strength") return "请选择推荐强度。";
  if (field === "visited_on") return "请选择到访日期。";
  if (field === "attested") return "请确认你亲自去过并愿意推荐。";
  if (field === "primary_category") return "请选择地点类型。";
  if (field === "cuisine_slug") return "请选择主菜系。";
  return fallback;
}

async function getActiveGroupId() {
  const supabase = await createClient();
  const context = await getActiveGroupContext(supabase, "/mark");
  return context ? { supabase, ...context } : { supabase, error: "请先登录并加入共同地图。" as const };
}

type PhotoPair = {
  display: File;
  thumbnail: File;
  displayMetadata: WebpMetadata;
  thumbnailMetadata: WebpMetadata;
};

function isFile(value: FormDataEntryValue): value is File {
  return typeof File !== "undefined" && value instanceof File && value.size > 0;
}

export async function parsePhotoPairs(formData: FormData): Promise<{ pairs?: PhotoPair[]; error?: string }> {
  const displays = formData.getAll("photos").filter(isFile);
  const thumbnails = formData.getAll("photo_thumbnails").filter(isFile);
  if (displays.length === 0 && thumbnails.length === 0) return { pairs: [] };
  if (displays.length > 9 || thumbnails.length > 9) return { error: "这次到访最多保留 9 张照片。" };
  if (displays.length !== thumbnails.length) return { error: "照片展示图与缩略图数量不一致，请重新选择。" };
  const totalBytes = [...displays, ...thumbnails].reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > 16 * 1024 * 1024) return { error: "单次照片总大小不能超过 16MB。" };

  const pairs: PhotoPair[] = [];
  for (let index = 0; index < displays.length; index += 1) {
    const display = displays[index];
    const thumbnail = thumbnails[index];
    const displayMetadata = await readWebpMetadata(await display.arrayBuffer());
    const thumbnailMetadata = await readWebpMetadata(await thumbnail.arrayBuffer());
    if (display.type !== "image/webp" || thumbnail.type !== "image/webp") return { error: `第 ${index + 1} 张照片不是 WebP 格式。` };
    if (!isValidWebpFile(display, displayMetadata, { maxEdge: 1_280, maxBytes: 600 * 1024 }) || !displayMetadata) return { error: `第 ${index + 1} 张展示图不符合 1280px / 600KiB 限制。` };
    if (!isValidWebpFile(thumbnail, thumbnailMetadata, { maxEdge: 640, maxBytes: 120 * 1024 }) || !thumbnailMetadata) return { error: `第 ${index + 1} 张缩略图不符合 640px / 120KiB 限制。` };
    pairs.push({ display, thumbnail, displayMetadata, thumbnailMetadata });
  }
  return { pairs };
}

type PhotoUploadInput = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  groupId: string;
  userId: string;
  groupPlaceId: string;
  visitRecordId: string;
  sortOrder: number;
  pair: PhotoPair;
  route: string;
};

type PhotoUploadOutcome = {
  photoId: string;
  created: boolean;
  canonicalFailed?: boolean;
  failureReason?: "validation" | "storage" | "database" | "permission" | "unknown";
  thumbnailDeferred?: boolean;
};

function metricFailure(route: string, stage: "canonical_upload_failed" | "photo_repair_failed" | "request_failed", reason: string) {
  recordServerMetric(`photo.${stage}.${reason}`, { route, outcome: "error", value: 1 });
}

async function stablePhotoId(input: PhotoUploadInput) {
  const displayBytes = new Uint8Array(await input.pair.display.arrayBuffer());
  const thumbnailBytes = new Uint8Array(await input.pair.thumbnail.arrayBuffer());
  // The ID is content-stable within one visit. Sort order remains mutable for
  // a retry, so it must not be part of the idempotency key.
  const prefix = new TextEncoder().encode(`${input.groupId}:${input.userId}:${input.visitRecordId}:`);
  const seed = new Uint8Array(prefix.length + displayBytes.length + thumbnailBytes.length);
  seed.set(prefix);
  seed.set(displayBytes, prefix.length);
  seed.set(thumbnailBytes, prefix.length + displayBytes.length);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", seed));
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function photoBase(input: PhotoUploadInput, photoId: string) {
  return `groups/${input.groupId}/users/${input.userId}/visits/${input.visitRecordId}/photos/${photoId}`;
}

function storageErrorReason(error: unknown): PhotoUploadOutcome["failureReason"] {
  const message = error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message ?? "").toLowerCase() : "";
  if (/permission|forbidden|not authorized|row-level|jwt|unauthor/.test(message)) return "permission";
  if (/network|fetch|timeout|timed out|connection/.test(message)) return "storage";
  return "storage";
}

async function registerMissingThumbnail(input: PhotoUploadInput, photoId: string, thumbnailKey: string) {
  const storage = input.supabase.storage.from("place-photos");
  const upload = await storage.upload(thumbnailKey, input.pair.thumbnail, { contentType: "image/webp", upsert: false });
  const hasThumbnail = !upload.error || /already exists|duplicate/i.test(upload.error.message);
  if (!hasThumbnail) {
    await storage.remove([thumbnailKey]);
    recordServerMetric("photo.thumbnail_deferred", { route: input.route, outcome: "ok", value: 1 });
    return false;
  }
  const { error: registerError } = await input.supabase.rpc("register_photo_thumbnail", {
    p_photo_id: photoId,
    p_thumbnail_object_key: thumbnailKey,
    p_thumbnail_width: input.pair.thumbnailMetadata.width,
    p_thumbnail_height: input.pair.thumbnailMetadata.height,
    p_thumbnail_size_bytes: input.pair.thumbnail.size,
  });
  if (registerError) {
    await storage.remove([thumbnailKey]);
    recordServerMetric("photo.thumbnail_deferred", { route: input.route, outcome: "ok", value: 1 });
    return false;
  }
  return true;
}

async function uploadPhotoPair(input: PhotoUploadInput): Promise<PhotoUploadOutcome> {
  const photoId = await stablePhotoId(input);
  const base = photoBase(input, photoId);
  const displayKey = `${base}/display.webp`;
  const thumbnailKey = `${base}/thumb.webp`;
  const storage = input.supabase.storage.from("place-photos");
  const { data: existingPhoto, error: existingError } = await input.supabase.from("photos").select("id, group_id, group_place_id, user_id, visit_record_id, object_key, thumbnail_object_key").eq("id", photoId).maybeSingle();
  if (existingError) {
    metricFailure(input.route, "canonical_upload_failed", "database");
    return { photoId, created: false, canonicalFailed: true, failureReason: "database" };
  }
  if (existingPhoto) {
    const scoped = existingPhoto.group_id === input.groupId && existingPhoto.group_place_id === input.groupPlaceId && existingPhoto.user_id === input.userId && existingPhoto.visit_record_id === input.visitRecordId && existingPhoto.object_key === displayKey;
    if (!scoped) {
      metricFailure(input.route, "canonical_upload_failed", "validation");
      return { photoId, created: false, canonicalFailed: true, failureReason: "validation" };
    }
    if (existingPhoto.thumbnail_object_key === thumbnailKey) return { photoId, created: false };
    const thumbnailReady = await registerMissingThumbnail(input, photoId, thumbnailKey);
    return { photoId, created: false, thumbnailDeferred: !thumbnailReady };
  }

  const displayUpload = await storage.upload(displayKey, input.pair.display, { contentType: "image/webp", upsert: false });
  const displayAlreadyExists = Boolean(displayUpload.error && /already exists|duplicate/i.test(displayUpload.error.message));
  if (displayUpload.error && !displayAlreadyExists) {
    await storage.remove([displayKey, thumbnailKey]);
    metricFailure(input.route, "canonical_upload_failed", storageErrorReason(displayUpload.error) ?? "storage");
    return { photoId, created: false, canonicalFailed: true, failureReason: storageErrorReason(displayUpload.error) };
  }

  const thumbnailUpload = await storage.upload(thumbnailKey, input.pair.thumbnail, { contentType: "image/webp", upsert: false });
  const thumbnailReady = !thumbnailUpload.error || /already exists|duplicate/i.test(thumbnailUpload.error.message);
  if (!thumbnailReady) await storage.remove([thumbnailKey]);
  const { error: photoError } = await input.supabase.from("photos").insert({
    id: photoId,
    group_id: input.groupId,
    group_place_id: input.groupPlaceId,
    user_id: input.userId,
    visit_record_id: input.visitRecordId,
    storage_provider: "supabase",
    object_key: displayKey,
    width: input.pair.displayMetadata.width,
    height: input.pair.displayMetadata.height,
    size_bytes: input.pair.display.size,
    sort_order: input.sortOrder,
    thumbnail_object_key: thumbnailReady ? thumbnailKey : null,
    thumbnail_width: thumbnailReady ? input.pair.thumbnailMetadata.width : null,
    thumbnail_height: thumbnailReady ? input.pair.thumbnailMetadata.height : null,
    thumbnail_size_bytes: thumbnailReady ? input.pair.thumbnail.size : null,
    thumbnail_generated_at: thumbnailReady ? new Date().toISOString() : null,
  });
  if (photoError?.code === "23505") {
    const { data: duplicate } = await input.supabase.from("photos").select("id, object_key, thumbnail_object_key").eq("id", photoId).maybeSingle();
    if (duplicate?.object_key === displayKey) return { photoId, created: false, thumbnailDeferred: !thumbnailReady };
  }
  if (photoError) {
    await storage.remove([...(displayAlreadyExists ? [] : [displayKey]), ...(thumbnailReady ? [thumbnailKey] : [])]);
    metricFailure(input.route, "canonical_upload_failed", photoError.code === "42501" ? "permission" : "database");
    return { photoId, created: false, canonicalFailed: true, failureReason: photoError.code === "42501" ? "permission" : "database" };
  }
  if (!thumbnailReady) recordServerMetric("photo.thumbnail_deferred", { route: input.route, outcome: "ok", value: 1 });
  return { photoId, created: true, thumbnailDeferred: !thumbnailReady };
}

async function uploadPhotoPairs(input: Omit<PhotoUploadInput, "sortOrder" | "pair"> & { pairs: PhotoPair[] }) {
  const { data: currentRows, error: countError } = await input.supabase.from("photos").select("id, sort_order").eq("visit_record_id", input.visitRecordId).is("deleted_at", null);
  if (countError) {
    metricFailure(input.route, "request_failed", "request");
    const failedPhotoIds: string[] = [];
    for (const pair of input.pairs) failedPhotoIds.push(await stablePhotoId({ ...input, sortOrder: 0, pair }));
    return { failedPhotoIds, warnings: [], error: "照片数量暂时无法确认，请稍后重试。" };
  }
  const existingIds = new Set((currentRows ?? []).map((row) => row.id));
  let nextSortOrder = Math.max(-1, ...(currentRows ?? []).map((row) => Number(row.sort_order))) + 1;
  const failedPhotoIds: string[] = [];
  const warnings: string[] = [];
  for (const pair of input.pairs) {
    const photoId = await stablePhotoId({ ...input, sortOrder: nextSortOrder, pair });
    if (!existingIds.has(photoId) && nextSortOrder >= 9) {
      failedPhotoIds.push(photoId);
      metricFailure(input.route, "canonical_upload_failed", "validation");
      continue;
    }
    const result = await uploadPhotoPair({ ...input, sortOrder: nextSortOrder, pair });
    if (result.canonicalFailed) failedPhotoIds.push(result.photoId);
    if (result.thumbnailDeferred) warnings.push("照片已保存，小尺寸预览稍后补齐。");
    if (result.created) {
      existingIds.add(result.photoId);
      nextSortOrder += 1;
    }
  }
  return { failedPhotoIds, warnings: [...new Set(warnings)], error: undefined };
}

function photoRepairMessage(count: number) {
  return `这顿已经记下，但 ${count} 张照片还没传好。`;
}

async function revalidatePlace(groupPlaceId: string, paths: string[] = []) {
  revalidatePath("/");
  revalidatePath("/try");
  revalidatePath("/activity");
  revalidatePath(`/place/${groupPlaceId}`);
  paths.forEach((path) => revalidatePath(path));
}

export async function lookupAmapPoi(poiId: string): Promise<PoiLookup> {
  const parsedPoiId = z.string().trim().min(1).max(160).safeParse(poiId);
  if (!parsedPoiId.success) return { error: "地点信息无效。" };
  const activeGroup = await getActiveGroupId();
  if ("error" in activeGroup) return { error: activeGroup.error };
  const { data: places } = await activeGroup.supabase.from("places").select("id").eq("source_provider", "amap").eq("source_poi_id", parsedPoiId.data).limit(1);
  if (!places?.[0]) return { found: false };
  const { data: groupPlaces } = await activeGroup.supabase.from("group_places").select("id").eq("group_id", activeGroup.groupId).eq("place_id", places[0].id).neq("status", "archived").limit(1);
  return { found: Boolean(groupPlaces?.[0]) };
}

export async function savePlaceMark(_: MarkResult, formData: FormData): Promise<MarkResult> {
  try {
    const activeGroup = await getActiveGroupId();
    if ("error" in activeGroup) return { error: activeGroup.error };
    const fields = z.object({
      poi_id: z.string().trim().min(1).max(160), name: z.string().trim().min(1).max(160), branch_name: z.string().trim().max(100).optional(),
      address: z.string().trim().max(300).optional(), city: z.string().trim().max(80).optional(), district: z.string().trim().max(80).optional(),
      latitude: z.coerce.number().min(-90).max(90), longitude: z.coerce.number().min(-180).max(180), primary_category: z.enum(["restaurant", "cafe", "drinks", "bar", "bakery_dessert", "other_food_drink"]),
      strength: z.coerce.number().int().min(1).max(3), opinion_tags: z.array(z.enum(["tasty", "comfortable", "good_for_chat", "good_value"])).min(1).max(4), visited_on: z.string().date(),
      note: z.string().trim().max(1000).optional(), dishes: z.string().max(400).optional(), anonymous: z.literal("on").optional(), attested: z.literal("on"), cuisine_slug: z.enum(cuisineSlugs),
    }).safeParse({ ...Object.fromEntries(formData), opinion_tags: formData.getAll("opinion_tags") });
    if (!fields.success) return { error: validationMessage(fields.error.issues, "请检查填写内容。") };
    const value = fields.data;
    const parsedPhotos = await parsePhotoPairs(formData);
    if (parsedPhotos.error || !parsedPhotos.pairs) {
      metricFailure("/mark", "request_failed", "request");
      return { error: parsedPhotos.error ?? "照片信息无效。" };
    }
    const photos = parsedPhotos.pairs;
    const items = (value.dishes ?? "").split(/[,，]/).map((item) => item.trim()).filter(Boolean).slice(0, 12);
    const { data, error } = await activeGroup.supabase.rpc("save_candidate_promotion_mark", {
      p_group_id: activeGroup.groupId, p_source_provider: "amap", p_source_poi_id: value.poi_id, p_name: value.name, p_branch_name: value.branch_name ?? null,
      p_address: value.address ?? null, p_city: value.city ?? null, p_district: value.district ?? null, p_latitude: value.latitude, p_longitude: value.longitude,
      p_coordinate_system: "GCJ-02", p_primary_category: value.primary_category, p_overall_rating: [3, 4, 5][value.strength - 1], p_would_recommend: true,
      p_experience_attested: true, p_visited_on: value.visited_on, p_short_review: value.note ?? null, p_recommended_items: items, p_cuisine_slugs: [value.cuisine_slug],
      p_strength: value.strength, p_tags: value.opinion_tags, p_is_anonymous: value.anonymous === "on",
    });
    if (error || !data?.[0]?.mark_id) return { error: error ? userFacingError(error) : "操作没有完成，请再试一次。" };
    const visitRecordId = data[0].visit_record_id as string;
    const groupPlaceId = data[0].group_place_id as string;
    const upload = photos.length ? await uploadPhotoPairs({ supabase: activeGroup.supabase, groupId: activeGroup.groupId, userId: activeGroup.userId, groupPlaceId, visitRecordId, pairs: photos, route: "/mark" }) : { failedPhotoIds: [], warnings: [], error: undefined };
    if (upload.error) {
      return { status: "photo_repair_required", visitRecordId, groupPlaceId, failedPhotoIds: upload.failedPhotoIds, message: `${upload.error} 记录已保存，请点击“重试上传”。` };
    }
    const { error: discoveryError } = await activeGroup.supabase.rpc("refresh_group_place_discovery_metadata", { p_group_place_id: groupPlaceId });
    await revalidatePlace(groupPlaceId);
    if (upload.failedPhotoIds.length) {
      metricFailure("/mark", "photo_repair_failed", "canonical");
      return { status: "photo_repair_required", visitRecordId, groupPlaceId, failedPhotoIds: upload.failedPhotoIds, message: photoRepairMessage(upload.failedPhotoIds.length) };
    }
    if (discoveryError) return { error: "这一顿已记下，但地点信息正在整理，请稍后再查看。" };
    return { status: "complete", success: "这一顿已记下，地点已加入共同地图。", warning: upload.warnings.length ? upload.warnings.join(" ") : undefined };
  } catch {
    return { error: "保存失败，请检查网络后重试。" };
  }
}

export async function recordPlaceVisit(_: VisitResult, formData: FormData): Promise<VisitResult> {
  try {
    const fields = z.object({
      group_place_id: z.string().uuid(), visited_on: z.string().date(), opinion_changed: z.enum(["true", "false"]),
      strength: z.preprocess((value) => value === "" || value === null ? undefined : value, z.coerce.number().int().min(1).max(3).optional()),
      tags: z.array(z.enum(["tasty", "comfortable", "good_for_chat", "good_value"])).max(4), note: z.string().trim().max(1000).optional(), dishes: z.string().max(400).optional(), anonymous: z.literal("on").optional(),
    }).safeParse({ ...Object.fromEntries(formData), tags: formData.getAll("tags") });
    if (!fields.success) return { error: validationMessage(fields.error.issues, "请检查这顿饭的内容。") };
    const value = fields.data;
    const parsedPhotos = await parsePhotoPairs(formData);
    if (parsedPhotos.error || !parsedPhotos.pairs) {
      metricFailure("/mark", "request_failed", "request");
      return { error: parsedPhotos.error ?? "照片信息无效。" };
    }
    const photos = parsedPhotos.pairs;
    const activeGroup = await getActiveGroupId();
    if ("error" in activeGroup) return { error: activeGroup.error };
    const { data: groupPlace } = await activeGroup.supabase.from("group_places").select("id").eq("id", value.group_place_id).eq("group_id", activeGroup.groupId).eq("status", "active").maybeSingle();
    if (!groupPlace) return { error: "地点不存在，或你没有共同地图权限。" };
    const { data, error } = await activeGroup.supabase.rpc("record_place_visit", {
      p_group_place_id: value.group_place_id, p_visited_on: value.visited_on, p_opinion_changed: value.opinion_changed === "true", p_strength: value.strength ?? null,
      p_tags: value.tags, p_note: value.note ?? null, p_dishes: (value.dishes ?? "").split(/[,，]/).map((dish) => dish.trim()).filter(Boolean).slice(0, 12), p_is_anonymous: value.anonymous === "on",
    });
    if (error || !data?.[0]?.visit_record_id) return { error: error ? userFacingError(error) : "操作没有完成，请再试一次。" };
    const visitRecordId = data[0].visit_record_id as string;
    const upload = photos.length ? await uploadPhotoPairs({ supabase: activeGroup.supabase, groupId: activeGroup.groupId, userId: activeGroup.userId, groupPlaceId: value.group_place_id, visitRecordId, pairs: photos, route: "/mark" }) : { failedPhotoIds: [], warnings: [], error: undefined };
    await revalidatePlace(value.group_place_id, ["/activity"]);
    if (upload.error) {
      return { status: "photo_repair_required", visitRecordId, groupPlaceId: value.group_place_id, failedPhotoIds: upload.failedPhotoIds, message: `${upload.error} 这顿饭已记下，请点击“重试上传”。` };
    }
    if (upload.failedPhotoIds.length) {
      metricFailure("/mark", "photo_repair_failed", "canonical");
      return { status: "photo_repair_required", visitRecordId, groupPlaceId: value.group_place_id, failedPhotoIds: upload.failedPhotoIds, message: photoRepairMessage(upload.failedPhotoIds.length) };
    }
    return { status: "complete", success: "这顿饭已记下，地点时间线也更新了。", warning: upload.warnings.length ? upload.warnings.join(" ") : undefined };
  } catch {
    return { error: "保存失败，请检查网络后重试。" };
  }
}

export async function repairVisitPhotos(_: PhotoRepairResult, formData: FormData): Promise<PhotoRepairResult> {
  try {
    const visitRecordId = z.string().uuid().safeParse(formData.get("visit_record_id"));
    const groupPlaceId = z.string().uuid().safeParse(formData.get("group_place_id"));
    if (!visitRecordId.success || !groupPlaceId.success) return { error: "到访记录无效，请刷新后再试。" };
    const parsedPhotos = await parsePhotoPairs(formData);
    if (parsedPhotos.error || !parsedPhotos.pairs?.length) {
      metricFailure("/place/:id", "request_failed", "request");
      return { error: parsedPhotos.error ?? "请选择需要补传的照片。" };
    }
    const activeGroup = await getActiveGroupId();
    if ("error" in activeGroup) return { error: activeGroup.error };
    const { data: visit } = await activeGroup.supabase.from("visit_records").select("id, user_id, group_place_id, deleted_at, hidden_at").eq("id", visitRecordId.data).maybeSingle();
    const { data: groupPlace } = await activeGroup.supabase.from("group_places").select("id, group_id, status").eq("id", groupPlaceId.data).eq("group_id", activeGroup.groupId).eq("status", "active").maybeSingle();
    if (!visit || visit.user_id !== activeGroup.userId || visit.group_place_id !== groupPlaceId.data || visit.deleted_at || visit.hidden_at || !groupPlace) return { error: "这条到访现在不能补传照片，请刷新后再试。" };
    const upload = await uploadPhotoPairs({ supabase: activeGroup.supabase, groupId: activeGroup.groupId, userId: activeGroup.userId, groupPlaceId: groupPlaceId.data, visitRecordId: visitRecordId.data, pairs: parsedPhotos.pairs, route: "/place/:id" });
    await revalidatePlace(groupPlaceId.data);
    if (upload.error) return { error: upload.error };
    if (upload.failedPhotoIds.length) {
      metricFailure("/place/:id", "photo_repair_failed", "canonical");
      return { status: "photo_repair_required", visitRecordId: visitRecordId.data, groupPlaceId: groupPlaceId.data, failedPhotoIds: upload.failedPhotoIds, message: photoRepairMessage(upload.failedPhotoIds.length) };
    }
    recordServerMetric("photo.repair_succeeded", { route: "/place/:id", outcome: "ok", value: 1 });
    return { status: "complete", success: "照片已补传。", groupPlaceId: groupPlaceId.data, visitRecordId: visitRecordId.data, warning: upload.warnings.length ? upload.warnings.join(" ") : undefined };
  } catch {
    metricFailure("/place/:id", "photo_repair_failed", "unknown");
    return { error: "照片补传失败，请检查网络后重试。" };
  }
}
