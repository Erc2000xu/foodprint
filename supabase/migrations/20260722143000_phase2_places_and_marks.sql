-- Foodprint Phase 2: shared places, group places and real-experience marks.
-- All place inclusion is performed through save_place_mark so a map entry can
-- never exist without the first valid, attested mark.

create type public.group_place_status as enum ('active', 'inactive_no_marks', 'archived');
create type public.revisit_preference as enum ('yes', 'maybe', 'no');

create table public.places (
  id uuid primary key default gen_random_uuid(),
  source_provider text not null check (source_provider in ('amap', 'manual')),
  source_poi_id text,
  name text not null check (char_length(trim(name)) between 1 and 160),
  branch_name text,
  address text,
  province text,
  city text,
  district text,
  latitude numeric(10,7) not null check (latitude between -90 and 90),
  longitude numeric(10,7) not null check (longitude between -180 and 180),
  coordinate_system text not null default 'GCJ-02' check (coordinate_system in ('GCJ-02', 'WGS84')),
  provider_type_code text,
  phone text,
  raw_provider_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((source_provider = 'amap' and source_poi_id is not null) or source_provider = 'manual')
);

create unique index places_provider_poi_unique_idx
  on public.places (source_provider, source_poi_id)
  where source_poi_id is not null;

create table public.group_places (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete restrict,
  primary_category text not null check (primary_category in ('restaurant', 'cafe', 'drinks', 'bar', 'bakery_dessert', 'street_food', 'other_food_drink')),
  status public.group_place_status not null default 'active',
  created_by uuid not null references public.profiles(id) on delete restrict,
  first_mark_id uuid,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (group_id, place_id),
  check ((status = 'archived') = (archived_at is not null))
);

create table public.place_marks (
  id uuid primary key default gen_random_uuid(),
  group_place_id uuid not null references public.group_places(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  overall_rating numeric(2,1) not null check (overall_rating between 1 and 5 and mod(overall_rating * 2, 1) = 0),
  quality_rating numeric(2,1) check (quality_rating is null or (quality_rating between 1 and 5 and mod(quality_rating * 2, 1) = 0)),
  value_rating numeric(2,1) check (value_rating is null or (value_rating between 1 and 5 and mod(value_rating * 2, 1) = 0)),
  environment_rating numeric(2,1) check (environment_rating is null or (environment_rating between 1 and 5 and mod(environment_rating * 2, 1) = 0)),
  service_rating numeric(2,1) check (service_rating is null or (service_rating between 1 and 5 and mod(service_rating * 2, 1) = 0)),
  uniqueness_rating numeric(2,1) check (uniqueness_rating is null or (uniqueness_rating between 1 and 5 and mod(uniqueness_rating * 2, 1) = 0)),
  would_recommend boolean not null,
  would_revisit public.revisit_preference,
  short_review text check (short_review is null or char_length(short_review) <= 1000),
  recommended_items text[] not null default '{}'::text[],
  price_per_person numeric(10,2) check (price_per_person is null or price_per_person >= 0),
  currency char(3) not null default 'CNY',
  first_visited_on date,
  last_visited_on date,
  experience_attested_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (first_visited_on is null or last_visited_on is null or first_visited_on <= last_visited_on)
);

create unique index place_marks_one_current_mark_per_user_idx
  on public.place_marks (group_place_id, user_id)
  where deleted_at is null;

alter table public.group_places
  add constraint group_places_first_mark_fk
  foreign key (first_mark_id) references public.place_marks(id) on delete set null;

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  place_mark_id uuid not null references public.place_marks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  visited_on date,
  price_per_person numeric(10,2) check (price_per_person is null or price_per_person >= 0),
  currency char(3) not null default 'CNY',
  companions_note text check (companions_note is null or char_length(companions_note) <= 280),
  visit_note text check (visit_note is null or char_length(visit_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index group_places_group_status_idx on public.group_places (group_id, status, created_at desc);
create index place_marks_group_place_current_idx on public.place_marks (group_place_id, updated_at desc) where deleted_at is null;
create index visits_mark_current_idx on public.visits (place_mark_id, created_at desc) where deleted_at is null;

create trigger places_set_updated_at before update on public.places for each row execute function public.set_updated_at();
create trigger group_places_set_updated_at before update on public.group_places for each row execute function public.set_updated_at();
create trigger place_marks_set_updated_at before update on public.place_marks for each row execute function public.set_updated_at();
create trigger visits_set_updated_at before update on public.visits for each row execute function public.set_updated_at();

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
    select id into v_group_place_id from public.group_places where group_id = p_group_id and place_id = v_place_id for update;
  else
    v_created_group_place := true;
  end if;

  select id into v_mark_id from public.place_marks
    where group_place_id = v_group_place_id and user_id = v_user_id and deleted_at is null for update;

  if v_mark_id is null then
    if not exists (select 1 from public.place_marks where group_place_id = v_group_place_id and deleted_at is null) and not p_would_recommend then
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

alter table public.places enable row level security;
alter table public.group_places enable row level security;
alter table public.place_marks enable row level security;
alter table public.visits enable row level security;

create policy "members read places in their group" on public.places for select to authenticated using (
  exists (select 1 from public.group_places gp where gp.place_id = places.id and public.is_active_group_member(gp.group_id))
);
create policy "members read group places" on public.group_places for select to authenticated using (public.is_active_group_member(group_id));
create policy "members read group place marks" on public.place_marks for select to authenticated using (
  exists (select 1 from public.group_places gp where gp.id = place_marks.group_place_id and public.is_active_group_member(gp.group_id))
);
create policy "members read visits in their group" on public.visits for select to authenticated using (
  exists (select 1 from public.place_marks mark join public.group_places gp on gp.id = mark.group_place_id where mark.id = visits.place_mark_id and public.is_active_group_member(gp.group_id))
);

create or replace view public.group_place_stats with (security_invoker = true) as
  select gp.id as group_place_id, gp.group_id, gp.place_id, gp.primary_category, gp.status,
    avg(mark.overall_rating) filter (where mark.deleted_at is null) as average_rating,
    count(distinct mark.user_id) filter (where mark.deleted_at is null) as mark_count,
    count(distinct mark.user_id) filter (where mark.deleted_at is null and mark.would_recommend) as recommend_count,
    max(mark.updated_at) filter (where mark.deleted_at is null) as last_marked_at
  from public.group_places gp
  left join public.place_marks mark on mark.group_place_id = gp.id
  group by gp.id;

create or replace view public.group_place_member_summary with (security_invoker = true) as
  select mark.group_place_id,
    array_agg(mark.user_id order by mark.updated_at desc) filter (where mark.deleted_at is null) as member_ids,
    array_agg(profile.display_name order by mark.updated_at desc) filter (where mark.deleted_at is null) as member_names
  from public.place_marks mark
  join public.profiles profile on profile.id = mark.user_id
  group by mark.group_place_id;

revoke all on table public.places, public.group_places, public.place_marks, public.visits from anon, authenticated;
grant select on table public.places, public.group_places, public.place_marks, public.visits to authenticated;
revoke all on function public.save_place_mark(uuid, text, text, text, text, text, text, text, numeric, numeric, text, text, numeric, boolean, boolean, date, date, text, text[], numeric, numeric, numeric, numeric, numeric, numeric, public.revisit_preference) from public, anon;
grant execute on function public.save_place_mark(uuid, text, text, text, text, text, text, text, numeric, numeric, text, text, numeric, boolean, boolean, date, date, text, text[], numeric, numeric, numeric, numeric, numeric, numeric, public.revisit_preference) to authenticated;
grant select on public.group_place_stats, public.group_place_member_summary to authenticated;
