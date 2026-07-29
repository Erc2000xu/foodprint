import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { MarkFlow } from "@/components/mark/mark-flow";
import { MealRecordForm } from "@/components/mark/meal-record-form";
import { AppShell } from "@/components/shell/app-shell";
import { createClient } from "@/lib/supabase/server";

export default async function MarkPage({ searchParams }: { searchParams: Promise<{ place?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mark");
  const { place: groupPlaceId } = await searchParams;
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
  return <AppShell activeNav="记一顿"><main className="mark-page">{mealForm ?? <MarkFlow />}</main></AppShell>;
}
