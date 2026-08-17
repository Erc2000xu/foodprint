import { redirect } from "next/navigation";
import { ContentReadyMarker } from "@/components/navigation/content-ready-marker";
import { PrivatePhoto } from "@/components/photo/private-photo";
import { PendingNavigationLink } from "@/components/shell/pending-navigation-link";
import { AppShell } from "@/components/shell/app-shell";
import { BowlIcon, toBowlLevel } from "@/components/recommendation/bowl-icon";
import { GoodAtIcon, goodAtOptions, isGoodAtSlug } from "@/components/recommendation/good-at-icon";
import { getActiveGroupContext } from "@/lib/auth/active-group-context";
import { createClient } from "@/lib/supabase/server";
import { selectPhotoResource } from "@/lib/photos/photo-resource";

type VisitFeedItem = { visit_record_id: string; group_place_id: string; place_name: string; visited_on: string | null; strength: number; tags: string[]; note: string | null; dishes: string[]; created_at: string; display_name: string; thumbnail_object_keys?: string[] };
type SignedPhoto = { url: string; width: number; height: number; photoId?: string };
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
  const context = await getActiveGroupContext(supabase, "/activity");
  if (!context) redirect("/login?next=/activity");

  const feedResult = await supabase.rpc("list_group_visit_feed_v2", { p_limit: 20, p_before_created_at: null, p_before_id: null });
  const visits = (feedResult.error ? (await supabase.rpc("list_group_visit_feed", { p_group_id: context.groupId })).data : feedResult.data) as VisitFeedItem[];
  const visibleVisits = (visits ?? []).slice(0, 20);
  const visitIds = visibleVisits.map((visit) => visit.visit_record_id);
  const photoRows = visitIds.length
    ? await supabase.from("photos").select("id, visit_record_id, object_key, width, height, thumbnail_object_key, thumbnail_width, thumbnail_height").in("visit_record_id", visitIds).is("deleted_at", null).is("hidden_at", null).order("sort_order").limit(40)
    : { data: [] };
  const photoResources = (photoRows.data ?? []).flatMap((photo) => {
    const resource = selectPhotoResource(photo);
    return resource ? [{ photo, resource }] : [];
  });
  const keys = visibleVisits.flatMap((visit) => visit.thumbnail_object_keys ?? []).concat(photoResources.map(({ resource }) => resource.key));
  const uniqueKeys = [...new Set(keys)];
  const signed = uniqueKeys.length ? await supabase.storage.from("place-photos").createSignedUrls(uniqueKeys, 60 * 15) : { data: [] };
  const signedByPath = new Map((signed.data ?? []).map((photo) => [photo.path, photo.signedUrl]));
  const dimensionsByKey = new Map(photoResources.map(({ resource }) => [resource.key, { width: Number(resource.width ?? 1), height: Number(resource.height ?? 1) }]));
  const photosByVisit = new Map<string, SignedPhoto[]>();
  visibleVisits.forEach((visit) => {
    const rowPhotos = photoResources.filter(({ photo }) => photo.visit_record_id === visit.visit_record_id).map(({ photo, resource }) => ({ photoId: photo.id, url: signedByPath.get(resource.key), width: Number(resource.width ?? 1), height: Number(resource.height ?? 1) })).filter((photo): photo is { photoId: string; url: string; width: number; height: number } => Boolean(photo.url));
    const rpcPhotos = (visit.thumbnail_object_keys ?? []).map((key) => ({ url: signedByPath.get(key), ...(dimensionsByKey.get(key) ?? { width: 1, height: 1 }) })).filter((photo): photo is SignedPhoto => Boolean(photo.url));
    photosByVisit.set(visit.visit_record_id, (rowPhotos.length ? rowPhotos : rpcPhotos).slice(0, 2));
  });

  return <AppShell activeNav="饭后聊" groupName={context.groupName}><section className="activity-page"><p className="eyebrow">饭后聊</p><h1 className="creative-title">吃过以后，留下几句话。</h1><p className="activity-intro">每一条，都是一位成员的真实感受。</p>{visibleVisits.length ? <ol className="activity-list">{visibleVisits.map((visit) => <li key={visit.visit_record_id}><span className="member-avatar">{visit.display_name.slice(0, 1) || "食"}</span><div><p><strong>{visit.display_name}</strong> 去了 <PendingNavigationLink href={`/place/${visit.group_place_id}`} navigationSource="place-card">{visit.place_name}</PendingNavigationLink></p><b className="inline-bowl-strength"><BowlIcon level={toBowlLevel(visit.strength)} size="xs" /> {bowlLabels[visit.strength]}</b>{visit.tags?.length ? <div className="mark-scene-tags good-at-tag-list">{visit.tags.map((tag) => <span key={tag}>{isGoodAtSlug(tag) && <GoodAtIcon slug={tag} size={28} />}{goodAtOptions.find((option) => option.slug === tag)?.label ?? tag}</span>)}</div> : null}{visit.note && <blockquote>{visit.note}</blockquote>}{visit.dishes.length ? <small>推荐：{visit.dishes.join("、")}</small> : null}{(photosByVisit.get(visit.visit_record_id) ?? []).length > 0 && <div className="activity-photo-strip">{photosByVisit.get(visit.visit_record_id)!.map((photo, index) => <PrivatePhoto key={`${visit.visit_record_id}-${index}`} photoId={photo.photoId} src={photo.url} alt={`${visit.place_name} 的到访照片 ${index + 1}`} width={photo.width} height={photo.height} />)}</div>}{visit.visited_on && <small>到访：{visit.visited_on}</small>}<time>{relativeTime(visit.created_at)}</time></div></li>)}</ol> : <div className="empty-state"><strong>还没有新的饭后聊</strong><span>新的到访记录会显示在这里。</span></div>}<ContentReadyMarker route="/activity" /></section></AppShell>;
}
