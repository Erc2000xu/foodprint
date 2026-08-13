import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ContentReadyMarker } from "@/components/navigation/content-ready-marker";
import { DiscoveryBrowser } from "@/components/map/map-browser";
import { cuisineOptions } from "@/lib/discovery-options";
import { getDiscoveryRequestContext, loadDiscoveryIndexV23 } from "@/lib/discovery/server";
import { measureServerOperation } from "@/lib/performance/server";
import { createClient } from "@/lib/supabase/server";
import { readDiscoveryMapRuntimeConfig } from "@/lib/env.server";

function DiscoveryFallback() {
  return <div className="empty-note">正在打开发现…</div>;
}

export default async function Home() {
  const mapRuntimeConfig = readDiscoveryMapRuntimeConfig();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return <AppShell activeNav="发现"><Suspense fallback={<DiscoveryFallback />}><DiscoveryBrowser places={[]} cuisineOptions={cuisineOptions} mapRuntimeConfig={mapRuntimeConfig} /></Suspense><ContentReadyMarker route="/" /></AppShell>;
  const supabase = await createClient();
  const context = await getDiscoveryRequestContext(supabase, "/");
  if (!context) redirect("/login");
  const indexResult = await measureServerOperation("/", "discovery.page.total", () => loadDiscoveryIndexV23(supabase), (result) => ({ count: result.places.length, outcome: result.status }));
  const pagePlaces = indexResult.status === "error" || indexResult.status === "overflow" ? [] : indexResult.places;
  const pageMapConfig = mapRuntimeConfig.enabled && indexResult.status === "complete" && indexResult.places.length > 0 ? mapRuntimeConfig : { enabled: false } as const;
  return <AppShell activeNav="发现" groupName={context.groupName}><Suspense fallback={<DiscoveryFallback />}><DiscoveryBrowser canManage={context.role === "owner" || context.role === "admin"} places={pagePlaces} indexStatus={indexResult.status} cuisineOptions={cuisineOptions} mapRuntimeConfig={pageMapConfig} /></Suspense><ContentReadyMarker route="/" /></AppShell>;
}
