import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DataExportPanel } from "@/components/admin/data-export-panel";
import { LeaveGroupButton } from "@/components/admin/leave-group-button";
import { PersonalPlaceLists, type PersonalPlace } from "@/components/admin/personal-place-lists";
import { InstallGuide } from "@/components/pwa/install-guide";
import { ContentReadyMarker } from "@/components/navigation/content-ready-marker";
import { AdminDeferredPanels, type AdminDeferredData } from "@/components/admin/admin-deferred-panels";
import { AdminDeferredErrorBoundary } from "@/components/admin/admin-deferred-error-boundary";
import { AppShell } from "@/components/shell/app-shell";
import { getActiveGroupContext } from "@/lib/auth/active-group-context";
import { createClient } from "@/lib/supabase/server";

type MemberDirectoryRow = {
  user_id: string;
  display_name: string;
  email: string;
  role: "owner" | "admin" | "member";
  status: "active" | "suspended" | "removed";
};

const roleLabel = (role: MemberDirectoryRow["role"]) => ({ owner: "Owner", admin: "Admin", member: "Member" })[role];

export default async function AdminPage() {
  const supabase = await createClient();
  const context = await getActiveGroupContext(supabase, "/admin");
  if (!context) redirect("/login");
  const user = { id: context.userId };
  const membership = { group_id: context.groupId, role: context.role, status: "active" as const };

  const isOwner = membership.role === "owner";
  const isManager = isOwner || membership.role === "admin";
  const group = { id: context.groupId, name: context.groupName };
  const [{ data: ownMarks }, { data: wishlistItems }] = await Promise.all([
    supabase.from("place_marks").select("group_place_id").eq("user_id", user.id).is("deleted_at", null).order("updated_at", { ascending: false }).limit(10),
    supabase.from("wishlist_items").select("group_place_id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
  ]);
  const personalGroupPlaceIds = [...new Set([...(ownMarks ?? []).map((mark) => mark.group_place_id), ...(wishlistItems ?? []).map((item) => item.group_place_id)])];
  const { data: groupPlaces } = personalGroupPlaceIds.length
    ? await supabase.from("group_places").select("id, place_id").eq("group_id", membership.group_id).eq("status", "active").in("id", personalGroupPlaceIds).limit(20)
    : { data: [] };
  const placeIds = groupPlaces?.map((place) => place.place_id) ?? [];
  const [{ data: places }] = await Promise.all([
    placeIds.length ? supabase.from("places").select("id, name, address, city, district").in("id", placeIds) : Promise.resolve({ data: [] }),
  ]);
  const groupPlaceById = new Map((groupPlaces ?? []).map((place) => [place.id, place]));
  const placeById = new Map((places ?? []).map((place) => [place.id, place]));
  const toPersonalPlace = (groupPlaceId: string): PersonalPlace | undefined => {
    const groupPlace = groupPlaceById.get(groupPlaceId);
    const place = groupPlace && placeById.get(groupPlace.place_id);
    return place ? { groupPlaceId, name: place.name, address: place.address || [place.city, place.district].filter(Boolean).join(" · ") } : undefined;
  };
  const personalMarks = (ownMarks ?? []).flatMap((mark) => {
    const place = toPersonalPlace(mark.group_place_id);
    return place ? [place] : [];
  });
  const personalWishlist = (wishlistItems ?? []).flatMap((item) => {
    const place = toPersonalPlace(item.group_place_id);
    return place ? [place] : [];
  });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  const deferredAdminData: Promise<AdminDeferredData> = (async () => {
    const membersResult = isOwner ? await supabase.rpc("list_group_members_for_management", { p_group_id: membership.group_id }) : { data: [] };
    if (!isManager) return { members: [], invitations: [], groupPlaces: [], places: [], cuisines: [], photos: [], activeManaged: [], archivedManaged: [], hiddenManaged: [], pendingManaged: [], removedManaged: [] };
    const { data: allGroupPlaces } = await supabase.from("group_places").select("id, place_id").eq("group_id", membership.group_id).eq("status", "active").order("created_at", { ascending: false }).limit(120);
    const allGroupPlaceIds = (allGroupPlaces ?? []).map((place) => place.id);
    const allPlaceIds = (allGroupPlaces ?? []).map((place) => place.place_id);
    const [invitationsResult, placesResult, cuisinesResult, photosResult, activeResult, archivedResult, hiddenResult, pendingResult, removedResult] = await Promise.all([
      supabase.rpc("list_group_invitations", { p_group_id: membership.group_id }),
      allPlaceIds.length ? supabase.from("places").select("id, name, address, city, district").in("id", allPlaceIds).limit(120) : Promise.resolve({ data: [] }),
      allGroupPlaceIds.length ? supabase.from("place_cuisines").select("group_place_id, cuisine_slug").in("group_place_id", allGroupPlaceIds).limit(240) : Promise.resolve({ data: [] }),
      allGroupPlaceIds.length ? supabase.from("photos").select("group_place_id").in("group_place_id", allGroupPlaceIds).is("deleted_at", null).limit(240) : Promise.resolve({ data: [] }),
      supabase.rpc("list_group_place_management", { p_group_id: membership.group_id, p_status: "active", p_query: null, p_cursor: null, p_limit: 10 }),
      supabase.rpc("list_group_place_management", { p_group_id: membership.group_id, p_status: "archived", p_query: null, p_cursor: null, p_limit: 10 }),
      supabase.rpc("list_hidden_group_content", { p_group_id: membership.group_id, p_limit: 10 }),
      supabase.rpc("list_managed_place_candidates", { p_group_id: membership.group_id, p_status: "pending", p_limit: 10 }),
      supabase.rpc("list_managed_place_candidates", { p_group_id: membership.group_id, p_status: "dismissed", p_limit: 10 }),
    ]);
    return {
      members: (membersResult.data ?? []) as AdminDeferredData["members"],
      invitations: (invitationsResult.data ?? []) as AdminDeferredData["invitations"],
      groupPlaces: (allGroupPlaces ?? []) as AdminDeferredData["groupPlaces"],
      places: (placesResult.data ?? []) as AdminDeferredData["places"],
      cuisines: (cuisinesResult.data ?? []) as AdminDeferredData["cuisines"],
      photos: (photosResult.data ?? []) as AdminDeferredData["photos"],
      activeManaged: (activeResult.data ?? []) as AdminDeferredData["activeManaged"],
      archivedManaged: (archivedResult.data ?? []) as AdminDeferredData["archivedManaged"],
      hiddenManaged: (hiddenResult.data ?? []) as AdminDeferredData["hiddenManaged"],
      pendingManaged: (pendingResult.data ?? []) as AdminDeferredData["pendingManaged"],
      removedManaged: (removedResult.data ?? []) as AdminDeferredData["removedManaged"],
    };
  })();

  return <AppShell activeNav="我的" groupName={group.name}><section className="admin-page"><header><p className="eyebrow">{group.name}</p><h1>我的</h1><p>当前身份：{roleLabel(membership.role as MemberDirectoryRow["role"])}</p></header><PersonalPlaceLists marks={personalMarks} wishlist={personalWishlist} /><section className="admin-card"><h2>安装食迹 App</h2><InstallGuide /></section><ContentReadyMarker route="/admin" /><AdminDeferredErrorBoundary><Suspense fallback={<section className="admin-card" aria-live="polite"><h2>管理区正在加载</h2><p>个人摘要已经可用，其余管理面板稍后出现。</p></section>}><AdminDeferredPanels data={deferredAdminData} groupId={group.id} appUrl={appUrl} isOwner={isOwner} isManager={isManager} /></Suspense></AdminDeferredErrorBoundary><DataExportPanel isOwner={isOwner} /><LeaveGroupButton groupId={membership.group_id} isOwner={isOwner} /></section></AppShell>;
}
