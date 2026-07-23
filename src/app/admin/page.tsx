import { redirect } from "next/navigation";
import { InviteForm } from "@/components/admin/invite-form";
import { InvitationList, type InvitationSummary } from "@/components/admin/invitation-list";
import { MemberStatusButton } from "@/components/admin/member-status-button";
import { DataExportPanel } from "@/components/admin/data-export-panel";
import { PersonalPlaceLists, type PersonalPlace } from "@/components/admin/personal-place-lists";
import { InstallGuide } from "@/components/pwa/install-guide";
import { AppShell } from "@/components/shell/app-shell";
import { createClient } from "@/lib/supabase/server";

type InvitationRow = {
  id: string;
  created_at: string;
  expires_at: string;
  max_uses: number;
  use_count: number;
  status: InvitationSummary["status"];
};

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: memberships } = await supabase.from("group_members").select("group_id, role, status").eq("user_id", user.id).eq("status", "active").limit(1);
  const membership = memberships?.[0];
  if (!membership) return <main className="auth-page"><section className="auth-card"><h1>尚未加入共同地图</h1><p>请通过朋友分享的邀请链接加入食迹。</p></section></main>;

  const { data: group } = await supabase.from("groups").select("id, name").eq("id", membership.group_id).single();
  const { data: members } = await supabase.from("group_members").select("user_id, role, status, profiles(display_name)").eq("group_id", membership.group_id).order("joined_at");
  const { data: groupPlaces } = await supabase.from("group_places").select("id, place_id").eq("group_id", membership.group_id).eq("status", "active");
  const groupPlaceIds = groupPlaces?.map((place) => place.id) ?? [];
  const placeIds = groupPlaces?.map((place) => place.place_id) ?? [];
  const [{ data: ownMarks }, { data: wishlistItems }, { data: places }] = await Promise.all([
    groupPlaceIds.length ? supabase.from("place_marks").select("group_place_id, overall_rating").eq("user_id", user.id).in("group_place_id", groupPlaceIds).is("deleted_at", null).order("updated_at", { ascending: false }) : Promise.resolve({ data: [] }),
    groupPlaceIds.length ? supabase.from("wishlist_items").select("group_place_id").eq("user_id", user.id).in("group_place_id", groupPlaceIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    placeIds.length ? supabase.from("places").select("id, name, address, city, district").in("id", placeIds) : Promise.resolve({ data: [] }),
  ]);
  const groupPlaceById = new Map((groupPlaces ?? []).map((place) => [place.id, place]));
  const placeById = new Map((places ?? []).map((place) => [place.id, place]));
  const toPersonalPlace = (groupPlaceId: string, rating?: number): PersonalPlace | undefined => {
    const groupPlace = groupPlaceById.get(groupPlaceId); const place = groupPlace && placeById.get(groupPlace.place_id);
    return place ? { groupPlaceId, name: place.name, address: place.address || [place.city, place.district].filter(Boolean).join(" · "), rating } : undefined;
  };
  const personalMarks = (ownMarks ?? []).flatMap((mark) => { const place = toPersonalPlace(mark.group_place_id, Number(mark.overall_rating)); return place ? [place] : []; });
  const personalWishlist = (wishlistItems ?? []).flatMap((item) => { const place = toPersonalPlace(item.group_place_id); return place ? [place] : []; });
  const isManager = membership.role === "owner" || membership.role === "admin";
  const { data: invitations } = isManager
    ? await supabase.rpc("list_group_invitations", { p_group_id: membership.group_id })
    : { data: [] };
  const invitationSummaries: InvitationSummary[] = ((invitations ?? []) as InvitationRow[]).map((invitation) => ({
    id: invitation.id,
    createdAt: invitation.created_at,
    expiresAt: invitation.expires_at,
    maxUses: invitation.max_uses,
    useCount: invitation.use_count,
    status: invitation.status,
  }));

  return <AppShell activeNav="我的"><section className="admin-page"><header><p className="eyebrow">{group?.name}</p><h1>我的与成员管理</h1><p>当前角色：{membership.role === "owner" ? "Owner" : membership.role === "admin" ? "Admin" : "成员"}</p></header><PersonalPlaceLists marks={personalMarks} wishlist={personalWishlist} /><section className="admin-card"><h2>安装食迹</h2><InstallGuide /></section><DataExportPanel isOwner={membership.role === "owner"} />{isManager && group && <><section className="admin-card"><h2>邀请朋友</h2><p>新成员会先验证邮箱，再通过邀请链接加入共同地图。</p><InviteForm groupId={group.id} /></section><section className="admin-card"><h2>邀请记录</h2><p>为保护隐私，原始邀请链接只在生成时显示一次；这里仅显示状态和使用情况。</p><InvitationList invitations={invitationSummaries} /></section></>}<section className="admin-card"><h2>成员</h2><ul className="member-list">{members?.map((member) => { const profile = member.profiles as { display_name?: string } | null; const manageable = isManager && member.role === "member" && (member.status === "active" || member.status === "suspended"); return <li key={member.user_id}><span className="member-avatar">{profile?.display_name?.slice(0, 1) ?? "食"}</span><span className="member-list__identity"><strong>{profile?.display_name ?? "成员"}</strong><small>{member.role} · {member.status}</small></span>{manageable && <MemberStatusButton groupId={membership.group_id} userId={member.user_id} status={member.status} />}</li>; })}</ul></section></section></AppShell>;
}
