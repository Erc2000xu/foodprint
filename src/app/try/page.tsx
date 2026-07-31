import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { TryList } from "@/components/try/try-list";
import { createClient } from "@/lib/supabase/server";

export default async function TryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/try");
  const { data: memberships } = await supabase.from("group_members").select("group_id, role").eq("user_id", user.id).eq("status", "active").limit(1);
  const groupId = memberships?.[0]?.group_id;
  if (!groupId) redirect("/admin");
  const { data: candidates } = await supabase.from("place_candidates")
    .select("id, place_id, heard_from, expectation, created_by, created_at")
    .eq("group_id", groupId).eq("status", "pending").order("created_at", { ascending: false });
  const placeIds = candidates?.map((candidate) => candidate.place_id) ?? [];
  const creatorIds = [...new Set((candidates ?? []).map((candidate) => candidate.created_by))];
  const [{ data: places }, { data: profiles }, { data: businessAreas }] = await Promise.all([
    placeIds.length ? supabase.from("places").select("id, source_poi_id, name, address, city, district, latitude, longitude").in("id", placeIds) : Promise.resolve({ data: [] }),
    creatorIds.length ? supabase.from("profiles").select("id, display_name").in("id", creatorIds) : Promise.resolve({ data: [] }),
    placeIds.length ? supabase.from("place_amap_business_area_cache").select("place_id, business_area_name").in("place_id", placeIds).eq("status", "success") : Promise.resolve({ data: [] }),
  ]);
  const placeById = new Map((places ?? []).map((place) => [place.id, place]));
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const businessAreaByPlaceId = new Map((businessAreas ?? []).map((area) => [area.place_id, area.business_area_name]));
  const cards = (candidates ?? []).flatMap((candidate) => {
    const place = placeById.get(candidate.place_id);
    if (!place) return [];
    return [{
      id: candidate.id, name: place.name, address: place.address ?? "", city: place.city ?? "", district: place.district ?? "", businessArea: businessAreaByPlaceId.get(place.id) ?? "", poiId: place.source_poi_id ?? "", latitude: Number(place.latitude), longitude: Number(place.longitude),
      heardFrom: candidate.heard_from ?? "", expectation: candidate.expectation ?? "", creatorName: profileById.get(candidate.created_by)?.display_name ?? "成员",
      isMine: candidate.created_by === user.id, canManage: ["owner", "admin"].includes(memberships?.[0]?.role ?? ""),
    }];
  });
  return <AppShell activeNav="去试试"><TryList candidates={cards} /></AppShell>;
}
