"use client";

import { useActionState, useState } from "react";
import { repairVisitPhotos, type PhotoRepairResult } from "@/app/mark/actions";
import { PhotoPicker, type PhotoPickerState } from "@/components/mark/photo-picker";

const initial: PhotoRepairResult = {};

export function VisitPhotoRepair({ groupPlaceId, visitRecordId, placeName, photoCount }: { groupPlaceId: string; visitRecordId: string; placeName: string; photoCount: number }) {
  const [photoPickerState, setPhotoPickerState] = useState<PhotoPickerState>({ processing: false, preparedCount: 0, failedCount: 0, hasBlockingFailure: false });
  const [state, action, pending] = useActionState(repairVisitPhotos, initial);

  if (state.status === "complete") return <p className="photo-repair-success" role="status">{state.success}{state.warning ? ` ${state.warning}` : ""}</p>;

  return <form className="visit-photo-repair" action={action} onSubmit={(event) => { if (photoPickerState.processing || photoPickerState.hasBlockingFailure) event.preventDefault(); }}>
    <input type="hidden" name="visit_record_id" value={visitRecordId} />
    <input type="hidden" name="group_place_id" value={groupPlaceId} />
    <strong>为这次到访补传照片</strong><small>{placeName} · 已有 {photoCount} / 9 张</small>
    <PhotoPicker onStateChange={setPhotoPickerState} />
    {"error" in state && state.error && <p className="form-error">{state.error}</p>}
    {state.status === "photo_repair_required" && <p className="form-error">{state.message}</p>}
    <button className="text-button" type="submit" disabled={pending || photoPickerState.processing || photoPickerState.hasBlockingFailure}>{pending ? "正在补传…" : photoPickerState.processing ? "正在处理照片…" : photoPickerState.hasBlockingFailure ? "请处理失败照片" : state.status === "photo_repair_required" ? "重试上传" : "选择照片并补传"}</button>
  </form>;
}
