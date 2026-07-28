import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { DiscoveryBrowser } from "@/components/map/map-browser";
import { cuisineOptions } from "@/lib/discovery-options";
import { getActiveDiscoveryGroup, loadDiscoveryData } from "@/lib/discovery/server";
import { createClient } from "@/lib/supabase/server";

function DiscoveryFallback() {
  return <div className="empty-note">正在加载发现内容…</div>;
}

export default async function Home() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return <AppShell activeNav="发现"><Suspense fallback={<DiscoveryFallback />}><DiscoveryBrowser places={[]} cuisineOptions={cuisineOptions} /></Suspense></AppShell>;
  const supabase = await createClient();
  const groupId = await getActiveDiscoveryGroup(supabase);
  if (!groupId) redirect("/login");
  const { places } = await loadDiscoveryData(supabase, groupId);
  return <AppShell activeNav="发现"><Suspense fallback={<DiscoveryFallback />}><DiscoveryBrowser places={places} cuisineOptions={cuisineOptions} /></Suspense></AppShell>;
}
