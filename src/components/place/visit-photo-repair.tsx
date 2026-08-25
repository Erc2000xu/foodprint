"use client";

import { useActionState, useRef, useState, useTransition, type FormEvent } from "react";
import { repairVisitPhotos, type PhotoRepairResult } from "@/app/mark/actions";
import { PhotoPicker, PhotoSubmissionError, type PhotoPickerHandle, type PhotoPickerState } from "@/components/mark/photo-picker";
import { clientDisplayMode, reportClientMetric } from "@/lib/performance/client";

const initial: PhotoRepairResult = {};

export function VisitPhotoRepair({ groupPlaceId, visitRecordId, placeName, photoCount }: { groupPlaceId: string; visitRecordId: string; placeName: string; photoCount: number }) {
  const [photoPickerState, setPhotoPickerState] = useState<PhotoPickerState>({ processing: false, preparedCount: 0, failedCount: 0, hasBlockingFailure: false });
  const [photoSubmitError, setPhotoSubmitError] = useState("");
  const photoPickerRef = useRef<PhotoPickerHandle>(null);
  const [state, action, pending] = useActionState(repairVisitPhotos, initial);
  const [isSubmitting, startSubmit] = useTransition();

  const submitForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (photoPickerState.processing || photoPickerState.hasBlockingFailure) return;
    setPhotoSubmitError("");
    try {
      const formData = new FormData(event.currentTarget);
      const picker = photoPickerRef.current;
      const expectedCount = picker?.preparedCount ?? 0;
      const appendedCount = picker?.appendPreparedPhotos(formData) ?? 0;
      if (appendedCount !== expectedCount || appendedCount !== photoPickerState.preparedCount) throw new PhotoSubmissionError();
      startSubmit(() => action(formData));
    } catch (error) {
      if (error instanceof PhotoSubmissionError) {
        reportClientMetric("photo_submit_blocked", 1, "error", { reason: "prepared_photo_count_mismatch", browserMode: clientDisplayMode() });
        setPhotoSubmitError("照片准备结果与提交内容不一致，请重新选择后再试。");
        return;
      }
      setPhotoSubmitError("照片提交没有准备好，请重试。");
    }
  };

  if (state.status === "complete") return <p className="photo-repair-success" role="status">{state.success}{state.warning ? ` ${state.warning}` : ""}</p>;

  return <form className="visit-photo-repair" action={action} onSubmit={submitForm}>
    <input type="hidden" name="visit_record_id" value={visitRecordId} />
    <input type="hidden" name="group_place_id" value={groupPlaceId} />
    <strong>为这次到访补传照片</strong><small>{placeName} · 已有 {photoCount} / 9 张</small>
    <PhotoPicker ref={photoPickerRef} maxPhotos={Math.max(0, 9 - photoCount)} onStateChange={setPhotoPickerState} />
    {"error" in state && state.error && <p className="form-error">{state.error}</p>}
    {state.status === "photo_repair_required" && <p className="form-error">{state.message}</p>}
    {photoSubmitError && <p className="form-error">{photoSubmitError}</p>}
    <button className="text-button" type="submit" disabled={pending || isSubmitting || photoPickerState.processing || photoPickerState.hasBlockingFailure}>{pending || isSubmitting ? "正在补传…" : photoPickerState.processing ? "正在处理照片…" : photoPickerState.hasBlockingFailure ? "请处理失败照片" : state.status === "photo_repair_required" ? "重试上传" : "选择照片并补传"}</button>
  </form>;
}
