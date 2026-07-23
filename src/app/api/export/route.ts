import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Member = { group_id: string; role: "owner" | "admin" | "member"; status: string };

function asDownload(data: unknown, name: string) {
  return new Response(`${JSON.stringify(data, null, 2)}\n`, { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const scope = request.nextUrl.searchParams.get("scope") === "group" ? "group" : "mine";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "请先登录后再导出。" }, { status: 401 });
  const { data: memberships } = await supabase.from("group_members").select("group_id, role, status").eq("user_id", user.id).eq("status", "active").limit(1);
  const membership = memberships?.[0] as Member | undefined;
  if (!membership) return Response.json({ error: "你尚未加入共同地图。" }, { status: 403 });
  if (scope === "group" && membership.role !== "owner") return Response.json({ error: "只有 Owner 可以导出整个共同地图。" }, { status: 403 });

  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dataClient = scope === "group" && adminKey
    ? createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, adminKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : supabase;
  if (scope === "group" && !adminKey) return Response.json({ error: "服务器尚未配置受控导出服务，请联系 Owner。" }, { status: 503 });

  const { data: group } = await dataClient.from("groups").select("id, name, slug, owner_user_id, status, created_at, updated_at").eq("id", membership.group_id).maybeSingle();
  const { data: groupPlaces } = await dataClient.from("group_places").select("id, group_id, place_id, primary_category, status, first_mark_id, created_by, created_at, updated_at").eq("group_id", membership.group_id);
  const groupPlaceIds = (groupPlaces ?? []).map((row) => row.id);
  const placeIds = (groupPlaces ?? []).map((row) => row.place_id);
  const markQuery = dataClient.from("place_marks").select("*").is("deleted_at", null);
  const wishlistQuery = dataClient.from("wishlist_items").select("*");
  const photoQuery = dataClient.from("photos").select("*").is("deleted_at", null);
  const marksResult = scope === "group"
    ? groupPlaceIds.length ? await markQuery.in("group_place_id", groupPlaceIds) : { data: [] }
    : await markQuery.eq("user_id", user.id);
  const marks = marksResult.data ?? [];
  const markIds = marks.map((row) => row.id);
  const [placesResult, visitsResult, wishlistResult, photosResult, profileResult, membersResult] = await Promise.all([
    placeIds.length ? dataClient.from("places").select("*").in("id", placeIds) : Promise.resolve({ data: [] }),
    scope === "group" ? markIds.length ? dataClient.from("visits").select("*").in("place_mark_id", markIds) : Promise.resolve({ data: [] }) : dataClient.from("visits").select("*").eq("user_id", user.id),
    scope === "group" ? groupPlaceIds.length ? wishlistQuery.in("group_place_id", groupPlaceIds) : Promise.resolve({ data: [] }) : wishlistQuery.eq("user_id", user.id),
    scope === "group" ? photoQuery.eq("group_id", membership.group_id) : photoQuery.eq("user_id", user.id),
    dataClient.from("profiles").select("id, display_name, avatar_path, bio, preferred_theme, created_at, updated_at").eq("id", user.id).maybeSingle(),
    scope === "group" ? dataClient.from("group_members").select("group_id, user_id, role, status, joined_at, removed_at, created_at, updated_at, profiles(display_name, avatar_path)").eq("group_id", membership.group_id) : Promise.resolve({ data: [] }),
  ]);
  const referencedGroupPlaceIds = new Set([...marks.map((row) => row.group_place_id), ...(wishlistResult.data ?? []).map((row) => row.group_place_id)]);
  const exportedGroupPlaces = scope === "group" ? groupPlaces ?? [] : (groupPlaces ?? []).filter((row) => referencedGroupPlaceIds.has(row.id));
  const exportedPlaceIds = new Set(exportedGroupPlaces.map((row) => row.place_id));
  const exportedPlaces = (placesResult.data ?? []).filter((row) => exportedPlaceIds.has(row.id));
  await supabase.rpc("record_data_export", { p_group_id: membership.group_id, p_scope: scope });
  const payload = {
    format: "foodprint-export/v1", exported_at: new Date().toISOString(), scope, actor_user_id: user.id,
    group: scope === "group" ? group : undefined, profile: scope === "mine" ? profileResult.data : undefined,
    group_members: scope === "group" ? membersResult.data ?? [] : undefined,
    places: exportedPlaces, group_places: exportedGroupPlaces, place_marks: marks,
    visits: visitsResult.data ?? [], wishlist_items: wishlistResult.data ?? [], photos_manifest: photosResult.data ?? [],
  };
  const stamp = new Date().toISOString().slice(0, 10);
  return asDownload(payload, `foodprint-${scope}-${stamp}.json`);
}
