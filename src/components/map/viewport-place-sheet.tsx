"use client";

import Link from "next/link";
import { PointerEvent as ReactPointerEvent, useEffect, useRef } from "react";
import type { DiscoveryPlace } from "@/lib/discovery/types";
import { displayAmapLocationChain } from "@/lib/amap/location-display";
import { sceneTagLabels } from "@/lib/mark-options";
import { BowlIcon, toBowlLevel } from "@/components/recommendation/bowl-icon";
import { DiscoveryCardPhoto } from "@/components/photo/discovery-card-photo";
import type { ViewportSheetStatus } from "@/components/map/viewport-place-sheet-reducer";

function placeMeta(place: DiscoveryPlace) {
  return [place.city, place.district, place.businessAreaName].filter(Boolean).join(" · ") || "位置待补充";
}

function statusAfterDrag(status: ViewportSheetStatus, direction: "up" | "down") {
  if (direction === "up") return status === "summary" ? "viewport_list" : status === "place_preview" ? "viewport_list" : "viewport_list";
  return status === "viewport_list" ? "place_preview" : status === "place_preview" ? "summary" : "summary";
}

function PlaceRow({ place, onSelect, detailHref, onOpenDetail }: { place: DiscoveryPlace; onSelect: () => void; detailHref: (placeId: string) => string; onOpenDetail?: () => void }) {
  const location = displayAmapLocationChain(place.city, place.district, place.businessAreaName);
  const friendCount = place.friendCount ?? place.markCount ?? 0;
  return <article className="viewport-sheet__place-row">
    <button type="button" className="viewport-sheet__place-select" onClick={onSelect} aria-label={`选择 ${place.name}`}>
      <span className="viewport-sheet__place-photo"><DiscoveryCardPhoto photoId={place.coverPhotoId} initialUrl={place.coverPhotoUrl} width={place.coverPhotoWidth ?? 96} height={place.coverPhotoHeight ?? 96} alt="" /></span>
      <span className="viewport-sheet__place-bowl" aria-hidden="true">{place.bowlStrength ? <BowlIcon level={toBowlLevel(place.bowlStrength)} size="xs" /> : "—"}</span>
      <span className="viewport-sheet__place-copy"><strong>{place.name}</strong><small>{location || placeMeta(place)} · {friendCount} 位朋友吃过</small></span>
    </button>
    <Link href={detailHref(place.id)} onClick={onOpenDetail}>详情</Link>
  </article>;
}

export function ViewportPlaceSheet({
  places,
  summaryCount,
  selectedPlace,
  status,
  filterSummary,
  onStatusChange,
  onSelectPlace,
  onClearSelection,
  onOpenDetail,
  onOpenViewportList,
  onOpenAll,
  onHeightChange,
  detailHref = (placeId) => `/place/${placeId}`,
}: {
  places: DiscoveryPlace[];
  summaryCount?: number;
  selectedPlace?: DiscoveryPlace;
  status: ViewportSheetStatus;
  filterSummary?: string;
  onStatusChange: (status: ViewportSheetStatus) => void;
  onSelectPlace: (placeId: string) => void;
  onClearSelection: () => void;
  onOpenDetail?: () => void;
  onOpenViewportList: () => void;
  onOpenAll: () => void;
  onHeightChange?: (height: number) => void;
  detailHref?: (placeId: string) => string;
}) {
  const sheetRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; lastY: number; startAt: number; lock: "vertical" | "horizontal" | null }>({ startX: 0, startY: 0, lastY: 0, startAt: 0, lock: null });
  const frameRef = useRef<number | null>(null);
  const selectedMeta = selectedPlace ? [
    selectedPlace.cuisineSlugs?.[0],
    selectedPlace.pricePerPerson === null || selectedPlace.pricePerPerson === undefined ? "人均待补充" : `人均 ¥${Math.round(selectedPlace.pricePerPerson)}`,
    selectedPlace.sceneTags?.[0] ? sceneTagLabels[selectedPlace.sceneTags[0]] ?? selectedPlace.sceneTags[0] : undefined,
  ].filter(Boolean).join(" · ") : "";
  const nearbyCount = Math.max(0, places.length - (selectedPlace ? 1 : 0));
  const rangeCount = summaryCount ?? places.length;

  useEffect(() => {
    const element = sheetRef.current;
    if (!element || !onHeightChange) return;
    const report = () => onHeightChange(Math.ceil(element.getBoundingClientRect().height));
    report();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onHeightChange, status, selectedPlace, places.length]);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  const setDragOffset = (offset: number) => {
    const element = sheetRef.current;
    if (!element) return;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      element.style.setProperty("--sheet-drag-offset", `${offset}px`);
      frameRef.current = null;
    });
  };

  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.stopPropagation();
    dragRef.current = { startX: event.clientX, startY: event.clientY, lastY: event.clientY, startAt: performance.now(), lock: null };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag.startAt) return;
    event.stopPropagation();
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.lock && Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= 10) drag.lock = Math.abs(deltaY) >= Math.abs(deltaX) ? "vertical" : "horizontal";
    drag.lastY = event.clientY;
    if (drag.lock !== "vertical") return;
    event.preventDefault();
    setDragOffset(Math.max(-180, Math.min(180, deltaY)));
  };

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag.startAt) return;
    event.stopPropagation();
    const deltaY = event.clientY - drag.startY;
    const elapsed = Math.max(1, performance.now() - drag.startAt);
    const velocity = deltaY / elapsed;
    const shouldMove = Math.abs(deltaY) >= 44 || Math.abs(velocity) >= 0.45;
    setDragOffset(0);
    dragRef.current = { startX: 0, startY: 0, lastY: 0, startAt: 0, lock: null };
    if (drag.lock !== "vertical" || !shouldMove) return;
    onStatusChange(statusAfterDrag(status, deltaY < 0 ? "up" : "down") as ViewportSheetStatus);
  };

  const dragProps = {
    onPointerDown: startDrag,
    onPointerMove: moveDrag,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  };

  const summary = <button type="button" className="viewport-sheet__summary" onClick={() => onOpenViewportList()} {...dragProps}>
    <span><strong>当前范围 · {rangeCount} 家</strong>{filterSummary && <small>{filterSummary}</small>}</span>
    <span className="viewport-sheet__summary-action">上拉查看列表</span>
  </button>;

  return <aside ref={sheetRef} className={`viewport-sheet viewport-sheet--${status}`} aria-label="当前视野地点" data-status={status} onPointerDown={(event) => event.stopPropagation()}>
    <div className="viewport-sheet__handle-wrap" {...dragProps}>
      <button type="button" className="viewport-sheet__handle" aria-label={status === "summary" ? "上拉查看当前范围列表" : "收起当前视野面板"} aria-expanded={status !== "summary"} onClick={() => onStatusChange(status === "summary" ? "viewport_list" : "summary")} />
    </div>
    {status === "summary" && summary}
    {status === "place_preview" && selectedPlace && <>
      <header className="viewport-sheet__fixed-header" {...dragProps}><strong>已选地点</strong><button type="button" onClick={onClearSelection}>收起</button></header>
      <div className="viewport-sheet__preview-content" onPointerDown={(event) => event.stopPropagation()}>
        <article className="viewport-sheet__selected-card">
          <button type="button" className="viewport-sheet__close" aria-label="关闭地点预览" onClick={onClearSelection}>×</button>
          <div className="viewport-sheet__selected-layout">
            <div className="viewport-sheet__selected-media"><DiscoveryCardPhoto photoId={selectedPlace.coverPhotoId} initialUrl={selectedPlace.coverPhotoUrl} width={selectedPlace.coverPhotoWidth ?? 320} height={selectedPlace.coverPhotoHeight ?? 240} alt={`${selectedPlace.name} 的真实照片`} priority /></div>
            <div className="viewport-sheet__selected-copy"><p className="eyebrow">{selectedPlace.bowlStrength ? ["", "值得去", "想再去", "会专门去"][toBowlLevel(selectedPlace.bowlStrength)] : "共同记录"}</p><h2>{selectedPlace.name}</h2><p>{selectedMeta || placeMeta(selectedPlace)} · {selectedPlace.friendCount ?? selectedPlace.markCount ?? 0} 位朋友吃过</p><p className="viewport-sheet__selected-note">{selectedPlace.recommendedItems?.[0] ? `推荐：${selectedPlace.recommendedItems[0]}` : selectedPlace.review || "朋友留下的真实记录。"}</p></div>
          </div>
          <div className="viewport-sheet__selected-actions"><Link className="primary-link" href={detailHref(selectedPlace.id)} onClick={onOpenDetail}>查看详情</Link><button type="button" className="text-button" onClick={onOpenViewportList}>看看附近另外 {nearbyCount} 家</button></div>
        </article>
      </div>
    </>}
    {status === "viewport_list" && <>
      <header className="viewport-sheet__fixed-header" {...dragProps}><strong>当前范围 · {rangeCount} 家</strong><button type="button" onClick={() => onStatusChange(selectedPlace ? "place_preview" : "summary")}>收起</button></header>
      <div className="viewport-sheet__content" onPointerDown={(event) => event.stopPropagation()}>
        {places.length ? <div className="viewport-sheet__place-list">{places.map((place) => <PlaceRow key={place.id} place={place} onSelect={() => onSelectPlace(place.id)} detailHref={detailHref} onOpenDetail={onOpenDetail} />)}</div> : <p className="viewport-sheet__empty">这个范围里还没有推荐地点。<button type="button" className="text-button" onClick={onOpenAll}>查看全部地点</button></p>}
      </div>
    </>}
  </aside>;
}
