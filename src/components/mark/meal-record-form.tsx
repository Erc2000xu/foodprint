"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { recordPlaceVisit, type VisitResult } from "@/app/mark/actions";
import { PhotoPicker } from "@/components/mark/photo-picker";
import { OpinionPicker } from "@/components/mark/opinion-picker";

type CurrentOpinion = { strength: number; tags: string[]; isAnonymous: boolean } | null;

const initial: VisitResult = {};

export function MealRecordForm({ groupPlaceId, placeName, currentOpinion }: { groupPlaceId: string; placeName: string; currentOpinion: CurrentOpinion }) {
  const mustCompleteOpinion = !currentOpinion || currentOpinion.tags.length === 0;
  const [changed, setChanged] = useState(mustCompleteOpinion);
  const [photosProcessing, setPhotosProcessing] = useState(false);
  const [state, action, pending] = useActionState(recordPlaceVisit, initial);

  if (state.success) return <section className="mark-card mark-success-card"><p className="eyebrow">这顿已记下</p><h1>{placeName}</h1><p className="form-success">{state.success}</p>{state.warning && <p className="form-error">{state.warning}</p>}<Link className="primary-link" href={`/place/${groupPlaceId}`}>回到地点详情</Link></section>;

  return <section className="mark-card"><p className="eyebrow">记一顿</p><h1>{placeName}</h1><p>把这次的感受留在地点时间线里。评分只按你当前的观点计一次。</p><form className="mark-form" action={action} onSubmit={(event) => { if (photosProcessing) event.preventDefault(); }}>
    <input type="hidden" name="group_place_id" value={groupPlaceId} />
    <p className="required-help">带 · 的项目需要填写</p>
    <label>到访日期 <span className="required-dot" aria-label="必填">·</span><input name="visited_on" type="date" max={new Date().toISOString().slice(0, 10)} required /></label>
    {currentOpinion && !mustCompleteOpinion && <fieldset className="meal-opinion-choice"><legend>这次和上次感觉一样吗？</legend><label><input checked={!changed} name="opinion_changed" type="radio" value="false" onChange={() => setChanged(false)} /> 是，沿用上次观点</label><label><input checked={changed} name="opinion_changed" type="radio" value="true" onChange={() => setChanged(true)} /> 有变化，更新我的观点</label></fieldset>}
    {!currentOpinion || mustCompleteOpinion ? <input name="opinion_changed" type="hidden" value="true" /> : null}
    {changed && <section className="mark-form-section"><h2>说说为什么推荐</h2><OpinionPicker defaultStrength={currentOpinion?.strength} defaultTags={currentOpinion?.tags} namePrefix="tags" /></section>}
    {!changed && <input name="opinion_changed" type="hidden" value="false" />}
    <label>饭后感受 <span className="optional-mark">可选</span><textarea name="note" maxLength={1000} placeholder="想留下的真实感受" /></label>
    <label>推荐菜 / 饮品 <span className="optional-mark">可选</span><input name="dishes" maxLength={400} placeholder="用逗号分隔，例如：烧鹅，酸奶" /></label>
    <PhotoPicker onProcessingChange={setPhotosProcessing} />
    <label className="attestation"><input name="anonymous" type="checkbox" /> <span>匿名分享给小组<br /><small>大家会看到“匿名成员”；你自己仍可管理和导出这条记录。</small></span></label>
    {state.error && <p className="form-error">{state.error}</p>}
    <p className="form-completion-note">{changed ? "完成到访日期、推荐强度和好在哪儿后即可保存。" : "完成到访日期后即可保存。"}</p><button className="primary-button" disabled={pending || photosProcessing}>{pending ? "正在保存…" : photosProcessing ? "正在处理照片…" : "记下这顿饭"}</button>
  </form></section>;
}
