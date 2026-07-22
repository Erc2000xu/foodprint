import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { WishlistToggle } from "@/components/discover/wishlist-toggle";
import { createClient } from "@/lib/supabase/server";

const categoryLabels: Record<string, string> = { restaurant: "餐厅", cafe: "咖啡馆", drinks: "茶饮/饮品", bar: "酒吧/Pub", bakery_dessert: "烘焙甜品", street_food: "小吃", other_food_drink: "其他餐饮" };

export default async function DiscoverPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/discover");
  const { data: memberships } = await supabase.from("group_members").select("group_id").eq("user_id", user.id).eq("status", "active").limit(1);
  const groupId = memberships?.[0]?.group_id;
  if (!groupId) redirect("/admin");

  const { data: groupPlaces } = await supabase.from("group_places").select("id, place_id, primary_category").eq("group_id", groupId).eq("status", "active").order("created_at", { ascending: false });
  const ids = groupPlaces?.map((place) => place.id) ?? [];
  const placeIds = groupPlaces?.map((place) => place.place_id) ?? [];
  const [{ data: places }, { data: stats }, { data: wishlist }] = await Promise.all([
    placeIds.length ? supabase.from("places").select("id, name, branch_name, address, city, district").in("id", placeIds) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("group_place_stats").select("group_place_id, average_rating, mark_count, recommend_count, last_marked_at").in("group_place_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("wishlist_items").select("group_place_id").eq("user_id", user.id).in("group_place_id", ids) : Promise.resolve({ data: [] }),
  ]);
  const placeById = new Map((places ?? []).map((place) => [place.id, place]));
  const statsById = new Map((stats ?? []).map((stat) => [stat.group_place_id, stat]));
  const wishlistIds = new Set((wishlist ?? []).map((item) => item.group_place_id));
  const cards = (groupPlaces ?? []).flatMap((groupPlace) => {
    const place = placeById.get(groupPlace.place_id); const stat = statsById.get(groupPlace.id);
    if (!place || !stat || !stat.mark_count) return [];
    return [{ groupPlace, place, stat }];
  }).sort((left, right) => Number(right.stat.average_rating ?? 0) - Number(left.stat.average_rating ?? 0));

  return <AppShell activeNav="发现"><section className="discover-page"><p className="eyebrow">发现</p><h1>朋友真实推荐的地方</h1><p className="discover-intro">按小组均分排列。想去不会计入评分，也不代表去过。</p>{cards.length ? <ul className="discover-list">{cards.map(({ groupPlace, place, stat }) => <li key={groupPlace.id}><article className="place-card"><Link href={`/place/${groupPlace.id}`} className="place-card__main"><span className="place-card__category">{categoryLabels[groupPlace.primary_category] ?? "餐饮"}</span><h2>{place.name}</h2>{place.branch_name && <p>{place.branch_name}</p>}<p>{place.address || [place.city, place.district].filter(Boolean).join(" · ") || "地址待补充"}</p><div className="place-card__stats"><strong>{Number(stat.average_rating).toFixed(1)}</strong><span>小组均分</span><b>{stat.mark_count}</b><span>人标记</span><b>{stat.recommend_count}</b><span>人推荐</span></div></Link><WishlistToggle groupPlaceId={groupPlace.id} initialWanted={wishlistIds.has(groupPlace.id)} /></article></li>)}</ul> : <div className="empty-state"><strong>共同地图还没有可发现的地点</strong><span>从一次真实体验开始添加吧。</span><Link className="primary-link" href="/mark">去标记地点</Link></div>}</section></AppShell>;
}
