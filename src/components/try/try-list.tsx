"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPlaceCandidate, deletePlaceCandidate, dismissPlaceCandidate, updatePlaceCandidate, type CandidateResult } from "@/app/try/actions";
import { amapFailureMessage } from "@/lib/amap/failure-message";
import { searchAmapPoiTips, type AmapPoiCandidate } from "@/lib/amap/poi-client";
import { amapNavigationUrl } from "@/lib/amap/uri";

type CandidateCard = {
  id: string;
  name: string;
  address: string;
  city: string;
  district: string;
  businessArea: string;
  poiId: string;
  latitude: number;
  longitude: number;
  heardFrom: string;
  expectation: string;
  creatorName: string;
  isMine: boolean;
  canManage: boolean;
};

const initial: CandidateResult = {};
type UserLocation = { latitude: number; longitude: number };
type SearchCandidate = AmapPoiCandidate & { distanceMeters?: number };

function distanceInMeters(from: UserLocation, to: AmapPoiCandidate) {
  const radius = 6_371_000;
  const radians = Math.PI / 180;
  const latitudeDelta = (to.latitude - from.latitude) * radians;
  const longitudeDelta = (to.longitude - from.longitude) * radians;
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(from.latitude * radians) * Math.cos(to.latitude * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sortByDistance(candidates: AmapPoiCandidate[], location?: UserLocation): SearchCandidate[] {
  if (!location) return candidates;
  return candidates.map((candidate) => ({ ...candidate, distanceMeters: distanceInMeters(location, candidate) })).sort((left, right) => (left.distanceMeters ?? Infinity) - (right.distanceMeters ?? Infinity));
}

function formatDistance(distance?: number) {
  if (!Number.isFinite(distance)) return "";
  return (distance ?? 0) < 1_000 ? `${Math.round(distance ?? 0)} m` : `${((distance ?? 0) / 1_000).toFixed(1)} km`;
}

function CandidateActions({ candidate }: { candidate: CandidateCard }) {
  const router = useRouter();
  const [verifying, setVerifying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [attested, setAttested] = useState(false);
  const [heardFrom, setHeardFrom] = useState(candidate.heardFrom);
  const [expectation, setExpectation] = useState(candidate.expectation);
  const [message, setMessage] = useState<CandidateResult>({});
  const [pending, startTransition] = useTransition();

  const dismiss = () => startTransition(async () => {
    const result = await dismissPlaceCandidate(candidate.id, attested);
    setMessage(result);
    if (result.success) router.refresh();
  });
  const saveEdit = () => startTransition(async () => {
    const result = await updatePlaceCandidate(candidate.id, heardFrom, expectation);
    setMessage(result);
    if (result.success) { setEditing(false); router.refresh(); }
  });
  const remove = () => startTransition(async () => {
    const reason = candidate.isMine ? null : window.prompt("请填写移除候选的原因（1–280 字）：");
    if (!candidate.isMine && (!reason || !reason.trim())) return;
    if (!window.confirm(`从“去试试”移除“${candidate.name}”？处理记录会保留。`)) return;
    const result = await deletePlaceCandidate(candidate.id, reason ?? undefined);
    setMessage(result);
    if (result.success) router.refresh();
  });

  return <div className="candidate-actions">
    {!verifying && <><a className="candidate-navigation" href={amapNavigationUrl(candidate)} target="_blank" rel="noreferrer"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21 3-7.6 18-3.7-8.7L3 8.6 21 3Z" /><path d="m9.7 12.3 4.1-4.1" /></svg>导航去这里</a><button className="candidate-verify-button" type="button" onClick={() => { setMessage({}); setVerifying(true); }}>我去过了</button></>}
    {candidate.isMine && !verifying && <button className="text-button" type="button" onClick={() => { setMessage({}); setEditing(!editing); }}>{editing ? "收起" : "编辑"}</button>}
    {(candidate.isMine || candidate.canManage) && !verifying && !editing && <button className="text-button text-button--danger" disabled={pending} onClick={remove} type="button">移除这家</button>}
    {editing && <div className="candidate-edit">
      <label>从哪里听说的（可选）<input value={heardFrom} maxLength={120} onChange={(event) => setHeardFrom(event.target.value)} placeholder="朋友提过、路过看到、在别处读到…" /></label>
      <label>为什么想去（可选）<textarea value={expectation} maxLength={280} onChange={(event) => setExpectation(event.target.value)} placeholder="留下想去的理由" /></label>
      <div><button className="secondary-button" type="button" disabled={pending} onClick={saveEdit}>{pending ? "正在保存…" : "保存"}</button><button className="danger-button" type="button" disabled={pending} onClick={remove}>移除这家</button></div>
    </div>}
    {verifying && <div className="candidate-verification">
      <strong>这家，你愿意推荐吗？</strong>
      <p>愿意推荐，就让它出现在发现；这次不推荐，它会从这里移除，也不会对外显示。</p>
      <label><input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} /> 我确认：这是我亲自去过或体验过的地方。</label>
      <div><button className="primary-button" type="button" disabled={!attested} onClick={() => router.push(`/mark?candidate=${candidate.id}`)}>值得推荐，加入发现</button><button className="secondary-button" type="button" disabled={pending || !attested} onClick={dismiss}>{pending ? "正在处理…" : "暂不推荐"}</button></div>
      <button className="text-button" type="button" disabled={pending} onClick={() => { setVerifying(false); setAttested(false); }}>取消</button>
    </div>}
    {message.error && <p className="form-error">{message.error}</p>}
    {message.success && <p className="form-success">{message.success}</p>}
  </div>;
}

export function TryList({ candidates }: { candidates: CandidateCard[] }) {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<SearchCandidate[]>([]);
  const [selected, setSelected] = useState<AmapPoiCandidate>();
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation>();
  const [locationState, setLocationState] = useState("");
  const requestId = useRef(0);
  const searchController = useRef<AbortController | null>(null);
  const [state, action, pending] = useActionState(async (previous: CandidateResult, formData: FormData) => {
    const result = await createPlaceCandidate(previous, formData);
    if (result.success) {
      setSelected(undefined);
      setKeyword("");
      router.refresh();
    }
    return result;
  }, initial);

  useEffect(() => {
    if (keyword.trim().length < 2 || selected) {
      requestId.current += 1;
      searchController.current?.abort();
      searchController.current = null;
      return;
    }
    const timer = window.setTimeout(() => {
      const currentRequest = ++requestId.current;
      searchController.current?.abort();
      const controller = new AbortController();
      searchController.current = controller;
      setSearching(true);
      void searchAmapPoiTips(keyword.trim(), userLocation, { signal: controller.signal }).then(({ candidates: found, error }) => {
        if (currentRequest !== requestId.current) return;
        setResults(sortByDistance(found, userLocation));
        setSearchError(error ?? "");
        setHasSearched(true);
        setSearching(false);
      }).catch(() => {
        if (currentRequest !== requestId.current) return;
        setResults([]);
        setSearchError(amapFailureMessage("network_failure"));
        setHasSearched(true);
        setSearching(false);
      });
    }, 420);
    return () => { window.clearTimeout(timer); searchController.current?.abort(); };
  }, [keyword, selected, userLocation]);

  const requestLocationSort = () => {
    if (!navigator.geolocation) { setLocationState("此浏览器不支持定位；你仍可按推荐或最近体验查看。"); return; }
    setLocationState("正在获取位置…");
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const location = { latitude: coords.latitude, longitude: coords.longitude };
      setUserLocation(location);
      setResults((current) => sortByDistance(current, location));
      setLocationState("已按距离从近到远排序。");
    }, () => setLocationState("未获得定位权限；你仍可按推荐或最近体验查看。"), { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 });
  };

  return <section className="try-page">
    <p className="eyebrow">去试试</p>
    <h1 className="creative-title">想去的地方，先记在这里。</h1>
    <p className="try-intro">想去的地方先记在这里。亲自吃过并愿意推荐后，才会出现在发现；不推荐的选择不会公开。</p>
    <section className="try-add-card">
      <div className="try-add-card__icon" aria-hidden="true">＋</div><div><strong>加入想去的地方</strong><p>从搜索结果中选择一家；听谁提过、为什么想去，都可以稍后补充。</p></div>
      {!selected ? <div className="try-search"><label>搜索想去的地方<input value={keyword} onChange={(event) => { setKeyword(event.target.value); setResults([]); setSearching(false); setSearchError(""); setHasSearched(false); }} placeholder="输入店名、咖啡馆或酒吧名称" /></label><div className="location-sort"><button type="button" className="text-button" onClick={requestLocationSort}>{userLocation ? "已按当前位置排序" : "按当前位置找"}</button>{locationState && <span>{locationState}</span>}</div>{searching && <p className="search-state">正在搜索…</p>}{searchError && <p className="form-error">{searchError}</p>}<ul className="poi-results">{results.map((candidate) => <li key={candidate.poiId}><button type="button" onClick={() => { setSearching(false); setSelected(candidate); setResults([]); }}><strong>{candidate.name}</strong><span>{candidate.address || `${candidate.city} ${candidate.district}`}</span><div className="poi-result-tags">{candidate.city && <em className="city-tag city-tag--teal">{candidate.city}</em>}{candidate.distanceMeters !== undefined && <em className="distance-tag">{formatDistance(candidate.distanceMeters)}</em>}</div></button></li>)}</ul>{hasSearched && !searching && !searchError && !results.length && <p className="search-state">暂时没有找到这家。可以换个关键词再试试。</p>}</div> : <form className="try-form" action={action}>
        <button className="back-button" type="button" onClick={() => { setSearching(false); setSelected(undefined); setKeyword(""); }}>← 重新搜索</button>
        <strong>{selected.name}</strong><p>{selected.address || `${selected.city} ${selected.district}`}</p>
        <input type="hidden" name="poi_id" value={selected.poiId} /><input type="hidden" name="name" value={selected.name} /><input type="hidden" name="address" value={selected.address} /><input type="hidden" name="city" value={selected.city} /><input type="hidden" name="district" value={selected.district} /><input type="hidden" name="latitude" value={selected.latitude} /><input type="hidden" name="longitude" value={selected.longitude} />
        <label>从哪里听说的（可选）<input name="heard_from" maxLength={120} placeholder="朋友提过、路过看到、在别处读到…" /></label>
        <label>为什么想去（可选）<textarea name="expectation" maxLength={280} placeholder="留下想去的理由" /></label>
        {state.error && <p className="form-error">{state.error}</p>}{state.success && <p className="form-success">{state.success}</p>}
        <button className="primary-button" disabled={pending}>{pending ? "正在加入…" : "加入去试试"}</button>
      </form>}
    </section>
    {candidates.length ? <ul className="candidate-list">{candidates.map((candidate) => <li key={candidate.id}><article className="candidate-card"><p className="candidate-card__location">{[candidate.city, candidate.district, candidate.businessArea].filter(Boolean).join(" · ") || "地点信息待补充"}</p><h2>{candidate.name}</h2><p>{candidate.address || "地址待补充"}</p>{candidate.heardFrom && <p><b>听说：</b>{candidate.heardFrom}</p>}{candidate.expectation && <blockquote>{candidate.expectation}</blockquote>}<small>由 {candidate.creatorName} 提出</small><CandidateActions candidate={candidate} /></article></li>)}</ul> : <div className="empty-state"><strong>还没有想去的地方</strong><span>从朋友提过的一家开始。</span></div>}
  </section>;
}
