import { AppShell } from "@/components/shell/app-shell";
import { AMapMap, type MapPlace } from "@/components/map/amap-map";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const quickFilters = ["附近", "咖啡馆", "约会", "环境 4+ "];

export default async function Home() {
  let places: MapPlace[] = [];
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    const supabase = await createClient();
    const result = await supabase.auth.getClaims();
    if (!result.data?.claims) redirect("/login");
    const userId = result.data.claims.sub;
    const { data: memberships } = await supabase.from("group_members").select("group_id").eq("user_id", userId).eq("status", "active").limit(1);
    const groupId = memberships?.[0]?.group_id;
    if (groupId) {
      const { data: groupPlaces } = await supabase.from("group_places").select("id, place_id, primary_category").eq("group_id", groupId).eq("status", "active").limit(30);
      const placeIds = groupPlaces?.map((place) => place.place_id) ?? [];
      if (placeIds.length) {
        const [{ data: rawPlaces }, { data: stats }] = await Promise.all([
          supabase.from("places").select("id, name, latitude, longitude").in("id", placeIds),
          supabase.from("group_place_stats").select("group_place_id, average_rating, mark_count").in("group_place_id", groupPlaces!.map((place) => place.id)),
        ]);
        const placeById = new Map((rawPlaces ?? []).map((place) => [place.id, place]));
        const statsByGroupPlace = new Map((stats ?? []).map((stat) => [stat.group_place_id, stat]));
        places = groupPlaces!.flatMap((groupPlace) => {
          const place = placeById.get(groupPlace.place_id); const stat = statsByGroupPlace.get(groupPlace.id);
          if (!place || !stat || stat.mark_count < 1 || stat.average_rating === null) return [];
          return [{ id: groupPlace.id, name: place.name, category: groupPlace.primary_category, latitude: Number(place.latitude), longitude: Number(place.longitude), averageRating: Number(stat.average_rating), markCount: Number(stat.mark_count) }];
        });
      }
    }
  }
  return (
    <AppShell>
      <section className="map-stage" aria-label="地图功能开发占位区">
        <AMapMap apiKey={process.env.NEXT_PUBLIC_AMAP_KEY} places={places} />

        <div className="map-toolbar">
          <button className="search-trigger" type="button">
            <span aria-hidden="true">⌕</span>
            搜索朋友推荐的地方
          </button>
          <button className="icon-button" type="button" aria-label="定位到当前位置">
            ◎
          </button>
        </div>

        <div className="filter-row" aria-label="快捷筛选（Phase 0 静态展示）">
          {quickFilters.map((filter, index) => (
            <button className={index === 0 ? "filter-chip filter-chip--active" : "filter-chip"} key={filter} type="button">
              {filter}
            </button>
          ))}
        </div>

        {!places.length && <div className="map-placeholder" role="status">
          <span className="map-placeholder__pin" aria-hidden="true">✦</span>
          <p>共同地图还没有真实标记</p>
          <small>点击下方「标记」，添加一次真实体验后，这里就会出现地点。</small>
        </div>}
      </section>

      <section className="place-sheet" aria-labelledby="welcome-title">
        <div className="sheet-handle" aria-hidden="true" />
        <div className="eyebrow">共同地图</div>
        <h1 id="welcome-title">把值得再去的地方，留给懂你的人。</h1>
        <p>
          食迹只收录朋友真实体验过、愿意推荐的餐饮地点。每一处新地点，都从一条真实标记开始。
        </p>
        <div className="welcome-card">
          <div className="mascot-mark" aria-hidden="true">FP</div>
          <div>
            <strong>从一次真实体验开始</strong>
            <span>新地点必须和首条推荐标记一起创建。</span>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
