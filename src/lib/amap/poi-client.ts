import { amapFailureMessage } from "@/lib/amap/failure-message";
import { createClient } from "@/lib/supabase/client";

export type AmapPoiCandidate = { poiId: string; name: string; address: string; city: string; district: string; latitude: number; longitude: number };
export type AmapDistrict = { adcode: string; name: string };
type AmapPayload = { candidates?: AmapPoiCandidate[]; districts?: AmapDistrict[]; error?: string; category?: string; processed?: number; updated?: number };
export type AmapRequestOptions = { signal?: AbortSignal; timeoutMs?: number };

const DEFAULT_TIMEOUT_MS = 8_000;
let districtCache: { expiresAt: number; districts: AmapDistrict[] } | undefined;

function requestCancelled() {
  return new Error("request_cancelled");
}

function requestTimedOut() {
  return new Error("provider_timeout");
}

function runWithTimeout<T>(promise: Promise<T>, options: AmapRequestOptions = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timeout = 0;
    const onAbort = () => { if (!settled) { settled = true; window.clearTimeout(timeout); options.signal?.removeEventListener("abort", onAbort); reject(requestCancelled()); } };
    timeout = window.setTimeout(() => { if (!settled) { settled = true; options.signal?.removeEventListener("abort", onAbort); reject(requestTimedOut()); } }, timeoutMs);
    if (options.signal?.aborted) { onAbort(); return; }
    options.signal?.addEventListener("abort", onAbort, { once: true });
    promise.then((value) => { if (settled) return; settled = true; window.clearTimeout(timeout); options.signal?.removeEventListener("abort", onAbort); resolve(value); }, (error) => { if (settled) return; settled = true; window.clearTimeout(timeout); options.signal?.removeEventListener("abort", onAbort); reject(error); });
  });
}

async function invokeAmapPoi(body: Record<string, unknown>, options?: AmapRequestOptions): Promise<AmapPayload> {
  const supabase = createClient();
  try {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const request = supabase.functions.invoke("amap-poi-search", { body, signal: options?.signal, timeout: timeoutMs });
    const { data, error } = await runWithTimeout(request, options);
    if (!error) {
      const payload = (data ?? {}) as AmapPayload;
      return payload.error ? { ...payload, error: amapFailureMessage(payload.category) } : payload;
    }
    if (error.context instanceof Response) {
      const payload = await error.context.json().catch(() => ({})) as AmapPayload;
      return { ...payload, error: amapFailureMessage(payload.category, amapFailureMessage("network_failure")) };
    }
    return { error: amapFailureMessage("network_failure"), category: "network_failure" };
  } catch (error) {
    if (error instanceof Error && error.message === "request_cancelled") return { category: "request_cancelled" };
    if (error instanceof Error && error.message === "provider_timeout") return { error: amapFailureMessage("provider_timeout"), category: "provider_timeout" };
    return { error: amapFailureMessage("network_failure"), category: "network_failure" };
  }
}

export async function searchAmapPoiTips(keyword: string, location?: { latitude: number; longitude: number }, options?: AmapRequestOptions): Promise<{ candidates: AmapPoiCandidate[]; error?: string }> {
  if (keyword.trim().length < 2) return { candidates: [] };
  const payload = await invokeAmapPoi({ keyword: keyword.trim(), location }, options);
  if (payload.category === "request_cancelled") return { candidates: [] };
  return payload.error ? { candidates: [], error: payload.error || amapFailureMessage(payload.category) } : { candidates: payload.candidates ?? [] };
}

export async function getAmapBeijingDistricts(options?: AmapRequestOptions): Promise<{ districts: AmapDistrict[]; error?: string }> {
  if (districtCache && districtCache.expiresAt > Date.now()) return { districts: districtCache.districts };
  const payload = await invokeAmapPoi({ operation: "districts" }, options);
  if (payload.error) return { districts: [], error: payload.error || amapFailureMessage(payload.category) };
  const districts = payload.districts ?? [];
  districtCache = { districts, expiresAt: Date.now() + 5 * 60_000 };
  return { districts };
}
