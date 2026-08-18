"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { lookupAmapPoi, repairVisitPhotos, savePlaceMark, type MarkResult } from "@/app/mark/actions";
import { categoryOptions, type PlaceCategory } from "@/lib/mark-options";
import { PhotoPicker, type PhotoPickerState } from "@/components/mark/photo-picker";
import { OpinionPicker } from "@/components/mark/opinion-picker";
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
  const [alreadyInGroup, setAlreadyInGroup] = useState(false);
  const [selectionError, setSelectionError] = useState("");
  const [primaryCategory, setPrimaryCategory] = useState<PlaceCategory>("restaurant");
  const [cuisine, setCuisine] = useState<(typeof cuisineOptions)[number][0]>("beijing_northern");
  const [userLocation, setUserLocation] = useState<UserLocation>();
  const [locationState, setLocationState] = useState("");
  const [photoPickerState, setPhotoPickerState] = useState<PhotoPickerState>({ processing: false, preparedCount: 0, failedCount: 0, hasBlockingFailure: false });
  const [repairDismissed, setRepairDismissed] = useState(false);
  const [isLookingUp, startLookup] = useTransition();
  const requestId = useRef(0);
  const [state, action, pending] = useActionState(savePlaceMark, initial);
  const [repairState, repairAction, repairPending] = useActionState(repairVisitPhotos, initial);

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
      setLocationState("无法使用定位，已按默认顺序显示。");
      return;
    }
    setLocationState("正在获取位置…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const location = { latitude: coords.latitude, longitude: coords.longitude };
        setUserLocation(location);
        setResults((current) => sortByDistance(current, location));
        setLocationState("已按距离从近到远排序。");
      },
      () => setLocationState("未获得定位权限，已按默认顺序显示。"),
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

  if (repairState.status === "complete") return <section className="mark-card mark-success-card"><Image className="mark-success-mascot" src="/mascot/mark-success.jpg" width={220} height={220} alt="食迹腊肠狗把地点记录在地图上" priority /><p className="eyebrow">照片已补传</p><h1>这一顿的照片记好了</h1><p className="form-success">{repairState.success}</p>{repairState.warning && <p className="form-error">{repairState.warning}</p>}<Link className="primary-link" href={`/place/${repairState.groupPlaceId}`}>回到地点详情</Link></section>;

  if (state.status === "complete") return <section className="mark-card mark-success-card"><Image className="mark-success-mascot" src="/mascot/mark-success.jpg" width={220} height={220} alt="食迹腊肠狗把地点记录在地图上" priority /><p className="eyebrow">这一顿已记下</p><h1>已留下这次真实体验</h1><p className="form-success">{state.success}</p>{state.warning && <p className="form-error">{state.warning}</p>}<Link className="primary-link" href="/">回到发现</Link></section>;

  if (state.status === "photo_repair_required" && repairDismissed) return <section className="mark-card mark-success-card"><p className="eyebrow">这一顿已记下</p><h1>照片可以稍后补传</h1><p className="form-success">记录已经保存，照片还没传好。你之后可以在地点详情继续补传。</p><Link className="primary-link" href={`/place/${state.groupPlaceId}`}>回到地点详情</Link></section>;

  if (selected) return <section className="mark-card">
    <button className="back-button" type="button" onClick={() => { setSelected(undefined); setKeyword(""); }}>← 重新搜索</button>
    <p className="eyebrow">{alreadyInGroup ? "已有朋友记录" : "收录新地点"}</p>
    <h1>{selected.name}</h1>
    <p className="selected-place">{selected.address || `${selected.city} ${selected.district}`}</p>
    <form className="mark-form" action={action} onSubmit={(event) => { if (photoPickerState.processing || photoPickerState.hasBlockingFailure) event.preventDefault(); }}>
      <input type="hidden" name="poi_id" value={selected.poiId} />
      <input type="hidden" name="name" value={selected.name} />
      <input type="hidden" name="address" value={selected.address} />
      <input type="hidden" name="city" value={selected.city} />
      <input type="hidden" name="district" value={selected.district} />
      <input type="hidden" name="latitude" value={selected.latitude} />
      <input type="hidden" name="longitude" value={selected.longitude} />
      <input type="hidden" name="branch_name" value="" />
      <p className="required-help">带 · 的项目需要填写</p>
      {!alreadyInGroup && <label className="attestation attestation--first"><input name="attested" type="checkbox" required /> <span><b>我确认：这是我亲自去过的地方，以下内容来自真实感受。</b><small>第一次收录的地点，需要是你愿意推荐给朋友的地方。</small></span></label>}
      {alreadyInGroup && <input name="attested" type="hidden" value="on" />}
      <label>到访日期（必填）<input name="visited_on" type="date" max={new Date().toISOString().slice(0, 10)} required /></label>
      <label>地点类型<select name="primary_category" value={primaryCategory} onChange={(event) => setPrimaryCategory(event.target.value as PlaceCategory)}>{categoryOptions.map(([value, categoryLabel]) => <option key={value} value={value}>{categoryLabel}</option>)}</select></label>
      <label>主菜系（必填）<select name="cuisine_slug" value={cuisine} onChange={(event) => setCuisine(event.target.value as typeof cuisine)}>{cuisineOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <section className="mark-form-section"><OpinionPicker namePrefix="opinion_tags" /></section>
      <label>推荐菜或饮品（可选）<input name="dishes" maxLength={400} placeholder="用逗号隔开，例如：手冲咖啡，巴斯克" /></label>
      <label>饭后感受（可选）<textarea name="note" maxLength={1000} placeholder="留下这次真实感受" /></label>
      <PhotoPicker onStateChange={setPhotoPickerState} />
      <label className="attestation"><input name="anonymous" type="checkbox" /> <span>匿名分享给小组<br /><small>大家会看到“匿名成员”；你自己仍可管理和导出这条记录。</small></span></label>
      {"error" in state && state.error && <p className="form-error">{state.error}</p>}
      {state.status === "photo_repair_required" && <section className="photo-repair-panel" aria-live="polite"><input type="hidden" name="visit_record_id" value={state.visitRecordId} /><input type="hidden" name="group_place_id" value={state.groupPlaceId} /><strong>{state.message}</strong><p>记录已经保存；重试只会补传照片，不会再次创建地点或到访记录。</p>{"error" in repairState && repairState.error && <p className="form-error">{repairState.error}</p>}<div><button className="primary-button" type="submit" formAction={repairAction} disabled={repairPending || photoPickerState.processing}>{repairPending ? "正在重试上传…" : "重试上传"}</button><button className="text-button" type="button" onClick={() => setRepairDismissed(true)}>暂时不传</button></div></section>}
      <p className="form-completion-note">完成到访确认、到访日期、地点类型、主菜系、推荐强度和好在哪儿后即可保存。</p>
      <button className="primary-button" disabled={pending || photoPickerState.processing || photoPickerState.hasBlockingFailure || state.status === "photo_repair_required"}>{pending ? "正在保存…" : photoPickerState.processing ? "正在处理照片…" : photoPickerState.hasBlockingFailure ? "请处理失败照片" : "保存这次体验"}</button>
    </form>
  </section>;

  return <section className="mark-card">
    <p className="eyebrow">记下第一顿</p>
    <h1 className="creative-title">把这一顿，好好记下来。</h1>
    <p>搜索你去过的地方。第一次收录时，请补充真实感受和推荐理由。</p>
    <label className="poi-search">搜索去过的地方<input value={keyword} onChange={(event) => { setKeyword(event.target.value); setResults([]); setSearching(false); setSearchError(""); setHasSearched(false); }} autoFocus placeholder="输入店名、咖啡馆或酒吧名称" /></label>
    <div className="location-sort"><button type="button" className="text-button" onClick={requestLocationSort}>{userLocation ? "已按距离排序" : "按距离排序"}</button>{locationState && <span>{locationState}</span>}</div>
    {searching && <p className="search-state">正在搜索…</p>}
    {searchError && <p className="form-error">{searchError}</p>}
    {selectionError && <p className="form-error">{selectionError}</p>}
    {isLookingUp && <p className="search-state">正在查看共同地图…</p>}
    <ul className="poi-results">{results.map((candidate) => <li key={candidate.poiId}><button type="button" onClick={() => choose(candidate)} disabled={isLookingUp}><strong>{candidate.name}</strong><span>{candidate.address || `${candidate.city} ${candidate.district}`}</span><div className="poi-result-tags">{candidate.city && <em className={`city-tag ${cityTagTone(candidate.city)}`}>{candidate.city}</em>}{candidate.distanceMeters !== undefined && Number.isFinite(candidate.distanceMeters) && <em className="distance-tag">{formatDistance(candidate.distanceMeters)}</em>}</div></button></li>)}</ul>
    {hasSearched && !searchError && !searching && !results.length && <p className="search-state">没找到这家。换个关键词，或稍后再试。</p>}
  </section>;
}
