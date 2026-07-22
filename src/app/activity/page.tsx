import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { createClient } from "@/lib/supabase/server";

function relativeTime(value: string) {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export default async function ActivityPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/activity");
  const { data: memberships } = await supabase.from("group_members").select("group_id").eq("user_id", user.id).eq("status", "active").limit(1);
  const groupId = memberships?.[0]?.group_id;
  if (!groupId) redirect("/admin");
  const { data: groupPlaces } = await supabase.from("group_places").select("id, place_id").eq("group_id", groupId).eq("status", "active");
  const groupPlaceIds = groupPlaces?.map((place) => place.id) ?? [];
  const placeIds = groupPlaces?.map((place) => place.place_id) ?? [];
  const [{ data: marks }, { data: places }] = await Promise.all([
    groupPlaceIds.length ? supabase.from("place_marks").select("id, group_place_id, user_id, overall_rating, would_recommend, short_review, recommended_items, updated_at").in("group_place_id", groupPlaceIds).is("deleted_at", null).order("updated_at", { ascending: false }).limit(30) : Promise.resolve({ data: [] }),
    placeIds.length ? supabase.from("places").select("id, name").in("id", placeIds) : Promise.resolve({ data: [] }),
  ]);
  const userIds = [...new Set((marks ?? []).map((mark) => mark.user_id))];
  const { data: profiles } = userIds.length ? await supabase.from("profiles").select("id, display_name").in("id", userIds) : { data: [] };
  const placeIdByGroupPlaceId = new Map((groupPlaces ?? []).map((place) => [place.id, place.place_id]));
  const placeById = new Map((places ?? []).map((place) => [place.id, place]));
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  return <AppShell activeNav="动态"><section className="activity-page"><p className="eyebrow">动态</p><h1>朋友最近留下的体验</h1><p className="activity-intro">每一条都是成员独立的真实体验，不合成为统一结论。</p>{marks?.length ? <ol className="activity-list">{marks.map((mark) => { const place = placeById.get(placeIdByGroupPlaceId.get(mark.group_place_id) ?? ""); const profile = profileById.get(mark.user_id); return <li key={mark.id}><span className="member-avatar">{profile?.display_name?.slice(0, 1) ?? "食"}</span><div><p><strong>{profile?.display_name ?? "成员"}</strong> 标记了 <Link href={`/place/${mark.group_place_id}`}>{place?.name ?? "一个地点"}</Link></p><b>{Number(mark.overall_rating).toFixed(1)} 分 · {mark.would_recommend ? "愿意推荐" : "不推荐"}</b>{mark.short_review && <blockquote>{mark.short_review}</blockquote>}{mark.recommended_items?.length ? <small>推荐：{mark.recommended_items.join("、")}</small> : null}<time>{relativeTime(mark.updated_at)}</time></div></li>; })}</ol> : <div className="empty-state"><strong>暂时还没有新动态</strong><span>新的真实标记会在这里出现。</span></div>}</section></AppShell>;
}
