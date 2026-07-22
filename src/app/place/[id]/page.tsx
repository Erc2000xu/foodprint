import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { createClient } from "@/lib/supabase/server";

type Profile = { display_name?: string } | null;

export default async function PlaceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/place/${id}`)}`);
  const { data: groupPlace } = await supabase.from("group_places").select("id, place_id, primary_category, status").eq("id", id).maybeSingle();
  if (!groupPlace || groupPlace.status === "archived") notFound();
  const [{ data: place }, { data: stats }, { data: marks }] = await Promise.all([
    supabase.from("places").select("name, branch_name, address, city, district, phone").eq("id", groupPlace.place_id).maybeSingle(),
    supabase.from("group_place_stats").select("average_rating, mark_count, recommend_count").eq("group_place_id", groupPlace.id).maybeSingle(),
    supabase.from("place_marks").select("id, user_id, overall_rating, would_recommend, would_revisit, short_review, recommended_items, price_per_person, last_visited_on, updated_at, profiles(display_name)").eq("group_place_id", groupPlace.id).is("deleted_at", null).order("updated_at", { ascending: false }),
  ]);
  if (!place) notFound();
  const isMarkedByMe = marks?.some((mark) => mark.user_id === user.id) ?? false;
  return <AppShell><section className="place-detail"><Link className="back-button" href="/">← 返回地图</Link><p className="eyebrow">{groupPlace.primary_category}</p><h1>{place.name}</h1>{place.branch_name && <p className="place-branch">{place.branch_name}</p>}<p className="place-address">{place.address || `${place.city ?? ""} ${place.district ?? ""}`}</p><div className="place-stats"><strong>{Number(stats?.average_rating ?? 0).toFixed(1)}</strong><span>小组均分</span><strong>{stats?.mark_count ?? 0}</strong><span>人真实标记</span><strong>{stats?.recommend_count ?? 0}</strong><span>人推荐</span></div><Link className="primary-link" href={`/mark?place=${groupPlace.id}`}>{isMarkedByMe ? "编辑我的真实标记" : "我也去过"}</Link><section className="opinions"><h2>朋友的真实体验</h2>{marks?.length ? <ul>{marks.map((mark) => { const profile = mark.profiles as Profile; return <li key={mark.id}><div className="opinion-heading"><span className="member-avatar">{profile?.display_name?.slice(0, 1) ?? "食"}</span><strong>{profile?.display_name ?? "成员"}</strong><b>{Number(mark.overall_rating).toFixed(1)} 分</b></div><p>{mark.would_recommend ? "愿意推荐" : "不推荐"}{mark.would_revisit ? ` · ${mark.would_revisit === "yes" ? "愿意再去" : mark.would_revisit === "maybe" ? "看情况" : "不愿意再去"}` : ""}</p>{mark.short_review && <p className="opinion-review">{mark.short_review}</p>}{mark.recommended_items?.length ? <p className="opinion-items">推荐：{mark.recommended_items.join("、")}</p> : null}{mark.last_visited_on && <small>最近到访：{mark.last_visited_on}</small>}</li>; })}</ul> : <p className="empty-note">暂时还没有可展示的真实体验。</p>}</section></section></AppShell>;
}
