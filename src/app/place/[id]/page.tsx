import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { NavigationIntentLink } from "@/components/navigation/navigation-coordinator";
import { PhotoDeleteButton } from "@/components/place/photo-delete-button";
import { VisitPhotoRepair } from "@/components/place/visit-photo-repair";
import { ContentReadyMarker } from "@/components/navigation/content-ready-marker";
import { PrivatePhoto } from "@/components/photo/private-photo";
import { ModerationControl } from "@/components/place/moderation-control";
import { VisitDeleteButton } from "@/components/place/visit-delete-button";
import { PlaceManagementControl } from "@/components/place/place-management-control";
import { OpinionCounts } from "@/components/discover/opinion-counts";
import { BowlIcon, toBowlLevel } from "@/components/recommendation/bowl-icon";
import { GoodAtIcon, isGoodAtSlug } from "@/components/recommendation/good-at-icon";
import { AppShell } from "@/components/shell/app-shell";
import { amapNavigationUrl, amapPlaceUrl } from "@/lib/amap/uri";
import { displayAmapLocationChain } from "@/lib/amap/location-display";
import { categoryOptions, sceneTagLabels } from "@/lib/mark-options";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroupContext } from "@/lib/auth/active-group-context";
import { selectPhotoResource } from "@/lib/photos/photo-resource";

type Profile = { display_name?: string } | null;
type PlacePhoto = { id: string; user_id: string; object_key: string; width: number | null; height: number | null; thumbnail_object_key: string | null; thumbnail_width: number | null; thumbnail_height: number | null; sort_order: number; visit_record_id: string | null };
type OpinionSummary = { bowl_strength: number | null; friend_count: number; tasty_count: number; comfortable_count: number; good_for_chat_count: number; good_value_count: number };
type TimelineRecord = { visit_record_id: string; visited_on: string | null; strength: number; tags: string[]; note: string | null; dishes: string[]; created_at: string; display_name: string; can_delete: boolean };
type PlaceDetailReadModel = {
  place_name: string;
  branch_name: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  average_rating: number | null;
  mark_count: number | null;
  recommend_count: number | null;
  bowl_strength: number | null;
  friend_count: number;
  tasty_count: number;
  comfortable_count: number;
  good_for_chat_count: number;
  good_value_count: number;
  timeline: unknown;
  gallery_thumbnail_object_keys: string[];
};
const categoryLabels = Object.fromEntries(categoryOptions) as Record<string, string>;
const opinionTagLabels: Record<string, string> = { tasty: "吃得香", comfortable: "坐得住", good_for_chat: "聊得开", good_value: "花得值" };
const bowlLabels = ["", "值得去", "想再去", "会专门去"];

export default async function PlaceDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string }> }) {
  const { id } = await params;
  const { returnTo } = await searchParams;
  const safeReturnTo = returnTo?.startsWith("/?") || returnTo === "/" ? returnTo : "/";
  const supabase = await createClient();
  const context = await getActiveGroupContext(supabase, "/place/:id");
  if (!context) redirect(`/login?next=${encodeURIComponent(`/place/${id}`)}`);
  const user = { id: context.userId };
  const { data: groupPlace } = await supabase.from("group_places").select("id, group_id, place_id, primary_category, status").eq("id", id).maybeSingle();
  if (!groupPlace || groupPlace.group_id !== context.groupId || groupPlace.status === "archived") notFound();
  const canModerate = context.role === "owner" || context.role === "admin";

  const { data: detailRows } = await supabase.rpc("get_group_place_detail_v2", { p_group_place_id: groupPlace.id, p_timeline_limit: 20 });
  const detail = (detailRows?.[0] as PlaceDetailReadModel | undefined) ?? null;
  const [{ data: placeRows }, { data: statsRows }, { data: marks }, { data: photos }, { data: opinionSummaries }, { data: timelineRows }, { data: businessAreaCache }] = await Promise.all([
    detail ? Promise.resolve({ data: null }) : supabase.from("places").select("name, branch_name, address, city, district, phone, latitude, longitude").eq("id", groupPlace.place_id).maybeSingle(),
    detail ? Promise.resolve({ data: null }) : supabase.from("group_place_stats").select("average_rating, mark_count, recommend_count").eq("group_place_id", groupPlace.id).maybeSingle(),
    supabase.from("place_marks").select("id, user_id, overall_rating, would_recommend, would_revisit, short_review, recommended_items, price_per_person, last_visited_on, updated_at, profiles(display_name)").eq("group_place_id", groupPlace.id).is("deleted_at", null).order("updated_at", { ascending: false }).limit(20),
    supabase.from("photos").select("id, user_id, object_key, width, height, thumbnail_object_key, thumbnail_width, thumbnail_height, sort_order, visit_record_id").eq("group_place_id", groupPlace.id).is("deleted_at", null).is("hidden_at", null).order("sort_order").limit(12),
    detail ? Promise.resolve({ data: null }) : supabase.rpc("get_group_place_opinion_summary", { p_group_place_id: groupPlace.id }),
    detail ? Promise.resolve({ data: null }) : supabase.rpc("list_group_place_visit_timeline", { p_group_place_id: groupPlace.id }),
    supabase.from("place_amap_business_area_cache").select("business_area_name, adcode").eq("place_id", groupPlace.place_id).eq("status", "success").maybeSingle(),
  ]);
  const place = detail ? {
    name: detail.place_name,
    branch_name: detail.branch_name,
    address: detail.address,
    city: detail.city,
    district: detail.district,
    phone: detail.phone,
    latitude: detail?.latitude ?? null,
    longitude: detail?.longitude ?? null,
  } : placeRows;
  const stats = detail ? { average_rating: detail.average_rating, mark_count: detail.mark_count, recommend_count: detail.recommend_count } : statsRows;
  const opinionSummariesResolved = detail ? [{ bowl_strength: detail.bowl_strength, friend_count: detail.friend_count, tasty_count: detail.tasty_count, comfortable_count: detail.comfortable_count, good_for_chat_count: detail.good_for_chat_count, good_value_count: detail.good_value_count }] : opinionSummaries;
  const timelineResolved = detail && Array.isArray(detail.timeline) ? detail.timeline : timelineRows;
  if (!place) notFound();

  const photoRows = (photos ?? []) as PlacePhoto[];
  const photoResources = photoRows.flatMap((photo) => {
    const resource = selectPhotoResource(photo);
    return resource ? [{ photo, resource }] : [];
  });
  const signedResult = photoResources.length ? await supabase.storage.from("place-photos").createSignedUrls(photoResources.map(({ resource }) => resource.key), 60 * 15) : { data: [] };
  const signedByKey = new Map((signedResult.data ?? []).map((photo) => [photo.path, photo.signedUrl]));
  const signedPhotos = photoResources.map(({ photo, resource }) => ({ ...photo, signedUrl: signedByKey.get(resource.key), displayWidth: resource.width, displayHeight: resource.height })).filter((photo): photo is typeof photo & { signedUrl: string } => Boolean(photo.signedUrl));
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
  const opinionSummary = (opinionSummariesResolved?.[0] as OpinionSummary | undefined);
  const v3Timeline = (timelineResolved ?? []) as TimelineRecord[];
  const ownVisitIds = v3Timeline.filter((record) => record.can_delete).map((record) => record.visit_record_id);
  const { data: ownVisitPhotoRows } = ownVisitIds.length
    ? await supabase.from("photos").select("visit_record_id").in("visit_record_id", ownVisitIds).is("deleted_at", null).is("hidden_at", null)
    : { data: [] as Array<{ visit_record_id: string }> };
  const ownVisitPhotoCounts = new Map<string, number>();
  (ownVisitPhotoRows ?? []).forEach((row) => ownVisitPhotoCounts.set(row.visit_record_id, (ownVisitPhotoCounts.get(row.visit_record_id) ?? 0) + 1));
  const v3TagCounts: Record<string, number> = opinionSummary ? { tasty: Number(opinionSummary.tasty_count), comfortable: Number(opinionSummary.comfortable_count), good_for_chat: Number(opinionSummary.good_for_chat_count), good_value: Number(opinionSummary.good_value_count) } : {};
  const hasV3TagCounts = Object.values(v3TagCounts).some((count) => count > 0);
  const amapTarget = { name: place.name, address: place.address, latitude: Number(place.latitude), longitude: Number(place.longitude) };

  return <AppShell groupName={context.groupName}><section className="place-detail">
    <NavigationIntentLink className="back-button" href={safeReturnTo} source="back">← 回到发现</NavigationIntentLink>
    <p className="eyebrow">{categoryLabels[groupPlace.primary_category] ?? groupPlace.primary_category}</p><div className="place-title-row"><h1>{place.name}</h1>{canModerate && <PlaceManagementControl groupPlaceId={groupPlace.id} placeName={place.name} />}</div>
    {place.branch_name && <p className="place-branch">{place.branch_name}</p>}<p className="place-address">{place.address || `${place.city ?? ""} ${place.district ?? ""}`}</p>
    <div className="place-location-tags" aria-label="地点信息">{(place.city || place.district) && <span className="location-tag location-tag--district">行政区 · {displayAmapLocationChain(place.city, place.district)}</span>}{businessAreaCache?.business_area_name && <span className="location-tag location-tag--business_district">商圈 · {businessAreaCache.business_area_name}</span>}<span className="location-tag location-tag--source">地点信息</span></div>
    <div className="place-navigation"><a className="place-navigation__primary" href={amapNavigationUrl(amapTarget)} target="_blank" rel="noreferrer">导航去这里</a><a className="place-navigation__secondary" href={amapPlaceUrl(amapTarget)} target="_blank" rel="noreferrer">查看地图位置</a></div><p className="place-navigation__hint">会优先打开设备中的地图应用；未安装时，将在网页中打开。</p>
    {opinionSummary?.friend_count ? <div className="place-stats place-stats--bowl"><BowlIcon level={toBowlLevel(Number(opinionSummary.bowl_strength))} size="lg" /><span>{bowlLabels[Number(opinionSummary.bowl_strength)]}</span><div><strong>{opinionSummary.friend_count}</strong><span>位朋友吃过</span></div></div> : stats?.mark_count ? <div className="place-stats"><strong>{Number(stats.average_rating).toFixed(1)}</strong><span>小组均分</span><strong>{stats.mark_count}</strong><span>人留过记录</span><strong>{stats.recommend_count}</strong><span>人愿意推荐</span></div> : <p className="new-recommendation-note">已有朋友推荐；更多感受会在后续记录中补充。</p>}
    {opinionSummary?.friend_count ? <div className="member-summary"><span>有 {opinionSummary.friend_count} 位朋友留下感受</span></div> : memberNames.length > 0 && <div className="member-summary"><div className="member-avatar-stack" aria-label={`已由 ${memberNames.join("、")} 留下记录`}>{memberNames.slice(0, 4).map((name, index) => <span className="member-avatar" key={`${name}-${index}`}>{name.slice(0, 1)}</span>)}</div><span>{memberNames.length === 1 ? `${memberNames[0]} 的真实体验` : `${memberNames.length} 位朋友留下感受`}</span></div>}
    {hasV3TagCounts ? <section className="scene-summary"><h2>好在哪儿</h2><OpinionCounts counts={v3TagCounts} /></section> : sceneTotals.size > 0 && <section className="scene-summary"><h2>大家觉得适合</h2><div>{[...sceneTotals.entries()].sort((left, right) => right[1] - left[1]).map(([slug, total]) => <span key={slug}>{sceneTagLabels[slug] ?? slug} · {total}</span>)}</div></section>}
    {visiblePhotos.length > 0 && <section className="place-gallery"><div><h2>真实照片</h2><p>仅共同地图成员可见</p></div><div className="place-gallery__grid">{visiblePhotos.map((photo) => <div key={photo.id}><PrivatePhoto src={photo.signedUrl} photoId={photo.id} alt={`${place.name} 的真实照片`} width={photo.displayWidth ?? photo.width ?? photo.thumbnail_width} height={photo.displayHeight ?? photo.height ?? photo.thumbnail_height} />{photo.user_id === user.id && <PhotoDeleteButton photoId={photo.id} />}{canModerate && <ModerationControl contentId={photo.id} contentType="photo" />}</div>)}</div></section>}
    <Link className="primary-link" href={`/mark?place=${groupPlace.id}`}>{isMarkedByMe ? "再记一顿" : "我也去过"}</Link>
    <section className="opinions"><h2>饭后聊</h2>{v3Timeline.length ? <ul>{v3Timeline.map((record) => <li key={record.visit_record_id}><div className="opinion-heading"><span className="member-avatar">{record.display_name.slice(0, 1) || "食"}</span><strong>{record.display_name}</strong><b className="inline-bowl-strength"><BowlIcon level={toBowlLevel(record.strength)} size="xs" /> {bowlLabels[record.strength]}</b></div>{record.tags.length > 0 && <div className="mark-scene-tags good-at-tag-list">{record.tags.map((tag) => <span key={tag}>{isGoodAtSlug(tag) && <GoodAtIcon slug={tag} size={28} />}{opinionTagLabels[tag] ?? tag}</span>)}</div>}{record.note && <p className="opinion-review">{record.note}</p>}{record.dishes.length > 0 && <p className="opinion-items">推荐：{record.dishes.join("、")}</p>}{(photosByVisit.get(record.visit_record_id) ?? []).length > 0 && <div className="visit-photo-strip">{(photosByVisit.get(record.visit_record_id) ?? []).map((photo) => <PrivatePhoto alt={`${place.name} 的到访照片`} key={photo.id} src={photo.signedUrl} photoId={photo.id} width={photo.displayWidth ?? photo.width ?? photo.thumbnail_width} height={photo.displayHeight ?? photo.height ?? photo.thumbnail_height} />)}</div>}{record.visited_on && <small>到访：{record.visited_on}</small>}{record.can_delete && <VisitDeleteButton visitRecordId={record.visit_record_id} />}{record.can_delete && (ownVisitPhotoCounts.get(record.visit_record_id) ?? 0) < 9 && <VisitPhotoRepair groupPlaceId={groupPlace.id} visitRecordId={record.visit_record_id} placeName={place.name} photoCount={ownVisitPhotoCounts.get(record.visit_record_id) ?? 0} />}{canModerate && <ModerationControl contentId={record.visit_record_id} contentType="visit" />}</li>)}</ul> : marks?.length ? <ul>{marks.map((mark) => { const profile = mark.profiles as Profile; const scenes = scenesByMark.get(mark.id) ?? []; return <li key={mark.id}><div className="opinion-heading"><span className="member-avatar">{profile?.display_name?.slice(0, 1) ?? "食"}</span><strong>{profile?.display_name ?? "成员"}</strong><b>{Number(mark.overall_rating).toFixed(1)} 分</b></div><p>{mark.would_recommend ? "愿意推荐" : "不推荐"}{mark.would_revisit ? ` · ${mark.would_revisit === "yes" ? "愿意再去" : mark.would_revisit === "maybe" ? "看情况" : "不愿意再去"}` : ""}</p>{scenes.length > 0 && <div className="mark-scene-tags">{scenes.map((slug) => <span key={slug}>{sceneTagLabels[slug] ?? slug}</span>)}</div>}{mark.short_review && <p className="opinion-review">{mark.short_review}</p>}{mark.recommended_items?.length ? <p className="opinion-items">推荐：{mark.recommended_items.join("、")}</p> : null}{mark.last_visited_on && <small>最近到访：{mark.last_visited_on}</small>}</li>; })}</ul> : <p className="empty-note">还没有人留下感受。</p>}</section><ContentReadyMarker route="/place/:id" />
  </section></AppShell>;
}
