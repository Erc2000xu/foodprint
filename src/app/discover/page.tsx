import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { DiscoverFilters } from "@/components/discover/discover-filters";
import { WishlistToggle } from "@/components/discover/wishlist-toggle";
import { createClient } from "@/lib/supabase/server";
import { categoryOptions, sceneTagLabels } from "@/lib/mark-options";

const categoryLabels = Object.fromEntries(categoryOptions) as Record<string, string>;
const categoryValues = new Set<string>(categoryOptions.map(([value]) => value));
const sceneValues = new Set(Object.keys(sceneTagLabels));
const valueAt = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
const valuesAt = (value: string | string[] | undefined) => (Array.isArray(value) ? value : value ? [value] : []);

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const selectedCategories = valuesAt(query.category).filter((value) => categoryValues.has(value));
  const selectedScenes = valuesAt(query.scene).filter((value) => sceneValues.has(value));
  const city = valueAt(query.city).trim().slice(0, 80);
  const minRating = ["4", "4.5"].includes(valueAt(query.minRating)) ? valueAt(query.minRating) : "";
  const minEnvironment = ["4", "4.5"].includes(valueAt(query.minEnvironment)) ? valueAt(query.minEnvironment) : "";
  const wanted = valueAt(query.wanted) === "1";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/discover");
  const { data: memberships } = await supabase.from("group_members").select("group_id").eq("user_id", user.id).eq("status", "active").limit(1);
  const groupId = memberships?.[0]?.group_id;
  if (!groupId) redirect("/admin");

  const { data: groupPlaces } = await supabase.from("group_places").select("id, place_id, primary_category").eq("group_id", groupId).eq("status", "active").order("created_at", { ascending: false });
  const ids = groupPlaces?.map((place) => place.id) ?? [];
  const placeIds = groupPlaces?.map((place) => place.place_id) ?? [];
  const [{ data: places }, { data: stats }, { data: wishlist }, { data: marks }] = await Promise.all([
    placeIds.length ? supabase.from("places").select("id, name, branch_name, address, city, district").in("id", placeIds) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("group_place_stats").select("group_place_id, average_rating, mark_count, recommend_count, last_marked_at").in("group_place_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("wishlist_items").select("group_place_id").eq("user_id", user.id).in("group_place_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("place_marks").select("id, group_place_id, environment_rating").in("group_place_id", ids).is("deleted_at", null) : Promise.resolve({ data: [] }),
  ]);
  const markIds = marks?.map((mark) => mark.id) ?? [];
  const { data: markSceneTags } = markIds.length ? await supabase.from("place_mark_scene_tags").select("place_mark_id, scene_tag_slug").in("place_mark_id", markIds) : { data: [] };
  const placeById = new Map((places ?? []).map((place) => [place.id, place]));
  const statsById = new Map((stats ?? []).map((stat) => [stat.group_place_id, stat]));
  const wishlistIds = new Set((wishlist ?? []).map((item) => item.group_place_id));
  const groupPlaceByMark = new Map((marks ?? []).map((mark) => [mark.id, mark.group_place_id]));
  const scenesByGroupPlace = new Map<string, Set<string>>();
  (markSceneTags ?? []).forEach((tag) => { const groupPlaceId = groupPlaceByMark.get(tag.place_mark_id); if (groupPlaceId) scenesByGroupPlace.set(groupPlaceId, new Set([...(scenesByGroupPlace.get(groupPlaceId) ?? []), tag.scene_tag_slug])); });
  const environmentByGroupPlace = new Map<string, number>();
  const environments = new Map<string, number[]>();
  (marks ?? []).forEach((mark) => { if (mark.environment_rating !== null) environments.set(mark.group_place_id, [...(environments.get(mark.group_place_id) ?? []), Number(mark.environment_rating)]); });
  environments.forEach((ratings, groupPlaceId) => environmentByGroupPlace.set(groupPlaceId, ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length));
  const unfilteredCards = (groupPlaces ?? []).flatMap((groupPlace) => {
    const place = placeById.get(groupPlace.place_id); const stat = statsById.get(groupPlace.id);
    if (!place || !stat || !stat.mark_count) return [];
    return [{ groupPlace, place, stat, scenes: [...(scenesByGroupPlace.get(groupPlace.id) ?? [])], averageEnvironment: environmentByGroupPlace.get(groupPlace.id) }];
  });
  const cities = [...new Set(unfilteredCards.map((card) => card.place.city).filter((value): value is string => Boolean(value)))].sort((left, right) => left.localeCompare(right, "zh-CN"));
  const cards = unfilteredCards.filter(({ groupPlace, place, stat, scenes, averageEnvironment }) => {
    if (selectedCategories.length && !selectedCategories.includes(groupPlace.primary_category)) return false;
    if (city && place.city !== city) return false;
    if (selectedScenes.length && !selectedScenes.some((scene) => scenes.includes(scene))) return false;
    if (minRating && Number(stat.average_rating) < Number(minRating)) return false;
    if (minEnvironment && (averageEnvironment === undefined || averageEnvironment < Number(minEnvironment))) return false;
    if (wanted && !wishlistIds.has(groupPlace.id)) return false;
    return true;
  }).sort((left, right) => Number(right.stat.average_rating ?? 0) - Number(left.stat.average_rating ?? 0));

  return <AppShell activeNav="发现"><section className="discover-page"><p className="eyebrow">发现</p><h1>朋友真实推荐的地方</h1><p className="discover-intro">按小组均分排列。想去不会计入评分，也不代表去过。</p><DiscoverFilters cities={cities} selectedCategories={selectedCategories} selectedScenes={selectedScenes} city={city} minRating={minRating} minEnvironment={minEnvironment} wanted={wanted} />{cards.length ? <ul className="discover-list">{cards.map(({ groupPlace, place, stat, scenes, averageEnvironment }) => <li key={groupPlace.id}><article className="place-card"><Link href={`/place/${groupPlace.id}`} className="place-card__main"><span className="place-card__category">{categoryLabels[groupPlace.primary_category] ?? "餐饮"}</span><h2>{place.name}</h2>{place.branch_name && <p>{place.branch_name}</p>}<p>{place.address || [place.city, place.district].filter(Boolean).join(" · ") || "地址待补充"}</p>{scenes.length > 0 && <div className="place-card__scenes">{scenes.slice(0, 3).map((scene) => <span key={scene}>{sceneTagLabels[scene]}</span>)}</div>}<div className="place-card__stats"><strong>{Number(stat.average_rating).toFixed(1)}</strong><span>小组均分</span><b>{stat.mark_count}</b><span>人标记</span><b>{stat.recommend_count}</b><span>人推荐</span>{averageEnvironment !== undefined && <b>{averageEnvironment.toFixed(1)}</b>} {averageEnvironment !== undefined && <span>环境</span>}</div></Link><WishlistToggle groupPlaceId={groupPlace.id} initialWanted={wishlistIds.has(groupPlace.id)} /></article></li>)}</ul> : <div className="empty-state"><strong>{unfilteredCards.length ? "没有符合筛选条件的地点" : "共同地图还没有可发现的地点"}</strong><span>{unfilteredCards.length ? "换个筛选条件再试试。" : "从一次真实体验开始添加吧。"}</span>{unfilteredCards.length ? <Link className="primary-link" href="/discover">清空筛选</Link> : <Link className="primary-link" href="/mark">去标记地点</Link>}</div>}</section></AppShell>;
}
