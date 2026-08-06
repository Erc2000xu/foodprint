/* eslint-disable @next/next/no-img-element */

"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { archiveGroupPlace, type PlaceManagementResult } from "@/app/admin/actions";

const initial: PlaceManagementResult = {};

export function PlaceManagementControl({ groupPlaceId, placeName }: { groupPlaceId: string; placeName: string }) {
  const [open, setOpen] = useState(false);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [state, action, pending] = useActionState(archiveGroupPlace, initial);
  const controlRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => { if (!controlRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);
  // 中文注释：图片只负责稳定外观，原生按钮继续承载权限、键盘和无障碍语义。
  return <div className="place-management-control" ref={controlRef}><button aria-expanded={open} aria-haspopup="menu" aria-label={`管理${placeName}`} className="management-menu-button" onClick={() => setOpen((value) => !value)} type="button"><img src="/images/v1-4-1/place-management-button.png" alt="" aria-hidden="true" /></button>{open && <div className="management-popover" role="menu"><a href={`/place/${groupPlaceId}`} role="menuitem">查看地点详情</a><a href="/admin#place-content-management" role="menuitem">管理到访记录</a><button className="management-menu-danger" onClick={() => { setOpen(false); setConfirmingArchive(true); }} role="menuitem" type="button">下架地点</button></div>}{confirmingArchive && <div aria-modal="true" className="management-modal-backdrop" role="dialog" aria-label={`下架${placeName}`}><form className="management-modal" action={action}><input name="group_place_id" type="hidden" value={groupPlaceId} /><h2>下架“{placeName}”？</h2><p>下架后，这家店会从发现、地图和普通列表中隐藏。已有到访、照片和成员观点会保留，你可以在“我的—地点与内容管理”中恢复。</p><label>下架原因<textarea name="reason" required minLength={1} maxLength={280} /></label><label className="attestation"><input name="understood" required type="checkbox" /><span>我了解这是对整个小组地点的下架操作</span></label><div><button className="text-button" onClick={() => setConfirmingArchive(false)} type="button">取消</button><button className="danger-button" disabled={pending} type="submit">{pending ? "下架中…" : "确认下架"}</button></div>{state.error && <p className="form-error">{state.error}</p>}{state.success && <p className="form-success">{state.success}</p>}</form></div>}</div>;
}
