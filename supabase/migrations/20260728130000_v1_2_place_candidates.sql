-- Foodprint V1.2: group-scoped places to try and their private verification lifecycle.
-- Candidates are confirmed AMap POIs but are not part of discovery until a member
-- records a real visit and explicitly promotes them.

create type public.place_candidate_status as enum ('pending', 'promoted', 'dismissed');

create table public.place_candidates (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete restrict,
  status public.place_candidate_status not null default 'pending',
  heard_from text check (heard_from is null or char_length(trim(heard_from)) <= 120),
  expectation text check (expectation is null or char_length(trim(expectation)) <= 280),
  created_by uuid not null references public.profiles(id) on delete restrict,
  resolved_by uuid references public.profiles(id) on delete restrict,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'pending') = (resolved_at is null and resolved_by is null))
);

create unique index place_candidates_one_pending_per_group_place_idx
  on public.place_candidates (group_id, place_id)
  where status = 'pending';
create index place_candidates_group_pending_created_idx
  on public.place_candidates (group_id, created_at desc)
  where status = 'pending';
create trigger place_candidates_set_updated_at before update on public.place_candidates for each row execute function public.set_updated_at();

-- Places attached only to a pending candidate are readable by that candidate's
-- group. Resolved negative candidates do not make a place broadly readable.
create policy "members read places in pending candidates" on public.places for select to authenticated using (
  exists (
    select 1 from public.place_candidates candidate
    where candidate.place_id = places.id
      and candidate.status = 'pending'
      and public.is_active_group_member(candidate.group_id)
  )
);

alter table public.place_candidates enable row level security;
create policy "members read pending place candidates" on public.place_candidates for select to authenticated using (
  status = 'pending' and public.is_active_group_member(group_id)
);

create or replace function public.create_place_candidate(
  p_group_id uuid,
  p_source_poi_id text,
  p_name text,
  p_address text,
  p_city text,
  p_district text,
  p_latitude numeric,
  p_longitude numeric,
  p_heard_from text default null,
  p_expectation text default null
)
returns table (candidate_id uuid, created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_place_id uuid;
  v_candidate_id uuid;
  v_created boolean := false;
begin
  if v_user_id is null or not public.is_active_group_member(p_group_id, v_user_id) then
    raise exception 'active group membership required' using errcode = '42501';
  end if;
  if nullif(trim(p_source_poi_id), '') is null or nullif(trim(p_name), '') is null then
    raise exception 'a confirmed amap poi is required' using errcode = '22023';
  end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'invalid poi coordinates' using errcode = '22023';
  end if;

  insert into public.places (source_provider, source_poi_id, name, address, city, district, latitude, longitude, coordinate_system)
  values ('amap', trim(p_source_poi_id), trim(p_name), nullif(trim(p_address), ''), nullif(trim(p_city), ''), nullif(trim(p_district), ''), p_latitude, p_longitude, 'GCJ-02')
  on conflict (source_provider, source_poi_id) where source_poi_id is not null do update
    set name = excluded.name, address = excluded.address, city = excluded.city, district = excluded.district,
        latitude = excluded.latitude, longitude = excluded.longitude, coordinate_system = excluded.coordinate_system
  returning id into v_place_id;

  if exists (select 1 from public.group_places where group_id = p_group_id and place_id = v_place_id and status <> 'archived') then
    raise exception 'this place is already recommended in the group' using errcode = '22023';
  end if;
  -- V1.2 deliberately has no re-try policy for a privately dismissed candidate.
  -- Keep the response neutral so this does not expose another member's outcome.
  if exists (select 1 from public.place_candidates where group_id = p_group_id and place_id = v_place_id and status = 'dismissed') then
    raise exception 'this place cannot be added again at this time' using errcode = '22023';
  end if;

  insert into public.place_candidates (group_id, place_id, heard_from, expectation, created_by)
  values (p_group_id, v_place_id, nullif(trim(p_heard_from), ''), nullif(trim(p_expectation), ''), v_user_id)
  on conflict (group_id, place_id) where status = 'pending' do nothing
  returning id into v_candidate_id;

  if v_candidate_id is null then
    select id into v_candidate_id from public.place_candidates
      where group_id = p_group_id and place_id = v_place_id and status = 'pending';
  else
    v_created := true;
    insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id)
    values (p_group_id, v_user_id, 'place_candidate.created', 'place_candidate', v_candidate_id);
  end if;

  return query select v_candidate_id, v_created;
end;
$$;

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
declare
  v_candidate public.place_candidates;
  v_user_id uuid := auth.uid();
  v_group_place_id uuid;
  v_status public.place_candidate_status;
begin
  select * into v_candidate from public.place_candidates where id = p_candidate_id for update;
  if not found then raise exception 'candidate not found' using errcode = '22023'; end if;
  if v_user_id is null or not public.is_active_group_member(v_candidate.group_id, v_user_id) then
    raise exception 'active group membership required' using errcode = '42501';
  end if;
  if v_candidate.status <> 'pending' then raise exception 'candidate has already been verified' using errcode = '22023'; end if;
  if not p_experience_attested then raise exception 'real experience attestation is required' using errcode = '22023'; end if;

  if p_would_recommend then
    insert into public.group_places (group_id, place_id, primary_category, status, created_by)
    values (v_candidate.group_id, v_candidate.place_id, 'restaurant', 'active', v_user_id)
    on conflict (group_id, place_id) do update set status = 'active', archived_at = null
    returning id into v_group_place_id;
    v_status := 'promoted';
  else
    v_status := 'dismissed';
  end if;

  update public.place_candidates
    set status = v_status, resolved_by = v_user_id, resolved_at = now()
    where id = v_candidate.id;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    v_candidate.group_id,
    v_user_id,
    case when p_would_recommend then 'place_candidate.promoted' else 'place_candidate.dismissed' end,
    'place_candidate',
    v_candidate.id,
    jsonb_build_object('group_place_id', v_group_place_id)
  );
  return query select v_group_place_id, v_status;
end;
$$;

create or replace function public.update_place_candidate(
  p_candidate_id uuid,
  p_heard_from text default null,
  p_expectation text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_candidate public.place_candidates;
begin
  select * into v_candidate from public.place_candidates where id = p_candidate_id for update;
  if not found or v_candidate.status <> 'pending' or v_candidate.created_by <> auth.uid()
    or not public.is_active_group_member(v_candidate.group_id, auth.uid()) then
    raise exception 'only the creator may edit a pending candidate' using errcode = '42501';
  end if;
  update public.place_candidates
    set heard_from = nullif(trim(p_heard_from), ''), expectation = nullif(trim(p_expectation), '')
    where id = p_candidate_id;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id)
  values (v_candidate.group_id, auth.uid(), 'place_candidate.updated', 'place_candidate', p_candidate_id);
end;
$$;

create or replace function public.delete_place_candidate(p_candidate_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_candidate public.place_candidates;
begin
  select * into v_candidate from public.place_candidates where id = p_candidate_id for update;
  if not found or v_candidate.status <> 'pending' or v_candidate.created_by <> auth.uid()
    or not public.is_active_group_member(v_candidate.group_id, auth.uid()) then
    raise exception 'only the creator may delete a pending candidate' using errcode = '42501';
  end if;
  delete from public.place_candidates where id = p_candidate_id;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id)
  values (v_candidate.group_id, auth.uid(), 'place_candidate.deleted', 'place_candidate', p_candidate_id);
end;
$$;

revoke all on table public.place_candidates from anon, authenticated;
grant select on table public.place_candidates to authenticated;
revoke all on function public.create_place_candidate(uuid, text, text, text, text, text, numeric, numeric, text, text) from public, anon;
revoke all on function public.resolve_place_candidate(uuid, boolean, boolean) from public, anon;
revoke all on function public.update_place_candidate(uuid, text, text) from public, anon;
revoke all on function public.delete_place_candidate(uuid) from public, anon;
grant execute on function public.create_place_candidate(uuid, text, text, text, text, text, numeric, numeric, text, text) to authenticated;
grant execute on function public.resolve_place_candidate(uuid, boolean, boolean) to authenticated;
grant execute on function public.update_place_candidate(uuid, text, text) to authenticated;
grant execute on function public.delete_place_candidate(uuid) to authenticated;
