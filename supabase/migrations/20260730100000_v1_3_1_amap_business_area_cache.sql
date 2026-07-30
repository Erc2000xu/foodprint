-- Foodprint V1.3.1: refreshable AMap business-area display cache.
-- AMap remains the authority. This table is not a manually editable district
-- directory and must never be used to distribute provider data externally.

create type public.amap_business_area_cache_status as enum (
  'pending',
  'success',
  'not_found',
  'temporary_failure'
);

create table public.place_amap_business_area_cache (
  place_id uuid primary key references public.places(id) on delete cascade,
  status public.amap_business_area_cache_status not null,
  business_area_name text check (business_area_name is null or char_length(trim(business_area_name)) between 1 and 120),
  adcode text check (adcode is null or adcode ~ '^[0-9]{6}$'),
  center_latitude numeric(10,7) check (center_latitude is null or center_latitude between -90 and 90),
  center_longitude numeric(10,7) check (center_longitude is null or center_longitude between -180 and 180),
  queried_at timestamptz,
  last_attempt_at timestamptz not null default now(),
  next_refresh_after timestamptz,
  failure_count integer not null default 0 check (failure_count between 0 and 100),
  failure_category text check (failure_category is null or failure_category in ('provider_timeout', 'provider_auth_failure', 'provider_unavailable', 'network_failure')),
  updated_at timestamptz not null default now(),
  check (
    (status = 'success' and business_area_name is not null and adcode is not null and queried_at is not null)
    or (status = 'not_found' and business_area_name is null and queried_at is not null)
    or (status = 'temporary_failure' and business_area_name is null and failure_category is not null)
    or (status = 'pending' and business_area_name is null)
  )
);

create index place_amap_business_area_cache_due_idx
  on public.place_amap_business_area_cache (status, next_refresh_after, last_attempt_at);

create trigger place_amap_business_area_cache_set_updated_at
  before update on public.place_amap_business_area_cache
  for each row execute function public.set_updated_at();

alter table public.place_amap_business_area_cache enable row level security;

create policy "members read AMap business area cache for their places"
  on public.place_amap_business_area_cache
  for select to authenticated using (
    exists (
      select 1
      from public.group_places group_place
      where group_place.place_id = place_amap_business_area_cache.place_id
        and group_place.status <> 'archived'
        and public.is_active_group_member(group_place.group_id)
    )
    or exists (
      select 1
      from public.place_candidates candidate
      where candidate.place_id = place_amap_business_area_cache.place_id
        and candidate.status = 'pending'
        and public.is_active_group_member(candidate.group_id)
    )
  );

create or replace function public.list_amap_business_area_backfill_candidates(
  p_group_place_id uuid default null,
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
  select
    place.id,
    group_place.id,
    place.source_poi_id,
    place.latitude,
    place.longitude,
    coalesce(cache.failure_count, 0)
  from public.group_places group_place
  join public.places place on place.id = group_place.place_id
  left join public.place_amap_business_area_cache cache on cache.place_id = place.id
  where public.is_active_group_member(group_place.group_id)
    and group_place.status <> 'archived'
    and (p_group_place_id is null or group_place.id = p_group_place_id)
    and place.source_provider = 'amap'
    and place.source_poi_id is not null
    and place.coordinate_system = 'GCJ-02'
    and (
      cache.place_id is null
      or (cache.status = 'pending' and cache.last_attempt_at < now() - interval '10 minutes')
      or (cache.status in ('not_found', 'temporary_failure', 'success') and coalesce(cache.next_refresh_after, now()) <= now())
    )
  order by
    case when p_group_place_id is not null then 0 else 1 end,
    cache.last_attempt_at nulls first,
    group_place.created_at
  limit least(greatest(coalesce(p_limit, 3), 1), 5);
$$;

comment on table public.place_amap_business_area_cache is
  'Refreshable AMap reverse-geocode display cache; not a Foodprint-owned business-area directory.';

revoke all on table public.place_amap_business_area_cache from anon, authenticated;
grant select on table public.place_amap_business_area_cache to authenticated;
revoke all on function public.list_amap_business_area_backfill_candidates(uuid, integer) from public, anon;
grant execute on function public.list_amap_business_area_backfill_candidates(uuid, integer) to authenticated;
