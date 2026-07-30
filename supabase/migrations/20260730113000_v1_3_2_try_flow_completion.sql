-- Foodprint V1.3.2: a candidate becomes discoverable only with a complete,
-- attested meal record.  This migration intentionally supersedes the early
-- V1.2 one-click promotion path, which could create an empty group place.

update public.group_places
set primary_category = 'restaurant'
where primary_category = 'street_food';

alter table public.group_places
  drop constraint if exists group_places_primary_category_check;

alter table public.group_places
  add constraint group_places_primary_category_check
  check (primary_category in ('restaurant', 'cafe', 'drinks', 'bar', 'bakery_dessert', 'other_food_drink'));

-- Include pending candidates in the provider-owned cache refresh queue.  The
-- one optional place argument lets a newly saved candidate be refreshed right
-- away, without making it a public group place first.
drop function if exists public.list_amap_business_area_backfill_candidates(uuid, integer);

create function public.list_amap_business_area_backfill_candidates(
  p_group_place_id uuid default null,
  p_place_id uuid default null,
  p_limit integer default 3
)
returns table (
  place_id uuid,
  group_place_id uuid,
  source_poi_id text,
  latitude numeric,
  longitude numeric,
  failure_count integer
)
language sql
security definer
set search_path = public
as $$
  with eligible_places as (
    select place.id as place_id, group_place.id as group_place_id, group_place.created_at
    from public.group_places group_place
    join public.places place on place.id = group_place.place_id
    where public.is_active_group_member(group_place.group_id)
      and group_place.status <> 'archived'
      and (p_group_place_id is null or group_place.id = p_group_place_id)
      and (p_place_id is null or place.id = p_place_id)
    union
    select place.id as place_id, null::uuid as group_place_id, candidate.created_at
    from public.place_candidates candidate
    join public.places place on place.id = candidate.place_id
    where candidate.status = 'pending'
      and public.is_active_group_member(candidate.group_id)
      and p_group_place_id is null
      and (p_place_id is null or place.id = p_place_id)
  )
  select distinct on (place.id)
    place.id,
    eligible.group_place_id,
    place.source_poi_id,
    place.latitude,
    place.longitude,
    coalesce(cache.failure_count, 0)
  from eligible_places eligible
  join public.places place on place.id = eligible.place_id
  left join public.place_amap_business_area_cache cache on cache.place_id = place.id
  where place.source_provider = 'amap'
    and place.source_poi_id is not null
    and place.coordinate_system = 'GCJ-02'
    and (
      cache.place_id is null
      or (cache.status = 'pending' and cache.last_attempt_at < now() - interval '10 minutes')
      or (cache.status in ('not_found', 'temporary_failure', 'success') and coalesce(cache.next_refresh_after, now()) <= now())
    )
  order by place.id, eligible.group_place_id nulls last
  limit least(greatest(coalesce(p_limit, 3), 1), 5);
$$;

create or replace function public.dismiss_place_candidate(
  p_candidate_id uuid,
  p_experience_attested boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate public.place_candidates;
  v_user_id uuid := auth.uid();
begin
  select * into v_candidate from public.place_candidates where id = p_candidate_id for update;
  if not found then raise exception 'candidate not found' using errcode = '22023'; end if;
  if v_user_id is null or not public.is_active_group_member(v_candidate.group_id, v_user_id) then
    raise exception 'active group membership required' using errcode = '42501';
  end if;
  if v_candidate.status <> 'pending' then raise exception 'candidate has already been verified' using errcode = '22023'; end if;
  if not p_experience_attested then raise exception 'real experience attestation is required' using errcode = '22023'; end if;

  update public.place_candidates
    set status = 'dismissed', resolved_by = v_user_id, resolved_at = now()
    where id = v_candidate.id;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id)
  values (v_candidate.group_id, v_user_id, 'place_candidate.dismissed', 'place_candidate', v_candidate.id);
end;
$$;

-- Keep the legacy function safe for any older web client: it may dismiss, but
-- it can no longer create a recommendation without the full meal form.
create or replace function public.resolve_place_candidate(
  p_candidate_id uuid,
  p_would_recommend boolean,
  p_experience_attested boolean
)
returns table (group_place_id uuid, status public.place_candidate_status)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_would_recommend then
    raise exception 'complete a meal record before recommending this candidate' using errcode = '22023';
  end if;
  perform public.dismiss_place_candidate(p_candidate_id, p_experience_attested);
  return query select null::uuid, 'dismissed'::public.place_candidate_status;
end;
$$;

-- Save every first-mark artifact and promote matching pending candidates in one
-- transaction.  A failed cuisine or visit write rolls the place mark back too.
create function public.save_candidate_promotion_mark(
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
    update public.place_candidates
      set status = 'promoted', resolved_by = auth.uid(), resolved_at = now()
      where group_id = p_group_id and place_id = v_mark.place_id and status = 'pending'
      returning id
  loop
    v_promoted_count := v_promoted_count + 1;
    insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id, metadata)
    values (p_group_id, auth.uid(), 'place_candidate.promoted', 'place_candidate', v_candidate_id,
      jsonb_build_object('group_place_id', v_mark.group_place_id, 'mark_id', v_mark.mark_id, 'visit_record_id', v_visit.visit_record_id));
  end loop;

  return query select v_mark.group_place_id, v_mark.place_id, v_mark.mark_id, v_visit.visit_record_id, v_promoted_count;
end;
$$;

revoke all on function public.list_amap_business_area_backfill_candidates(uuid, uuid, integer) from public, anon;
revoke all on function public.dismiss_place_candidate(uuid, boolean) from public, anon;
revoke all on function public.save_candidate_promotion_mark(uuid, text, text, text, text, text, text, text, numeric, numeric, text, text, numeric, boolean, boolean, date, text, text[], text[], smallint, text[], boolean) from public, anon;
grant execute on function public.list_amap_business_area_backfill_candidates(uuid, uuid, integer) to authenticated;
grant execute on function public.dismiss_place_candidate(uuid, boolean) to authenticated;
grant execute on function public.save_candidate_promotion_mark(uuid, text, text, text, text, text, text, text, numeric, numeric, text, text, numeric, boolean, boolean, date, text, text[], text[], smallint, text[], boolean) to authenticated;
