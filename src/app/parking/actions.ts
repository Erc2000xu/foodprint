"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveGroupContext } from "@/lib/auth/active-group-context";
import { listParkingMarks, getParkingAccess, parkingMarkFromRpcRow, type ParkingMarksResult } from "@/lib/adapters/parking-repository";
import { normalizeParkingGeometry } from "@/lib/parking/geometry";
import { parkingGeometryTypes, type ParkingGeometryType, type ParkingMark } from "@/lib/parking/types";
import { createClient } from "@/lib/supabase/server";
import { userFacingError } from "@/lib/user-facing-error";

export type ParkingActionResult = {
  error?: string;
  success?: string;
  mark?: ParkingMark;
};

export type ParkingAccessStatus = {
  allowed: boolean;
  canManage: boolean;
  authorizedCount: number;
};

const geometryTypeSchema = z.enum(parkingGeometryTypes);
const markInputSchema = z.object({
  groupId: z.string().uuid(),
  geometryType: geometryTypeSchema,
  coordinates: z.unknown(),
  name: z.string().max(30).nullable().optional(),
  isConvenient: z.boolean(),
  comment: z.string().max(500).nullable().optional(),
});

function validationError(type: ParkingGeometryType, coordinates: unknown, isConvenient: boolean) {
  if (!isConvenient) return "请先勾选“我确认这里方便停摩托车”。";
  const normalized = normalizeParkingGeometry(type, coordinates);
  return normalized.ok ? undefined : normalized.error;
}

async function getParkingContext() {
  const supabase = await createClient();
  const context = await getActiveGroupContext(supabase, "/parking");
  return context ? { supabase, context } : null;
}

function accessError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  return /parking access required|parking mark edit not allowed|parking mark delete not allowed|parking access manager required|permission|not authorized|42501/i.test(message);
}

export async function getParkingAccessStatus(): Promise<ParkingAccessStatus> {
  const context = await getParkingContext();
  if (!context) return { allowed: false, canManage: false, authorizedCount: 0 };
  const access = await getParkingAccess(context.supabase, context.context.groupId);
  return {
    allowed: access?.canUse === true,
    canManage: access?.canManage === true,
    authorizedCount: access?.authorizedCount ?? 0,
  };
}

export async function loadParkingMarks(): Promise<ParkingMarksResult> {
  const context = await getParkingContext();
  if (!context) return { status: "denied", marks: [] };
  const access = await getParkingAccess(context.supabase, context.context.groupId);
  if (!access?.canUse) return { status: "denied", marks: [] };
  return listParkingMarks(context.supabase, context.context.groupId);
}

type ParsedMarkInput =
  | { data: { groupId: string; geometryType: ParkingGeometryType; coordinates: ParkingMark["coordinates"]; name: string | null; isConvenient: boolean; comment: string | null } }
  | { error: string };

async function parseMarkInput(value: unknown): Promise<ParsedMarkInput> {
  const parsed = markInputSchema.safeParse(value);
  if (!parsed.success) return { error: "停车记录内容无效，请重新选择位置。" } as const;
  const validationMessage = validationError(parsed.data.geometryType, parsed.data.coordinates, parsed.data.isConvenient);
  if (validationMessage) return { error: validationMessage } as const;
  const normalized = normalizeParkingGeometry(parsed.data.geometryType, parsed.data.coordinates);
  if (!normalized.ok) return { error: normalized.error } as const;
  return {
    data: {
      ...parsed.data,
      name: parsed.data.name?.trim() || null,
      comment: parsed.data.comment?.trim() || null,
      coordinates: normalized.coordinates,
    },
  };
}

export async function createParkingMark(input: unknown): Promise<ParkingActionResult> {
  const parsedKey = z.object({ requestKey: z.string().uuid() }).safeParse(input);
  if (!parsedKey.success) return { error: "保存请求无效，请重新选择位置。" };
  const parsed = await parseMarkInput(input);
  if ("error" in parsed) return parsed;
  const markInput = parsed.data;
  const context = await getParkingContext();
  if (!context || markInput.groupId !== context.context.groupId) return { error: "停车地图权限已失效，请返回发现页。" };
  const { data, error } = await context.supabase.rpc("create_parking_mark", {
    p_group_id: context.context.groupId,
    p_geometry_type: markInput.geometryType,
    p_coordinates: markInput.coordinates,
    p_name: markInput.name,
    p_is_convenient: markInput.isConvenient,
    p_comment: markInput.comment,
    p_idempotency_key: parsedKey.data.requestKey,
  });
  if (error) return { error: accessError(error) ? "停车地图权限已失效，请返回发现页。" : userFacingError(error, "保存失败，请保留草稿后重试。") };
  const mark = parkingMarkFromRpcRow(data);
  if (!mark) return { error: "保存结果暂时无法读取，请刷新停车地图。" };
  revalidatePath("/");
  revalidatePath("/parking");
  return { mark, success: "已保存到共享停车地图。" };
}

export async function updateParkingMark(input: unknown): Promise<ParkingActionResult> {
  const parsedId = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsedId.success) return { error: "停车记录信息无效，请刷新后重试。" };
  const parsed = await parseMarkInput(input);
  if ("error" in parsed) return parsed;
  const markInput = parsed.data;
  const context = await getParkingContext();
  if (!context || markInput.groupId !== context.context.groupId) return { error: "停车地图权限已失效，请返回发现页。" };
  const { data, error } = await context.supabase.rpc("update_parking_mark", {
    p_mark_id: parsedId.data.id,
    p_geometry_type: markInput.geometryType,
    p_coordinates: markInput.coordinates,
    p_name: markInput.name,
    p_is_convenient: markInput.isConvenient,
    p_comment: markInput.comment,
  });
  if (error) return { error: accessError(error) ? "停车地图权限已失效，请返回发现页。" : userFacingError(error, "修改失败，请保留草稿后重试。") };
  const mark = parkingMarkFromRpcRow(data);
  if (!mark) return { error: "修改结果暂时无法读取，请刷新停车地图。" };
  revalidatePath("/");
  revalidatePath("/parking");
  return { mark, success: "停车记录已更新。" };
}

export async function deleteParkingMark(id: string): Promise<ParkingActionResult> {
  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success) return { error: "停车记录信息无效，请刷新后重试。" };
  const context = await getParkingContext();
  if (!context) return { error: "停车地图权限已失效，请返回发现页。" };
  const { data, error } = await context.supabase.rpc("delete_parking_mark", { p_mark_id: parsedId.data });
  if (error) return { error: accessError(error) ? "停车地图权限已失效，请返回发现页。" : userFacingError(error, "删除失败，请稍后重试。") };
  if (!Array.isArray(data) || !data[0]?.id) return { error: "删除结果暂时无法确认，请刷新停车地图。" };
  revalidatePath("/");
  revalidatePath("/parking");
  return { success: "停车记录已删除。" };
}

const accessInputSchema = z.object({ groupId: z.string().uuid(), userId: z.string().uuid() });

export async function grantParkingAccess(input: unknown): Promise<{ error?: string; success?: string }> {
  const parsed = accessInputSchema.safeParse(input);
  if (!parsed.success) return { error: "成员信息无效，请刷新后重试。" };
  const context = await getParkingContext();
  if (!context || parsed.data.groupId !== context.context.groupId) return { error: "停车授权管理权限已失效。" };
  const { error } = await context.supabase.rpc("grant_parking_access", { p_group_id: context.context.groupId, p_user_id: parsed.data.userId });
  if (error) return { error: accessError(error) ? "停车授权管理权限已失效。" : userFacingError(error, "授权失败，请稍后重试。") };
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/parking");
  return { success: "停车地图权限已添加。" };
}

export async function revokeParkingAccess(input: unknown): Promise<{ error?: string; success?: string }> {
  const parsed = accessInputSchema.safeParse(input);
  if (!parsed.success) return { error: "成员信息无效，请刷新后重试。" };
  const context = await getParkingContext();
  if (!context || parsed.data.groupId !== context.context.groupId) return { error: "停车授权管理权限已失效。" };
  const { error } = await context.supabase.rpc("revoke_parking_access", { p_group_id: context.context.groupId, p_user_id: parsed.data.userId });
  if (error) return { error: accessError(error) ? "停车授权管理权限已失效。" : userFacingError(error, "撤销失败，请稍后重试。") };
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/parking");
  return { success: "停车地图权限已撤销。" };
}
