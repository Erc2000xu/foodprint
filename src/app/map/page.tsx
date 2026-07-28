import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { MapBrowser } from "@/components/map/map-browser";
import { cuisineOptions } from "@/lib/discovery-options";
import { getActiveDiscoveryGroup, loadDiscoveryData } from "@/lib/discovery/server";
import { createClient } from "@/lib/supabase/server";

function MapBrowserFallback() {
  return <div className="empty-note">正在加载地图与地点…</div>;
}

export default async function MapPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return <AppShell activeNav="发现"><Suspense fallback={<MapBrowserFallback />}><MapBrowser places={[]} cuisineOptions={cuisineOptions} geoOptions={[]} /></Suspense></AppShell>;
  const supabase = await createClient();
  const groupId = await getActiveDiscoveryGroup(supabase);
  if (!groupId) redirect("/login?next=/map");
  const { places, geoOptions } = await loadDiscoveryData(supabase, groupId);
  return <AppShell activeNav="发现"><Suspense fallback={<MapBrowserFallback />}><MapBrowser places={places} cuisineOptions={cuisineOptions} geoOptions={geoOptions} /></Suspense></AppShell>;
}
