"use client";

import { useEffect, useRef, useState } from "react";
import { loadAmap } from "@/lib/amap/load-amap";

export type MapPlace = {
  id: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  averageRating: number;
  markCount: number;
};

const defaultCenter: [number, number] = [116.397428, 39.90923];

type AMapInstance = { add: (overlay: unknown) => void; addControl: (control: unknown) => void; destroy: () => void };

export function AMapMap({ apiKey, places }: { apiKey?: string; places: MapPlace[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!apiKey || !containerRef.current) return;
    let destroyed = false;
    let map: AMapInstance | undefined;
    const load = async () => {
      try {
        const AMap = await loadAmap(apiKey, ["AMap.Scale"]);
        if (destroyed || !containerRef.current) return;
        const center = places[0] ? [places[0].longitude, places[0].latitude] : defaultCenter;
        const mapInstance = new AMap.Map(containerRef.current, { center, zoom: places.length ? 13 : 11, viewMode: "2D", resizeEnable: true }) as AMapInstance;
        map = mapInstance;
        mapInstance.addControl(new AMap.Scale());
        places.forEach((place) => {
          const marker = new AMap.Marker({
            position: [place.longitude, place.latitude],
            anchor: "bottom-center",
            content: `<div class="foodprint-marker" aria-label="${place.name}，${place.averageRating.toFixed(1)} 分，${place.markCount} 人标记"><span>${place.averageRating.toFixed(1)}</span></div>`,
          });
          marker.on("click", () => window.location.assign(`/place/${place.id}`));
          mapInstance.add(marker);
        });
      } catch {
        if (!destroyed) setError("地图暂时无法加载。请检查高德 Key、域名白名单和网络后重试。");
      }
    };
    void load();
    return () => { destroyed = true; map?.destroy(); };
  }, [apiKey, places]);

  if (!apiKey) return <div className="map-fallback"><strong>地图服务尚未配置</strong><span>请在 Vercel 添加 NEXT_PUBLIC_AMAP_KEY 后重新部署。</span></div>;
  return <div className="amap-container" ref={containerRef}>{error && <div className="map-fallback map-fallback--error"><strong>地图加载失败</strong><span>{error}</span></div>}</div>;
}
