import { AppShell } from "@/components/shell/app-shell";
import { MapBrowser } from "@/components/map/map-browser";
import { cuisineOptions } from "@/lib/discovery-options";
import { getActiveDiscoveryGroup, loadDiscoveryData } from "@/lib/discovery/server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Home() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return <AppShell><MapBrowser places={[]} cuisineOptions={cuisineOptions} geoOptions={[]} /></AppShell>;
  const supabase = await createClient();
  const groupId = await getActiveDiscoveryGroup(supabase);
  if (!groupId) redirect("/login");
  const { places, geoOptions } = await loadDiscoveryData(supabase, groupId);
  return <AppShell><MapBrowser places={places} cuisineOptions={cuisineOptions} geoOptions={geoOptions} /></AppShell>;
}
