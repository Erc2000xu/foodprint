"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { lookupAmapPoi, savePlaceMark, type MarkResult } from "@/app/mark/actions";
import { categoryOptions, qualityLabels, sceneTags, type PlaceCategory } from "@/lib/mark-options";
import { PhotoPicker } from "@/components/mark/photo-picker";
import { createClient } from "@/lib/supabase/client";

export type MarkCandidate = {
  poiId: string;
  name: string;
  address: string;
  city: string;
  district: string;
  latitude: number;
  longitude: number;
  distanceMeters?: number;
};

type UserLocation = { latitude: number; longitude: number };

const initial: MarkResult = {};
async function searchAmapTips(keyword: string, location?: UserLocation): Promise<{ candidates: MarkCandidate[]; error?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("amap-poi-search", { body: { keyword, location } });
  if (error) {
    const context = error.context;
    if (context instanceof Response) {
      const payload = await context.json().catch(() => null) as { error?: string; errorCode?: string } | null;
      if (payload?.error) return { candidates: [], error: `${payload.error}${payload.errorCode ? `（${payload.errorCode}）` : ""}` };
    }
    return { candidates: [], error: "地点搜索服务暂时无法连接。" };
  }
  const payload = data as { candidates?: MarkCandidate[]; error?: string; errorCode?: string } | null;
  if (payload?.error) return { candidates: [], error: `${payload.error}${payload.errorCode ? `（${payload.errorCode}）` : ""}` };
  return { candidates: payload?.candidates ?? [] };
}

function distanceInMeters(from: UserLocation, to: MarkCandidate) {
  if (!Number.isFinite(to.latitude) || !Number.isFinite(to.longitude)) return Number.POSITIVE_INFINITY;
  const radius = 6_371_000;
  const radians = Math.PI / 180;
  const latitudeDelta = (to.latitude - from.latitude) * radians;
  const longitudeDelta = (to.longitude - from.longitude) * radians;
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(from.latitude * radians) * Math.cos(to.latitude * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sortByDistance(candidates: MarkCandidate[], location?: UserLocation) {
  if (!location) return candidates;
  return candidates
    .map((candidate) => ({ ...candidate, distanceMeters: distanceInMeters(location, candidate) }))
    .sort((left, right) => (left.distanceMeters ?? Number.POSITIVE_INFINITY) - (right.distanceMeters ?? Number.POSITIVE_INFINITY));
}

function formatDistance(distanceMeters?: number) {
  if (!Number.isFinite(distanceMeters)) return "";
  if ((distanceMeters ?? 0) < 1_000) return `${Math.round(distanceMeters ?? 0)} m`;
  return `${((distanceMeters ?? 0) / 1_000).toFixed(1)} km`;
}

function cityTagTone(city: string) {
  const code = Array.from(city).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return ["city-tag--teal", "city-tag--coral", "city-tag--gold"][code % 3];
}

function StarRating({ name, label, required = false }: { name: string; label: string; required?: boolean }) {
  const [value, setValue] = useState<number | null>(null);
  const chooseRating = (star: number) => {
    setValue((current) => !required && current === star ? null : star);
  };

  return <fieldset className={`star-rating${required ? " star-rating--required" : ""}`}>
    <legend>{label}{required ? <span className="required-mark">必填</span> : <span className="optional-mark">可选</span>}</legend>
    <input type="hidden" name={name} value={value ?? ""} />
    <div className="star-rating__controls" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((star) => <button key={star} className={`star-rating__button${value !== null && value >= star ? " star-rating__button--selected" : ""}`} type="button" onClick={() => chooseRating(star)} aria-label={`设置为 ${star} 星`} aria-pressed={value === star}>★</button>)}
    </div>
    <p className="star-rating__hint">{value === null ? required ? "请选择 1–5 星。" : "不填写不会影响保存。" : `${value} 星${required ? "" : "；再次点选同一颗星可清除。"}`}</p>
  </fieldset>;
}

export function MarkFlow({ initialCandidate }: { initialCandidate?: MarkCandidate }) {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<MarkCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [selected, setSelected] = useState<MarkCandidate | undefined>(initialCandidate);
  const [alreadyInGroup, setAlreadyInGroup] = useState(Boolean(initialCandidate));
  const [selectionError, setSelectionError] = useState("");
  const [primaryCategory, setPrimaryCategory] = useState<PlaceCategory>("restaurant");
  const [userLocation, setUserLocation] = useState<UserLocation>();
  const [locationState, setLocationState] = useState("");
  const [isLookingUp, startLookup] = useTransition();
  const requestId = useRef(0);
  const [state, action, pending] = useActionState(savePlaceMark, initial);

  useEffect(() => {
    if (keyword.trim().length < 2 || selected) {
      requestId.current += 1;
      return;
    }
    const timer = window.setTimeout(() => {
      const currentRequest = ++requestId.current;
      setSearching(true);
      const finish = (candidates: MarkCandidate[], error = "") => {
        if (currentRequest !== requestId.current) return;
        setResults(sortByDistance(candidates, userLocation));
        setSearchError(error);
        setHasSearched(true);
        setSearching(false);
      };
      void searchAmapTips(keyword.trim(), userLocation)
        .then(({ candidates, error }) => finish(candidates, error ? `高德搜索失败：${error}` : ""))
        .catch(() => finish([], "高德搜索服务暂时无法连接。"));
    }, 420);
    return () => window.clearTimeout(timer);
  }, [keyword, selected, userLocation]);

  const requestLocationSort = () => {
    if (!navigator.geolocation) {
      setLocationState("当前浏览器不支持定位，仍按高德默认顺序展示。");
      return;
    }
    setLocationState("正在获取当前位置…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const location = { latitude: coords.latitude, longitude: coords.longitude };
        setUserLocation(location);
        setResults((current) => sortByDistance(current, location));
        setLocationState("已按距你当前位置由近到远排序。");
      },
      () => setLocationState("未取得定位权限，仍按高德默认顺序展示。"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  };

  const choose = (candidate: MarkCandidate) => {
    setSelectionError("");
    startLookup(async () => {
      const lookup = await lookupAmapPoi(candidate.poiId);
      if (lookup.error) {
        setSelectionError(lookup.error);
        return;
      }
      setAlreadyInGroup(Boolean(lookup.found));
      setSelected(candidate);
      setResults([]);
    });
  };

  if (state.success) return <section className="mark-card"><p className="eyebrow">标记完成</p><h1>已留下一次真实体验</h1><p className="form-success">{state.success}</p><Link className="primary-link" href="/">回到共同地图</Link></section>;

  if (selected) return <section className="mark-card">
    <button className="back-button" type="button" onClick={() => { setSelected(undefined); setKeyword(""); }}>← 重新搜索</button>
    <p className="eyebrow">{alreadyInGroup ? "朋友已经标记过这里" : "添加新地点"}</p>
    <h1>{selected.name}</h1>
    <p className="selected-place">{selected.address || `${selected.city} ${selected.district}`}</p>
    <form className="mark-form" action={action}>
      <input type="hidden" name="poi_id" value={selected.poiId} />
      <input type="hidden" name="name" value={selected.name} />
      <input type="hidden" name="address" value={selected.address} />
      <input type="hidden" name="city" value={selected.city} />
      <input type="hidden" name="district" value={selected.district} />
      <input type="hidden" name="latitude" value={selected.latitude} />
      <input type="hidden" name="longitude" value={selected.longitude} />
      <input type="hidden" name="branch_name" value="" />
      <label>地点类型<select name="primary_category" value={primaryCategory} onChange={(event) => setPrimaryCategory(event.target.value as PlaceCategory)}>{categoryOptions.map(([value, categoryLabel]) => <option key={value} value={value}>{categoryLabel}</option>)}</select></label>
      <label className="attestation"><input name="attested" type="checkbox" required /> <span>我确认已亲自到访或体验过这里，内容基于真实体验。<b>必填</b></span></label>
      <StarRating name="overall_rating" label="综合体验" required />
      <div className="rating-grid">
        <StarRating name="quality_rating" label={qualityLabels[primaryCategory]} />
        <StarRating name="value_rating" label="性价比" />
        <StarRating name="environment_rating" label="环境氛围" />
        <StarRating name="service_rating" label="服务体验" />
        <StarRating name="uniqueness_rating" label="独特性" />
      </div>
      <fieldset className="scene-tag-picker">
        <legend>适合什么场景 <span className="optional-mark">可选，可多选</span></legend>
        <div className="scene-tag-picker__options">
          {sceneTags.map(([slug, label]) => <label key={slug}><input type="checkbox" name="scene_tags" value={slug} /><span>{label}</span></label>)}
        </div>
      </fieldset>
      {alreadyInGroup ? <label>是否推荐<select name="would_recommend" defaultValue="true"><option value="true">愿意推荐</option><option value="false">不推荐</option></select></label> : <><input type="hidden" name="would_recommend" value="true" /><p className="first-mark-note">首次收录必须是你愿意推荐给朋友的地点。</p></>}
      <label>是否愿意再去 <span className="optional-mark">可选</span><select name="would_revisit" defaultValue=""><option value="">不填写</option><option value="yes">愿意再去</option><option value="maybe">看情况</option><option value="no">不愿意再去</option></select></label>
      <label>最近到访日期 <span className="optional-mark">可选</span><input name="last_visited_on" type="date" /></label>
      <label>人均消费（元） <span className="optional-mark">可选</span><input name="price_per_person" type="number" min="0" step="1" inputMode="decimal" /></label>
      <label>推荐菜 / 饮品 <span className="optional-mark">可选</span><input name="recommended_items" maxLength={400} placeholder="用逗号分隔，例如：手冲咖啡，巴斯克" /></label>
      <label>一句体验 <span className="optional-mark">可选</span><input name="short_review" maxLength={1000} placeholder="想留下的真实感受" /></label>
      <PhotoPicker />
      {state.error && <p className="form-error">{state.error}</p>}
      <button className="primary-button" disabled={pending}>{pending ? "正在保存…" : "保存真实标记"}</button>
    </form>
  </section>;

  return <section className="mark-card">
    <p className="eyebrow">添加真实体验</p>
    <h1>你去过的地方，才值得留在这里。</h1>
    <p>搜索高德地点；新地点必须与第一条真实推荐一起加入共同地图。</p>
    <label className="poi-search">搜索地点<input value={keyword} onChange={(event) => { setKeyword(event.target.value); setResults([]); setSearching(false); setSearchError(""); setHasSearched(false); }} autoFocus placeholder="输入餐厅、咖啡馆或酒吧名称" /></label>
    <div className="location-sort"><button type="button" className="text-button" onClick={requestLocationSort}>{userLocation ? "已按当前位置排序" : "按当前位置排序"}</button>{locationState && <span>{locationState}</span>}</div>
    {searching && <p className="search-state">正在搜索…</p>}
    {searchError && <p className="form-error">{searchError}</p>}
    {selectionError && <p className="form-error">{selectionError}</p>}
    {isLookingUp && <p className="search-state">正在检查共同地图…</p>}
    <ul className="poi-results">{results.map((candidate) => <li key={candidate.poiId}><button type="button" onClick={() => choose(candidate)} disabled={isLookingUp}><strong>{candidate.name}</strong><span>{candidate.address || `${candidate.city} ${candidate.district}`}</span><div className="poi-result-tags">{candidate.city && <em className={`city-tag ${cityTagTone(candidate.city)}`}>{candidate.city}</em>}{candidate.distanceMeters !== undefined && Number.isFinite(candidate.distanceMeters) && <em className="distance-tag">{formatDistance(candidate.distanceMeters)}</em>}</div></button></li>)}</ul>
    {hasSearched && !searchError && !searching && !results.length && <p className="search-state">没有找到结果。请换一个关键词，或稍后重试。</p>}
  </section>;
}
