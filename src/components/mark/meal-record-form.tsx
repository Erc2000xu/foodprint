"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { recordPlaceVisit, repairVisitPhotos, type VisitResult } from "@/app/mark/actions";
import { PhotoPicker, type PhotoPickerState } from "@/components/mark/photo-picker";
import { OpinionPicker } from "@/components/mark/opinion-picker";

type CurrentOpinion = { strength: number; tags: string[]; isAnonymous: boolean } | null;

const initial: VisitResult = {};

export function MealRecordForm({ groupPlaceId, placeName, currentOpinion }: { groupPlaceId: string; placeName: string; currentOpinion: CurrentOpinion }) {
  const mustCompleteOpinion = !currentOpinion || currentOpinion.tags.length === 0;
  const [changed, setChanged] = useState(mustCompleteOpinion);
  const [photoPickerState, setPhotoPickerState] = useState<PhotoPickerState>({ processing: false, preparedCount: 0, failedCount: 0, hasBlockingFailure: false });
  const [repairDismissed, setRepairDismissed] = useState(false);
  const [state, action, pending] = useActionState(recordPlaceVisit, initial);
  const [repairState, repairAction, repairPending] = useActionState(repairVisitPhotos, initial);

  if (repairState.status === "complete") return <section className="mark-card mark-success-card"><p className="eyebrow">照片已补传</p><h1>{placeName}</h1><p className="form-success">{repairState.success}</p>{repairState.warning && <p className="form-error">{repairState.warning}</p>}<Link className="primary-link" href={`/place/${repairState.groupPlaceId ?? groupPlaceId}`}>回到地点详情</Link></section>;

  if (state.status === "complete") return <section className="mark-card mark-success-card"><p className="eyebrow">这一顿记好了</p><h1>{placeName}</h1><p className="form-success">{state.success}</p>{state.warning && <p className="form-error">{state.warning}</p>}<Link className="primary-link" href={`/place/${groupPlaceId}`}>回到地点详情</Link></section>;

  if (state.status === "photo_repair_required" && repairDismissed) return <section className="mark-card mark-success-card"><p className="eyebrow">这一顿已记下</p><h1>{placeName}</h1><p className="form-success">记录已经保存，照片还没传好。你之后可以在地点详情继续补传。</p><Link className="primary-link" href={`/place/${groupPlaceId}`}>回到地点详情</Link></section>;

  return <section className="mark-card"><p className="eyebrow">记一顿</p><h1>{placeName}</h1><p>把这次感受留在地点记录里；每次推荐只按你当前的观点计算。</p><form className="mark-form" action={action} onSubmit={(event) => { if (photoPickerState.processing || photoPickerState.hasBlockingFailure) event.preventDefault(); }}>
    <input type="hidden" name="group_place_id" value={groupPlaceId} />
    <p className="required-help">带 · 的项目需要填写</p>
    <label>到访日期（必填）<input name="visited_on" type="date" max={new Date().toISOString().slice(0, 10)} required /></label>
    {currentOpinion && !mustCompleteOpinion && <fieldset className="meal-opinion-choice"><legend>这次和上次的感受一样吗？</legend><label><input checked={!changed} name="opinion_changed" type="radio" value="false" onChange={() => setChanged(false)} /> 一样，保留上次观点</label><label><input checked={changed} name="opinion_changed" type="radio" value="true" onChange={() => setChanged(true)} /> 有变化，更新我的观点</label></fieldset>}
    {!currentOpinion || mustCompleteOpinion ? <input name="opinion_changed" type="hidden" value="true" /> : null}
    {changed && <section className="mark-form-section"><OpinionPicker defaultStrength={currentOpinion?.strength} defaultTags={currentOpinion?.tags} namePrefix="tags" /></section>}
    {!changed && <input name="opinion_changed" type="hidden" value="false" />}
    <label>饭后感受（可选）<textarea name="note" maxLength={1000} placeholder="留下这次真实感受" /></label>
    <label>推荐菜或饮品（可选）<input name="dishes" maxLength={400} placeholder="用逗号隔开，例如：手冲咖啡，巴斯克" /></label>
    <PhotoPicker onStateChange={setPhotoPickerState} />
    <label className="attestation"><input name="anonymous" type="checkbox" /> <span>匿名分享给小组<br /><small>大家会看到“匿名成员”；你自己仍可管理和导出这条记录。</small></span></label>
    {"error" in state && state.error && <p className="form-error">{state.error}</p>}
    {state.status === "photo_repair_required" && <section className="photo-repair-panel" aria-live="polite"><input type="hidden" name="visit_record_id" value={state.visitRecordId} /><input type="hidden" name="group_place_id" value={state.groupPlaceId} /><strong>{state.message}</strong><p>记录已经保存；重试只会补传照片，不会再次创建到访记录。</p>{"error" in repairState && repairState.error && <p className="form-error">{repairState.error}</p>}<div><button className="primary-button" type="submit" formAction={repairAction} disabled={repairPending || photoPickerState.processing}>{repairPending ? "正在重试上传…" : "重试上传"}</button><button className="text-button" type="button" onClick={() => setRepairDismissed(true)}>暂时不传</button></div></section>}
    <p className="form-completion-note">{changed ? "完成到访日期、推荐强度和好在哪儿后即可保存。" : "完成到访日期后即可保存。"}</p><button className="primary-button" disabled={pending || photoPickerState.processing || photoPickerState.hasBlockingFailure || state.status === "photo_repair_required"}>{pending ? "正在保存…" : photoPickerState.processing ? "正在处理照片…" : photoPickerState.hasBlockingFailure ? "请处理失败照片" : "记下这顿饭"}</button>
  </form></section>;
}
