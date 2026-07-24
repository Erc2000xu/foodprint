"use client";

import { useActionState } from "react";
import { completePlaceCuisine, type ManagementResult } from "@/app/admin/actions";
import { cuisineOptions } from "@/lib/discovery-options";

export type DiscoveryBackfillPlace = { groupPlaceId: string; name: string; address: string; cuisineSlug?: string };
export type DiscoveryBackfillGeo = { id: string; name: string; kind: "district" | "business_district" | "metro_station" };
const initialState: ManagementResult = {};

export function DiscoveryBackfill({ places, geoOptions }: { places: DiscoveryBackfillPlace[]; geoOptions: DiscoveryBackfillGeo[] }) {
  if (!places.length) return null;
  return <section className="admin-card"><h2>完善地点检索信息</h2><p>为历史地点补充主菜系和位置。已有照片会自动作为候选封面；人均状态从真实标记同步。</p><ul className="discovery-backfill-list">{places.map((place) => <li key={place.groupPlaceId}><div><strong>{place.name}</strong><small>{place.address || "地址待补充"}</small></div><DiscoveryForm place={place} geoOptions={geoOptions} /></li>)}</ul></section>;
}

function DiscoveryForm({ place, geoOptions }: { place: DiscoveryBackfillPlace; geoOptions: DiscoveryBackfillGeo[] }) {
  const [state, action, pending] = useActionState(completePlaceCuisine, initialState);
  return <form action={action} className="discovery-backfill-form">
    <input type="hidden" name="group_place_id" value={place.groupPlaceId} />
    <select name="cuisine_slug" defaultValue={place.cuisineSlug ?? "beijing_northern"} aria-label={`${place.name} 的主菜系`}>
      {cuisineOptions.map(([slug, label]) => <option value={slug} key={slug}>{label}</option>)}
    </select>
    <select name="geo_entity_ids" multiple aria-label={`${place.name} 的区域、商圈或地铁站（可多选）`} title="可按住 Command / Ctrl 多选">
      <option disabled>选择区域、商圈或地铁站</option>
      {geoOptions.map((area) => <option value={area.id} key={area.id}>{area.kind === "district" ? "行政区" : area.kind === "business_district" ? "商圈" : "地铁站"} · {area.name}</option>)}
    </select>
    <button className="text-button" disabled={pending}>{pending ? "保存中" : "保存"}</button>
    {state.error && <small className="inline-action__error">{state.error}</small>}
    {state.success && <small className="inline-action__success">{state.success}</small>}
  </form>;
}
