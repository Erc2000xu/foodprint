"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { backfillAmapBusinessAreas, getAmapBeijingDistricts, searchAmapPoiTips, type AmapDistrict, type AmapPoiCandidate } from "@/lib/amap/poi-client";
import type { MapPlace } from "@/components/map/amap-map";
import { StaticMapAdapter } from "@/components/map/map-adapter";
import { DiscoveryPlaceCard } from "@/components/discover/discovery-place-card";
import { categoryOptions, sceneTagLabels, sceneTags } from "@/lib/mark-options";
import { priceOptions } from "@/lib/discovery-options";
import { defaultSearchState, discoveryDistanceMeters, filterDiscoveryPlaces, hasActiveSearch, searchStateFromParams, searchStateToParams, type DiscoveryLocationFilter, type SearchState } from "@/lib/discovery/search-state";

type CuisineOption = readonly [string, string];
export type GeoOption = { id: string; kind: "district" | "business_district" | "metro_line" | "metro_station"; name: string; parentId?: string | null };
type Origin = { latitude: number; longitude: number };
type IntentMenu = "location" | "cuisine" | "inspiration";

const categoryLabels = Object.fromEntries(categoryOptions) as Record<string, string>;

function dateScore(value?: string | null) { return value ? new Date(value).getTime() : 0; }
function locationKind(candidate: AmapPoiCandidate): DiscoveryLocationFilter["kind"] {
  return /地铁|轨道|站/.test(`${candidate.name} ${candidate.address}`) ? "metro_station" : "business_district";
}
function locationKindLabel(kind: DiscoveryLocationFilter["kind"]) { return kind === "district" ? "行政区" : kind === "metro_station" ? "地铁 / 交通" : "商圈 / 地点"; }

/** The primary Discovery experience: rich recommendation cards with an optional map view. */
export function DiscoveryBrowser({ places, cuisineOptions, canManage = false }: { places: MapPlace[]; cuisineOptions: readonly CuisineOption[]; geoOptions?: GeoOption[]; canManage?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const state = useMemo(() => searchStateFromParams(new URLSearchParams(params.toString())), [params]);
  const mode = params.get("view") === "map" ? "map" : "list";
  const [draftQuery, setDraftQuery] = useState(state.query ?? "");
  const [mapError, setMapError] = useState("");
  const [origin, setOrigin] = useState<Origin>();
  const [locationMessage, setLocationMessage] = useState("");
  const [districts, setDistricts] = useState<AmapDistrict[]>([]);
  const [districtError, setDistrictError] = useState("");
  const [amapSuggestions, setAmapSuggestions] = useState<AmapPoiCandidate[]>([]);
  const [amapError, setAmapError] = useState("");
  const [isSearchingAmap, setIsSearchingAmap] = useState(false);
  const [openMenu, setOpenMenu] = useState<IntentMenu>();
  const intentActionsRef = useRef<HTMLDivElement>(null);
  const cuisineLabelBySlug = useMemo(() => Object.fromEntries(cuisineOptions), [cuisineOptions]) as Record<string, string>;

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getAmapBeijingDistricts(), backfillAmapBusinessAreas()]).then(([result, backfill]) => {
      if (cancelled) return;
      setDistricts(result.districts);
      setDistrictError(result.error ?? "");
      if (backfill.updated > 0) router.refresh();
    });
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (openMenu && !intentActionsRef.current?.contains(event.target as Node)) setOpenMenu(undefined);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(undefined);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openMenu]);

  const filteredPlaces = useMemo(() => {
    const result = filterDiscoveryPlaces(places, { ...state, areaIds: [] }, cuisineLabelBySlug);
    return state.sort === "distance" && origin ? result.sort((left, right) => discoveryDistanceMeters(origin, left) - discoveryDistanceMeters(origin, right)) : result;
  }, [places, state, cuisineLabelBySlug, origin]);
  const activeSearch = hasActiveSearch(state);
  const currentUrl = `${pathname}${params.toString() ? `?${params}` : ""}`;
  const recentPlaces = useMemo(() => [...places].sort((left, right) => dateScore(right.lastMarkedAt) - dateScore(left.lastMarkedAt)), [places]);

  const commit = (patch: Partial<SearchState>, options?: { clear?: boolean }) => {
    const next: SearchState = options?.clear ? { ...defaultSearchState, ...patch } : { ...state, ...patch, selectedPlaceId: undefined };
    const queryParams = searchStateToParams(next);
    if (mode === "map") queryParams.set("view", "map");
    const query = queryParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const switchView = (nextMode: "list" | "map") => {
    const queryParams = new URLSearchParams(params.toString());
    if (nextMode === "map") queryParams.set("view", "map"); else queryParams.delete("view");
    const query = queryParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const keyword = draftQuery.trim();
    commit({ query: keyword || undefined });
    setAmapError(""); setAmapSuggestions([]);
    if (keyword.length < 2) return;
    setIsSearchingAmap(true);
    const result = await searchAmapPoiTips(keyword);
    setIsSearchingAmap(false);
    setAmapSuggestions(result.candidates);
    setAmapError(result.error ?? "");
  };
  const selectCuisine = (slug: string, close = false) => {
    commit({ cuisineIds: state.cuisineIds.includes(slug) ? state.cuisineIds.filter((value) => value !== slug) : [...state.cuisineIds, slug] });
    if (close) setOpenMenu(undefined);
  };
  const selectScene = (slug: string, close = false) => {
    commit({ sceneTagIds: state.sceneTagIds.includes(slug) ? state.sceneTagIds.filter((value) => value !== slug) : [...state.sceneTagIds, slug] });
    if (close) setOpenMenu(undefined);
  };
  const clearAll = () => { setDraftQuery(""); setAmapSuggestions([]); commit({}, { clear: true }); };
  const reportMapError = useCallback(() => setMapError("地图暂不可用；你仍可在列表中完成检索。"), []);
  const requestNearby = () => {
    if (!navigator.geolocation) { setLocationMessage("当前浏览器不支持定位；可继续按推荐或最近体验排序。"); return; }
    setLocationMessage("正在获取位置，仅用于本次本机排序…");
    navigator.geolocation.getCurrentPosition(({ coords }) => { setOrigin({ latitude: coords.latitude, longitude: coords.longitude }); setLocationMessage("已按离你最近排序；位置不会写入链接。"); commit({ sort: "distance" }); }, () => setLocationMessage("未取得定位权限；可继续按推荐或最近体验排序。"), { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 });
  };
  const detailHref = (id: string) => `/place/${id}?returnTo=${encodeURIComponent(currentUrl)}`;
  const selectDistrict = (district: AmapDistrict) => {
    setAmapSuggestions([]);
    setOpenMenu(undefined);
    commit({ query: undefined, areaIds: [], locationFilter: { id: district.adcode, name: district.name, kind: "district" } });
  };
  const selectAmapLocation = (candidate: AmapPoiCandidate) => {
    const kind = locationKind(candidate);
    setDraftQuery("");
    setAmapSuggestions([]);
    setOpenMenu(undefined);
    commit({ query: undefined, areaIds: [], locationFilter: { id: candidate.poiId, name: candidate.name, kind, latitude: candidate.latitude, longitude: candidate.longitude } });
  };
  const suggestions = useMemo(() => {
    const keyword = draftQuery.trim().toLocaleLowerCase("zh-CN");
    if (!keyword) return [] as Array<{ type: "cuisine" | "place"; id: string; label: string; description: string }>;
    return [
      ...cuisineOptions.filter(([, label]) => label.toLocaleLowerCase("zh-CN").includes(keyword)).slice(0, 3).map(([id, label]) => ({ type: "cuisine" as const, id, label, description: "菜系" })),
      ...places.filter((place) => place.name.toLocaleLowerCase("zh-CN").includes(keyword) || place.recommendedItems?.some((item) => item.toLocaleLowerCase("zh-CN").includes(keyword))).slice(0, 3).map((place) => ({ type: "place" as const, id: place.id, label: place.name, description: "餐厅" })),
    ];
  }, [draftQuery, cuisineOptions, places]);

  return <section className="home-explorer" aria-label="找餐厅">
    <header className="home-explorer__header"><div><p className="eyebrow">发现 · 朋友真实推荐</p><h1>今天想去哪儿吃？</h1><p>从朋友真实推荐里，找到合适的一家。</p></div><div className="map-view-toggle" role="group" aria-label="切换发现列表或地图"><button className={mode === "list" ? "is-active" : ""} type="button" onClick={() => switchView("list")}>列表</button><button className={mode === "map" ? "is-active" : ""} type="button" onClick={() => switchView("map")}>地图</button></div></header>

    <form className="intent-search" onSubmit={submit}><span aria-hidden="true">⌕</span><input value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder="搜餐厅、区域、菜系或推荐菜" aria-label="搜索餐厅、行政区、商圈、地铁、菜系或推荐菜" /><button type="submit" disabled={isSearchingAmap}>{isSearchingAmap ? "查找中" : "搜索"}</button><small>可搜餐厅、行政区、商圈/地铁、菜系或推荐菜。</small></form>
    {(amapSuggestions.length > 0 || amapError) && <div className="amap-search-suggestions" aria-label="高德地点建议"><p>高德地点建议</p>{amapSuggestions.map((candidate) => <button key={candidate.poiId} type="button" onClick={() => selectAmapLocation(candidate)}><span className={`location-tag location-tag--${locationKind(candidate)}`}>{locationKindLabel(locationKind(candidate))}</span><strong>{candidate.name}</strong><small>{candidate.district || candidate.address || "高德地图地点"}</small></button>)}{amapError && <small className="location-note">地点建议暂不可用，仍已按站内内容筛选。</small>}</div>}
    {suggestions.length > 0 && <div className="search-suggestions" aria-label="站内搜索建议">{suggestions.map((suggestion) => <button key={`${suggestion.type}-${suggestion.id}`} type="button" onClick={() => { if (suggestion.type === "cuisine") selectCuisine(suggestion.id); else { setDraftQuery(suggestion.label); commit({ query: suggestion.label }); } }}>{suggestion.label}<small>{suggestion.description}</small></button>)}</div>}

    <div className="intent-actions" aria-label="找餐厅方式" ref={intentActionsRef}>
      <div className="intent-action"><button type="button" aria-expanded={openMenu === "location"} aria-controls="intent-menu-location" onClick={() => setOpenMenu(openMenu === "location" ? undefined : "location")}>按地点找</button>{openMenu === "location" && <div className="intent-menu intent-menu--grouped intent-menu--left" id="intent-menu-location"><section><b>行政区 · 来自高德</b>{districts.map((district) => <button className={state.locationFilter?.id === district.adcode ? "is-selected" : ""} key={district.adcode} type="button" onClick={() => selectDistrict(district)}>{district.name}</button>)}{districtError && <small>{districtError}</small>}</section><section><b>商圈 / 地铁 · 来自高德</b><small>在上方搜索并选择建议；商圈按 3 公里、地铁按 1.5 公里筛选。</small></section></div>}</div>
      <div className="intent-action"><button type="button" aria-expanded={openMenu === "cuisine"} aria-controls="intent-menu-cuisine" onClick={() => setOpenMenu(openMenu === "cuisine" ? undefined : "cuisine")}>按菜系找</button>{openMenu === "cuisine" && <div className="intent-menu intent-menu--center" id="intent-menu-cuisine">{cuisineOptions.map(([slug, label]) => <button className={state.cuisineIds.includes(slug) ? "is-selected" : ""} key={slug} type="button" onClick={() => selectCuisine(slug, true)}>{label}</button>)}</div>}</div>
      <div className="intent-action"><button type="button" aria-expanded={openMenu === "inspiration"} aria-controls="intent-menu-inspiration" onClick={() => setOpenMenu(openMenu === "inspiration" ? undefined : "inspiration")}>找灵感</button>{openMenu === "inspiration" && <div className="intent-menu intent-menu--right" id="intent-menu-inspiration">{sceneTags.map(([slug, label]) => <button className={state.sceneTagIds.includes(slug) ? "is-selected" : ""} key={slug} type="button" onClick={() => selectScene(slug, true)}>{label}</button>)}</div>}</div>
    </div>
    {activeSearch && <section className="active-filter-panel" aria-label="筛选条件"><div className="active-filter-panel__controls"><select value={state.priceRange ?? ""} onChange={(event) => commit({ priceRange: event.target.value as SearchState["priceRange"] || undefined })} aria-label="人均"><option value="">全部人均</option>{priceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select value={state.sort} onChange={(event) => { if (event.target.value === "distance") requestNearby(); else commit({ sort: event.target.value as SearchState["sort"] }); }} aria-label="结果排序"><option value="recommended">最值得去</option><option value="recent">最近体验</option><option value="distance">离我最近</option></select></div><div className="active-filter-panel__chips">{state.query && <button type="button" onClick={() => { setDraftQuery(""); commit({ query: undefined }); }}>站内搜索 · {state.query} ×</button>}{state.locationFilter && <button className={`location-tag location-tag--${state.locationFilter.kind}`} type="button" onClick={() => commit({ locationFilter: undefined })}>{locationKindLabel(state.locationFilter.kind)} · {state.locationFilter.name} ×</button>}{state.cuisineIds.map((id) => <button key={id} type="button" onClick={() => selectCuisine(id)}>{cuisineLabelBySlug[id] ?? id} ×</button>)}{state.sceneTagIds.map((id) => <button key={id} type="button" onClick={() => selectScene(id)}>{sceneTagLabels[id] ?? id} ×</button>)}</div><div className="result-heading"><strong>{state.query ? `“${state.query}”找到 ${filteredPlaces.length} 家` : `${filteredPlaces.length} 家朋友推荐`}</strong><button className="text-button" type="button" onClick={clearAll}>清除筛选</button></div>{locationMessage && <p className="location-note">{locationMessage}</p>}</section>}

    {mode === "map" ? <section className="v1-static-map" aria-label="发现地点的地图视图"><StaticMapAdapter pins={filteredPlaces} selectedPlaceId={state.selectedPlaceId} onError={reportMapError} /><div><strong>{filteredPlaces.length} 家朋友推荐</strong><button type="button" onClick={() => switchView("list")}>查看列表</button></div>{mapError && <p className="map-status-message">{mapError}</p>}</section> : <section className="home-results">{!activeSearch && <div className="home-results__intro"><p className="eyebrow">朋友最近推荐</p><h2>先从这些值得去的地方开始</h2></div>}{(activeSearch ? filteredPlaces : recentPlaces).length ? <ul className="home-place-list">{(activeSearch ? filteredPlaces : recentPlaces).map((place) => <li key={place.id}><DiscoveryPlaceCard canManage={canManage} place={place} href={detailHref(place.id)} cuisineLabel={place.cuisineSlugs?.map((slug) => cuisineLabelBySlug[slug]).filter(Boolean)[0]} categoryLabel={categoryLabels[place.category] || "餐饮"} nearbyLabel={state.locationFilter?.kind === "metro_station" ? state.locationFilter.name : undefined} /></li>)}</ul> : <div className="empty-state"><strong>{places.length ? "当前条件下暂无朋友推荐" : "共同地图还没有真实标记"}</strong><span>{places.length ? "清除筛选或扩大范围再试试。" : "从添加第一家真实体验开始。"}</span>{places.length ? <button className="text-button" type="button" onClick={clearAll}>清除筛选</button> : <Link className="primary-link" href="/mark">去标记地点</Link>}</div>}</section>}
  </section>;
}
