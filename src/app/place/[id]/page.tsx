import Link from "next/link";
/* eslint-disable @next/next/no-img-element */
import { notFound, redirect } from "next/navigation";
import { PhotoDeleteButton } from "@/components/place/photo-delete-button";
import { ModerationControl } from "@/components/place/moderation-control";
import { VisitDeleteButton } from "@/components/place/visit-delete-button";
import { AppShell } from "@/components/shell/app-shell";
import { amapNavigationUrl, amapPlaceUrl } from "@/lib/amap/uri";
import { displayAmapAdministrativeLocation } from "@/lib/amap/location-display";
import { categoryOptions, sceneTagLabels } from "@/lib/mark-options";
import { createClient } from "@/lib/supabase/server";

type Profile = { display_name?: string } | null;
type PlacePhoto = { id: string; user_id: string; object_key: string; width: number | null; height: number | null; sort_order: number; visit_record_id: string | null };
type OpinionSummary = { bowl_strength: number | null; friend_count: number; tasty_count: number; comfortable_count: number; good_for_chat_count: number; good_value_count: number };
type TimelineRecord = { visit_record_id: string; visited_on: string | null; strength: number; tags: string[]; note: string | null; dishes: string[]; created_at: string; display_name: string; can_delete: boolean };
const categoryLabels = Object.fromEntries(categoryOptions) as Record<string, string>;
const opinionTagLabels: Record<string, string> = { tasty: "吃得香", comfortable: "坐得住", good_for_chat: "聊得开", good_value: "花得值" };
const bowlLabels = ["", "值得去", "想再去", "会专门去"];

export default async function PlaceDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string }> }) {
  const { id } = await params;
  const { returnTo } = await searchParams;
  const safeReturnTo = returnTo?.startsWith("/?") || returnTo === "/" ? returnTo : "/";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/place/${id}`)}`);
  const { data: groupPlace } = await supabase.from("group_places").select("id, group_id, place_id, primary_category, status").eq("id", id).maybeSingle();
  if (!groupPlace || groupPlace.status === "archived") notFound();
  const { data: membership } = await supabase.from("group_members").select("role").eq("group_id", groupPlace.group_id).eq("user_id", user.id).eq("status", "active").maybeSingle();
  const canModerate = membership?.role === "owner" || membership?.role === "admin";

  const [{ data: place }, { data: stats }, { data: marks }, { data: photos }, { data: opinionSummaries }, { data: timeline }] = await Promise.all([
    supabase.from("places").select("name, branch_name, address, city, district, phone, latitude, longitude").eq("id", groupPlace.place_id).maybeSingle(),
    supabase.from("group_place_stats").select("average_rating, mark_count, recommend_count").eq("group_place_id", groupPlace.id).maybeSingle(),
    supabase.from("place_marks").select("id, user_id, overall_rating, would_recommend, would_revisit, short_review, recommended_items, price_per_person, last_visited_on, updated_at, profiles(display_name)").eq("group_place_id", groupPlace.id).is("deleted_at", null).order("updated_at", { ascending: false }),
    supabase.from("photos").select("id, user_id, object_key, width, height, sort_order, visit_record_id").eq("group_place_id", groupPlace.id).is("deleted_at", null).is("hidden_at", null).order("sort_order"),
    supabase.rpc("get_group_place_opinion_summary", { p_group_place_id: groupPlace.id }),
    supabase.rpc("list_group_place_visit_timeline", { p_group_place_id: groupPlace.id }),
  ]);
  if (!place) notFound();

  const signedPhotos = await Promise.all(((photos ?? []) as PlacePhoto[]).map(async (photo) => {
    const { data } = await supabase.storage.from("place-photos").createSignedUrl(photo.object_key, 60 * 15);
    return data?.signedUrl ? { ...photo, signedUrl: data.signedUrl } : null;
  }));
  const visiblePhotos = signedPhotos.filter((photo): photo is NonNullable<typeof photo> => photo !== null);
  const photosByVisit = new Map<string, typeof visiblePhotos>();
  visiblePhotos.forEach((photo) => { if (photo.visit_record_id) photosByVisit.set(photo.visit_record_id, [...(photosByVisit.get(photo.visit_record_id) ?? []), photo]); });
  const markIds = marks?.map((mark) => mark.id) ?? [];
  const { data: markSceneTags } = markIds.length
    ? await supabase.from("place_mark_scene_tags").select("place_mark_id, scene_tag_slug").in("place_mark_id", markIds)
    : { data: [] };
  const scenesByMark = new Map<string, string[]>();
  (markSceneTags ?? []).forEach((scene) => scenesByMark.set(scene.place_mark_id, [...(scenesByMark.get(scene.place_mark_id) ?? []), scene.scene_tag_slug]));
  const sceneTotals = new Map<string, number>();
  (markSceneTags ?? []).forEach((scene) => sceneTotals.set(scene.scene_tag_slug, (sceneTotals.get(scene.scene_tag_slug) ?? 0) + 1));
  const isMarkedByMe = marks?.some((mark) => mark.user_id === user.id) ?? false;
  const memberNames = (marks ?? []).map((mark) => (mark.profiles as Profile)?.display_name ?? "成员");
  const opinionSummary = (opinionSummaries?.[0] as OpinionSummary | undefined);
  const v3Timeline = (timeline ?? []) as TimelineRecord[];
  const v3TagTotals = opinionSummary ? Object.entries({ tasty: Number(opinionSummary.tasty_count), comfortable: Number(opinionSummary.comfortable_count), good_for_chat: Number(opinionSummary.good_for_chat_count), good_value: Number(opinionSummary.good_value_count) }).filter(([, count]) => count > 0) : [];
  const amapTarget = { name: place.name, address: place.address, latitude: Number(place.latitude), longitude: Number(place.longitude) };

  return <AppShell><section className="place-detail">
    <Link className="back-button" href={safeReturnTo}>← 返回结果</Link>
    <p className="eyebrow">{categoryLabels[groupPlace.primary_category] ?? groupPlace.primary_category}</p><h1>{place.name}</h1>
    {place.branch_name && <p className="place-branch">{place.branch_name}</p>}<p className="place-address">{place.address || `${place.city ?? ""} ${place.district ?? ""}`}</p>
    <div className="place-location-tags" aria-label="高德地点信息">{place.district && <span className="location-tag location-tag--district">行政区 · {displayAmapAdministrativeLocation(place.city, place.district)}</span>}<span className="location-tag location-tag--source">高德地点</span></div>
    <div className="place-navigation"><a className="place-navigation__primary" href={amapNavigationUrl(amapTarget)} target="_blank" rel="noreferrer">去高德导航</a><a className="place-navigation__secondary" href={amapPlaceUrl(amapTarget)} target="_blank" rel="noreferrer">在高德地图查看</a></div><p className="place-navigation__hint">手机会优先唤起高德地图；未安装时将在网页地图中打开。</p>
    {opinionSummary?.friend_count ? <div className="place-stats"><strong>{"🥣".repeat(Number(opinionSummary.bowl_strength))}</strong><span>{bowlLabels[Number(opinionSummary.bowl_strength)]}</span><strong>{opinionSummary.friend_count}</strong><span>位朋友吃过</span></div> : stats?.mark_count ? <div className="place-stats"><strong>{Number(stats.average_rating).toFixed(1)}</strong><span>小组均分</span><strong>{stats.mark_count}</strong><span>人真实标记</span><strong>{stats.recommend_count}</strong><span>人推荐</span></div> : <p className="new-recommendation-note">已由成员真实验证并推荐；完整体验会在后续记录中补齐。</p>}
    {opinionSummary?.friend_count ? <div className="member-summary"><span>{opinionSummary.friend_count} 位朋友留下了真实体验</span></div> : memberNames.length > 0 && <div className="member-summary"><div className="member-avatar-stack" aria-label={`已由 ${memberNames.join("、")} 标记`}>{memberNames.slice(0, 4).map((name, index) => <span className="member-avatar" key={`${name}-${index}`}>{name.slice(0, 1)}</span>)}</div><span>{memberNames.length === 1 ? `${memberNames[0]} 的真实体验` : `${memberNames.length} 位朋友已留下体验`}</span></div>}
    {v3TagTotals.length > 0 ? <section className="scene-summary"><h2>好在哪儿</h2><div>{v3TagTotals.map(([slug, total]) => <span key={slug}>{opinionTagLabels[slug]} · {total}</span>)}</div></section> : sceneTotals.size > 0 && <section className="scene-summary"><h2>大家觉得适合</h2><div>{[...sceneTotals.entries()].sort((left, right) => right[1] - left[1]).map(([slug, total]) => <span key={slug}>{sceneTagLabels[slug] ?? slug} · {total}</span>)}</div></section>}
    {visiblePhotos.length > 0 && <section className="place-gallery"><div><h2>真实照片</h2><p>仅共同地图成员可见</p></div><div className="place-gallery__grid">{visiblePhotos.map((photo) => <figure key={photo.id}><img src={photo.signedUrl} alt={`${place.name} 的真实照片`} width={photo.width ?? undefined} height={photo.height ?? undefined} />{photo.user_id === user.id && <PhotoDeleteButton photoId={photo.id} />}{canModerate && <ModerationControl contentId={photo.id} contentType="photo" />}</figure>)}</div></section>}
    <Link className="primary-link" href={`/mark?place=${groupPlace.id}`}>{isMarkedByMe ? "再记一顿" : "我也去过"}</Link>
    <section className="opinions"><h2>饭后聊</h2>{v3Timeline.length ? <ul>{v3Timeline.map((record) => <li key={record.visit_record_id}><div className="opinion-heading"><span className="member-avatar">{record.display_name.slice(0, 1) || "食"}</span><strong>{record.display_name}</strong><b>{"🥣".repeat(record.strength)} {bowlLabels[record.strength]}</b></div>{record.tags.length > 0 && <div className="mark-scene-tags">{record.tags.map((tag) => <span key={tag}>{opinionTagLabels[tag] ?? tag}</span>)}</div>}{record.note && <p className="opinion-review">{record.note}</p>}{record.dishes.length > 0 && <p className="opinion-items">推荐：{record.dishes.join("、")}</p>}{(photosByVisit.get(record.visit_record_id) ?? []).length > 0 && <div className="visit-photo-strip">{(photosByVisit.get(record.visit_record_id) ?? []).map((photo) => <img alt={`${place.name} 的到访照片`} key={photo.id} src={photo.signedUrl} />)}</div>}{record.visited_on && <small>到访：{record.visited_on}</small>}{record.can_delete && <VisitDeleteButton visitRecordId={record.visit_record_id} />}{canModerate && <ModerationControl contentId={record.visit_record_id} contentType="visit" />}</li>)}</ul> : marks?.length ? <ul>{marks.map((mark) => { const profile = mark.profiles as Profile; const scenes = scenesByMark.get(mark.id) ?? []; return <li key={mark.id}><div className="opinion-heading"><span className="member-avatar">{profile?.display_name?.slice(0, 1) ?? "食"}</span><strong>{profile?.display_name ?? "成员"}</strong><b>{Number(mark.overall_rating).toFixed(1)} 分</b></div><p>{mark.would_recommend ? "愿意推荐" : "不推荐"}{mark.would_revisit ? ` · ${mark.would_revisit === "yes" ? "愿意再去" : mark.would_revisit === "maybe" ? "看情况" : "不愿意再去"}` : ""}</p>{scenes.length > 0 && <div className="mark-scene-tags">{scenes.map((slug) => <span key={slug}>{sceneTagLabels[slug] ?? slug}</span>)}</div>}{mark.short_review && <p className="opinion-review">{mark.short_review}</p>}{mark.recommended_items?.length ? <p className="opinion-items">推荐：{mark.recommended_items.join("、")}</p> : null}{mark.last_visited_on && <small>最近到访：{mark.last_visited_on}</small>}</li>; })}</ul> : <p className="empty-note">暂时还没有可展示的真实体验。</p>}</section>
  </section></AppShell>;
}
