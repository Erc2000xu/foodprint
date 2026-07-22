import { redirect } from "next/navigation";
import { InviteForm } from "@/components/admin/invite-form";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/login");
  const { data: memberships } = await supabase.from("group_members").select("group_id, role, status").eq("user_id", user.id).eq("status", "active").limit(1);
  const membership = memberships?.[0]; if (!membership) return <main className="auth-page"><section className="auth-card"><h1>尚未加入共同地图</h1><p>请通过朋友分享的邀请链接加入食迹。</p></section></main>;
  const { data: group } = await supabase.from("groups").select("id, name").eq("id", membership.group_id).single();
  const { data: members } = await supabase.from("group_members").select("user_id, role, status, profiles(display_name)").eq("group_id", membership.group_id).order("joined_at");
  const isManager = membership.role === "owner" || membership.role === "admin";
  return <main className="admin-page"><header><p className="eyebrow">{group?.name}</p><h1>我的与成员管理</h1><p>当前角色：{membership.role === "owner" ? "Owner" : membership.role === "admin" ? "Admin" : "成员"}</p></header>{isManager && group && <section className="admin-card"><h2>邀请朋友</h2><p>新成员会先验证邮箱，再通过邀请链接加入共同地图。</p><InviteForm groupId={group.id} /></section>}<section className="admin-card"><h2>成员</h2><ul className="member-list">{members?.map((member) => <li key={member.user_id}><span className="member-avatar">{(member.profiles as { display_name?: string } | null)?.display_name?.slice(0, 1) ?? "食"}</span><span><strong>{(member.profiles as { display_name?: string } | null)?.display_name ?? "成员"}</strong><small>{member.role} · {member.status}</small></span></li>)}</ul></section></main>;
}
