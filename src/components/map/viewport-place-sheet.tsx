"use client";

import Link from "next/link";
import { useRef } from "react";
import type { DiscoveryPlace } from "@/lib/discovery/types";
import { displayAmapLocationChain } from "@/lib/amap/location-display";
import { sceneTagLabels } from "@/lib/mark-options";
import { BowlIcon, toBowlLevel } from "@/components/recommendation/bowl-icon";
import { DiscoveryCardPhoto } from "@/components/photo/discovery-card-photo";
import type { ViewportSheetDetent } from "@/components/map/viewport-place-sheet-reducer";

function placeMeta(place: DiscoveryPlace) {
  return [place.city, place.district, place.businessAreaName].filter(Boolean).join(" · ") || "位置待补充";
}

function PlaceRow({ place, onSelect, detailHref }: { place: DiscoveryPlace; onSelect: () => void; detailHref: (placeId: string) => string }) {
  const location = displayAmapLocationChain(place.city, place.district, place.businessAreaName);
  const friendCount = place.friendCount ?? place.markCount ?? 0;
  return <article className="viewport-sheet__place-row">
    <button type="button" className="viewport-sheet__place-select" onClick={onSelect}>
      <span className="viewport-sheet__place-bowl" aria-hidden="true">{place.bowlStrength ? <BowlIcon level={toBowlLevel(place.bowlStrength)} size="xs" /> : "—"}</span>
      <span><strong>{place.name}</strong><small>{location || placeMeta(place)} · {friendCount} 位朋友吃过</small></span>
    </button>
    <Link href={detailHref(place.id)}>详情</Link>
  </article>;
}

export function ViewportPlaceSheet({
  places,
  selectedPlace,
  detent,
  onDetentChange,
  onSelectPlace,
  onClearSelection,
  onOpenAll,
  detailHref = (placeId) => `/place/${placeId}`,
}: {
  places: DiscoveryPlace[];
  selectedPlace?: DiscoveryPlace;
  detent: ViewportSheetDetent;
  onDetentChange: (detent: ViewportSheetDetent) => void;
  onSelectPlace: (placeId: string) => void;
  onClearSelection: () => void;
  onOpenAll: () => void;
  detailHref?: (placeId: string) => string;
}) {
  const dragStartY = useRef<number | null>(null);
  const selectedMeta = selectedPlace ? [
    selectedPlace.cuisineSlugs?.[0],
    selectedPlace.pricePerPerson === null || selectedPlace.pricePerPerson === undefined ? "人均待补充" : `人均 ¥${Math.round(selectedPlace.pricePerPerson)}`,
    selectedPlace.sceneTags?.[0] ? sceneTagLabels[selectedPlace.sceneTags[0]] ?? selectedPlace.sceneTags[0] : undefined,
  ].filter(Boolean).join(" · ") : "";

  const moveDetent = (delta: number) => {
    const detents: ViewportSheetDetent[] = ["peek", "card", "half", "expanded"];
    const index = detents.indexOf(detent);
    onDetentChange(detents[Math.max(0, Math.min(detents.length - 1, index + delta))]);
  };

  return <aside className={`viewport-sheet viewport-sheet--${detent}`} aria-label="当前视野地点" data-detent={detent}>
    <div className="viewport-sheet__handle-wrap" onPointerDown={(event) => { dragStartY.current = event.clientY; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerUp={(event) => { const start = dragStartY.current; dragStartY.current = null; if (start === null) return; const delta = start - event.clientY; if (Math.abs(delta) > 28) moveDetent(delta > 0 ? 1 : -1); }}>
      <button type="button" className="viewport-sheet__handle" aria-label={detent === "expanded" ? "收起当前视野" : "展开当前视野"} aria-expanded={detent === "expanded"} onClick={() => moveDetent(detent === "expanded" ? -1 : 1)} />
    </div>
    {detent === "peek" && <div className="viewport-sheet__peek"><strong>当前范围 · {places.length} 家</strong><button type="button" onClick={onOpenAll}>查看全部</button></div>}
    {detent !== "peek" && <div className="viewport-sheet__content">
      {selectedPlace && <article className="viewport-sheet__selected-card">
        <button type="button" className="viewport-sheet__close" aria-label="关闭地点卡片" onClick={onClearSelection}>×</button>
        <div className="viewport-sheet__selected-layout">
          <div className="viewport-sheet__selected-media"><DiscoveryCardPhoto photoId={selectedPlace.coverPhotoId} initialUrl={selectedPlace.coverPhotoUrl} width={selectedPlace.coverPhotoWidth ?? 320} height={selectedPlace.coverPhotoHeight ?? 240} alt={`${selectedPlace.name} 的真实照片`} priority /></div>
          <div className="viewport-sheet__selected-copy"><p className="eyebrow">已选地点</p><h2>{selectedPlace.name}</h2><p>{selectedMeta || placeMeta(selectedPlace)}</p><p className="viewport-sheet__selected-note">{selectedPlace.review || `${selectedPlace.friendCount ?? selectedPlace.markCount ?? 0} 位朋友留下了共同记录。`}</p></div>
        </div>
        <Link className="primary-link" href={detailHref(selectedPlace.id)}>查看详情</Link>
      </article>}
      <div className="viewport-sheet__heading"><strong>当前范围 · {places.length} 家</strong><button type="button" onClick={onOpenAll}>查看全部</button></div>
      {places.length ? <div className="viewport-sheet__place-list">{places.map((place) => <PlaceRow key={place.id} place={place} onSelect={() => onSelectPlace(place.id)} detailHref={detailHref} />)}</div> : <p className="viewport-sheet__empty">当前范围内还没有符合条件的地点。</p>}
    </div>}
  </aside>;
}
