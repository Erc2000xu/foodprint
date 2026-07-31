"use client";

import { useActionState, useState } from "react";
import { archiveGroupPlace, type PlaceManagementResult } from "@/app/admin/actions";

const initial: PlaceManagementResult = {};

export function PlaceManagementControl({ groupPlaceId, placeName }: { groupPlaceId: string; placeName: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(archiveGroupPlace, initial);
  return <div className="place-management-control"><button aria-expanded={open} aria-label={`管理${placeName}`} className="management-menu-button" onClick={() => setOpen((value) => !value)} type="button">···</button>{open && <form className="management-popover" action={action}><input name="group_place_id" type="hidden" value={groupPlaceId} /><a href={`/place/${groupPlaceId}`}>查看地点详情</a><a href="/admin#place-content-management">管理到访记录</a><label>下架原因<textarea name="reason" required minLength={1} maxLength={280} /></label><label className="attestation"><input name="understood" required type="checkbox" /><span>我了解这是对整个小组地点的下架操作</span></label><button className="danger-button" disabled={pending} type="submit">{pending ? "下架中…" : "确认下架"}</button>{state.error && <p className="form-error">{state.error}</p>}{state.success && <p className="form-success">{state.success}</p>}</form>}</div>;
}
