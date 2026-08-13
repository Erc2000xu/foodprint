"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getAmapBeijingDistricts, searchAmapPoiTips, type AmapDistrict, type AmapPoiCandidate } from "@/lib/amap/poi-client";
import { DynamicMapAdapter } from "@/components/map/lazy-map-adapter";
import { DiscoveryPlaceCard } from "@/components/discover/discovery-place-card";
import { ViewportPlaceSheet } from "@/components/map/viewport-place-sheet";
import { initialViewportSheetState, viewportSheetReducer, type ViewportSheetDetent } from "@/components/map/viewport-place-sheet-reducer";
import { categoryOptions, sceneTagLabels, sceneTags } from "@/lib/mark-options";
import { priceOptions } from "@/lib/discovery-options";
import { defaultSearchState, discoveryDistanceMeters, filterDiscoveryPlaces, hasActiveSearch, searchStateFromParams, searchStateToParams, type DiscoveryLocationFilter, type SearchState } from "@/lib/discovery/search-state";
import { isValidGcj02Coordinate, type DiscoveryPlace, type DiscoveryIndexStatus, type GeoOption, type MapViewport } from "@/lib/discovery/types";
import { placesWithinBounds } from "@/lib/discovery/viewport";
import { discoveryViewFromParams, type DiscoveryView } from "@/lib/discovery/map-state";
import { mapFailureMessage, type MapFailure } from "@/lib/amap/map-failure";
import type { DiscoveryMapRuntimeConfig } from "@/lib/env.server";
import { reportClientMetric } from "@/lib/performance/client";

type CuisineOption = readonly [string, string];
type Origin = { latitude: number; longitude: number };
type IntentMenu = "location" | "cuisine" | "inspiration";

const categoryLabels = Object.fromEntries(categoryOptions) as Record<string, string>;

function locationKind(candidate: AmapPoiCandidate): DiscoveryLocationFilter["kind"] {
  return /地铁|轨道|站/.test(`${candidate.name} ${candidate.address}`) ? "metro_station" : "business_district";
}

function locationKindLabel(kind: DiscoveryLocationFilter["kind"]) {
  return kind === "district" ? "行政区" : kind === "metro_station" ? "地铁" : "商圈";
}

function stablePlaceIds(places: readonly DiscoveryPlace[]) {
  return places.map((place) => place.id).sort().join(",");
}

export type DiscoveryBrowserProps = {
  places: DiscoveryPlace[];
  cuisineOptions: readonly CuisineOption[];
  geoOptions?: GeoOption[];
  canManage?: boolean;
  indexStatus?: DiscoveryIndexStatus;
  mapRuntimeConfig?: DiscoveryMapRuntimeConfig;
};

/** The shared BaseSet → FilteredSet → ViewportSet discovery experience. */
export function DiscoveryBrowser({ places, cuisineOptions, canManage = false, indexStatus = "empty", mapRuntimeConfig = { enabled: false } }: DiscoveryBrowserProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const paramsString = params.toString();
  const state = useMemo(() => searchStateFromParams(new URLSearchParams(paramsString)), [paramsString]);
  const dataComplete = indexStatus === "complete";
  const mapEnabled = mapRuntimeConfig.enabled && dataComplete && places.length > 0;
  const [mapDisabledForSession, setMapDisabledForSession] = useState(false);
  const [mapFailure, setMapFailure] = useState<MapFailure>();
  const [retryGeneration, setRetryGeneration] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [pendingLocate, setPendingLocate] = useState(false);
  const [locateRequest, setLocateRequest] = useState(0);
  const [viewport, setViewport] = useState<MapViewport>();
  const [sheet, dispatchSheet] = useReducer(viewportSheetReducer, initialViewportSheetState);
  const [draftQuery, setDraftQuery] = useState(state.query ?? "");
  const [origin, setOrigin] = useState<Origin>();
  const [locationMessage, setLocationMessage] = useState("");
  const [districts, setDistricts] = useState<AmapDistrict[]>([]);
  const [districtError, setDistrictError] = useState("");
  const [districtLoaded, setDistrictLoaded] = useState(false);
  const [amapSuggestions, setAmapSuggestions] = useState<AmapPoiCandidate[]>([]);
  const [amapError, setAmapError] = useState("");
  const [isSearchingAmap, setIsSearchingAmap] = useState(false);
  const [openMenu, setOpenMenu] = useState<IntentMenu>();
  const intentActionsRef = useRef<HTMLDivElement>(null);
  const amapRequestId = useRef(0);
  const amapSearchController = useRef<AbortController | null>(null);
  const cuisineLabelBySlug = useMemo(() => Object.fromEntries(cuisineOptions), [cuisineOptions]) as Record<string, string>;
  const paramView = discoveryViewFromParams(new URLSearchParams(paramsString), mapEnabled, dataComplete);
  const view = mapDisabledForSession ? "list" : paramView;

  const mapMode = view === "map" && mapEnabled && !mapDisabledForSession;
  const filteredPlaces = useMemo(() => {
    const result = filterDiscoveryPlaces(places, state, cuisineLabelBySlug);
    if (state.sort !== "distance" || !origin) return result;
    return [...result].sort((left, right) => discoveryDistanceMeters(origin, left) - discoveryDistanceMeters(origin, right) || left.id.localeCompare(right.id));
  }, [cuisineLabelBySlug, origin, places, state]);
  const viewportPlaces = useMemo(() => viewport && mapMode ? placesWithinBounds(filteredPlaces, viewport.bounds) : filteredPlaces, [filteredPlaces, mapMode, viewport]);
  const mapPlaces = useMemo(() => filteredPlaces.filter(isValidGcj02Coordinate).sort((left, right) => left.id.localeCompare(right.id)), [filteredPlaces]);
  const selectedPlace = sheet.selectedPlaceId ? places.find((place) => place.id === sheet.selectedPlaceId) : undefined;
  const activeSearch = hasActiveSearch(state);
  const hasControls = activeSearch || state.sort === "distance";
  const currentUrl = `${pathname}${paramsString ? `?${paramsString}` : ""}`;
  const scrollStorageKey = `foodprint:scroll:${currentUrl}`;
  const districtLoading = openMenu === "location" && districts.length === 0 && !districtLoaded && !districtError;
  const mapFitRequestKey = stablePlaceIds(mapPlaces);

  useEffect(() => {
    if (sheet.selectedPlaceId && !filteredPlaces.some((place) => place.id === sheet.selectedPlaceId)) dispatchSheet({ type: "CLEAR_SELECTION" });
  }, [filteredPlaces, sheet.selectedPlaceId]);

  useEffect(() => {
    if (openMenu !== "location" || districtLoaded || districts.length > 0) return;
    const controller = new AbortController();
    void getAmapBeijingDistricts({ signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      setDistricts(result.districts);
      setDistrictError(result.error ?? "");
      setDistrictLoaded(true);
    });
    return () => controller.abort();
  }, [districtLoaded, districts.length, openMenu]);

  useEffect(() => () => {
    amapRequestId.current += 1;
    amapSearchController.current?.abort();
  }, []);

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (openMenu && !intentActionsRef.current?.contains(event.target as Node)) setOpenMenu(undefined);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenu(undefined);
        dispatchSheet({ type: "ESCAPE" });
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openMenu]);

  useEffect(() => {
    let savedPosition = "";
    try { savedPosition = sessionStorage.getItem(scrollStorageKey) ?? ""; } catch { return; }
    const scrollY = Number(savedPosition);
    if (!Number.isFinite(scrollY) || scrollY < 0) return;
    const frame = window.requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: "auto" }));
    try { sessionStorage.removeItem(scrollStorageKey); } catch { /* Storage can be disabled. */ }
    return () => window.cancelAnimationFrame(frame);
  }, [scrollStorageKey]);

  const rememberScrollPosition = () => {
    try { sessionStorage.setItem(scrollStorageKey, String(Math.max(0, Math.round(window.scrollY)))); } catch { /* Storage can be disabled. */ }
  };

  const replaceSearch = (next: SearchState, nextView = view) => {
    const queryParams = searchStateToParams(next);
    if (nextView === "list") queryParams.set("view", "list");
    else queryParams.delete("view");
    const query = queryParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const commit = (patch: Partial<SearchState>, options?: { clear?: boolean }) => {
    const next: SearchState = options?.clear ? { ...defaultSearchState, ...patch } : { ...state, ...patch };
    replaceSearch(next);
  };

  const switchView = (nextView: DiscoveryView) => {
    if (nextView === "map" && !mapEnabled) {
      setLocationMessage(indexStatus === "invalid_coordinates" ? "地点坐标待补充，当前先使用完整列表。" : "地图暂未开启，当前先使用完整列表。");
      return;
    }
    setMapReady(false);
    replaceSearch(state, nextView);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const keyword = draftQuery.trim();
    commit({ query: keyword || undefined });
    setAmapError(""); setAmapSuggestions([]);
    amapSearchController.current?.abort();
    amapSearchController.current = null;
    const currentRequest = ++amapRequestId.current;
    setIsSearchingAmap(false);
    if (keyword.length < 2) return;
    const controller = new AbortController();
    amapSearchController.current = controller;
    setIsSearchingAmap(true);
    const result = await searchAmapPoiTips(keyword, undefined, { signal: controller.signal });
    if (currentRequest !== amapRequestId.current) return;
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
  const clearAll = () => {
    setDraftQuery(""); setAmapSuggestions([]); setOrigin(undefined); setLocationMessage("");
    commit({}, { clear: true });
  };

  const requestNearby = () => {
    if (!mapEnabled) {
      setLocationMessage("地图未开启，暂时无法获取当前位置；你仍可按推荐或最近体验查看。");
      return;
    }
    if (!mapMode) {
      setPendingLocate(true);
      switchView("map");
      return;
    }
    if (!mapReady) {
      setPendingLocate(true);
      setLocationMessage("地图正在准备定位…");
      return;
    }
    setLocationMessage("正在获取位置…");
    setLocateRequest((value) => value + 1);
  };

  const reportMapFailure = (failure: MapFailure) => {
    setMapFailure(failure);
    setMapDisabledForSession(true);
    setMapReady(false);
    replaceSearch(state, "list");
    const failureDetail = failure.code === "complete_timeout" || failure.code === "provider_timeout" ? "timeout" : "error";
    reportClientMetric("amap_failed", 1, failureDetail, { outcome: failureDetail });
    reportClientMetric("discovery_fallback_to_list", 1, "error", { outcome: "error" });
  };

  const retryMap = () => {
    reportClientMetric("map_retry_clicked", 1, undefined, { outcome: "success" });
    setMapFailure(undefined);
    setMapDisabledForSession(false);
    setRetryGeneration((value) => value + 1);
    setMapReady(false);
    replaceSearch(state, "map");
  };

  const handleLocationResult = (location: Origin) => {
    setOrigin(location);
    setLocationMessage("已按离你最近排序；位置仅用于本次排序，不会保存。");
    commit({ sort: "distance" });
  };
  const handleLocationError = () => setLocationMessage("未获得定位权限；你仍可按推荐或最近体验查看。");
  const handleViewportSettled = (nextViewport: MapViewport) => {
    setViewport(nextViewport);
    if (sheet.selectedPlaceId && !placesWithinBounds([selectedPlace ?? places[0]].filter(Boolean), nextViewport.bounds).some((place) => place.id === sheet.selectedPlaceId)) dispatchSheet({ type: "CLEAR_SELECTION" });
  };
  const handleClusterOpened = (placeIds: string[]) => {
    dispatchSheet({ type: "OPEN_EXPANDED" });
    reportClientMetric("map_cluster_opened", placeIds.length, undefined, { outcome: "success" });
  };

  const detailHref = (id: string) => `/place/${id}?returnTo=${encodeURIComponent(currentUrl)}`;
  const selectDistrict = (district: AmapDistrict) => {
    setAmapSuggestions([]); setOpenMenu(undefined);
    commit({ query: undefined, areaIds: [], locationFilter: { id: district.adcode, name: district.name, kind: "district" } });
  };
  const selectAmapLocation = (candidate: AmapPoiCandidate) => {
    const kind = locationKind(candidate);
    setDraftQuery(""); setAmapSuggestions([]); setOpenMenu(undefined);
    commit({ query: undefined, areaIds: [], locationFilter: { id: candidate.poiId, name: candidate.name, kind, latitude: candidate.latitude, longitude: candidate.longitude } });
  };
  const suggestions = useMemo(() => {
    const keyword = draftQuery.trim().toLocaleLowerCase("zh-CN");
    if (!keyword) return [] as Array<{ type: "cuisine" | "place"; id: string; label: string; description: string }>;
    return [
      ...cuisineOptions.filter(([, label]) => label.toLocaleLowerCase("zh-CN").includes(keyword)).slice(0, 3).map(([id, label]) => ({ type: "cuisine" as const, id, label, description: "菜系" })),
      ...places.filter((place) => place.name.toLocaleLowerCase("zh-CN").includes(keyword) || place.recommendedItems?.some((item) => item.toLocaleLowerCase("zh-CN").includes(keyword))).slice(0, 3).map((place) => ({ type: "place" as const, id: place.id, label: place.name, description: "地点" })),
    ];
  }, [draftQuery, cuisineOptions, places]);

  return <section className="home-explorer" aria-label="寻找地点">
    <header className="home-explorer__header"><div><p className="eyebrow">发现 · 朋友吃过的地方</p><h1 className="creative-title">今天想去哪儿吃？</h1><p>从朋友吃过的地方里，选一家合适的。</p></div><div className="map-view-toggle" role="group" aria-label="切换发现列表或地图"><button className={view === "list" ? "is-active" : ""} type="button" onClick={() => switchView("list")}>列表</button><button className={view === "map" ? "is-active" : ""} type="button" onClick={() => switchView("map")}>地图</button></div></header>

    <form className="intent-search" onSubmit={submit}><span aria-hidden="true">⌕</span><input value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder="搜餐厅、区域、菜系或推荐菜" aria-label="搜索餐厅、区域、商圈、地铁、菜系或推荐菜" /><button type="submit" disabled={isSearchingAmap}>{isSearchingAmap ? "搜索中…" : "搜索"}</button><small>可搜餐厅、区域、商圈、地铁、菜系或推荐菜。</small></form>
    {(amapSuggestions.length > 0 || amapError) && <div className="amap-search-suggestions" aria-label="地点建议"><p>地点建议</p>{amapSuggestions.map((candidate) => <button key={candidate.poiId} type="button" onClick={() => selectAmapLocation(candidate)}><span className={`location-tag location-tag--${locationKind(candidate)}`}>{locationKindLabel(locationKind(candidate))}</span><strong>{candidate.name}</strong><small>{candidate.district || candidate.address || "地点信息待补充"}</small></button>)}{amapError && <small className="location-note">暂时无法显示地点建议，食迹里的地点仍可继续筛选。</small>}</div>}
    {suggestions.length > 0 && <div className="search-suggestions" aria-label="站内搜索建议">{suggestions.map((suggestion) => <button key={`${suggestion.type}-${suggestion.id}`} type="button" onClick={() => { if (suggestion.type === "cuisine") selectCuisine(suggestion.id); else { setDraftQuery(suggestion.label); commit({ query: suggestion.label }); } }}>{suggestion.label}<small>{suggestion.description}</small></button>)}</div>}

    <div className="intent-actions" aria-label="寻找地点的方式" ref={intentActionsRef}>
      <div className="intent-action"><button type="button" aria-expanded={openMenu === "location"} aria-controls="intent-menu-location" onClick={() => { const nextOpenMenu = openMenu === "location" ? undefined : "location"; if (nextOpenMenu === "location" && districts.length === 0) { setDistrictError(""); setDistrictLoaded(false); } setOpenMenu(nextOpenMenu); }}>按地点找</button>{openMenu === "location" && <div className="intent-menu intent-menu--grouped intent-menu--left" id="intent-menu-location"><section><b>行政区</b>{districtLoading && <small>正在加载行政区…</small>}{districts.map((district) => <button className={state.locationFilter?.id === district.adcode ? "is-selected" : ""} key={district.adcode} type="button" onClick={() => selectDistrict(district)}>{district.name}</button>)}{districtError && <small>{districtError}</small>}</section><section><b>商圈 / 地铁</b><small>搜索并选择一个地点；商圈按 3 公里、地铁按 1.5 公里筛选。</small></section></div>}</div>
      <div className="intent-action"><button type="button" aria-expanded={openMenu === "cuisine"} aria-controls="intent-menu-cuisine" onClick={() => setOpenMenu(openMenu === "cuisine" ? undefined : "cuisine")}>按菜系找</button>{openMenu === "cuisine" && <div className="intent-menu intent-menu--center" id="intent-menu-cuisine">{cuisineOptions.map(([slug, label]) => <button className={state.cuisineIds.includes(slug) ? "is-selected" : ""} key={slug} type="button" onClick={() => selectCuisine(slug, true)}>{label}</button>)}</div>}</div>
      <div className="intent-action"><button type="button" aria-expanded={openMenu === "inspiration"} aria-controls="intent-menu-inspiration" onClick={() => setOpenMenu(openMenu === "inspiration" ? undefined : "inspiration")}>找灵感</button>{openMenu === "inspiration" && <div className="intent-menu intent-menu--right" id="intent-menu-inspiration">{sceneTags.map(([slug, label]) => <button className={state.sceneTagIds.includes(slug) ? "is-selected" : ""} key={slug} type="button" onClick={() => selectScene(slug, true)}>{label}</button>)}</div>}</div>
    </div>
    {hasControls && <section className="active-filter-panel" aria-label="筛选条件"><div className="active-filter-panel__controls"><select value={state.priceRange ?? ""} onChange={(event) => commit({ priceRange: event.target.value as SearchState["priceRange"] || undefined })} aria-label="人均"><option value="">全部人均</option>{priceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select value={state.sort} onChange={(event) => { if (event.target.value === "distance") requestNearby(); else commit({ sort: event.target.value as SearchState["sort"] }); }} aria-label="结果排序"><option value="recommended">最值得去</option><option value="recent">最近体验</option><option value="distance">离我最近</option></select></div><div className="active-filter-panel__chips">{state.query && <button type="button" onClick={() => { setDraftQuery(""); commit({ query: undefined }); }}>搜索 · {state.query} ×</button>}{state.locationFilter && <button className={`location-tag location-tag--${state.locationFilter.kind}`} type="button" onClick={() => commit({ locationFilter: undefined })}>{locationKindLabel(state.locationFilter.kind)} · {state.locationFilter.name} ×</button>}{state.cuisineIds.map((id) => <button key={id} type="button" onClick={() => selectCuisine(id)}>{cuisineLabelBySlug[id] ?? id} ×</button>)}{state.sceneTagIds.map((id) => <button key={id} type="button" onClick={() => selectScene(id)}>{sceneTagLabels[id] ?? id} ×</button>)}</div><div className="result-heading"><strong>{state.query ? `“${state.query}”找到 ${filteredPlaces.length} 个地点` : `朋友推荐了 ${filteredPlaces.length} 个地点`}</strong><button className="text-button" type="button" onClick={clearAll}>清除筛选</button></div>{locationMessage && <p className="location-note">{locationMessage}</p>}</section>}

    {mapMode ? <section className="dynamic-map-shell" aria-label="发现地点的动态地图"><div className="dynamic-map-toolbar"><strong>朋友推荐了 {filteredPlaces.length} 个地点</strong><button type="button" onClick={requestNearby} aria-label="按离我最近排序">⌖ 离我最近</button></div><DynamicMapAdapter key={retryGeneration} apiKey={mapRuntimeConfig.enabled ? mapRuntimeConfig.jsApiKey : ""} pins={mapPlaces} selectedPlaceId={sheet.selectedPlaceId} userLocation={origin} retryGeneration={retryGeneration} locateRequest={locateRequest} fitRequestKey={mapFitRequestKey} padding={{ top: 28, right: 20, bottom: sheet.detent === "expanded" ? 400 : sheet.detent === "half" ? 270 : sheet.detent === "card" ? 230 : 130, left: 20 }} onReady={() => { setMapReady(true); if (pendingLocate) { setPendingLocate(false); setLocateRequest((value) => value + 1); } reportClientMetric("amap_ready", 1, undefined, { outcome: "success" }); if (retryGeneration > 0) reportClientMetric("map_retry_result", 1, undefined, { outcome: "success" }); }} onViewportSettled={handleViewportSettled} onSelectPlace={(placeId) => { dispatchSheet({ type: "SELECT_PLACE", placeId }); reportClientMetric("map_pin_selected", 1, undefined, { outcome: "success" }); }} onClearSelection={() => dispatchSheet({ type: "CLEAR_SELECTION" })} onClusterOpened={handleClusterOpened} onLocationResult={handleLocationResult} onLocationError={handleLocationError} onFatalError={reportMapFailure} /><ViewportPlaceSheet places={viewportPlaces} selectedPlace={selectedPlace} detent={sheet.detent} detailHref={detailHref} onDetentChange={(detent: ViewportSheetDetent) => dispatchSheet({ type: "SET_DETENT", detent })} onSelectPlace={(placeId) => { dispatchSheet({ type: "SELECT_PLACE", placeId }); reportClientMetric("viewport_sheet_place_opened", 1, undefined, { outcome: "success" }); }} onClearSelection={() => dispatchSheet({ type: "CLEAR_SELECTION" })} onOpenAll={() => { switchView("list"); reportClientMetric("viewport_sheet_opened", 1, undefined, { outcome: "success" }); }} />{locationMessage && <p className="map-location-note">{locationMessage}</p>}</section> : <section className="home-results">{mapFailure && <div className="map-fallback-banner" role="status"><span>{mapFailureMessage(mapFailure)}</span>{mapFailure.retryable && mapEnabled && <button type="button" onClick={retryMap}>重试地图</button>}</div>}{indexStatus === "invalid_coordinates" && <div className="map-fallback-banner" role="status"><span>部分地点坐标待补充，地图暂不可用；完整列表仍可使用。</span></div>}{(indexStatus === "error" || indexStatus === "overflow") && <div className="map-fallback-banner" role="alert"><span>地点列表暂时没有完整加载，请稍后重试。</span></div>}{!hasControls && <div className="home-results__intro"><p className="eyebrow">共同地图</p><h2>朋友吃过的地方</h2><p>列表与地图来自同一组已推荐地点。</p></div>}{filteredPlaces.length ? <ul className="home-place-list">{filteredPlaces.map((place, index) => <li key={place.id}><DiscoveryPlaceCard isFirst={index === 0} canManage={canManage} place={place} href={detailHref(place.id)} onNavigate={rememberScrollPosition} cuisineLabel={place.cuisineSlugs?.map((slug) => cuisineLabelBySlug[slug]).filter(Boolean)[0]} categoryLabel={categoryLabels[place.category] || "餐饮"} nearbyLabel={state.locationFilter?.kind === "metro_station" ? state.locationFilter.name : undefined} /></li>)}</ul> : <div className="empty-state"><strong>{places.length ? "没有符合条件的地点" : indexStatus === "error" || indexStatus === "overflow" ? "地点列表暂时不可用" : "共同地图里还没有地点"}</strong><span>{places.length ? "可以换个条件再试试。" : indexStatus === "error" || indexStatus === "overflow" ? "请稍后刷新页面再试。" : "先记下一家去过的地方。"}</span>{places.length ? <button className="text-button" type="button" onClick={clearAll}>清除筛选</button> : indexStatus === "error" || indexStatus === "overflow" ? null : <Link className="primary-link" href="/mark">记下第一家</Link>}</div>}</section>}
  </section>;
}

export type { GeoOption };
