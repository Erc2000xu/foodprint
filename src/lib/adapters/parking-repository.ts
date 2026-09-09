import type { ParkingAccess, ParkingCoordinates, ParkingGeometryType, ParkingMark, ParkingMember } from "@/lib/parking/types";
import { normalizeParkingGeometry } from "@/lib/parking/geometry";

type SupabaseLike = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;
type RpcRow = Record<string, unknown>;

function firstRpcRow(value: unknown): RpcRow | null {
  if (Array.isArray(value)) return value[0] && typeof value[0] === "object" ? value[0] as RpcRow : null;
  return value && typeof value === "object" ? value as RpcRow : null;
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function booleanValue(value: unknown) {
  return value === true || value === "true";
}

function geometryType(value: unknown): ParkingGeometryType | null {
  return value === "point" || value === "line" || value === "area" ? value : null;
}

export function parkingMarkFromRpcRow(value: unknown): ParkingMark | null {
  const row = firstRpcRow(value);
  if (!row) return null;
  const type = geometryType(row.geometry_type);
  if (!type) return null;
  const normalized = normalizeParkingGeometry(type, row.coordinates);
  if (!normalized.ok) return null;
  const id = stringValue(row.id);
  const groupId = stringValue(row.group_id);
  const createdBy = stringValue(row.created_by);
  if (!id || !groupId || !createdBy) return null;
  return {
    id,
    groupId,
    createdBy,
    creatorDisplayName: stringValue(row.creator_display_name, "共同成员"),
    geometryType: type,
    coordinates: normalized.coordinates,
    coordinateSystem: "GCJ-02",
    name: nullableString(row.name),
    displayName: stringValue(row.display_name, stringValue(row.name, type === "point" ? "停车点" : type === "line" ? "路边停车" : "停车区域")),
    isConvenient: true,
    comment: nullableString(row.comment),
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at),
    canEdit: booleanValue(row.can_edit),
  };
}

export async function getParkingAccess(supabase: SupabaseLike, groupId: string): Promise<ParkingAccess | null> {
  const { data, error } = await supabase.rpc("get_parking_access", { p_group_id: groupId });
  if (error) return null;
  const row = firstRpcRow(data);
  if (!row) return { enabled: false, canUse: false, canManage: false, authorizedCount: 0 };
  return {
    enabled: booleanValue(row.enabled),
    canUse: booleanValue(row.can_use),
    canManage: booleanValue(row.can_manage),
    authorizedCount: Math.max(0, Number(row.authorized_count ?? 0)),
  };
}

export type ParkingMarksResult =
  | { status: "ok"; marks: ParkingMark[] }
  | { status: "denied"; marks: [] }
  | { status: "error"; marks: []; message?: string };

export async function listParkingMarks(supabase: SupabaseLike, groupId: string): Promise<ParkingMarksResult> {
  const marks: ParkingMark[] = [];
  let cursorUpdatedAt: string | null = null;
  let cursorId: string | null = null;
  const seen = new Set<string>();
  for (let page = 0; page < 20; page += 1) {
    const { data, error } = await supabase.rpc("list_parking_marks", {
      p_group_id: groupId,
      p_cursor_updated_at: cursorUpdatedAt,
      p_cursor_id: cursorId,
      p_limit: 100,
    });
    if (error) {
      const denied = /parking access required|not authorized|permission|42501/i.test(error.message ?? "");
      return denied ? { status: "denied", marks: [] } : { status: "error", marks: [], message: error.message };
    }
    const row = firstRpcRow(data);
    const items = row?.items && Array.isArray(row.items) ? row.items : [];
    for (const item of items) {
      const mark = parkingMarkFromRpcRow(item);
      if (!mark || seen.has(mark.id)) return { status: "error", marks: [], message: "停车记录数据无效。" };
      seen.add(mark.id);
      marks.push(mark);
    }
    const hasMore = booleanValue(row?.has_more);
    const next = row?.next_cursor && typeof row.next_cursor === "object" ? row.next_cursor as RpcRow : null;
    if (!hasMore) return { status: "ok", marks };
    const nextUpdatedAt = stringValue(next?.updated_at);
    const nextId = stringValue(next?.id);
    if (!nextUpdatedAt || !nextId || (nextUpdatedAt === cursorUpdatedAt && nextId === cursorId)) {
      return { status: "error", marks: [], message: "停车记录分页游标无效。" };
    }
    cursorUpdatedAt = nextUpdatedAt;
    cursorId = nextId;
  }
  return { status: "error", marks: [], message: "停车记录过多，请稍后重试。" };
}

export function parkingMarkInputFromRow(mark: ParkingMark) {
  return {
    geometryType: mark.geometryType,
    coordinates: mark.coordinates as ParkingCoordinates,
    name: mark.name ?? "",
    isConvenient: mark.isConvenient,
    comment: mark.comment ?? "",
  };
}

export async function listParkingMembers(supabase: SupabaseLike, groupId: string): Promise<ParkingMember[]> {
  const { data, error } = await supabase.rpc("list_parking_members_for_management", { p_group_id: groupId, p_query: null, p_limit: 100 });
  if (error || !Array.isArray(data)) return [];
  return data.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const row = value as RpcRow;
    const userId = stringValue(row.user_id);
    if (!userId) return [];
    return [{
      userId,
      displayName: stringValue(row.display_name, "未设置昵称"),
      email: stringValue(row.email),
      role: row.role === "owner" || row.role === "admin" ? row.role : "member",
      parkingGranted: booleanValue(row.parking_granted),
      grantedAt: nullableString(row.granted_at),
    } satisfies ParkingMember];
  });
}
