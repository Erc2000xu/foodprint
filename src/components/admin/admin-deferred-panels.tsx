import { use } from "react";
import { BusinessAreaBackfill } from "@/components/admin/business-area-backfill";
import { DiscoveryBackfill, type DiscoveryBackfillPlace } from "@/components/admin/discovery-backfill";
import { InvitationList, type InvitationSummary } from "@/components/admin/invitation-list";
import { InviteForm } from "@/components/admin/invite-form";
import { MemberRoleControl } from "@/components/admin/member-role-control";
import { MemberStatusButton } from "@/components/admin/member-status-button";
import { PlaceContentManagement, type HiddenContent, type ManagedCandidate, type ManagedPlace } from "@/components/admin/place-content-management";
import { decryptInvitationToken } from "@/lib/invitations/token-crypto";

export type AdminDeferredMember = { user_id: string; display_name: string; email: string; role: "owner" | "admin" | "member"; status: "active" | "suspended" | "removed" };
export type AdminDeferredInvitation = { id: string; created_at: string; expires_at: string; max_uses: number; use_count: number; status: InvitationSummary["status"]; token_ciphertext: string | null };
export type AdminDeferredPlace = { id: string; place_id: string };
export type AdminDeferredPlaceInfo = { id: string; name: string; address: string | null; city: string | null; district: string | null };
export type AdminDeferredCuisine = { group_place_id: string; cuisine_slug: string };
export type AdminDeferredPhoto = { group_place_id: string };
export type AdminDeferredManagedPlace = { group_place_id: string; place_name: string; address: string | null; status: "active" | "archived"; archived_at: string | null; archived_reason: string | null; archived_by_name: string | null; opinion_count: number | string; visit_count: number | string; photo_count: number | string };
export type AdminDeferredHiddenContent = { content_id: string; content_type: "visit" | "photo"; place_name: string; hidden_reason: string; hidden_at: string };
export type AdminDeferredCandidate = { candidate_id: string; place_name: string; status: "pending" | "dismissed"; resolution_type: string | null; resolution_reason: string | null };

export type AdminDeferredData = {
  members: AdminDeferredMember[];
  invitations: AdminDeferredInvitation[];
  groupPlaces: AdminDeferredPlace[];
  places: AdminDeferredPlaceInfo[];
  cuisines: AdminDeferredCuisine[];
  photos: AdminDeferredPhoto[];
  activeManaged: AdminDeferredManagedPlace[];
  archivedManaged: AdminDeferredManagedPlace[];
  hiddenManaged: AdminDeferredHiddenContent[];
  pendingManaged: AdminDeferredCandidate[];
  removedManaged: AdminDeferredCandidate[];
};

function roleLabel(role: AdminDeferredMember["role"]) { return ({ owner: "Owner", admin: "Admin", member: "Member" })[role]; }
function statusLabel(status: AdminDeferredMember["status"]) { return ({ active: "正常使用", suspended: "暂停使用", removed: "已移除" })[status]; }
function managedPlaces(rows: AdminDeferredManagedPlace[]): ManagedPlace[] { return rows.map((row) => ({ groupPlaceId: row.group_place_id, name: row.place_name, address: row.address ?? "", status: row.status, archivedAt: row.archived_at, archivedReason: row.archived_reason, archivedByName: row.archived_by_name, opinionCount: Number(row.opinion_count), visitCount: Number(row.visit_count), photoCount: Number(row.photo_count) })); }
function managedCandidates(rows: AdminDeferredCandidate[]): ManagedCandidate[] { return rows.map((row) => ({ id: row.candidate_id, name: row.place_name, status: row.status, resolutionType: row.resolution_type, resolutionReason: row.resolution_reason })); }

export function AdminDeferredPanels({ data, groupId, appUrl, isOwner, isManager }: { data: Promise<AdminDeferredData>; groupId: string; appUrl?: string; isOwner: boolean; isManager: boolean }) {
  const deferred = use(data);
  if (!isManager && !isOwner) return null;
  const placeById = new Map(deferred.places.map((place) => [place.id, place]));
  const cuisineIds = new Set(deferred.cuisines.map((cuisine) => cuisine.group_place_id));
  const photoIds = new Set(deferred.photos.map((photo) => photo.group_place_id));
  const incompleteDiscoveryPlaces: DiscoveryBackfillPlace[] = deferred.groupPlaces.flatMap((groupPlace) => {
    const place = placeById.get(groupPlace.place_id);
    if (!place || cuisineIds.has(groupPlace.id)) return [];
    const missing = !photoIds.has(groupPlace.id) ? "封面" : "";
    return [{ groupPlaceId: groupPlace.id, name: place.name, address: `${place.address || [place.city, place.district].filter(Boolean).join(" · ")}${missing ? `（另缺${missing}）` : ""}` }];
  });
  const invitationSummaries: InvitationSummary[] = deferred.invitations.map((invitation) => {
    let inviteUrl: string | undefined;
    if (appUrl && invitation.token_ciphertext) {
      try { inviteUrl = `${appUrl}/join/${decryptInvitationToken(invitation.token_ciphertext)}`; } catch { inviteUrl = undefined; }
    }
    return { id: invitation.id, createdAt: invitation.created_at, expiresAt: invitation.expires_at, maxUses: invitation.max_uses, useCount: invitation.use_count, status: invitation.status, inviteUrl };
  });
  return <>
    {isManager && <><PlaceContentManagement activePlaces={managedPlaces(deferred.activeManaged)} archivedPlaces={managedPlaces(deferred.archivedManaged)} hiddenContent={deferred.hiddenManaged.map((row): HiddenContent => ({ id: row.content_id, type: row.content_type, placeName: row.place_name, reason: row.hidden_reason, hiddenAt: row.hidden_at }))} pendingCandidates={managedCandidates(deferred.pendingManaged)} removedCandidates={managedCandidates(deferred.removedManaged)} /><DiscoveryBackfill places={incompleteDiscoveryPlaces} /><section className="admin-card"><h2>邀请朋友</h2><p>新成员验证邮箱后，可通过邀请链接加入共同地图。</p><InviteForm groupId={groupId} /></section><section className="admin-card"><h2>邀请记录</h2><p>这里只显示仍有效的邀请。请私下发送链接；失效、撤销和用完的邀请会保留在后台记录中。</p><InvitationList invitations={invitationSummaries} /></section></>}
    {isOwner && <><BusinessAreaBackfill /><section className="admin-card"><h2>成员</h2><p className="member-role-explainer"><b>Owner</b>：查看成员信息，管理角色、状态和共同地图数据。<br /><b>Admin</b>：管理邀请，协助维护地点内容。<br /><b>Member</b>：记录和浏览共同地图。</p><ol className="member-join-steps"><li><b>分享邀请</b><span>Owner 或 Admin 创建有效邀请链接，并私下发送给朋友。</span></li><li><b>创建账号</b><span>朋友打开链接，填写昵称、邮箱和至少 8 位密码。</span></li><li><b>验证邮箱</b><span>验证邮箱后，可通过邀请链接加入共同地图。</span></li></ol><ul className="member-list">{deferred.members.map((member) => { const canManageStatus = member.role !== "owner" && (member.status === "active" || member.status === "suspended"); const canManageRole = member.role !== "owner" && member.status === "active"; return <li key={member.user_id}><div className="member-card__identity"><span className="member-avatar">{member.display_name.slice(0, 1) || "食"}</span><span className="member-list__identity"><strong>{member.display_name || "未设置昵称"}</strong><small className="member-email">{member.email}</small><small>{roleLabel(member.role)} · {statusLabel(member.status)}</small></span></div>{(canManageRole || canManageStatus) && <div className="member-card__actions">{canManageRole && <MemberRoleControl groupId={groupId} userId={member.user_id} role={member.role as "admin" | "member"} />}{canManageStatus && <MemberStatusButton groupId={groupId} userId={member.user_id} status={member.status as "active" | "suspended"} />}</div>}</li>; })}</ul></section></>}
  </>;
}
