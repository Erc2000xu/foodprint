import Link from "next/link";
/* eslint-disable @next/next/no-img-element */
import { notFound, redirect } from "next/navigation";
import { PhotoDeleteButton } from "@/components/place/photo-delete-button";
import { AppShell } from "@/components/shell/app-shell";
import { categoryOptions, sceneTagLabels } from "@/lib/mark-options";
import { createClient } from "@/lib/supabase/server";

type Profile = { display_name?: string } | null;
type PlacePhoto = { id: string; user_id: string; object_key: string; width: number | null; height: number | null; sort_order: number };
const categoryLabels = Object.fromEntries(categoryOptions) as Record<string, string>;

export default async function PlaceDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string }> }) {
  const { id } = await params;
  const { returnTo } = await searchParams;
  const safeReturnTo = returnTo?.startsWith("/?") || returnTo === "/" ? returnTo : "/";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/place/${id}`)}`);
  const { data: groupPlace } = await supabase.from("group_places").select("id, place_id, primary_category, status").eq("id", id).maybeSingle();
  if (!groupPlace || groupPlace.status === "archived") notFound();

  const [{ data: place }, { data: stats }, { data: marks }, { data: photos }] = await Promise.all([
    supabase.from("places").select("name, branch_name, address, city, district, phone").eq("id", groupPlace.place_id).maybeSingle(),
    supabase.from("group_place_stats").select("average_rating, mark_count, recommend_count").eq("group_place_id", groupPlace.id).maybeSingle(),
    supabase.from("place_marks").select("id, user_id, overall_rating, would_recommend, would_revisit, short_review, recommended_items, price_per_person, last_visited_on, updated_at, profiles(display_name)").eq("group_place_id", groupPlace.id).is("deleted_at", null).order("updated_at", { ascending: false }),
    supabase.from("photos").select("id, user_id, object_key, width, height, sort_order").eq("group_place_id", groupPlace.id).is("deleted_at", null).order("sort_order"),
  ]);
  if (!place) notFound();

  const signedPhotos = await Promise.all(((photos ?? []) as PlacePhoto[]).map(async (photo) => {
    const { data } = await supabase.storage.from("place-photos").createSignedUrl(photo.object_key, 60 * 15);
    return data?.signedUrl ? { ...photo, signedUrl: data.signedUrl } : null;
  }));
  const visiblePhotos = signedPhotos.filter((photo): photo is NonNullable<typeof photo> => photo !== null);
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

  return <AppShell><section className="place-detail">
    <Link className="back-button" href={safeReturnTo}>← 返回结果</Link>
    <p className="eyebrow">{categoryLabels[groupPlace.primary_category] ?? groupPlace.primary_category}</p><h1>{place.name}</h1>
    {place.branch_name && <p className="place-branch">{place.branch_name}</p>}<p className="place-address">{place.address || `${place.city ?? ""} ${place.district ?? ""}`}</p>
    <div className="place-stats"><strong>{Number(stats?.average_rating ?? 0).toFixed(1)}</strong><span>小组均分</span><strong>{stats?.mark_count ?? 0}</strong><span>人真实标记</span><strong>{stats?.recommend_count ?? 0}</strong><span>人推荐</span></div>
    {memberNames.length > 0 && <div className="member-summary"><div className="member-avatar-stack" aria-label={`已由 ${memberNames.join("、")} 标记`}>{memberNames.slice(0, 4).map((name, index) => <span className="member-avatar" key={`${name}-${index}`}>{name.slice(0, 1)}</span>)}</div><span>{memberNames.length === 1 ? `${memberNames[0]} 的真实体验` : `${memberNames.length} 位朋友已留下体验`}</span></div>}
    {sceneTotals.size > 0 && <section className="scene-summary"><h2>大家觉得适合</h2><div>{[...sceneTotals.entries()].sort((left, right) => right[1] - left[1]).map(([slug, total]) => <span key={slug}>{sceneTagLabels[slug] ?? slug} · {total}</span>)}</div></section>}
    {visiblePhotos.length > 0 && <section className="place-gallery"><div><h2>真实照片</h2><p>仅共同地图成员可见</p></div><div className="place-gallery__grid">{visiblePhotos.map((photo) => <figure key={photo.id}><img src={photo.signedUrl} alt={`${place.name} 的真实照片`} width={photo.width ?? undefined} height={photo.height ?? undefined} />{photo.user_id === user.id && <PhotoDeleteButton photoId={photo.id} />}</figure>)}</div></section>}
    <Link className="primary-link" href={`/mark?place=${groupPlace.id}`}>{isMarkedByMe ? "编辑我的真实标记" : "我也去过"}</Link>
    <section className="opinions"><h2>朋友的真实体验</h2>{marks?.length ? <ul>{marks.map((mark) => { const profile = mark.profiles as Profile; const scenes = scenesByMark.get(mark.id) ?? []; return <li key={mark.id}><div className="opinion-heading"><span className="member-avatar">{profile?.display_name?.slice(0, 1) ?? "食"}</span><strong>{profile?.display_name ?? "成员"}</strong><b>{Number(mark.overall_rating).toFixed(1)} 分</b></div><p>{mark.would_recommend ? "愿意推荐" : "不推荐"}{mark.would_revisit ? ` · ${mark.would_revisit === "yes" ? "愿意再去" : mark.would_revisit === "maybe" ? "看情况" : "不愿意再去"}` : ""}</p>{scenes.length > 0 && <div className="mark-scene-tags">{scenes.map((slug) => <span key={slug}>{sceneTagLabels[slug] ?? slug}</span>)}</div>}{mark.short_review && <p className="opinion-review">{mark.short_review}</p>}{mark.recommended_items?.length ? <p className="opinion-items">推荐：{mark.recommended_items.join("、")}</p> : null}{mark.last_visited_on && <small>最近到访：{mark.last_visited_on}</small>}</li>; })}</ul> : <p className="empty-note">暂时还没有可展示的真实体验。</p>}</section>
  </section></AppShell>;
}
