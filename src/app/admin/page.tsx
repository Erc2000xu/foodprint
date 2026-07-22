import { redirect } from "next/navigation";
import { InviteForm } from "@/components/admin/invite-form";
import { InvitationList, type InvitationSummary } from "@/components/admin/invitation-list";
import { MemberStatusButton } from "@/components/admin/member-status-button";
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

  return <AppShell activeNav="我的"><section className="admin-page"><header><p className="eyebrow">{group?.name}</p><h1>我的与成员管理</h1><p>当前角色：{membership.role === "owner" ? "Owner" : membership.role === "admin" ? "Admin" : "成员"}</p></header>{isManager && group && <><section className="admin-card"><h2>邀请朋友</h2><p>新成员会先验证邮箱，再通过邀请链接加入共同地图。</p><InviteForm groupId={group.id} /></section><section className="admin-card"><h2>邀请记录</h2><p>为保护隐私，原始邀请链接只在生成时显示一次；这里仅显示状态和使用情况。</p><InvitationList invitations={invitationSummaries} /></section></>}<section className="admin-card"><h2>成员</h2><ul className="member-list">{members?.map((member) => { const profile = member.profiles as { display_name?: string } | null; const manageable = isManager && member.role === "member" && (member.status === "active" || member.status === "suspended"); return <li key={member.user_id}><span className="member-avatar">{profile?.display_name?.slice(0, 1) ?? "食"}</span><span className="member-list__identity"><strong>{profile?.display_name ?? "成员"}</strong><small>{member.role} · {member.status}</small></span>{manageable && <MemberStatusButton groupId={membership.group_id} userId={member.user_id} status={member.status} />}</li>; })}</ul></section></section></AppShell>;
}
