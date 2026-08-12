import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";
import { ContentReadyMarker } from "@/components/navigation/content-ready-marker";
import { MarkFlow } from "@/components/mark/mark-flow";
import { MealRecordForm } from "@/components/mark/meal-record-form";
import { AppShell } from "@/components/shell/app-shell";
import { getActiveGroupContext } from "@/lib/auth/active-group-context";
import { createClient } from "@/lib/supabase/server";

export default async function MarkPage({ searchParams }: { searchParams: Promise<{ place?: string; candidate?: string }> }) {
  const supabase = await createClient();
  const context = await getActiveGroupContext(supabase, "/mark");
  if (!context) redirect("/login?next=/mark");
  const targets = z.object({ place: z.string().uuid().optional(), candidate: z.string().uuid().optional() }).refine((value) => !(value.place && value.candidate), "一次只能打开一个记录目标。").safeParse(await searchParams);
  if (!targets.success) return <AppShell activeNav="记一顿" groupName={context.groupName}><main className="mark-page"><section className="mark-card"><p className="form-error">记录目标无效，请从地点或候选列表重新进入。</p><ContentReadyMarker route="/mark" /></section></main></AppShell>;
  const { place: groupPlaceId, candidate: candidateId } = targets.data;
  let mealForm: ReactNode;
  if (groupPlaceId) {
    const { data: groupPlace } = await supabase.from("group_places").select("place_id").eq("id", groupPlaceId).eq("group_id", context.groupId).neq("status", "archived").maybeSingle();
    if (groupPlace) {
      const { data: place } = await supabase.from("places").select("source_poi_id, name, address, city, district, latitude, longitude").eq("id", groupPlace.place_id).maybeSingle();
      const { data: opinions } = await supabase.rpc("get_my_current_opinion", { p_group_place_id: groupPlaceId });
      const opinion = opinions?.[0];
      if (place) mealForm = <MealRecordForm groupPlaceId={groupPlaceId} placeName={place.name} currentOpinion={opinion ? { strength: Number(opinion.strength), tags: opinion.tags ?? [], isAnonymous: opinion.is_anonymous } : null} />;
    }
  }
  if (!mealForm && candidateId) {
    const { data: candidate } = await supabase.from("place_candidates").select("place_id").eq("id", candidateId).eq("group_id", context.groupId).eq("status", "pending").maybeSingle();
    if (candidate) {
      const { data: place } = await supabase.from("places").select("source_poi_id, name, address, city, district, latitude, longitude").eq("id", candidate.place_id).maybeSingle();
      if (place?.source_poi_id) mealForm = <MarkFlow initialCandidate={{ poiId: place.source_poi_id, name: place.name, address: place.address ?? "", city: place.city ?? "", district: place.district ?? "", latitude: Number(place.latitude), longitude: Number(place.longitude) }} />;
    }
  }
  return <AppShell activeNav="记一顿" groupName={context.groupName}><main className="mark-page">{mealForm ?? <MarkFlow />}<ContentReadyMarker route="/mark" /></main></AppShell>;
}
