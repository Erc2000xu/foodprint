"use client";

import { useActionState } from "react";
import { completePlaceCuisine, type ManagementResult } from "@/app/admin/actions";
import { cuisineOptions } from "@/lib/discovery-options";

export type DiscoveryBackfillPlace = { groupPlaceId: string; name: string; address: string; cuisineSlug?: string };
const initialState: ManagementResult = {};

export function DiscoveryBackfill({ places }: { places: DiscoveryBackfillPlace[] }) {
  if (!places.length) return null;
  return <section className="admin-card"><h2>完善地点检索信息</h2><p>为历史地点补充主菜系。行政区、商圈和附近地铁均在前台直接向高德读取，不再维护一份容易缺失的本地地点清单。</p><ul className="discovery-backfill-list">{places.map((place) => <li key={place.groupPlaceId}><div><strong>{place.name}</strong><small>{place.address || "地址待补充"}</small></div><DiscoveryForm place={place} /></li>)}</ul></section>;
}

function DiscoveryForm({ place }: { place: DiscoveryBackfillPlace }) {
  const [state, action, pending] = useActionState(completePlaceCuisine, initialState);
  return <form action={action} className="discovery-backfill-form">
    <input type="hidden" name="group_place_id" value={place.groupPlaceId} />
    <select name="cuisine_slug" defaultValue={place.cuisineSlug ?? "beijing_northern"} aria-label={`${place.name} 的主菜系`}>
      {cuisineOptions.map(([slug, label]) => <option value={slug} key={slug}>{label}</option>)}
    </select>
    <button className="text-button" disabled={pending}>{pending ? "保存中" : "保存"}</button>
    {state.error && <small className="inline-action__error">{state.error}</small>}
    {state.success && <small className="inline-action__success">{state.success}</small>}
  </form>;
}
