-- The output column named place_id is also a column on group_places. Qualify
-- the table reference so PL/pgSQL never treats it as an ambiguous variable.
create or replace function public.save_place_mark(
  p_group_id uuid,
  p_source_provider text,
  p_source_poi_id text,
  p_name text,
  p_branch_name text,
  p_address text,
  p_city text,
  p_district text,
  p_latitude numeric,
  p_longitude numeric,
  p_coordinate_system text,
  p_primary_category text,
  p_overall_rating numeric,
  p_would_recommend boolean,
  p_experience_attested boolean,
  p_first_visited_on date default null,
  p_last_visited_on date default null,
  p_short_review text default null,
  p_recommended_items text[] default '{}'::text[],
  p_price_per_person numeric default null,
  p_quality_rating numeric default null,
  p_value_rating numeric default null,
  p_environment_rating numeric default null,
  p_service_rating numeric default null,
  p_uniqueness_rating numeric default null,
  p_would_revisit public.revisit_preference default null
)
returns table (group_place_id uuid, place_id uuid, mark_id uuid, created_group_place boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_place_id uuid;
  v_group_place_id uuid;
  v_mark_id uuid;
  v_created_group_place boolean := false;
  v_created_mark boolean := false;
begin
  if v_user_id is null or not public.is_active_group_member(p_group_id, v_user_id) then
    raise exception 'active group membership required' using errcode = '42501';
  end if;
  if not p_experience_attested then
    raise exception 'real experience attestation is required' using errcode = '22023';
  end if;
  if p_source_provider not in ('amap', 'manual') or p_primary_category not in ('restaurant', 'cafe', 'drinks', 'bar', 'bakery_dessert', 'street_food', 'other_food_drink') then
    raise exception 'invalid place source or category' using errcode = '22023';
  end if;
  if p_source_provider = 'amap' and nullif(trim(p_source_poi_id), '') is null then
    raise exception 'amap poi id is required' using errcode = '22023';
  end if;

  if p_source_provider = 'amap' then
    insert into public.places (source_provider, source_poi_id, name, branch_name, address, city, district, latitude, longitude, coordinate_system)
    values ('amap', trim(p_source_poi_id), trim(p_name), nullif(trim(p_branch_name), ''), nullif(trim(p_address), ''), nullif(trim(p_city), ''), nullif(trim(p_district), ''), p_latitude, p_longitude, coalesce(p_coordinate_system, 'GCJ-02'))
    on conflict (source_provider, source_poi_id) where source_poi_id is not null do update
      set name = excluded.name, branch_name = excluded.branch_name, address = excluded.address,
          city = excluded.city, district = excluded.district, latitude = excluded.latitude,
          longitude = excluded.longitude, coordinate_system = excluded.coordinate_system
    returning id into v_place_id;
  else
    insert into public.places (source_provider, name, branch_name, address, city, district, latitude, longitude, coordinate_system)
    values ('manual', trim(p_name), nullif(trim(p_branch_name), ''), nullif(trim(p_address), ''), nullif(trim(p_city), ''), nullif(trim(p_district), ''), p_latitude, p_longitude, coalesce(p_coordinate_system, 'GCJ-02'))
    returning id into v_place_id;
  end if;

  insert into public.group_places (group_id, place_id, primary_category, created_by)
  values (p_group_id, v_place_id, p_primary_category, v_user_id)
  on conflict (group_id, place_id) do nothing
  returning id into v_group_place_id;

  if v_group_place_id is null then
    select existing_group_place.id into v_group_place_id
      from public.group_places as existing_group_place
      where existing_group_place.group_id = p_group_id
        and existing_group_place.place_id = v_place_id
      for update;
  else
    v_created_group_place := true;
  end if;

  select existing_mark.id into v_mark_id from public.place_marks as existing_mark
    where existing_mark.group_place_id = v_group_place_id and existing_mark.user_id = v_user_id and existing_mark.deleted_at is null for update;

  if v_mark_id is null then
    if not exists (select 1 from public.place_marks as current_mark where current_mark.group_place_id = v_group_place_id and current_mark.deleted_at is null) and not p_would_recommend then
      raise exception 'the first mark must recommend the place' using errcode = '22023';
    end if;
    insert into public.place_marks (
      group_place_id, user_id, overall_rating, quality_rating, value_rating, environment_rating,
      service_rating, uniqueness_rating, would_recommend, would_revisit, short_review,
      recommended_items, price_per_person, first_visited_on, last_visited_on, experience_attested_at
    ) values (
      v_group_place_id, v_user_id, p_overall_rating, p_quality_rating, p_value_rating, p_environment_rating,
      p_service_rating, p_uniqueness_rating, p_would_recommend, p_would_revisit, nullif(trim(p_short_review), ''),
      coalesce(p_recommended_items, '{}'::text[]), p_price_per_person, p_first_visited_on, p_last_visited_on, now()
    ) returning id into v_mark_id;
    v_created_mark := true;
    insert into public.visits (place_mark_id, user_id, visited_on, price_per_person)
    values (v_mark_id, v_user_id, coalesce(p_last_visited_on, p_first_visited_on), p_price_per_person);
  else
    update public.place_marks set
      overall_rating = p_overall_rating, quality_rating = p_quality_rating, value_rating = p_value_rating,
      environment_rating = p_environment_rating, service_rating = p_service_rating,
      uniqueness_rating = p_uniqueness_rating, would_recommend = p_would_recommend,
      would_revisit = p_would_revisit, short_review = nullif(trim(p_short_review), ''),
      recommended_items = coalesce(p_recommended_items, '{}'::text[]), price_per_person = p_price_per_person,
      first_visited_on = p_first_visited_on, last_visited_on = p_last_visited_on,
      experience_attested_at = now()
    where id = v_mark_id;
  end if;

  update public.group_places set first_mark_id = coalesce(first_mark_id, v_mark_id), status = 'active', archived_at = null
    where id = v_group_place_id;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_group_id, v_user_id, case when v_created_mark then 'place_mark.created' else 'place_mark.updated' end, 'place_mark', v_mark_id, jsonb_build_object('group_place_id', v_group_place_id));

  return query select v_group_place_id, v_place_id, v_mark_id, v_created_group_place;
end;
$$;
