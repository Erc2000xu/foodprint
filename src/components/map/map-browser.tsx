"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { MapPlace } from "@/components/map/amap-map";
import { StaticAmapMap } from "@/components/map/static-amap-map";
import { categoryOptions } from "@/lib/mark-options";

const categoryLabels = Object.fromEntries(categoryOptions) as Record<string, string>;

export function MapBrowser({ places }: { places: MapPlace[] }) {
  const [mode, setMode] = useState<"map" | "list">("map");
  const [filter, setFilter] = useState<"all" | "coffee" | "date" | "rating">("all");
  const visiblePlaces = useMemo(() => places.filter((place) => {
    if (filter === "coffee") return place.category === "cafe";
    if (filter === "date") return place.sceneTags.includes("date");
    if (filter === "rating") return place.averageRating >= 4;
    return true;
  }), [filter, places]);

  return <section className="map-stage" aria-label="共同地图">
    {mode === "map" ? <StaticAmapMap places={visiblePlaces} /> : <div className="map-list-panel">{visiblePlaces.length ? <ul>{visiblePlaces.map((place) => <li key={place.id}><Link href={`/place/${place.id}`}><div><strong>{place.name}</strong><span>{categoryLabels[place.category] ?? "餐饮"}</span></div><div className="map-list-score"><b>{place.averageRating.toFixed(1)}</b><small>{place.markCount} 人标记</small></div></Link></li>)}</ul> : <p>当前筛选下还没有地点。</p>}</div>}

    <div className="map-toolbar">
      <Link className="search-trigger" href="/discover"><span aria-hidden="true">⌕</span>搜索朋友推荐的地方</Link>
      <div className="map-view-toggle" role="group" aria-label="切换地图或列表"><button className={mode === "map" ? "is-active" : ""} type="button" onClick={() => setMode("map")}>地图</button><button className={mode === "list" ? "is-active" : ""} type="button" onClick={() => setMode("list")}>列表</button></div>
    </div>
    <div className="filter-row" aria-label="地点筛选">
      {[["all", "全部"], ["coffee", "咖啡馆"], ["date", "约会"], ["rating", "评分 4+"]].map(([value, label]) => <button className={filter === value ? "filter-chip filter-chip--active" : "filter-chip"} key={value} type="button" onClick={() => setFilter(value as typeof filter)}>{label}</button>)}
    </div>
    {!places.length && <div className="map-placeholder" role="status"><span className="map-placeholder__pin" aria-hidden="true">✦</span><p>共同地图还没有真实标记</p><small>点击下方「标记」，添加一次真实体验后，这里就会出现地点。</small></div>}
  </section>;
}
