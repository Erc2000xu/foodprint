import { redirect } from "next/navigation";
import { InviteForm } from "@/components/admin/invite-form";
import { InvitationList, type InvitationSummary } from "@/components/admin/invitation-list";
import { MemberRoleControl } from "@/components/admin/member-role-control";
import { MemberStatusButton } from "@/components/admin/member-status-button";
import { DataExportPanel } from "@/components/admin/data-export-panel";
import { PersonalPlaceLists, type PersonalPlace } from "@/components/admin/personal-place-lists";
import { DiscoveryBackfill, type DiscoveryBackfillPlace } from "@/components/admin/discovery-backfill";
import { InstallGuide } from "@/components/pwa/install-guide";
import { AppShell } from "@/components/shell/app-shell";
import { decryptInvitationToken } from "@/lib/invitations/token-crypto";
import { createClient } from "@/lib/supabase/server";

type InvitationRow = {
  id: string;
  created_at: string;
  expires_at: string;
  max_uses: number;
  use_count: number;
  status: InvitationSummary["status"];
  token_ciphertext: string | null;
};

type MemberDirectoryRow = {
  user_id: string;
  display_name: string;
  email: string;
  role: "owner" | "admin" | "member";
  status: "active" | "suspended" | "removed";
};

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase.from("group_members").select("group_id, role, status").eq("user_id", user.id).eq("status", "active").limit(1);
  const membership = memberships?.[0];
  if (!membership) return <main className="auth-page"><section className="auth-card"><h1>尚未加入共同地图</h1><p>请通过朋友分享的邀请链接加入食迹。</p></section></main>;

  const isOwner = membership.role === "owner";
  const isManager = isOwner || membership.role === "admin";
  const { data: group } = await supabase.from("groups").select("id, name").eq("id", membership.group_id).single();
  const { data: members } = isManager
    ? await supabase.rpc("list_group_members_for_management", { p_group_id: membership.group_id })
    : { data: [] };
  const { data: groupPlaces } = await supabase.from("group_places").select("id, place_id").eq("group_id", membership.group_id).eq("status", "active");
  const groupPlaceIds = groupPlaces?.map((place) => place.id) ?? [];
  const placeIds = groupPlaces?.map((place) => place.place_id) ?? [];
  const [{ data: ownMarks }, { data: wishlistItems }, { data: places }, { data: cuisines }, { data: photos }] = await Promise.all([
    groupPlaceIds.length ? supabase.from("place_marks").select("group_place_id, overall_rating").eq("user_id", user.id).in("group_place_id", groupPlaceIds).is("deleted_at", null).order("updated_at", { ascending: false }) : Promise.resolve({ data: [] }),
    groupPlaceIds.length ? supabase.from("wishlist_items").select("group_place_id").eq("user_id", user.id).in("group_place_id", groupPlaceIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    placeIds.length ? supabase.from("places").select("id, name, address, city, district").in("id", placeIds) : Promise.resolve({ data: [] }),
    groupPlaceIds.length ? supabase.from("place_cuisines").select("group_place_id, cuisine_slug").in("group_place_id", groupPlaceIds) : Promise.resolve({ data: [] }),
    groupPlaceIds.length ? supabase.from("photos").select("group_place_id").in("group_place_id", groupPlaceIds).is("deleted_at", null) : Promise.resolve({ data: [] }),
  ]);
  const groupPlaceById = new Map((groupPlaces ?? []).map((place) => [place.id, place]));
  const placeById = new Map((places ?? []).map((place) => [place.id, place]));
  const toPersonalPlace = (groupPlaceId: string, rating?: number): PersonalPlace | undefined => {
    const groupPlace = groupPlaceById.get(groupPlaceId);
    const place = groupPlace && placeById.get(groupPlace.place_id);
    return place ? { groupPlaceId, name: place.name, address: place.address || [place.city, place.district].filter(Boolean).join(" · "), rating } : undefined;
  };
  const personalMarks = (ownMarks ?? []).flatMap((mark) => {
    const place = toPersonalPlace(mark.group_place_id, Number(mark.overall_rating));
    return place ? [place] : [];
  });
  const personalWishlist = (wishlistItems ?? []).flatMap((item) => {
    const place = toPersonalPlace(item.group_place_id);
    return place ? [place] : [];
  });
  const cuisineByGroupPlace = new Map((cuisines ?? []).map((cuisine) => [cuisine.group_place_id, cuisine.cuisine_slug]));
  const photoGroupPlaceIds = new Set((photos ?? []).map((photo) => photo.group_place_id));
  const incompleteDiscoveryPlaces: DiscoveryBackfillPlace[] = (groupPlaces ?? []).flatMap((groupPlace) => {
    const place = placeById.get(groupPlace.place_id);
    if (!place || cuisineByGroupPlace.has(groupPlace.id)) return [];
    const missing = !photoGroupPlaceIds.has(groupPlace.id) ? "封面" : "";
    return [{ groupPlaceId: groupPlace.id, name: place.name, address: `${place.address || [place.city, place.district].filter(Boolean).join(" · ")}${missing ? `（另缺${missing}）` : ""}` }];
  });
  const { data: invitations } = isManager
    ? await supabase.rpc("list_group_invitations", { p_group_id: membership.group_id })
    : { data: [] };
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  const invitationSummaries: InvitationSummary[] = ((invitations ?? []) as InvitationRow[]).map((invitation) => {
    let inviteUrl: string | undefined;
    if (appUrl && invitation.token_ciphertext) {
      try { inviteUrl = `${appUrl}/join/${decryptInvitationToken(invitation.token_ciphertext)}`; } catch { inviteUrl = undefined; }
    }
    return {
      id: invitation.id,
      createdAt: invitation.created_at,
      expiresAt: invitation.expires_at,
      maxUses: invitation.max_uses,
      useCount: invitation.use_count,
      status: invitation.status,
      inviteUrl,
    };
  });

  return <AppShell activeNav="我的"><section className="admin-page"><header><p className="eyebrow">{group?.name}</p><h1>我的与成员管理</h1><p>当前角色：{isOwner ? "Owner" : membership.role === "admin" ? "Admin" : "成员"}</p></header><PersonalPlaceLists marks={personalMarks} wishlist={personalWishlist} /><section className="admin-card"><h2>安装食迹</h2><InstallGuide /></section><DataExportPanel isOwner={isOwner} />{isManager && <DiscoveryBackfill places={incompleteDiscoveryPlaces} />}{isManager && group && <><section className="admin-card"><h2>邀请朋友</h2><p>新成员会先验证邮箱，再通过邀请链接加入共同地图。</p><InviteForm groupId={group.id} /></section><section className="admin-card"><h2>邀请记录</h2><p>仅显示仍可使用的邀请。链接可直接入组，请勿公开转发；用完、撤销或过期的记录会自动隐藏，并保留在后台历史中。</p><InvitationList invitations={invitationSummaries} /></section></>}{isManager && <section className="admin-card"><h2>成员</h2><p>仅 Owner 与 Admin 可以查看成员目录；邮箱仅用于识别成员，不会向普通成员显示。</p><ul className="member-list">{((members ?? []) as MemberDirectoryRow[]).map((member) => { const canManageStatus = isOwner && member.role !== "owner" && (member.status === "active" || member.status === "suspended"); const canManageRole = isOwner && member.role !== "owner" && member.status === "active"; return <li key={member.user_id}><span className="member-avatar">{member.display_name.slice(0, 1) || "食"}</span><span className="member-list__identity"><strong>{member.display_name || "成员"}</strong><small>{member.email}</small><small>{member.role} · {member.status}</small></span>{canManageRole && <MemberRoleControl groupId={membership.group_id} userId={member.user_id} role={member.role as "admin" | "member"} />}{canManageStatus && <MemberStatusButton groupId={membership.group_id} userId={member.user_id} status={member.status as "active" | "suspended"} />}</li>; })}</ul></section>}</section></AppShell>;
}
