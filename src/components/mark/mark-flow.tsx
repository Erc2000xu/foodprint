"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { lookupAmapPoi, savePlaceMark, type MarkResult } from "@/app/mark/actions";

export type MarkCandidate = { poiId: string; name: string; address: string; city: string; district: string; latitude: number; longitude: number };
const initial: MarkResult = {};
const categoryOptions = [["restaurant", "餐厅"], ["cafe", "咖啡馆"], ["drinks", "茶饮/饮品"], ["bar", "酒吧/Pub"], ["bakery_dessert", "烘焙/甜品"], ["street_food", "小吃/街头餐饮"], ["other_food_drink", "其他餐饮"]] as const;
const ratings = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

async function searchAmapTips(keyword: string): Promise<{ candidates: MarkCandidate[]; error?: string }> {
  const response = await fetch(`/api/poi-search?keyword=${encodeURIComponent(keyword)}`);
  let payload: { candidates?: MarkCandidate[]; error?: string; errorCode?: string };
  try { payload = await response.json() as { candidates?: MarkCandidate[]; error?: string; errorCode?: string }; }
  catch { return { candidates: [], error: `地点搜索接口响应异常（HTTP ${response.status}）` }; }
  if (!response.ok) return { candidates: [], error: `${payload.error ?? `HTTP ${response.status}`}${payload.errorCode ? `（${payload.errorCode}）` : ""}` };
  return { candidates: payload.candidates ?? [] };
}

function RatingSelect({ name, label, required = false }: { name: string; label: string; required?: boolean }) {
  return <label>{label}<select name={name} required={required} defaultValue="">{!required && <option value="">不填写</option>}{required && <option value="" disabled>请选择</option>}{ratings.map((rating) => <option key={rating} value={rating}>{rating.toFixed(1)} 分</option>)}</select></label>;
}

export function MarkFlow({ initialCandidate }: { initialCandidate?: MarkCandidate }) {
  const [keyword, setKeyword] = useState(""); const [results, setResults] = useState<MarkCandidate[]>([]); const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(""); const [hasSearched, setHasSearched] = useState(false);
  const [selected, setSelected] = useState<MarkCandidate | undefined>(initialCandidate); const [alreadyInGroup, setAlreadyInGroup] = useState(Boolean(initialCandidate)); const [selectionError, setSelectionError] = useState("");
  const [isLookingUp, startLookup] = useTransition(); const requestId = useRef(0); const [state, action, pending] = useActionState(savePlaceMark, initial);

  useEffect(() => {
    if (keyword.trim().length < 2 || selected) { requestId.current += 1; return; }
    const timer = window.setTimeout(() => {
      const currentRequest = ++requestId.current; setSearching(true);
      const finish = (candidates: MarkCandidate[], error = "") => {
        if (currentRequest !== requestId.current) return;
        setResults(candidates); setSearchError(error); setHasSearched(true); setSearching(false);
      };
      void searchAmapTips(keyword.trim()).then(({ candidates, error }) => finish(candidates, error ? `高德搜索失败：${error}` : "")).catch(() => finish([], "高德搜索服务暂时无法连接。"));
    }, 420);
    return () => window.clearTimeout(timer);
  }, [keyword, selected]);

  const choose = (candidate: MarkCandidate) => {
    setSelectionError("");
    startLookup(async () => {
      const lookup = await lookupAmapPoi(candidate.poiId);
      if (lookup.error) { setSelectionError(lookup.error); return; }
      setAlreadyInGroup(Boolean(lookup.found)); setSelected(candidate); setResults([]);
    });
  };

  if (state.success) return <section className="mark-card"><p className="eyebrow">标记完成</p><h1>已留下一次真实体验</h1><p className="form-success">{state.success}</p><Link className="primary-link" href="/">回到共同地图</Link></section>;
  if (selected) return <section className="mark-card"><button className="back-button" type="button" onClick={() => { setSelected(undefined); setKeyword(""); }}>← 重新搜索</button><p className="eyebrow">{alreadyInGroup ? "朋友已经标记过这里" : "添加新地点"}</p><h1>{selected.name}</h1><p className="selected-place">{selected.address || `${selected.city} ${selected.district}`}</p><form className="mark-form" action={action}><input type="hidden" name="poi_id" value={selected.poiId} /><input type="hidden" name="name" value={selected.name} /><input type="hidden" name="address" value={selected.address} /><input type="hidden" name="city" value={selected.city} /><input type="hidden" name="district" value={selected.district} /><input type="hidden" name="latitude" value={selected.latitude} /><input type="hidden" name="longitude" value={selected.longitude} /><input type="hidden" name="branch_name" value="" /><label>地点类型<select name="primary_category" defaultValue="restaurant">{categoryOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="attestation"><input name="attested" type="checkbox" required /> 我确认已亲自到访或体验过这里，内容基于真实体验。</label><RatingSelect name="overall_rating" label="综合体验" required /><div className="rating-grid"><RatingSelect name="quality_rating" label="出品质量" /><RatingSelect name="value_rating" label="性价比" /><RatingSelect name="environment_rating" label="环境氛围" /><RatingSelect name="service_rating" label="服务体验" /><RatingSelect name="uniqueness_rating" label="独特性" /></div>{alreadyInGroup ? <label>是否推荐<select name="would_recommend" defaultValue="true"><option value="true">愿意推荐</option><option value="false">不推荐</option></select></label> : <><input type="hidden" name="would_recommend" value="true" /><p className="first-mark-note">首次收录必须是你愿意推荐给朋友的地点。</p></>}<label>是否愿意再去<select name="would_revisit" defaultValue=""><option value="">不填写</option><option value="yes">愿意再去</option><option value="maybe">看情况</option><option value="no">不愿意再去</option></select></label><label>最近到访日期<input name="last_visited_on" type="date" /></label><label>人均消费（元）<input name="price_per_person" type="number" min="0" step="1" inputMode="decimal" /></label><label>推荐菜 / 饮品<input name="recommended_items" maxLength={400} placeholder="用逗号分隔，例如：手冲咖啡，巴斯克" /></label><label>一句体验<input name="short_review" maxLength={1000} placeholder="想留下的真实感受" /></label>{state.error && <p className="form-error">{state.error}</p>}<button className="primary-button" disabled={pending}>{pending ? "正在保存…" : "保存真实标记"}</button></form></section>;
  return <section className="mark-card"><p className="eyebrow">添加真实体验</p><h1>你去过的地方，才值得留在这里。</h1><p>搜索高德地点；新地点必须与第一条真实推荐一起加入共同地图。</p><label className="poi-search">搜索地点<input value={keyword} onChange={(event) => { setKeyword(event.target.value); setResults([]); setSearching(false); setSearchError(""); setHasSearched(false); }} autoFocus placeholder="输入餐厅、咖啡馆或酒吧名称" /></label>{searching && <p className="search-state">正在搜索…</p>}{searchError && <p className="form-error">{searchError}</p>}{selectionError && <p className="form-error">{selectionError}</p>}{isLookingUp && <p className="search-state">正在检查共同地图…</p>}<ul className="poi-results">{results.map((candidate) => <li key={candidate.poiId}><button type="button" onClick={() => choose(candidate)} disabled={isLookingUp}><strong>{candidate.name}</strong><span>{candidate.address || `${candidate.city} ${candidate.district}`}</span></button></li>)}</ul>{hasSearched && !searchError && !searching && !results.length && <p className="search-state">没有找到结果。请换一个关键词，或稍后重试。</p>}</section>;
}
