import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ContentReadyMarker } from "@/components/navigation/content-ready-marker";
import { DiscoveryBrowser } from "@/components/map/map-browser";
import { cuisineOptions } from "@/lib/discovery-options";
import { getDiscoveryRequestContext, loadDiscoveryData } from "@/lib/discovery/server";
import { measureServerOperation } from "@/lib/performance/server";
import { createClient } from "@/lib/supabase/server";

function DiscoveryFallback() {
  return <div className="empty-note">正在打开发现…</div>;
}

export default async function Home() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return <AppShell activeNav="发现"><Suspense fallback={<DiscoveryFallback />}><DiscoveryBrowser places={[]} cuisineOptions={cuisineOptions} /></Suspense><ContentReadyMarker route="/" /></AppShell>;
  const supabase = await createClient();
  const context = await getDiscoveryRequestContext(supabase, "/");
  if (!context) redirect("/login");
  const { places } = await measureServerOperation("/", "discovery.page.total", () => loadDiscoveryData(supabase, context), (result) => ({ count: result.places.length }));
  return <AppShell activeNav="发现" groupName={context.groupName}><Suspense fallback={<DiscoveryFallback />}><DiscoveryBrowser canManage={context.role === "owner" || context.role === "admin"} places={places} cuisineOptions={cuisineOptions} /></Suspense><ContentReadyMarker route="/" /></AppShell>;
}
