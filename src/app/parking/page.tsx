import { notFound, redirect } from "next/navigation";
import { ContentReadyMarker } from "@/components/navigation/content-ready-marker";
import { AppShell } from "@/components/shell/app-shell";
import { ParkingBrowser } from "@/components/parking/parking-browser";
import { getParkingAccess, listParkingMarks } from "@/lib/adapters/parking-repository";
import { getActiveGroupContext } from "@/lib/auth/active-group-context";
import { readDiscoveryMapRuntimeConfig } from "@/lib/env.server";
import { createClient } from "@/lib/supabase/server";

export default async function ParkingPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) notFound();
  const supabase = await createClient();
  const context = await getActiveGroupContext(supabase, "/parking");
  if (!context) redirect("/login");
  const access = await getParkingAccess(supabase, context.groupId);
  if (!access?.canUse) notFound();
  const marksResult = await listParkingMarks(supabase, context.groupId);
  const mapRuntimeConfig = readDiscoveryMapRuntimeConfig();
  return (
    <AppShell activeNav="发现" groupName={context.groupName} variant="map">
      <ParkingBrowser
        userId={context.userId}
        groupId={context.groupId}
        initialMarks={marksResult.status === "ok" ? marksResult.marks : []}
        initialDataError={marksResult.status === "error" ? "停车记录暂时无法读取，请重试。" : undefined}
        mapRuntimeConfig={mapRuntimeConfig}
      />
      <ContentReadyMarker route="/parking" />
    </AppShell>
  );
}
