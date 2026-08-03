-- V1.3.3 follow-up: qualify place_candidates columns in the first-mark RPC.
-- The function returns a column named place_id. An unqualified place_id in
-- its UPDATE query is therefore ambiguous in PL/pgSQL.

create or replace function public.save_candidate_promotion_mark(
  p_group_id uuid, p_source_provider text, p_source_poi_id text, p_name text,
  p_branch_name text, p_address text, p_city text, p_district text,
  p_latitude numeric, p_longitude numeric, p_coordinate_system text,
  p_primary_category text, p_overall_rating numeric, p_would_recommend boolean,
  p_experience_attested boolean, p_visited_on date, p_short_review text,
  p_recommended_items text[], p_cuisine_slugs text[], p_strength smallint,
  p_tags text[], p_is_anonymous boolean
)
returns table (group_place_id uuid, place_id uuid, mark_id uuid, visit_record_id uuid, promoted_candidate_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mark record;
  v_visit record;
  v_candidate_id uuid;
  v_promoted_count integer := 0;
begin
  select * into v_mark from public.save_place_mark(
    p_group_id, p_source_provider, p_source_poi_id, p_name, p_branch_name,
    p_address, p_city, p_district, p_latitude, p_longitude, p_coordinate_system,
    p_primary_category, p_overall_rating, p_would_recommend, p_experience_attested,
    p_visited_on, p_visited_on, p_short_review, coalesce(p_recommended_items, '{}'::text[]),
    null, null, null, null, null, null, null
  );

  perform public.set_group_place_cuisines(v_mark.group_place_id, coalesce(p_cuisine_slugs, '{}'::text[]));
  select * into v_visit from public.record_place_visit(
    v_mark.group_place_id, p_visited_on, true, p_strength, p_tags,
    p_short_review, coalesce(p_recommended_items, '{}'::text[]), coalesce(p_is_anonymous, false)
  );

  for v_candidate_id in
    update public.place_candidates as candidate
      set status = 'promoted', resolved_by = auth.uid(), resolved_at = now()
      where candidate.group_id = p_group_id
        and candidate.place_id = v_mark.place_id
        and candidate.status = 'pending'
      returning candidate.id
  loop
    v_promoted_count := v_promoted_count + 1;
    insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id, metadata)
    values (p_group_id, auth.uid(), 'place_candidate.promoted', 'place_candidate', v_candidate_id,
      jsonb_build_object('group_place_id', v_mark.group_place_id, 'mark_id', v_mark.mark_id, 'visit_record_id', v_visit.visit_record_id));
  end loop;

  return query select v_mark.group_place_id, v_mark.place_id, v_mark.mark_id, v_visit.visit_record_id, v_promoted_count;
end;
$$;
