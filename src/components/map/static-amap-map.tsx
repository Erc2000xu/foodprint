"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MapPlace } from "@/components/map/amap-map";
import { amapFailureMessage } from "@/lib/amap/failure-message";

export function StaticAmapMap({ places, onError }: { places: MapPlace[]; onError?: (error: Error) => void }) {
  const [imageUrl, setImageUrl] = useState("");
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let objectUrl = "";
    let cancelled = false;
    const load = async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (!cancelled) { setError("请先登录后再继续。"); onError?.(new Error("session expired")); }
        return;
      }
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/amap-static-map`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.access_token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
          "content-type": "application/json",
        },
        body: JSON.stringify({ groupPlaceIds: places.map((place) => place.id) }),
      });
      if (cancelled) return;
      if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) {
        const payload = await response.json().catch(() => null) as { category?: string } | null;
        const message = amapFailureMessage(payload?.category, "地图暂时无法显示；你仍可在列表中查找地点。");
        setError(message); onError?.(new Error("static map unavailable"));
        return;
      }
      const data = await response.blob();
      if (cancelled) return;
      objectUrl = URL.createObjectURL(data);
      setImageUrl(objectUrl);
    };
    void load().catch(() => {
      if (!cancelled) {
        const message = amapFailureMessage("network_failure");
        setError(message); onError?.(new Error("static map network failure"));
      }
    });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [places, onError, retryKey]);

  if (error) return <div className="map-fallback map-fallback--error"><strong>地图暂时无法显示</strong><span>{error}</span><button className="text-button" type="button" onClick={() => { setError(""); setImageUrl(""); setRetryKey((value) => value + 1); }}>重试地图</button></div>;
  if (!imageUrl) return <div className="map-fallback"><strong>正在打开地图…</strong><span>地点信息加载完成后，地图会继续显示。</span></div>;
  // This protected Blob URL is created at runtime, so Next's remote image
  // optimizer cannot fetch it and a plain image element is intentional here.
  // eslint-disable-next-line @next/next/no-img-element
  return <div className="static-amap-map"><img src={imageUrl} alt="共同地图中的地点分布" /><span>© 高德地图</span></div>;
}
