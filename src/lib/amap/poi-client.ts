import { amapFailureMessage } from "@/lib/amap/failure-message";
import { createClient } from "@/lib/supabase/client";

export type AmapPoiCandidate = { poiId: string; name: string; address: string; city: string; district: string; latitude: number; longitude: number };
export type AmapDistrict = { adcode: string; name: string };
type AmapPayload = { candidates?: AmapPoiCandidate[]; districts?: AmapDistrict[]; error?: string; category?: string; processed?: number; updated?: number };

async function invokeAmapPoi(body: Record<string, unknown>): Promise<AmapPayload> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("amap-poi-search", { body });
  if (!error) return (data ?? {}) as AmapPayload;
  if (error.context instanceof Response) return await error.context.json().catch(() => ({ error: amapFailureMessage("network_failure") })) as AmapPayload;
  return { error: amapFailureMessage("network_failure"), category: "network_failure" };
}

export async function searchAmapPoiTips(keyword: string, location?: { latitude: number; longitude: number }): Promise<{ candidates: AmapPoiCandidate[]; error?: string }> {
  const payload = await invokeAmapPoi({ keyword, location });
  return payload.error ? { candidates: [], error: payload.error || amapFailureMessage(payload.category) } : { candidates: payload.candidates ?? [] };
}

export async function getAmapBeijingDistricts(): Promise<{ districts: AmapDistrict[]; error?: string }> {
  const payload = await invokeAmapPoi({ operation: "districts" });
  return payload.error ? { districts: [], error: payload.error || amapFailureMessage(payload.category) } : { districts: payload.districts ?? [] };
}

export async function backfillAmapBusinessAreas(): Promise<{ processed: number; updated: number }> {
  const payload = await invokeAmapPoi({ operation: "business_area_backfill" });
  return { processed: payload.processed ?? 0, updated: payload.updated ?? 0 };
}
