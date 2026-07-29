"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { lookupAmapPoi, savePlaceMark, type MarkResult } from "@/app/mark/actions";
import { categoryOptions, type PlaceCategory } from "@/lib/mark-options";
import { PhotoPicker } from "@/components/mark/photo-picker";
import { BowlIcon, toBowlLevel } from "@/components/recommendation/bowl-icon";
import { cuisineOptions } from "@/lib/discovery-options";
import { amapFailureMessage } from "@/lib/amap/failure-message";
import { searchAmapPoiTips } from "@/lib/amap/poi-client";

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
  return searchAmapPoiTips(keyword, location);
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
  const [cuisine, setCuisine] = useState<(typeof cuisineOptions)[number][0]>("beijing_northern");
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
        .then(({ candidates, error }) => finish(candidates, error ?? ""))
        .catch(() => finish([], amapFailureMessage("network_failure")));
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

  if (state.success) return <section className="mark-card mark-success-card"><Image className="mark-success-mascot" src="/mascot/mark-success.jpg" width={220} height={220} alt="食迹腊肠狗把地点标记在地图上" priority /><p className="eyebrow">标记完成</p><h1>已留下一次真实体验</h1><p className="form-success">{state.success}</p><Link className="primary-link" href="/">回到发现</Link></section>;

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
      <label>主菜系 <span className="required-mark">必填</span><select name="cuisine_slug" value={cuisine} onChange={(event) => setCuisine(event.target.value as typeof cuisine)}>{cuisineOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="attestation"><input name="attested" type="checkbox" required /> <span>我确认已亲自到访或体验过这里，内容基于真实体验。<b>必填</b></span></label>
      <label>到访日期 <span className="required-mark">必填</span><input name="visited_on" type="date" max={new Date().toISOString().slice(0, 10)} required /></label>
      <fieldset className="meal-strength"><legend>这次的推荐强度 <span className="required-mark">必填</span></legend><div>{[[1, "值得去"], [2, "想再去"], [3, "会专门去"]].map(([value, label]) => <label key={value}><input name="strength" required type="radio" value={value} /><span className="meal-strength__label"><BowlIcon level={toBowlLevel(Number(value))} size="sm" /> {label}</span></label>)}</div></fieldset>
      <fieldset className="scene-tag-picker"><legend>好在哪儿 <span className="required-mark">选 1–2 项</span></legend><div className="scene-tag-picker__options">{[["tasty", "吃得香"], ["comfortable", "坐得住"], ["good_for_chat", "聊得开"], ["good_value", "花得值"]].map(([slug, label]) => <label key={slug}><input type="checkbox" name="opinion_tags" value={slug} /><span>{label}</span></label>)}</div></fieldset>
      {!alreadyInGroup && <p className="first-mark-note">首次收录必须是你愿意推荐给朋友的地点。</p>}
      <label>推荐菜 / 饮品 <span className="optional-mark">可选</span><input name="dishes" maxLength={400} placeholder="用逗号分隔，例如：手冲咖啡，巴斯克" /></label>
      <label>饭后感受 <span className="optional-mark">可选</span><textarea name="note" maxLength={1000} placeholder="想留下的真实感受" /></label>
      <PhotoPicker />
      <label className="attestation"><input name="anonymous" type="checkbox" /> <span>匿名分享给小组<br /><small>大家会看到“匿名成员”；你自己仍可管理和导出这条记录。</small></span></label>
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
