import { AppShell } from "@/components/shell/app-shell";
import { MapBrowser } from "@/components/map/map-browser";
import type { MapPlace } from "@/components/map/amap-map";
import { createClient } from "@/lib/supabase/server";
import Image from "next/image";
import { redirect } from "next/navigation";

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
        const [{ data: rawPlaces }, { data: stats }, { data: marks }] = await Promise.all([
          supabase.from("places").select("id, name, latitude, longitude").in("id", placeIds),
          supabase.from("group_place_stats").select("group_place_id, average_rating, mark_count").in("group_place_id", groupPlaces!.map((place) => place.id)),
          supabase.from("place_marks").select("id, group_place_id").in("group_place_id", groupPlaces!.map((place) => place.id)).is("deleted_at", null),
        ]);
        const markIds = marks?.map((mark) => mark.id) ?? [];
        const { data: markSceneTags } = markIds.length
          ? await supabase.from("place_mark_scene_tags").select("place_mark_id, scene_tag_slug").in("place_mark_id", markIds)
          : { data: [] };
        const placeById = new Map((rawPlaces ?? []).map((place) => [place.id, place]));
        const statsByGroupPlace = new Map((stats ?? []).map((stat) => [stat.group_place_id, stat]));
        const groupPlaceByMark = new Map((marks ?? []).map((mark) => [mark.id, mark.group_place_id]));
        const scenesByGroupPlace = new Map<string, string[]>();
        (markSceneTags ?? []).forEach((tag) => {
          const groupPlaceId = groupPlaceByMark.get(tag.place_mark_id);
          if (groupPlaceId) scenesByGroupPlace.set(groupPlaceId, [...new Set([...(scenesByGroupPlace.get(groupPlaceId) ?? []), tag.scene_tag_slug])]);
        });
        places = groupPlaces!.flatMap((groupPlace) => {
          const place = placeById.get(groupPlace.place_id); const stat = statsByGroupPlace.get(groupPlace.id);
          if (!place || !stat || stat.mark_count < 1 || stat.average_rating === null) return [];
          return [{ id: groupPlace.id, name: place.name, category: groupPlace.primary_category, latitude: Number(place.latitude), longitude: Number(place.longitude), averageRating: Number(stat.average_rating), markCount: Number(stat.mark_count), sceneTags: scenesByGroupPlace.get(groupPlace.id) ?? [] }];
        });
      }
    }
  }
  return (
    <AppShell>
      <MapBrowser places={places} />

      <section className="place-sheet" aria-labelledby="welcome-title">
        <div className="sheet-handle" aria-hidden="true" />
        <div className="eyebrow">共同地图</div>
        <h1 id="welcome-title">把值得再去的地方，留给懂你的人。</h1>
        <p>
          食迹只收录朋友真实体验过、愿意推荐的餐饮地点。每一处新地点，都从一条真实标记开始。
        </p>
        <div className="welcome-card">
          <Image className="welcome-mascot" src="/mascot/welcome.jpg" width={130} height={160} alt="" priority />
          <div>
            <strong>从一次真实体验开始</strong>
            <span>新地点必须和首条推荐标记一起创建。</span>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
