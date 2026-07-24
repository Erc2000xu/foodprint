"use client";

import Link from "next/link";
/* eslint-disable @next/next/no-img-element */
import { FormEvent, useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { MapPlace } from "@/components/map/amap-map";
import { StaticMapAdapter } from "@/components/map/map-adapter";
import { categoryOptions, sceneTagLabels } from "@/lib/mark-options";
import { priceOptions } from "@/lib/discovery-options";
import { defaultSearchState, filterDiscoveryPlaces, hasActiveSearch, searchStateFromParams, searchStateToParams, type SearchState } from "@/lib/discovery/search-state";

type CuisineOption = readonly [string, string];
export type GeoOption = { id: string; kind: "district" | "business_district" | "metro_line" | "metro_station"; name: string; parentId?: string | null };
type QuickFilter = "all" | "coffee" | "date" | "rating";
type Origin = { latitude: number; longitude: number };

const categoryLabels = Object.fromEntries(categoryOptions) as Record<string, string>;
const areaKindLabels: Record<GeoOption["kind"], string> = { district: "行政区", business_district: "商圈", metro_line: "地铁线路", metro_station: "地铁站" };

function dateScore(value?: string | null) { return value ? new Date(value).getTime() : 0; }
function distanceMeters(from: Origin, place: MapPlace) {
  const radians = Math.PI / 180; const radius = 6_371_000;
  const lat = (place.latitude - from.latitude) * radians; const lng = (place.longitude - from.longitude) * radians;
  const a = Math.sin(lat / 2) ** 2 + Math.cos(from.latitude * radians) * Math.cos(place.latitude * radians) * Math.sin(lng / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function MapBrowser({ places, cuisineOptions, geoOptions }: { places: MapPlace[]; cuisineOptions: readonly CuisineOption[]; geoOptions: GeoOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const state = useMemo(() => searchStateFromParams(new URLSearchParams(params.toString())), [params]);
  const [mode, setMode] = useState<"list" | "map">("list");
  const [draftQuery, setDraftQuery] = useState(state.query ?? "");
  const [mapError, setMapError] = useState("");
  const [origin, setOrigin] = useState<Origin>();
  const [locationMessage, setLocationMessage] = useState("");
  const cuisineLabelBySlug = useMemo(() => Object.fromEntries(cuisineOptions), [cuisineOptions]) as Record<string, string>;
  const geoById = useMemo(() => new Map(geoOptions.map((area) => [area.id, area])), [geoOptions]);
  const filteredPlaces = useMemo(() => {
    const result = filterDiscoveryPlaces(places, state, cuisineLabelBySlug);
    return state.sort === "distance" && origin ? result.sort((left, right) => distanceMeters(origin, left) - distanceMeters(origin, right)) : result;
  }, [places, state, cuisineLabelBySlug, origin]);
  const activeSearch = hasActiveSearch(state);
  const currentUrl = `${pathname}${params.toString() ? `?${params}` : ""}`;
  const recentPlaces = useMemo(() => [...places].sort((left, right) => dateScore(right.lastMarkedAt) - dateScore(left.lastMarkedAt)).slice(0, 3), [places]);

  const commit = (patch: Partial<SearchState>, options?: { clear?: boolean }) => {
    const next: SearchState = options?.clear
      ? { ...defaultSearchState, ...patch }
      : { ...state, ...patch, selectedPlaceId: undefined };
    const query = searchStateToParams(next).toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const submit = (event: FormEvent) => { event.preventDefault(); commit({ query: draftQuery.trim() || undefined }); };
  const selectArea = (id: string) => commit({ areaIds: state.areaIds.includes(id) ? state.areaIds.filter((value) => value !== id) : [...state.areaIds, id] });
  const selectCuisine = (slug: string) => commit({ cuisineIds: state.cuisineIds.includes(slug) ? state.cuisineIds.filter((value) => value !== slug) : [...state.cuisineIds, slug] });
  const selectScene = (slug: string) => commit({ sceneTagIds: state.sceneTagIds.includes(slug) ? state.sceneTagIds.filter((value) => value !== slug) : [...state.sceneTagIds, slug] });
  const selectQuick = (next: QuickFilter) => {
    if (next === "all") { commit({ quickFilter: undefined }); return; }
    commit({ quickFilter: state.quickFilter === next ? undefined : next });
  };
  const clearAll = () => { setDraftQuery(""); commit({}, { clear: true }); };
  const reportMapError = useCallback(() => setMapError("地图暂不可用；你仍可在列表中完成检索。"), []);
  const requestNearby = () => {
    if (!navigator.geolocation) { setLocationMessage("当前浏览器不支持定位；可继续按推荐排序。"); return; }
    setLocationMessage("正在获取位置，仅用于本次本机排序…");
    navigator.geolocation.getCurrentPosition(({ coords }) => { setOrigin({ latitude: coords.latitude, longitude: coords.longitude }); setLocationMessage("已按离你最近排序；位置不会写入链接。"); commit({ sort: "distance" }); }, () => setLocationMessage("未取得定位权限；可继续按推荐或最近体验排序。"), { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 });
  };
  const detailHref = (id: string) => ({ pathname: `/place/${id}`, query: { returnTo: currentUrl } });

  const areaGroups = {
    district: geoOptions.filter((area) => area.kind === "district"),
    business_district: geoOptions.filter((area) => area.kind === "business_district"),
    metro_station: geoOptions.filter((area) => area.kind === "metro_station"),
  };
  const suggestions = useMemo(() => {
    const keyword = draftQuery.trim().toLocaleLowerCase("zh-CN");
    if (keyword.length < 1) return [] as Array<{ type: "area" | "cuisine" | "place"; id: string; label: string; description: string }>;
    return [
      ...geoOptions.filter((area) => area.name.toLocaleLowerCase("zh-CN").includes(keyword)).slice(0, 3).map((area) => ({ type: "area" as const, id: area.id, label: area.name, description: areaKindLabels[area.kind] })),
      ...cuisineOptions.filter(([, label]) => label.toLocaleLowerCase("zh-CN").includes(keyword)).slice(0, 3).map(([id, label]) => ({ type: "cuisine" as const, id, label, description: "菜系" })),
      ...places.filter((place) => place.name.toLocaleLowerCase("zh-CN").includes(keyword) || place.recommendedItems?.some((item) => item.toLocaleLowerCase("zh-CN").includes(keyword))).slice(0, 3).map((place) => ({ type: "place" as const, id: place.id, label: place.name, description: "餐厅" })),
    ].slice(0, 6);
  }, [draftQuery, geoOptions, cuisineOptions, places]);

  return <section className="home-explorer" aria-label="找餐厅">
    <header className="home-explorer__header">
      <div><p className="eyebrow">北京 · 朋友真实推荐</p><h1>今天想去哪儿吃？</h1><p>从朋友真实推荐里，找到合适的一家。</p></div>
      <div className="map-view-toggle" role="group" aria-label="切换列表或地图"><button className={mode === "list" ? "is-active" : ""} type="button" onClick={() => setMode("list")}>列表</button><button className={mode === "map" ? "is-active" : ""} type="button" onClick={() => setMode("map")}>地图</button></div>
    </header>

    <form className="intent-search" onSubmit={submit}><span aria-hidden="true">⌕</span><input value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder="搜商圈、地铁站、菜系或餐厅" aria-label="搜索餐厅、菜系或区域" /><button type="submit">搜索</button><small>例如：王府井、粤菜、烤鸭</small></form>
    {suggestions.length > 0 && <div className="search-suggestions" aria-label="搜索建议">{suggestions.map((suggestion) => <button key={`${suggestion.type}-${suggestion.id}`} type="button" onClick={() => { if (suggestion.type === "area") selectArea(suggestion.id); else if (suggestion.type === "cuisine") selectCuisine(suggestion.id); else { setDraftQuery(suggestion.label); commit({ query: suggestion.label }); } }}>{suggestion.label}<small>{suggestion.description}</small></button>)}</div>}

    <div className="intent-actions" aria-label="找餐厅方式">
      <details><summary>📍 按地点找</summary><div className="intent-menu intent-menu--grouped">{(["district", "business_district", "metro_station"] as const).map((kind) => areaGroups[kind].length ? <section key={kind}><b>{areaKindLabels[kind]}</b>{areaGroups[kind].map((area) => <button className={state.areaIds.includes(area.id) ? "is-selected" : ""} key={area.id} type="button" onClick={() => selectArea(area.id)}>{area.name}</button>)}</section> : null)}</div></details>
      <details><summary>🍜 按菜系找</summary><div className="intent-menu">{cuisineOptions.map(([slug, label]) => <button className={state.cuisineIds.includes(slug) ? "is-selected" : ""} key={slug} type="button" onClick={() => selectCuisine(slug)}>{label}</button>)}</div></details>
      <details><summary>✨ 找灵感</summary><div className="intent-menu">{["friends_gathering", "date", "afternoon_tea", "late_night"].map((slug) => <button className={state.sceneTagIds.includes(slug) ? "is-selected" : ""} key={slug} type="button" onClick={() => selectScene(slug)}>{sceneTagLabels[slug]}</button>)}</div></details>
    </div>

    <div className="home-filter-row" aria-label="常用筛选">{([ ["all", "全部"], ["coffee", "咖啡馆"], ["date", "约会"], ["rating", "评分 4+"] ] as const).map(([value, label]) => <button className={(value === "all" ? !state.quickFilter : state.quickFilter === value) ? "filter-chip filter-chip--active" : "filter-chip"} key={value} type="button" onClick={() => selectQuick(value)}>{label}</button>)}</div>

    {activeSearch && <section className="active-filter-panel" aria-label="筛选条件">
      <div className="active-filter-panel__controls"><select value={state.priceRange ?? ""} onChange={(event) => commit({ priceRange: event.target.value as SearchState["priceRange"] || undefined })} aria-label="人均"><option value="">全部人均</option>{priceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select value={state.minRating ?? ""} onChange={(event) => commit({ minRating: event.target.value === "4.5" ? 4.5 : event.target.value === "4" ? 4 : undefined })} aria-label="评分"><option value="">全部评分</option><option value="4">评分 4+</option><option value="4.5">评分 4.5+</option></select><select value={state.sort} onChange={(event) => { if (event.target.value === "distance") requestNearby(); else commit({ sort: event.target.value as SearchState["sort"] }); }} aria-label="结果排序"><option value="recommended">最值得去</option><option value="recent">最近体验</option><option value="distance">离我最近</option></select></div>
      <div className="active-filter-panel__chips">{state.areaIds.map((id) => <button key={id} type="button" onClick={() => selectArea(id)}>{geoById.get(id)?.name ?? "地点"} ×</button>)}{state.cuisineIds.map((id) => <button key={id} type="button" onClick={() => selectCuisine(id)}>{cuisineLabelBySlug[id] ?? id} ×</button>)}{state.sceneTagIds.map((id) => <button key={id} type="button" onClick={() => selectScene(id)}>{sceneTagLabels[id] ?? id} ×</button>)}</div>
      <div className="result-heading"><strong>{filteredPlaces.length} 家朋友推荐</strong><button className="text-button" type="button" onClick={clearAll}>清除筛选</button></div>
      {locationMessage && <p className="location-note">{locationMessage}</p>}
    </section>}

    {mode === "map" ? <section className="v1-static-map" aria-label="当前筛选结果地图"><StaticMapAdapter pins={filteredPlaces} selectedPlaceId={state.selectedPlaceId} onError={reportMapError} /><div><strong>{filteredPlaces.length} 家朋友推荐</strong><button type="button" onClick={() => setMode("list")}>查看列表</button></div>{mapError && <p className="map-status-message">{mapError}</p>}</section> : <section className="home-results">
      {!activeSearch && <div className="home-results__intro"><p className="eyebrow">朋友最近推荐</p><h2>先从这些值得去的地方开始</h2></div>}
      {(activeSearch ? filteredPlaces : recentPlaces).length ? <ul className="home-place-list">{(activeSearch ? filteredPlaces : recentPlaces).map((place) => <li key={place.id}><Link href={detailHref(place.id)} className="home-place-card">
        <div className="home-place-card__photo">{place.coverPhotoUrl ? <img src={place.coverPhotoUrl} alt={`${place.name} 的真实照片`} /> : <span>食迹<br />推荐</span>}</div><div><p className="home-place-card__meta">{place.cuisineSlugs?.map((slug) => cuisineLabelBySlug[slug]).filter(Boolean).slice(0, 1).join(" · ") || categoryLabels[place.category] || "餐饮"} · {place.geoLabels?.find((label) => !label.includes("站")) || place.district || place.city || "北京"}</p><h2>{place.name}</h2><p className="home-place-card__location">{place.geoLabels?.find((label) => label.includes("站")) ? `近${place.geoLabels.find((label) => label.includes("站"))} · ` : ""}{place.pricePerPerson ? `人均 ¥${Math.round(place.pricePerPerson)}` : "人均待补充"}</p><div className="home-place-card__score-line"><b>{place.averageRating.toFixed(1)}</b><span>{place.markCount} 位朋友标记</span></div>{place.sceneTags.length > 0 && <div className="home-place-card__tags">{place.sceneTags.slice(0, 2).map((slug) => <span key={slug}>{sceneTagLabels[slug] ?? slug}</span>)}</div>}{place.recommendedItems?.length ? <p className="home-place-card__recommend">推荐：{place.recommendedItems.slice(0, 2).join("、")}</p> : place.review ? <p className="home-place-card__recommend">{place.review}</p> : null}</div>
      </Link></li>)}</ul> : <div className="empty-state"><strong>{places.length ? "当前条件下暂无朋友推荐" : "共同地图还没有真实标记"}</strong><span>{places.length ? "清除筛选或扩大范围再试试。" : "从添加第一家真实体验开始。"}</span>{places.length ? <button className="text-button" type="button" onClick={clearAll}>清除筛选</button> : <Link className="primary-link" href="/mark">去标记地点</Link>}</div>}
    </section>}
  </section>;
}
