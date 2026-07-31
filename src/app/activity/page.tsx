import Link from "next/link";
/* eslint-disable @next/next/no-img-element */
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { BowlIcon, toBowlLevel } from "@/components/recommendation/bowl-icon";
import { GoodAtIcon, goodAtOptions, isGoodAtSlug } from "@/components/recommendation/good-at-icon";
import { createClient } from "@/lib/supabase/server";

type VisitFeedItem = { visit_record_id: string; group_place_id: string; place_name: string; visited_on: string | null; strength: number; tags: string[]; note: string | null; dishes: string[]; created_at: string; display_name: string };
type VisitPhoto = { id: string; visit_record_id: string; object_key: string };
const bowlLabels = ["", "值得去", "想再去", "会专门去"];

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
  const { data: feed } = await supabase.rpc("list_group_visit_feed", { p_group_id: groupId });
  const visits = (feed ?? []) as VisitFeedItem[];
  const visitIds = visits.map((visit) => visit.visit_record_id);
  const { data: photos } = visitIds.length
    ? await supabase.from("photos").select("id, visit_record_id, object_key").in("visit_record_id", visitIds).is("deleted_at", null).is("hidden_at", null).order("sort_order")
    : { data: [] };
  const signedPhotos = await Promise.all(((photos ?? []) as VisitPhoto[]).map(async (photo) => {
    const { data } = await supabase.storage.from("place-photos").createSignedUrl(photo.object_key, 60 * 15);
    return data?.signedUrl ? { ...photo, signedUrl: data.signedUrl } : null;
  }));
  const photosByVisit = new Map<string, string[]>();
  signedPhotos.forEach((photo) => { if (photo) photosByVisit.set(photo.visit_record_id, [...(photosByVisit.get(photo.visit_record_id) ?? []), photo.signedUrl]); });

  return <AppShell activeNav="饭后聊"><section className="activity-page"><p className="eyebrow">饭后聊</p><h1>朋友最近留下的体验</h1><p className="activity-intro">每一条都是成员独立的真实体验，不合成为统一结论。</p>{visits.length ? <ol className="activity-list">{visits.map((visit) => <li key={visit.visit_record_id}><span className="member-avatar">{visit.display_name.slice(0, 1) || "食"}</span><div><p><strong>{visit.display_name}</strong> 去了 <Link href={`/place/${visit.group_place_id}`}>{visit.place_name}</Link></p><b className="inline-bowl-strength"><BowlIcon level={toBowlLevel(visit.strength)} size="xs" /> {bowlLabels[visit.strength]}</b>{visit.tags?.length ? <div className="mark-scene-tags good-at-tag-list">{visit.tags.map((tag) => <span key={tag}>{isGoodAtSlug(tag) && <GoodAtIcon slug={tag} size={28} />}{goodAtOptions.find((option) => option.slug === tag)?.label ?? tag}</span>)}</div> : null}{visit.note && <blockquote>{visit.note}</blockquote>}{visit.dishes.length ? <small>推荐：{visit.dishes.join("、")}</small> : null}{(photosByVisit.get(visit.visit_record_id) ?? []).length > 0 && <div className="activity-photo-strip">{photosByVisit.get(visit.visit_record_id)!.map((url, index) => <img key={url} src={url} alt={`${visit.place_name} 的到访照片 ${index + 1}`} />)}</div>}{visit.visited_on && <small>到访：{visit.visited_on}</small>}<time>{relativeTime(visit.created_at)}</time></div></li>)}</ol> : <div className="empty-state"><strong>暂时还没有新饭后聊</strong><span>新的到访记录会在这里出现。</span></div>}</section></AppShell>;
}
