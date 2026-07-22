import { redirect } from "next/navigation";
import { MarkFlow, type MarkCandidate } from "@/components/mark/mark-flow";
import { AppShell } from "@/components/shell/app-shell";
import { createClient } from "@/lib/supabase/server";

export default async function MarkPage({ searchParams }: { searchParams: Promise<{ place?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mark");
  const { place: groupPlaceId } = await searchParams;
  let initialCandidate: MarkCandidate | undefined;
  if (groupPlaceId) {
    const { data: groupPlace } = await supabase.from("group_places").select("place_id").eq("id", groupPlaceId).neq("status", "archived").maybeSingle();
    if (groupPlace) {
      const { data: place } = await supabase.from("places").select("source_poi_id, name, address, city, district, latitude, longitude").eq("id", groupPlace.place_id).maybeSingle();
      if (place?.source_poi_id) initialCandidate = { poiId: place.source_poi_id, name: place.name, address: place.address ?? "", city: place.city ?? "", district: place.district ?? "", latitude: Number(place.latitude), longitude: Number(place.longitude) };
    }
  }
  return <AppShell activeNav="标记"><main className="mark-page"><MarkFlow apiKey={process.env.NEXT_PUBLIC_AMAP_KEY} initialCandidate={initialCandidate} /></main></AppShell>;
}
