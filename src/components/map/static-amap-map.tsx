"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MapPlace } from "@/components/map/amap-map";

export function StaticAmapMap({ places }: { places: MapPlace[] }) {
  const [imageUrl, setImageUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let objectUrl = "";
    let cancelled = false;
    const load = async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (!cancelled) setError("登录状态已失效，请重新登录后查看地图。");
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
        setError("地图图片暂时无法生成，请使用列表浏览地点。");
        return;
      }
      const data = await response.blob();
      if (cancelled) return;
      objectUrl = URL.createObjectURL(data);
      setImageUrl(objectUrl);
    };
    void load();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [places]);

  if (error) return <div className="map-fallback map-fallback--error"><strong>地图暂时不可用</strong><span>{error}</span></div>;
  if (!imageUrl) return <div className="map-fallback"><strong>正在生成真实地图…</strong><span>正在从高德地图服务获取共同地点底图。</span></div>;
  // This protected Blob URL is created at runtime, so Next's remote image
  // optimizer cannot fetch it and a plain image element is intentional here.
  // eslint-disable-next-line @next/next/no-img-element
  return <div className="static-amap-map"><img src={imageUrl} alt="共同地图中的地点分布" /><span>© 高德地图</span></div>;
}
