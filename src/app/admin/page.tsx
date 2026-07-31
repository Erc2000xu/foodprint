import { redirect } from "next/navigation";
import { InviteForm } from "@/components/admin/invite-form";
import { InvitationList, type InvitationSummary } from "@/components/admin/invitation-list";
import { MemberRoleControl } from "@/components/admin/member-role-control";
import { MemberStatusButton } from "@/components/admin/member-status-button";
import { DataExportPanel } from "@/components/admin/data-export-panel";
import { LeaveGroupButton } from "@/components/admin/leave-group-button";
import { PersonalPlaceLists, type PersonalPlace } from "@/components/admin/personal-place-lists";
import { DiscoveryBackfill, type DiscoveryBackfillPlace } from "@/components/admin/discovery-backfill";
import { InstallGuide } from "@/components/pwa/install-guide";
import { PlaceContentManagement, type HiddenContent, type ManagedCandidate, type ManagedPlace } from "@/components/admin/place-content-management";
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
type ManagedPlaceRow = { group_place_id: string; place_name: string; address: string | null; status: "active" | "archived"; archived_at: string | null; archived_reason: string | null; archived_by_name: string | null; opinion_count: number | string; visit_count: number | string; photo_count: number | string };
type HiddenContentRow = { content_id: string; content_type: "visit" | "photo"; place_name: string; hidden_reason: string; hidden_at: string };
type ManagedCandidateRow = { candidate_id: string; place_name: string; status: "pending" | "dismissed"; resolution_type: string | null; resolution_reason: string | null };

const roleLabel = (role: MemberDirectoryRow["role"]) => ({ owner: "Owner", admin: "Admin", member: "Member" })[role];
const statusLabel = (status: MemberDirectoryRow["status"]) => ({ active: "Active", suspended: "Suspended", removed: "Removed" })[status];

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
  const { data: members } = isOwner
    ? await supabase.rpc("list_group_members_for_management", { p_group_id: membership.group_id })
    : { data: [] };
  const { data: groupPlaces } = await supabase.from("group_places").select("id, place_id").eq("group_id", membership.group_id).eq("status", "active");
  const groupPlaceIds = groupPlaces?.map((place) => place.id) ?? [];
  const placeIds = groupPlaces?.map((place) => place.place_id) ?? [];
  const [{ data: ownMarks }, { data: wishlistItems }, { data: places }, { data: cuisines }, { data: photos }] = await Promise.all([
    groupPlaceIds.length ? supabase.from("place_marks").select("group_place_id").eq("user_id", user.id).in("group_place_id", groupPlaceIds).is("deleted_at", null).order("updated_at", { ascending: false }) : Promise.resolve({ data: [] }),
    groupPlaceIds.length ? supabase.from("wishlist_items").select("group_place_id").eq("user_id", user.id).in("group_place_id", groupPlaceIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    placeIds.length ? supabase.from("places").select("id, name, address, city, district").in("id", placeIds) : Promise.resolve({ data: [] }),
    groupPlaceIds.length ? supabase.from("place_cuisines").select("group_place_id, cuisine_slug").in("group_place_id", groupPlaceIds) : Promise.resolve({ data: [] }),
    groupPlaceIds.length ? supabase.from("photos").select("group_place_id").in("group_place_id", groupPlaceIds).is("deleted_at", null) : Promise.resolve({ data: [] }),
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
  const [{ data: activeManaged }, { data: archivedManaged }, { data: hiddenManaged }, { data: pendingManaged }, { data: removedManaged }] = isManager ? await Promise.all([
    supabase.rpc("list_group_place_management", { p_group_id: membership.group_id, p_status: "active", p_query: null, p_cursor: null, p_limit: 50 }),
    supabase.rpc("list_group_place_management", { p_group_id: membership.group_id, p_status: "archived", p_query: null, p_cursor: null, p_limit: 50 }),
    supabase.rpc("list_hidden_group_content", { p_group_id: membership.group_id, p_limit: 50 }),
    supabase.rpc("list_managed_place_candidates", { p_group_id: membership.group_id, p_status: "pending", p_limit: 50 }),
    supabase.rpc("list_managed_place_candidates", { p_group_id: membership.group_id, p_status: "dismissed", p_limit: 50 }),
  ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const managedPlaces = (rows: ManagedPlaceRow[] | null): ManagedPlace[] => (rows ?? []).map((row) => ({ groupPlaceId: row.group_place_id, name: row.place_name, address: row.address ?? "", status: row.status, archivedAt: row.archived_at, archivedReason: row.archived_reason, archivedByName: row.archived_by_name, opinionCount: Number(row.opinion_count), visitCount: Number(row.visit_count), photoCount: Number(row.photo_count) }));
  const hiddenContent: HiddenContent[] = ((hiddenManaged ?? []) as HiddenContentRow[]).map((row) => ({ id: row.content_id, type: row.content_type, placeName: row.place_name, reason: row.hidden_reason, hiddenAt: row.hidden_at }));
  const managedCandidates = (rows: ManagedCandidateRow[] | null): ManagedCandidate[] => (rows ?? []).map((row) => ({ id: row.candidate_id, name: row.place_name, status: row.status, resolutionType: row.resolution_type, resolutionReason: row.resolution_reason }));
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

  return <AppShell activeNav="我的"><section className="admin-page"><header><p className="eyebrow">{group?.name}</p><h1>我的与成员管理</h1><p>当前角色：{roleLabel(membership.role as MemberDirectoryRow["role"])}</p></header><PersonalPlaceLists marks={personalMarks} wishlist={personalWishlist} /><section className="admin-card"><h2>安装食迹</h2><InstallGuide /></section>{isManager && <><PlaceContentManagement activePlaces={managedPlaces(activeManaged as ManagedPlaceRow[] | null)} archivedPlaces={managedPlaces(archivedManaged as ManagedPlaceRow[] | null)} hiddenContent={hiddenContent} pendingCandidates={managedCandidates(pendingManaged as ManagedCandidateRow[] | null)} removedCandidates={managedCandidates(removedManaged as ManagedCandidateRow[] | null)} /><DiscoveryBackfill places={incompleteDiscoveryPlaces} /></>}{isManager && group && <><section className="admin-card"><h2>邀请朋友</h2><p>新成员会先验证邮箱，再通过邀请链接加入共同地图。</p><InviteForm groupId={group.id} /></section><section className="admin-card"><h2>邀请记录</h2><p>仅显示仍可使用的邀请。链接可直接入组，请勿公开转发；用完、撤销或过期的记录会自动隐藏，并保留在后台历史中。</p><InvitationList invitations={invitationSummaries} /></section></>}{isOwner && <section className="admin-card"><h2>成员</h2><p className="member-role-explainer">角色说明：<b>Owner</b> 可查看成员邮箱、管理成员角色与状态并导出全组数据；<b>Admin</b> 可以管理邀请、地点和小组内容，但不能查看成员邮箱、管理成员角色或导出全组账户资料；<b>Member</b> 可记录和浏览共同地图。除 Owner 专用成员管理区外，产品只显示成员昵称。</p><ol className="member-join-steps"><li><b>分享邀请</b><span>Owner 或 Admin 创建有效邀请链接，并私下发送给朋友。</span></li><li><b>创建账号</b><span>朋友打开链接，填写昵称、邮箱和至少 8 位密码。</span></li><li><b>验证邮箱</b><span>验证邮箱后自动加入共同地图。</span></li></ol><ul className="member-list">{((members ?? []) as MemberDirectoryRow[]).map((member) => { const canManageStatus = member.role !== "owner" && (member.status === "active" || member.status === "suspended"); const canManageRole = member.role !== "owner" && member.status === "active"; return <li key={member.user_id}><div className="member-card__identity"><span className="member-avatar">{member.display_name.slice(0, 1) || "食"}</span><span className="member-list__identity"><strong>{member.display_name || "未命名用户"}</strong><small className="member-email">{member.email}</small><small>{roleLabel(member.role)} · {statusLabel(member.status)}</small></span></div>{(canManageRole || canManageStatus) && <div className="member-card__actions">{canManageRole && <MemberRoleControl groupId={membership.group_id} userId={member.user_id} role={member.role as "admin" | "member"} />}{canManageStatus && <MemberStatusButton groupId={membership.group_id} userId={member.user_id} status={member.status as "active" | "suspended"} />}</div>}</li>; })}</ul></section>}<DataExportPanel isOwner={isOwner} /><LeaveGroupButton groupId={membership.group_id} isOwner={isOwner} /></section></AppShell>;
}
