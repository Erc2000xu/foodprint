"use client";

import { lazy, Suspense } from "react";
import type { MapAdapterProps } from "@/components/map/map-adapter";

const MapAdapter = lazy(() => import("@/components/map/map-adapter").then((module) => ({ default: module.DynamicMapAdapter })));

export function DynamicMapAdapter(props: MapAdapterProps) {
  return <Suspense fallback={<div className="dynamic-map-loading" aria-label="地图加载中">正在打开地图…</div>}><MapAdapter {...props} /></Suspense>;
}
