"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPlaceCandidate, deletePlaceCandidate, resolvePlaceCandidate, updatePlaceCandidate, type CandidateResult } from "@/app/try/actions";
import { amapFailureMessage } from "@/lib/amap/failure-message";
import { searchAmapPoiTips, type AmapPoiCandidate } from "@/lib/amap/poi-client";

type CandidateCard = {
  id: string;
  name: string;
  address: string;
  city: string;
  district: string;
  heardFrom: string;
  expectation: string;
  creatorName: string;
  isMine: boolean;
};

const initial: CandidateResult = {};

function CandidateActions({ candidate }: { candidate: CandidateCard }) {
  const router = useRouter();
  const [verifying, setVerifying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [attested, setAttested] = useState(false);
  const [heardFrom, setHeardFrom] = useState(candidate.heardFrom);
  const [expectation, setExpectation] = useState(candidate.expectation);
  const [message, setMessage] = useState<CandidateResult>({});
  const [pending, startTransition] = useTransition();

  const complete = (wouldRecommend: boolean) => startTransition(async () => {
    const result = await resolvePlaceCandidate(candidate.id, wouldRecommend, attested);
    setMessage(result);
    if (result.success) router.refresh();
  });
  const saveEdit = () => startTransition(async () => {
    const result = await updatePlaceCandidate(candidate.id, heardFrom, expectation);
    setMessage(result);
    if (result.success) { setEditing(false); router.refresh(); }
  });
  const remove = () => startTransition(async () => {
    const result = await deletePlaceCandidate(candidate.id);
    setMessage(result);
    if (result.success) router.refresh();
  });

  return <div className="candidate-actions">
    {!verifying && <button className="candidate-verify-button" type="button" onClick={() => { setMessage({}); setVerifying(true); }}>我去试过了</button>}
    {candidate.isMine && !verifying && <button className="text-button" type="button" onClick={() => { setMessage({}); setEditing(!editing); }}>{editing ? "收起编辑" : "编辑"}</button>}
    {editing && <div className="candidate-edit">
      <label>从哪里听说的 <span>可选</span><input value={heardFrom} maxLength={120} onChange={(event) => setHeardFrom(event.target.value)} placeholder="朋友、短视频、路过时看到…" /></label>
      <label>为什么想试 <span>可选</span><textarea value={expectation} maxLength={280} onChange={(event) => setExpectation(event.target.value)} placeholder="一句自己的期待" /></label>
      <div><button className="secondary-button" type="button" disabled={pending} onClick={saveEdit}>{pending ? "正在保存…" : "保存"}</button><button className="danger-button" type="button" disabled={pending} onClick={remove}>删除候选</button></div>
    </div>}
    {verifying && <div className="candidate-verification">
      <strong>这家值得推荐吗？</strong>
      <p>你的选择只会让它进入发现，或从候选列表移除；不会公开形成负面评价。</p>
      <label><input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} /> 我确认已亲自到访或体验过这里。</label>
      <div><button className="primary-button" type="button" disabled={pending || !attested} onClick={() => complete(true)}>{pending ? "正在处理…" : "值得推荐，加入发现"}</button><button className="secondary-button" type="button" disabled={pending || !attested} onClick={() => complete(false)}>暂不推荐</button></div>
      <button className="text-button" type="button" disabled={pending} onClick={() => { setVerifying(false); setAttested(false); }}>取消</button>
    </div>}
    {message.error && <p className="form-error">{message.error}</p>}
    {message.success && <p className="form-success">{message.success}</p>}
  </div>;
}

export function TryList({ candidates }: { candidates: CandidateCard[] }) {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<AmapPoiCandidate[]>([]);
  const [selected, setSelected] = useState<AmapPoiCandidate>();
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const requestId = useRef(0);
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
      return;
    }
    const timer = window.setTimeout(() => {
      const currentRequest = ++requestId.current;
      setSearching(true);
      void searchAmapPoiTips(keyword.trim()).then(({ candidates: found, error }) => {
        if (currentRequest !== requestId.current) return;
        setResults(found);
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
    return () => window.clearTimeout(timer);
  }, [keyword, selected]);

  return <section className="try-page">
    <p className="eyebrow">去试试</p>
    <h1>把想吃的，先放在这里。</h1>
    <p className="try-intro">只有真实体验后值得推荐的地点，才会进入发现。这里不是收藏夹，也不公开负面评价。</p>
    <section className="try-add-card">
      <div className="try-add-card__icon" aria-hidden="true">＋</div><div><strong>加入一个想试的地点</strong><p>从高德选择地点即可；来源和期待都可以不填。</p></div>
      {!selected ? <div className="try-search"><label>搜索高德地点<input value={keyword} onChange={(event) => { setKeyword(event.target.value); setResults([]); setSearchError(""); setHasSearched(false); }} placeholder="输入餐厅、咖啡馆或酒吧名称" /></label>{searching && <p className="search-state">正在搜索…</p>}{searchError && <p className="form-error">{searchError}</p>}<ul className="poi-results">{results.map((candidate) => <li key={candidate.poiId}><button type="button" onClick={() => { setSelected(candidate); setResults([]); }}><strong>{candidate.name}</strong><span>{candidate.address || `${candidate.city} ${candidate.district}`}</span></button></li>)}</ul>{hasSearched && !searching && !searchError && !results.length && <p className="search-state">没有找到结果。请换个关键词，或稍后重试。</p>}</div> : <form className="try-form" action={action}>
        <button className="back-button" type="button" onClick={() => { setSelected(undefined); setKeyword(""); }}>← 重新搜索</button>
        <strong>{selected.name}</strong><p>{selected.address || `${selected.city} ${selected.district}`}</p>
        <input type="hidden" name="poi_id" value={selected.poiId} /><input type="hidden" name="name" value={selected.name} /><input type="hidden" name="address" value={selected.address} /><input type="hidden" name="city" value={selected.city} /><input type="hidden" name="district" value={selected.district} /><input type="hidden" name="latitude" value={selected.latitude} /><input type="hidden" name="longitude" value={selected.longitude} />
        <label>从哪里听说的 <span>可选</span><input name="heard_from" maxLength={120} placeholder="朋友、短视频、路过时看到…" /></label>
        <label>为什么想试 <span>可选</span><textarea name="expectation" maxLength={280} placeholder="一句自己的期待" /></label>
        {state.error && <p className="form-error">{state.error}</p>}{state.success && <p className="form-success">{state.success}</p>}
        <button className="primary-button" disabled={pending}>{pending ? "正在加入…" : "加入去试试"}</button>
      </form>}
    </section>
    {candidates.length ? <ul className="candidate-list">{candidates.map((candidate) => <li key={candidate.id}><article className="candidate-card"><p className="candidate-card__location">{[candidate.city, candidate.district].filter(Boolean).join(" · ") || "高德地点"}</p><h2>{candidate.name}</h2><p>{candidate.address || "地址待补充"}</p>{candidate.heardFrom && <p><b>听说：</b>{candidate.heardFrom}</p>}{candidate.expectation && <blockquote>{candidate.expectation}</blockquote>}<small>{candidate.creatorName} 加入</small><CandidateActions candidate={candidate} /></article></li>)}</ul> : <div className="empty-state"><strong>还没有想试的地点</strong><span>从朋友推荐或偶然看到的一家开始。</span></div>}
  </section>;
}
