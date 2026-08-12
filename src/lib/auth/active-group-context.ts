import { recordServerMetric } from "@/lib/performance/server";

type SupabaseLike = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;

export type ActiveGroupContext = {
  userId: string;
  groupId: string;
  role: "owner" | "admin" | "member";
  groupName: string;
};

const validRoles = new Set(["owner", "admin", "member"]);

/**
 * Request-scoped identity context. The caller owns the single server client;
 * this helper deliberately has no global cache and falls back to the existing
 * table reads until the additive V2.2 RPC has reached the target database.
 */
export async function getActiveGroupContext(supabase: SupabaseLike, route = "/"): Promise<ActiveGroupContext | null> {
  const authStartedAt = performance.now();
  const { data: { user } } = await supabase.auth.getUser();
  recordServerMetric("auth.user", { route, durationMs: performance.now() - authStartedAt, outcome: user ? "ok" : "empty", hasSession: Boolean(user) });
  if (!user) return null;

  const rpcStartedAt = performance.now();
  const { data: rpcRows, error: rpcError } = await supabase.rpc("get_active_group_context_v2");
  recordServerMetric("auth.group_context", { route, durationMs: performance.now() - rpcStartedAt, outcome: rpcError ? "error" : rpcRows?.[0] ? "ok" : "empty" });
  const rpcRow = rpcRows?.[0] as { user_id?: string; group_id?: string; role?: string; group_name?: string } | undefined;
  if (!rpcError && rpcRow?.user_id === user.id && rpcRow.group_id && validRoles.has(rpcRow.role ?? "") && rpcRow.group_name) {
    return { userId: rpcRow.user_id, groupId: rpcRow.group_id, role: rpcRow.role as ActiveGroupContext["role"], groupName: rpcRow.group_name };
  }

  const membershipStartedAt = performance.now();
  const { data: memberships, error: membershipError } = await supabase.from("group_members").select("group_id, role").eq("user_id", user.id).eq("status", "active").limit(1);
  const membership = memberships?.[0] as { group_id?: string; role?: string } | undefined;
  recordServerMetric("auth.membership", { route, durationMs: performance.now() - membershipStartedAt, outcome: membershipError ? "error" : membership ? "ok" : "empty" });
  if (!membership?.group_id || !validRoles.has(membership.role ?? "")) return null;

  const { data: group } = await supabase.from("groups").select("name").eq("id", membership.group_id).maybeSingle();
  if (!group?.name) return null;
  return { userId: user.id, groupId: membership.group_id, role: membership.role as ActiveGroupContext["role"], groupName: group.name };
}
