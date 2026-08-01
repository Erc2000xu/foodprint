import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { MarkFlow } from "@/components/mark/mark-flow";
import { MealRecordForm } from "@/components/mark/meal-record-form";
import { AppShell } from "@/components/shell/app-shell";
import { createClient } from "@/lib/supabase/server";

export default async function MarkPage({ searchParams }: { searchParams: Promise<{ place?: string; candidate?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mark");
  const { place: groupPlaceId, candidate: candidateId } = await searchParams;
  let mealForm: ReactNode;
  if (groupPlaceId) {
    const { data: groupPlace } = await supabase.from("group_places").select("place_id").eq("id", groupPlaceId).neq("status", "archived").maybeSingle();
    if (groupPlace) {
      const { data: place } = await supabase.from("places").select("source_poi_id, name, address, city, district, latitude, longitude").eq("id", groupPlace.place_id).maybeSingle();
      const { data: opinions } = await supabase.rpc("get_my_current_opinion", { p_group_place_id: groupPlaceId });
      const opinion = opinions?.[0];
      if (place) mealForm = <MealRecordForm groupPlaceId={groupPlaceId} placeName={place.name} currentOpinion={opinion ? { strength: Number(opinion.strength), tags: opinion.tags ?? [], isAnonymous: opinion.is_anonymous } : null} />;
    }
  }
  if (!mealForm && candidateId) {
    const { data: candidate } = await supabase.from("place_candidates").select("place_id").eq("id", candidateId).eq("status", "pending").maybeSingle();
    if (candidate) {
      const { data: membership } = await supabase.from("group_members").select("group_id").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
      const { data: candidateInGroup } = membership ? await supabase.from("place_candidates").select("id").eq("id", candidateId).eq("group_id", membership.group_id).eq("status", "pending").maybeSingle() : { data: null };
      if (candidateInGroup) {
        const { data: place } = await supabase.from("places").select("source_poi_id, name, address, city, district, latitude, longitude").eq("id", candidate.place_id).maybeSingle();
        if (place?.source_poi_id) mealForm = <MarkFlow initialCandidate={{ poiId: place.source_poi_id, name: place.name, address: place.address ?? "", city: place.city ?? "", district: place.district ?? "", latitude: Number(place.latitude), longitude: Number(place.longitude) }} />;
      }
    }
  }
  return <AppShell activeNav="记一顿"><main className="mark-page">{mealForm ?? <MarkFlow />}</main></AppShell>;
}
