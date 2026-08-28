-- Foodprint V2.4.2: nearby-first discovery, scalable management reads, and
-- per-visit price. This migration is forward-only and intentionally leaves
-- every published V1/V2 RPC signature intact for rollback to the old client.

alter table public.visit_records
  add column if not exists price_per_person numeric(10,2);

-- Backfill only the deterministic V1.3 linkage. legacy_visit_id is unique on
-- visit_records, so this cannot fan one legacy visit into multiple records;
-- records without that one-to-one link stay NULL rather than guessing.
do $$
declare
  v_legacy_count integer := 0;
begin
  update public.visit_records as visit_record
  set price_per_person = legacy_visit.price_per_person
  from public.visits as legacy_visit
  where visit_record.price_per_person is null
    and visit_record.legacy_visit_id = legacy_visit.id
    and legacy_visit.price_per_person is not null
    and legacy_visit.price_per_person >= 1
    and legacy_visit.price_per_person <= 99999
    and round(legacy_visit.price_per_person, 2) = legacy_visit.price_per_person;
  get diagnostics v_legacy_count = row_count;
  raise notice 'v2.4.2 price backfill from legacy_visit_id: % rows', v_legacy_count;
end;
$$;

alter table public.visit_records
  drop constraint if exists visit_records_price_per_person_valid;
alter table public.visit_records
  add constraint visit_records_price_per_person_valid
  check (
    price_per_person is null
    or (
      price_per_person >= 1
      and price_per_person <= 99999
      and round(price_per_person, 2) = price_per_person
    )
  );

create index if not exists visit_records_price_summary_idx
  on public.visit_records (group_place_id, visited_on desc, created_at desc)
  where deleted_at is null and hidden_at is null and price_per_person is not null;

create index if not exists group_places_management_keyset_v2_4_2_idx
  on public.group_places (group_id, status, updated_at desc, id desc);
create index if not exists place_candidates_management_keyset_v2_4_2_idx
  on public.place_candidates (group_id, status, updated_at desc, id desc);
create index if not exists visit_records_hidden_keyset_v2_4_2_idx
  on public.visit_records (group_place_id, hidden_at desc, id desc)
  where deleted_at is null and hidden_at is not null;
create index if not exists photos_hidden_keyset_v2_4_2_idx
  on public.photos (group_place_id, hidden_at desc, id desc)
  where deleted_at is null and hidden_at is not null;

-- V2.4.2 write path. The old record_place_visit remains available to an
-- older client; only this version can write the authoritative visit price.
create function public.record_place_visit_v2_4_2(
  p_group_place_id uuid,
  p_visited_on date,
  p_opinion_changed boolean,
  p_strength smallint default null,
  p_tags text[] default null,
  p_note text default null,
  p_dishes text[] default '{}'::text[],
  p_is_anonymous boolean default false,
  p_price_per_person numeric default null
)
returns table (visit_record_id uuid, current_opinion_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_group_id uuid;
  v_opinion public.current_opinions;
  v_tags text[] := array(
    select distinct trim(tag)
    from unnest(coalesce(p_tags, '{}'::text[])) as tag
    where nullif(trim(tag), '') is not null
    order by trim(tag)
  );
  v_dishes text[] := array(
    select distinct trim(dish)
    from unnest(coalesce(p_dishes, '{}'::text[])) as dish
    where nullif(trim(dish), '') is not null
    order by trim(dish)
  );
  v_visit_id uuid;
begin
  select group_place.group_id into v_group_id
  from public.group_places as group_place
  where group_place.id = p_group_place_id and group_place.status = 'active'
  for share;

  if v_user_id is null or v_group_id is null or not public.is_active_group_member(v_group_id, v_user_id) then
    raise exception 'active group membership required' using errcode = '42501';
  end if;
  if p_visited_on is null or p_visited_on > current_date then
    raise exception 'a valid past or current visit date is required' using errcode = '22023';
  end if;
  if p_price_per_person is not null and (
    p_price_per_person < 1
    or p_price_per_person > 99999
    or round(p_price_per_person, 2) <> p_price_per_person
  ) then
    raise exception 'price per person must be between 1 and 99999 with at most two decimals' using errcode = '22023';
  end if;
  if char_length(coalesce(trim(p_note), '')) > 1000 or cardinality(v_dishes) > 12 then
    raise exception 'visit content is outside the allowed limits' using errcode = '22023';
  end if;

  select * into v_opinion
  from public.current_opinions
  where group_place_id = p_group_place_id and user_id = v_user_id
  for update;

  if not found or p_opinion_changed then
    if coalesce(p_strength not between 1 and 3, true)
      or cardinality(v_tags) not between 1 and 4
      or not (v_tags <@ array['tasty', 'comfortable', 'good_for_chat', 'good_value']::text[]) then
      raise exception 'a strength and one to four valid opinion tags are required' using errcode = '22023';
    end if;
    insert into public.current_opinions (
      group_place_id, user_id, strength, tags, is_anonymous, first_visited_on, last_visited_on
    )
    values (p_group_place_id, v_user_id, p_strength, v_tags, p_is_anonymous, p_visited_on, p_visited_on)
    on conflict (group_place_id, user_id) do update set
      strength = excluded.strength,
      tags = excluded.tags,
      is_anonymous = excluded.is_anonymous,
      first_visited_on = least(coalesce(current_opinions.first_visited_on, excluded.first_visited_on), excluded.first_visited_on),
      last_visited_on = greatest(coalesce(current_opinions.last_visited_on, excluded.last_visited_on), excluded.last_visited_on)
    returning * into v_opinion;
  else
    update public.current_opinions set
      first_visited_on = least(coalesce(first_visited_on, p_visited_on), p_visited_on),
      last_visited_on = greatest(coalesce(last_visited_on, p_visited_on), p_visited_on)
    where id = v_opinion.id
    returning * into v_opinion;
  end if;

  insert into public.visit_records (
    group_place_id, user_id, visited_on, strength, tags, is_anonymous, note, dishes, price_per_person
  )
  values (
    p_group_place_id, v_user_id, p_visited_on, v_opinion.strength, v_opinion.tags,
    p_is_anonymous, nullif(trim(p_note), ''), v_dishes, p_price_per_person
  )
  returning id into v_visit_id;

  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    v_group_id, v_user_id, 'visit_record.created', 'visit_record', v_visit_id,
    jsonb_build_object('group_place_id', p_group_place_id, 'opinion_changed', p_opinion_changed, 'is_anonymous', p_is_anonymous)
  );

  return query select v_visit_id, v_opinion.id;
end;
$$;

-- First-mark flow is copied into a new version so it can pass the optional
-- price atomically while preserving candidate promotion and audit behavior.
create function public.save_candidate_promotion_mark_v2_4_2(
  p_group_id uuid, p_source_provider text, p_source_poi_id text, p_name text,
  p_branch_name text, p_address text, p_city text, p_district text,
  p_latitude numeric, p_longitude numeric, p_coordinate_system text,
  p_primary_category text, p_overall_rating numeric, p_would_recommend boolean,
  p_experience_attested boolean, p_visited_on date, p_short_review text,
  p_recommended_items text[], p_cuisine_slugs text[], p_strength smallint,
  p_tags text[], p_is_anonymous boolean, p_price_per_person numeric default null
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
  if p_price_per_person is not null and (
    p_price_per_person < 1
    or p_price_per_person > 99999
    or round(p_price_per_person, 2) <> p_price_per_person
  ) then
    raise exception 'price per person must be between 1 and 99999 with at most two decimals' using errcode = '22023';
  end if;

  select * into v_mark from public.save_place_mark(
    p_group_id, p_source_provider, p_source_poi_id, p_name, p_branch_name,
    p_address, p_city, p_district, p_latitude, p_longitude, p_coordinate_system,
    p_primary_category, p_overall_rating, p_would_recommend, p_experience_attested,
    p_visited_on, p_visited_on, p_short_review, coalesce(p_recommended_items, '{}'::text[]),
    p_price_per_person, null, null, null, null, null, null
  );

  perform public.set_group_place_cuisines(v_mark.group_place_id, coalesce(p_cuisine_slugs, '{}'::text[]));
  select * into v_visit from public.record_place_visit_v2_4_2(
    v_mark.group_place_id, p_visited_on, true, p_strength, p_tags,
    p_short_review, coalesce(p_recommended_items, '{}'::text[]), coalesce(p_is_anonymous, false), p_price_per_person
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
    values (
      p_group_id, auth.uid(), 'place_candidate.promoted', 'place_candidate', v_candidate_id,
      jsonb_build_object('group_place_id', v_mark.group_place_id, 'mark_id', v_mark.mark_id, 'visit_record_id', v_visit.visit_record_id)
    );
  end loop;

  return query select v_mark.group_place_id, v_mark.place_id, v_mark.mark_id, v_visit.visit_record_id, v_promoted_count;
end;
$$;

-- The V2.4.2 discovery index preserves the V2.4 photo fallback and pagination
-- by wrapping the current V2.3 function, replacing only the price projection.
create function public.list_discovery_index_v2_4_2(
  p_limit integer default 100,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  group_place_id uuid,
  place_name text,
  primary_category text,
  address text,
  city text,
  district text,
  latitude numeric,
  longitude numeric,
  coordinate_system text,
  average_rating numeric,
  mark_count bigint,
  recommend_count bigint,
  price_per_person numeric,
  avg_price_per_person numeric,
  price_sample_count bigint,
  short_review text,
  recommended_items text[],
  cuisine_slugs text[],
  scene_tags text[],
  geo_entity_ids uuid[],
  geo_labels text[],
  business_area_name text,
  business_area_adcode text,
  last_marked_at timestamptz,
  bowl_strength smallint,
  friend_count bigint,
  tasty_count bigint,
  comfortable_count bigint,
  good_for_chat_count bigint,
  good_value_count bigint,
  saved_for_later boolean,
  cover_photo_id uuid,
  cover_photo_width integer,
  cover_photo_height integer,
  next_cursor_created_at timestamptz,
  next_cursor_id uuid,
  has_more boolean
)
language sql
security definer
stable
set search_path = public
as $$
  with base as (
    select *
    from public.list_discovery_index_v2_3(p_limit, p_before_created_at, p_before_id)
  ),
  price_summary as (
    select
      visit.group_place_id,
      round(avg(visit.price_per_person), 2)::numeric as avg_price_per_person,
      count(*)::bigint as price_sample_count
    from public.visit_records as visit
    join base on base.group_place_id = visit.group_place_id
    where visit.price_per_person is not null
      and visit.deleted_at is null
      and visit.hidden_at is null
    group by visit.group_place_id
  )
  select
    base.group_place_id,
    base.place_name,
    base.primary_category,
    base.address,
    base.city,
    base.district,
    base.latitude,
    base.longitude,
    base.coordinate_system,
    base.average_rating,
    base.mark_count,
    base.recommend_count,
    price_summary.avg_price_per_person,
    price_summary.avg_price_per_person,
    coalesce(price_summary.price_sample_count, 0)::bigint,
    base.short_review,
    base.recommended_items,
    base.cuisine_slugs,
    base.scene_tags,
    base.geo_entity_ids,
    base.geo_labels,
    base.business_area_name,
    base.business_area_adcode,
    base.last_marked_at,
    base.bowl_strength,
    base.friend_count,
    base.tasty_count,
    base.comfortable_count,
    base.good_for_chat_count,
    base.good_value_count,
    base.saved_for_later,
    base.cover_photo_id,
    base.cover_photo_width,
    base.cover_photo_height,
    base.next_cursor_created_at,
    base.next_cursor_id,
    base.has_more
  from base
  left join price_summary on price_summary.group_place_id = base.group_place_id;
$$;

-- The detail read model adds the same aggregate and enriches only the already
-- authorized timeline rows. It never exposes hidden/deleted records.
create function public.get_group_place_detail_v2_4_2(
  p_group_place_id uuid,
  p_timeline_limit integer default 20
)
returns table (
  group_place_id uuid,
  group_id uuid,
  place_id uuid,
  primary_category text,
  place_status public.group_place_status,
  group_name text,
  place_name text,
  branch_name text,
  address text,
  city text,
  district text,
  latitude numeric,
  longitude numeric,
  phone text,
  average_rating numeric,
  mark_count bigint,
  recommend_count bigint,
  avg_price_per_person numeric,
  price_sample_count bigint,
  bowl_strength smallint,
  friend_count bigint,
  tasty_count bigint,
  comfortable_count bigint,
  good_for_chat_count bigint,
  good_value_count bigint,
  timeline jsonb,
  gallery_thumbnail_object_keys text[]
)
language sql
security definer
stable
set search_path = public
as $$
  with base as (
    select *
    from public.get_group_place_detail_v2(p_group_place_id, p_timeline_limit)
  ),
  price_summary as (
    select
      visit.group_place_id,
      round(avg(visit.price_per_person), 2)::numeric as avg_price_per_person,
      count(*)::bigint as price_sample_count
    from public.visit_records as visit
    where visit.group_place_id = p_group_place_id
      and visit.price_per_person is not null
      and visit.deleted_at is null
      and visit.hidden_at is null
    group by visit.group_place_id
  ),
  enriched as (
    select
      base.group_place_id,
      coalesce((
        select jsonb_agg(
          item.value || jsonb_build_object('price_per_person', visit.price_per_person)
          order by item.ordinality
        )
        from jsonb_array_elements(base.timeline) with ordinality as item(value, ordinality)
        left join public.visit_records as visit on visit.id = (item.value ->> 'visit_record_id')::uuid
      ), '[]'::jsonb) as timeline
    from base
  )
  select
    base.group_place_id,
    base.group_id,
    base.place_id,
    base.primary_category,
    base.place_status,
    base.group_name,
    base.place_name,
    base.branch_name,
    base.address,
    base.city,
    base.district,
    base.latitude,
    base.longitude,
    base.phone,
    base.average_rating,
    base.mark_count,
    base.recommend_count,
    price_summary.avg_price_per_person,
    coalesce(price_summary.price_sample_count, 0)::bigint,
    base.bowl_strength,
    base.friend_count,
    base.tasty_count,
    base.comfortable_count,
    base.good_for_chat_count,
    base.good_value_count,
    coalesce(enriched.timeline, base.timeline),
    base.gallery_thumbnail_object_keys
  from base
  left join price_summary on price_summary.group_place_id = base.group_place_id
  left join enriched on enriched.group_place_id = base.group_place_id;
$$;

-- A versioned export keeps the old personal export callable while making the
-- new authoritative visit price explicit through to_jsonb(visit_record).
create function public.export_my_v2_4_2_records(p_group_id uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'current_opinions', coalesce((
      select jsonb_agg(to_jsonb(opinion) order by opinion.updated_at desc)
      from public.current_opinions as opinion
      join public.group_places as group_place on group_place.id = opinion.group_place_id
      where group_place.group_id = p_group_id and opinion.user_id = auth.uid()
    ), '[]'::jsonb),
    'visit_records', coalesce((
      select jsonb_agg(to_jsonb(visit_record) order by visit_record.created_at desc)
      from public.visit_records as visit_record
      join public.group_places as group_place on group_place.id = visit_record.group_place_id
      where group_place.group_id = p_group_id and visit_record.user_id = auth.uid()
    ), '[]'::jsonb)
  )
  where public.is_active_group_member(p_group_id);
$$;

-- Management counts are intentionally server-side and current-group scoped.
create function public.get_group_content_management_counts_v2_4_2()
returns table (active_place_count bigint, archived_place_count bigint, candidate_count bigint, hidden_content_count bigint)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_group_id uuid;
begin
  select context.group_id into v_group_id
  from public.get_active_group_context_v2() as context
  where context.role in ('owner'::public.group_role, 'admin'::public.group_role);
  if v_group_id is null then
    raise exception 'owner or admin role required' using errcode = '42501';
  end if;

  return query
  select
    count(*) filter (where group_place.status = 'active')::bigint,
    count(*) filter (where group_place.status = 'archived')::bigint,
    (select count(*)::bigint from public.place_candidates candidate where candidate.group_id = v_group_id and candidate.status in ('pending', 'dismissed')),
    (
      (select count(*) from public.visit_records visit join public.group_places group_place on group_place.id = visit.group_place_id where group_place.group_id = v_group_id and visit.deleted_at is null and visit.hidden_at is not null)
      + (select count(*) from public.photos photo where photo.group_id = v_group_id and photo.deleted_at is null and photo.hidden_at is not null)
    )::bigint
  from public.group_places as group_place
  where group_place.group_id = v_group_id;
end;
$$;

create function public.list_group_place_management_v2_4_2(
  p_status text default 'active',
  p_query text default null,
  p_limit integer default 20,
  p_cursor_sort_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (items jsonb, next_cursor jsonb, has_more boolean, total_count bigint)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_group_id uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_query text := nullif(regexp_replace(lower(trim(coalesce(p_query, ''))), '\s+', '', 'g'), '');
begin
  if p_status not in ('active', 'archived') then
    raise exception 'management status must be active or archived' using errcode = '22023';
  end if;
  if (p_cursor_sort_at is null) <> (p_cursor_id is null) then
    raise exception 'both management cursor fields are required' using errcode = '22023';
  end if;
  select context.group_id into v_group_id
  from public.get_active_group_context_v2() as context
  where context.role in ('owner'::public.group_role, 'admin'::public.group_role);
  if v_group_id is null then
    raise exception 'owner or admin role required' using errcode = '42501';
  end if;

  return query
  with matches as (
    select
      group_place.id as group_place_id,
      place.name as place_name,
      place.address,
      group_place.primary_category,
      group_place.status,
      group_place.archived_at,
      group_place.archived_reason,
      archived_by.display_name as archived_by_name,
      group_place.updated_at as sort_at,
      (
        select count(*) from public.current_opinions opinion
        where opinion.group_place_id = group_place.id
      )::bigint as opinion_count,
      (
        select count(*) from public.visit_records visit
        where visit.group_place_id = group_place.id and visit.deleted_at is null
      )::bigint as visit_count,
      (
        select count(*) from public.photos photo
        where photo.group_place_id = group_place.id and photo.deleted_at is null
      )::bigint as photo_count
    from public.group_places as group_place
    join public.places as place on place.id = group_place.place_id
    left join public.profiles as archived_by on archived_by.id = group_place.archived_by
    where group_place.group_id = v_group_id
      and group_place.status::text = p_status
      and (
        v_query is null
        or regexp_replace(lower(coalesce(place.name, '')), '\s+', '', 'g') like '%' || v_query || '%'
        or regexp_replace(lower(coalesce(place.address, '')), '\s+', '', 'g') like '%' || v_query || '%'
      )
  ),
  paged as (
    select * from matches
    where p_cursor_sort_at is null or (sort_at, group_place_id) < (p_cursor_sort_at, p_cursor_id)
    order by sort_at desc, group_place_id desc
    limit v_limit + 1
  ),
  page as (
    select * from paged order by sort_at desc, group_place_id desc limit v_limit
  )
  select
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'group_place_id', row.group_place_id,
        'place_name', row.place_name,
        'address', row.address,
        'primary_category', row.primary_category,
        'status', row.status,
        'archived_at', row.archived_at,
        'archived_reason', row.archived_reason,
        'archived_by_name', row.archived_by_name,
        'sort_at', row.sort_at,
        'opinion_count', row.opinion_count,
        'visit_count', row.visit_count,
        'photo_count', row.photo_count
      ) order by row.sort_at desc, row.group_place_id desc)
      from page as row
    ), '[]'::jsonb),
    case when (select count(*) from paged) > v_limit then (
      select jsonb_build_object('sort_at', row.sort_at, 'id', row.group_place_id)
      from page as row order by row.sort_at asc, row.group_place_id asc limit 1
    ) else null end,
    (select count(*) from paged) > v_limit,
    (select count(*)::bigint from matches);
end;
$$;

create function public.list_group_candidate_management_v2_4_2(
  p_status text default 'pending',
  p_query text default null,
  p_limit integer default 20,
  p_cursor_sort_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (items jsonb, next_cursor jsonb, has_more boolean, total_count bigint)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_group_id uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_query text := nullif(regexp_replace(lower(trim(coalesce(p_query, ''))), '\s+', '', 'g'), '');
begin
  if p_status not in ('pending', 'dismissed') then
    raise exception 'candidate status must be pending or dismissed' using errcode = '22023';
  end if;
  if (p_cursor_sort_at is null) <> (p_cursor_id is null) then
    raise exception 'both management cursor fields are required' using errcode = '22023';
  end if;
  select context.group_id into v_group_id
  from public.get_active_group_context_v2() as context
  where context.role in ('owner'::public.group_role, 'admin'::public.group_role);
  if v_group_id is null then
    raise exception 'owner or admin role required' using errcode = '42501';
  end if;

  return query
  with matches as (
    select
      candidate.id as candidate_id,
      place.name as place_name,
      place.address,
      candidate.status,
      candidate.created_at,
      candidate.resolved_at,
      candidate.resolution_type,
      candidate.resolution_reason,
      coalesce(candidate.resolved_at, candidate.updated_at, candidate.created_at) as sort_at
    from public.place_candidates as candidate
    join public.places as place on place.id = candidate.place_id
    where candidate.group_id = v_group_id
      and candidate.status::text = p_status
      and (
        v_query is null
        or regexp_replace(lower(coalesce(place.name, '')), '\s+', '', 'g') like '%' || v_query || '%'
        or regexp_replace(lower(coalesce(place.address, '')), '\s+', '', 'g') like '%' || v_query || '%'
      )
  ),
  paged as (
    select * from matches
    where p_cursor_sort_at is null or (sort_at, candidate_id) < (p_cursor_sort_at, p_cursor_id)
    order by sort_at desc, candidate_id desc
    limit v_limit + 1
  ),
  page as (
    select * from paged order by sort_at desc, candidate_id desc limit v_limit
  )
  select
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'candidate_id', row.candidate_id,
        'place_name', row.place_name,
        'address', row.address,
        'status', row.status,
        'created_at', row.created_at,
        'resolved_at', row.resolved_at,
        'resolution_type', row.resolution_type,
        'resolution_reason', row.resolution_reason,
        'sort_at', row.sort_at
      ) order by row.sort_at desc, row.candidate_id desc)
      from page as row
    ), '[]'::jsonb),
    case when (select count(*) from paged) > v_limit then (
      select jsonb_build_object('sort_at', row.sort_at, 'id', row.candidate_id)
      from page as row order by row.sort_at asc, row.candidate_id asc limit 1
    ) else null end,
    (select count(*) from paged) > v_limit,
    (select count(*)::bigint from matches);
end;
$$;

create function public.list_group_hidden_content_v2_4_2(
  p_status text default 'hidden',
  p_query text default null,
  p_limit integer default 20,
  p_cursor_sort_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (items jsonb, next_cursor jsonb, has_more boolean, total_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_query text := nullif(regexp_replace(lower(trim(coalesce(p_query, ''))), '\s+', '', 'g'), '');
begin
  if p_status <> 'hidden' then
    raise exception 'hidden content status must be hidden' using errcode = '22023';
  end if;
  if (p_cursor_sort_at is null) <> (p_cursor_id is null) then
    raise exception 'both management cursor fields are required' using errcode = '22023';
  end if;
  select context.group_id into v_group_id
  from public.get_active_group_context_v2() as context
  where context.role in ('owner'::public.group_role, 'admin'::public.group_role);
  if v_group_id is null then
    raise exception 'owner or admin role required' using errcode = '42501';
  end if;

  return query
  with matches as (
    select
      visit.id as content_id,
      'visit'::text as content_type,
      visit.group_place_id,
      place.name as place_name,
      place.address,
      visit.hidden_at,
      visit.hidden_reason,
      visit.hidden_at as sort_at
    from public.visit_records as visit
    join public.group_places as group_place on group_place.id = visit.group_place_id
    join public.places as place on place.id = group_place.place_id
    where group_place.group_id = v_group_id
      and visit.deleted_at is null
      and visit.hidden_at is not null
      and (
        v_query is null
        or regexp_replace(lower(coalesce(place.name, '')), '\s+', '', 'g') like '%' || v_query || '%'
        or regexp_replace(lower(coalesce(place.address, '')), '\s+', '', 'g') like '%' || v_query || '%'
      )
    union all
    select
      photo.id as content_id,
      'photo'::text as content_type,
      photo.group_place_id,
      place.name as place_name,
      place.address,
      photo.hidden_at,
      photo.hidden_reason,
      photo.hidden_at as sort_at
    from public.photos as photo
    join public.group_places as group_place on group_place.id = photo.group_place_id
    join public.places as place on place.id = group_place.place_id
    where photo.group_id = v_group_id
      and photo.deleted_at is null
      and photo.hidden_at is not null
      and (
        v_query is null
        or regexp_replace(lower(coalesce(place.name, '')), '\s+', '', 'g') like '%' || v_query || '%'
        or regexp_replace(lower(coalesce(place.address, '')), '\s+', '', 'g') like '%' || v_query || '%'
      )
  ),
  paged as (
    select * from matches
    where p_cursor_sort_at is null or (sort_at, content_id) < (p_cursor_sort_at, p_cursor_id)
    order by sort_at desc, content_id desc
    limit v_limit + 1
  ),
  page as (
    select * from paged order by sort_at desc, content_id desc limit v_limit
  )
  select
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'content_id', row.content_id,
        'content_type', row.content_type,
        'group_place_id', row.group_place_id,
        'place_name', row.place_name,
        'address', row.address,
        'hidden_at', row.hidden_at,
        'hidden_reason', row.hidden_reason,
        'sort_at', row.sort_at
      ) order by row.sort_at desc, row.content_id desc)
      from page as row
    ), '[]'::jsonb),
    case when (select count(*) from paged) > v_limit then (
      select jsonb_build_object('sort_at', row.sort_at, 'id', row.content_id)
      from page as row order by row.sort_at asc, row.content_id asc limit 1
    ) else null end,
    (select count(*) from paged) > v_limit,
    (select count(*)::bigint from matches);
end;
$$;

-- Forward-only SQL hygiene for existing rollback-compatible management paths.
-- Keep the public signatures and behavior unchanged; qualify the two column
-- references that Supabase's schema linter flags as ambiguous.
create or replace function public.delete_my_visit_record(p_visit_record_id uuid)
returns table (group_place_id uuid, object_keys text[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_group_id uuid;
  v_group_place_id uuid;
  v_snapshot public.visit_records;
begin
  select gp.group_id, visit.group_place_id into v_group_id, v_group_place_id
  from public.visit_records visit
  join public.group_places gp on gp.id = visit.group_place_id
  where visit.id = p_visit_record_id and visit.user_id = v_user_id and visit.deleted_at is null
  for update of visit;
  if v_user_id is null or v_group_id is null or not public.is_active_group_member(v_group_id, v_user_id) then
    raise exception 'only an active author can delete this visit' using errcode = '42501';
  end if;
  update public.visit_records as visit_record
  set deleted_at = now()
  where visit_record.id = p_visit_record_id;
  select * into v_snapshot
  from public.visit_records as visit_record
  where visit_record.group_place_id = v_group_place_id
    and visit_record.user_id = v_user_id
    and visit_record.deleted_at is null
  order by visit_record.visited_on desc nulls last, visit_record.created_at desc
  limit 1
  for update;
  if found then
    update public.current_opinions as opinion
    set strength = v_snapshot.strength,
        tags = v_snapshot.tags,
        is_anonymous = v_snapshot.is_anonymous,
        first_visited_on = v_snapshot.visited_on,
        last_visited_on = v_snapshot.visited_on
    where opinion.group_place_id = v_group_place_id and opinion.user_id = v_user_id;
  else
    delete from public.current_opinions as opinion
    where opinion.group_place_id = v_group_place_id and opinion.user_id = v_user_id;
  end if;
  if not exists (
    select 1
    from public.current_opinions as opinion
    where opinion.group_place_id = v_group_place_id
  ) then
    update public.group_places
    set status = 'inactive_no_marks', archived_at = null, archived_by = null, archived_reason = null
    where id = v_group_place_id and status <> 'archived';
  end if;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id)
  values (v_group_id, v_user_id, 'visit_record.deleted', 'visit_record', p_visit_record_id);
  return query
  with deleted_photos as (
    update public.photos
    set deleted_at = now()
    where visit_record_id = p_visit_record_id and deleted_at is null
    returning object_key, thumbnail_object_key
  ), keys as (
    select object_key as object_key from deleted_photos
    union all
    select thumbnail_object_key from deleted_photos where thumbnail_object_key is not null
  )
  select v_group_place_id, coalesce(array_agg(keys.object_key), '{}'::text[]) from keys;
end;
$$;

create or replace function public.restore_group_place(p_group_place_id uuid)
returns table (previous_status public.group_place_status, current_status public.group_place_status, group_place_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_place public.group_places;
  v_next public.group_place_status;
begin
  select * into v_place from public.group_places where id = p_group_place_id for update;
  if not found then raise exception 'place not found' using errcode = '22023'; end if;
  if not public.has_group_role(v_place.group_id, array['owner'::public.group_role, 'admin'::public.group_role]) then
    raise exception 'owner or admin role required' using errcode = '42501';
  end if;
  if v_place.status <> 'archived' then raise exception 'place is not archived' using errcode = '22023'; end if;
  v_next := case when exists (
    select 1
    from public.current_opinions as opinion
    where opinion.group_place_id = v_place.id
  ) then 'active'::public.group_place_status else 'inactive_no_marks'::public.group_place_status end;
  update public.group_places
  set status = v_next, archived_at = null, archived_by = null, archived_reason = null
  where id = v_place.id;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_place.group_id, auth.uid(), 'group_place.restored', 'group_place', v_place.id, jsonb_build_object('previous_status', 'archived', 'current_status', v_next));
  return query select 'archived'::public.group_place_status, v_next, v_place.id;
end;
$$;

revoke all on function public.record_place_visit_v2_4_2(uuid, date, boolean, smallint, text[], text, text[], boolean, numeric) from public, anon;
revoke all on function public.save_candidate_promotion_mark_v2_4_2(uuid, text, text, text, text, text, text, text, numeric, numeric, text, text, numeric, boolean, boolean, date, text, text[], text[], smallint, text[], boolean, numeric) from public, anon;
revoke all on function public.list_discovery_index_v2_4_2(integer, timestamptz, uuid) from public, anon;
revoke all on function public.get_group_place_detail_v2_4_2(uuid, integer) from public, anon;
revoke all on function public.export_my_v2_4_2_records(uuid) from public, anon;
revoke all on function public.get_group_content_management_counts_v2_4_2() from public, anon;
revoke all on function public.list_group_place_management_v2_4_2(text, text, integer, timestamptz, uuid) from public, anon;
revoke all on function public.list_group_candidate_management_v2_4_2(text, text, integer, timestamptz, uuid) from public, anon;
revoke all on function public.list_group_hidden_content_v2_4_2(text, text, integer, timestamptz, uuid) from public, anon;

grant execute on function public.record_place_visit_v2_4_2(uuid, date, boolean, smallint, text[], text, text[], boolean, numeric) to authenticated;
grant execute on function public.save_candidate_promotion_mark_v2_4_2(uuid, text, text, text, text, text, text, text, numeric, numeric, text, text, numeric, boolean, boolean, date, text, text[], text[], smallint, text[], boolean, numeric) to authenticated;
grant execute on function public.list_discovery_index_v2_4_2(integer, timestamptz, uuid) to authenticated;
grant execute on function public.get_group_place_detail_v2_4_2(uuid, integer) to authenticated;
grant execute on function public.export_my_v2_4_2_records(uuid) to authenticated;
grant execute on function public.get_group_content_management_counts_v2_4_2() to authenticated;
grant execute on function public.list_group_place_management_v2_4_2(text, text, integer, timestamptz, uuid) to authenticated;
grant execute on function public.list_group_candidate_management_v2_4_2(text, text, integer, timestamptz, uuid) to authenticated;
grant execute on function public.list_group_hidden_content_v2_4_2(text, text, integer, timestamptz, uuid) to authenticated;
