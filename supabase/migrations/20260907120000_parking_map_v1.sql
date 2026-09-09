-- Foodprint Motorcycle Parking Map V1.
-- The feature is disabled until a release operator explicitly initializes a
-- verified existing owner account through initialize_parking_feature().

create table public.parking_feature_config (
  group_id uuid primary key references public.groups(id) on delete cascade,
  manager_user_id uuid not null references public.profiles(id) on delete restrict,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.parking_feature_access (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  granted_by uuid not null references public.profiles(id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (group_id, user_id)
);

create table public.parking_marks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  geometry_type text not null check (geometry_type in ('point', 'line', 'area')),
  coordinates jsonb not null,
  coordinate_system text not null default 'GCJ-02' check (coordinate_system = 'GCJ-02'),
  name text check (name is null or char_length(trim(name)) between 1 and 30),
  is_convenient boolean not null default false check (is_convenient is true),
  comment text check (comment is null or char_length(comment) <= 500),
  idempotency_key uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index parking_marks_idempotency_idx
  on public.parking_marks (group_id, created_by, idempotency_key);
create index parking_marks_group_updated_idx
  on public.parking_marks (group_id, updated_at desc, id desc)
  where deleted_at is null;
create index parking_feature_access_active_idx
  on public.parking_feature_access (group_id, user_id)
  where revoked_at is null;

create trigger parking_feature_config_set_updated_at
before update on public.parking_feature_config
for each row execute function public.set_updated_at();

create trigger parking_marks_set_updated_at
before update on public.parking_marks
for each row execute function public.set_updated_at();

create or replace function public.parking_coordinate_value(p_coordinate jsonb, p_index integer)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_value numeric;
begin
  if p_index not in (0, 1)
     or jsonb_typeof(p_coordinate) <> 'array'
     or jsonb_array_length(p_coordinate) <> 2
     or jsonb_typeof(p_coordinate -> p_index) <> 'number' then
    return null;
  end if;
  begin
    v_value := (p_coordinate ->> p_index)::numeric;
  exception when others then
    return null;
  end;
  return v_value;
end;
$$;

create or replace function public.parking_coordinate_is_valid(p_coordinate jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(
    public.parking_coordinate_value(p_coordinate, 0) between -180 and 180
    and public.parking_coordinate_value(p_coordinate, 1) between -90 and 90,
    false
  );
$$;

create or replace function public.parking_cross(
  p_a jsonb,
  p_b jsonb,
  p_c jsonb
)
returns numeric
language sql
immutable
set search_path = public
as $$
  select
    (public.parking_coordinate_value(p_b, 0) - public.parking_coordinate_value(p_a, 0))
      * (public.parking_coordinate_value(p_c, 1) - public.parking_coordinate_value(p_a, 1))
    - (public.parking_coordinate_value(p_b, 1) - public.parking_coordinate_value(p_a, 1))
      * (public.parking_coordinate_value(p_c, 0) - public.parking_coordinate_value(p_a, 0));
$$;

create or replace function public.parking_point_on_segment(
  p_a jsonb,
  p_b jsonb,
  p_point jsonb
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    public.parking_cross(p_a, p_b, p_point) = 0
    and public.parking_coordinate_value(p_point, 0) between least(public.parking_coordinate_value(p_a, 0), public.parking_coordinate_value(p_b, 0))
      and greatest(public.parking_coordinate_value(p_a, 0), public.parking_coordinate_value(p_b, 0))
    and public.parking_coordinate_value(p_point, 1) between least(public.parking_coordinate_value(p_a, 1), public.parking_coordinate_value(p_b, 1))
      and greatest(public.parking_coordinate_value(p_a, 1), public.parking_coordinate_value(p_b, 1));
$$;

create or replace function public.parking_segments_intersect(
  p_a jsonb,
  p_b jsonb,
  p_c jsonb,
  p_d jsonb
)
returns boolean
language sql
immutable
set search_path = public
as $$
  with segment_values as (
    select
      public.parking_cross(p_a, p_b, p_c) as cross_abc,
      public.parking_cross(p_a, p_b, p_d) as cross_abd,
      public.parking_cross(p_c, p_d, p_a) as cross_cda,
      public.parking_cross(p_c, p_d, p_b) as cross_cdb
  )
  select
    (segment_values.cross_abc = 0 and public.parking_point_on_segment(p_a, p_b, p_c))
    or (segment_values.cross_abd = 0 and public.parking_point_on_segment(p_a, p_b, p_d))
    or (segment_values.cross_cda = 0 and public.parking_point_on_segment(p_c, p_d, p_a))
    or (segment_values.cross_cdb = 0 and public.parking_point_on_segment(p_c, p_d, p_b))
    or ((segment_values.cross_abc > 0 and segment_values.cross_abd < 0 or segment_values.cross_abc < 0 and segment_values.cross_abd > 0)
      and (segment_values.cross_cda > 0 and segment_values.cross_cdb < 0 or segment_values.cross_cda < 0 and segment_values.cross_cdb > 0))
  from segment_values;
$$;

create or replace function public.parking_geometry_is_valid(
  p_geometry_type text,
  p_coordinates jsonb
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_count integer;
  v_index integer;
  v_other integer;
  v_area numeric := 0;
  v_x1 numeric;
  v_y1 numeric;
  v_x2 numeric;
  v_y2 numeric;
begin
  if p_geometry_type is null
     or p_coordinates is null
     or p_geometry_type not in ('point', 'line', 'area')
     or jsonb_typeof(p_coordinates) <> 'array' then
    return false;
  end if;

  if p_geometry_type = 'point' then
    return jsonb_array_length(p_coordinates) = 2
      and public.parking_coordinate_is_valid(p_coordinates);
  end if;

  v_count := jsonb_array_length(p_coordinates);
  if p_geometry_type = 'line' and (v_count < 2 or v_count > 100) then
    return false;
  end if;
  if p_geometry_type = 'area' and (v_count < 4 or v_count > 101) then
    return false;
  end if;

  for v_index in 0..v_count - 1 loop
    if not public.parking_coordinate_is_valid(p_coordinates -> v_index) then
      return false;
    end if;
  end loop;

  for v_index in 0..v_count - 2 loop
    if p_coordinates -> v_index = p_coordinates -> (v_index + 1) then
      return false;
    end if;
  end loop;

  if p_geometry_type = 'line' then
    for v_index in 0..v_count - 2 loop
      for v_other in v_index + 2..v_count - 2 loop
        if public.parking_segments_intersect(
          p_coordinates -> v_index,
          p_coordinates -> (v_index + 1),
          p_coordinates -> v_other,
          p_coordinates -> (v_other + 1)
        ) then
          return false;
        end if;
      end loop;
    end loop;
    return true;
  end if;

  -- Areas are stored as one closed outer ring. The closing point is not a
  -- separate user node and is therefore excluded from the uniqueness test.
  if p_coordinates -> 0 <> p_coordinates -> (v_count - 1) then
    return false;
  end if;
  for v_index in 0..v_count - 2 loop
    for v_other in v_index + 1..v_count - 2 loop
      if p_coordinates -> v_index = p_coordinates -> v_other then
        return false;
      end if;
    end loop;
    v_x1 := public.parking_coordinate_value(p_coordinates -> v_index, 0);
    v_y1 := public.parking_coordinate_value(p_coordinates -> v_index, 1);
    v_x2 := public.parking_coordinate_value(p_coordinates -> (v_index + 1), 0);
    v_y2 := public.parking_coordinate_value(p_coordinates -> (v_index + 1), 1);
    v_area := v_area + (v_x1 * v_y2 - v_x2 * v_y1);
  end loop;
  if abs(v_area) < 0.0000000001 then
    return false;
  end if;

  for v_index in 0..v_count - 2 loop
    for v_other in v_index + 1..v_count - 2 loop
      if v_other = v_index + 1 or (v_index = 0 and v_other = v_count - 2) then
        continue;
      end if;
      if public.parking_segments_intersect(
        p_coordinates -> v_index,
        p_coordinates -> (v_index + 1),
        p_coordinates -> v_other,
        p_coordinates -> (v_other + 1)
      ) then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end;
$$;

alter table public.parking_marks
  add constraint parking_marks_geometry_valid
  check (public.parking_geometry_is_valid(geometry_type, coordinates));

create or replace function public.is_parking_access_manager(
  p_group_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.parking_feature_config config
    join public.groups group_row on group_row.id = config.group_id and group_row.status = 'active'
    join public.group_members membership
      on membership.group_id = config.group_id
     and membership.user_id = config.manager_user_id
     and membership.status = 'active'
     and membership.role = 'owner'
    where config.group_id = p_group_id
      and config.manager_user_id = p_user_id
  );
$$;

create or replace function public.can_use_parking(
  p_group_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.parking_feature_config config
    join public.groups group_row on group_row.id = config.group_id and group_row.status = 'active'
    join public.group_members membership
      on membership.group_id = config.group_id
     and membership.user_id = p_user_id
     and membership.status = 'active'
    where config.group_id = p_group_id
      and config.enabled
      and (
        (config.manager_user_id = p_user_id and membership.role = 'owner')
        or exists (
          select 1
          from public.parking_feature_access access_row
          where access_row.group_id = config.group_id
            and access_row.user_id = p_user_id
            and access_row.revoked_at is null
        )
      )
  );
$$;

create or replace function public.revoke_parking_access_on_member_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'active' and new.status <> 'active' then
    update public.parking_feature_access
       set revoked_at = coalesce(revoked_at, now())
     where group_id = new.group_id
       and user_id = new.user_id
       and revoked_at is null;
    if found then
      insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id, metadata)
      values (
        new.group_id,
        auth.uid(),
        'parking.access_revoked_member_status',
        'parking_feature_access',
        new.user_id,
        jsonb_build_object('member_status', new.status::text)
      );
    end if;
  end if;
  return new;
end;
$$;

create trigger group_members_revoke_parking_access
after update of status on public.group_members
for each row execute function public.revoke_parking_access_on_member_status();

alter table public.parking_feature_config enable row level security;
alter table public.parking_feature_access enable row level security;
alter table public.parking_marks enable row level security;

create policy "parking managers read access grants"
on public.parking_feature_access for select to authenticated
using (public.is_parking_access_manager(group_id));

create policy "parking users read active shared marks"
on public.parking_marks for select to authenticated
using (public.can_use_parking(group_id) and deleted_at is null);

revoke all on table public.parking_feature_config from public, anon, authenticated;
revoke all on table public.parking_feature_access from public, anon, authenticated;
grant select on table public.parking_feature_access to authenticated;
revoke all on table public.parking_marks from public, anon, authenticated;
grant select on table public.parking_marks to authenticated;

create or replace function public.get_parking_access(p_group_id uuid)
returns table (
  enabled boolean,
  can_use boolean,
  can_manage boolean,
  authorized_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_config public.parking_feature_config;
  v_can_use boolean;
  v_can_manage boolean;
begin
  if not public.is_active_group_member(p_group_id, auth.uid()) then
    return query select false, false, false, 0::bigint;
  end if;
  select * into v_config from public.parking_feature_config where group_id = p_group_id;
  if not found then
    return query select false, false, false, 0::bigint;
  end if;
  v_can_use := public.can_use_parking(p_group_id, auth.uid());
  v_can_manage := public.is_parking_access_manager(p_group_id, auth.uid());
  return query
  select
    case when v_can_use or v_can_manage then v_config.enabled else false end,
    v_can_use,
    v_can_manage,
    (
      select count(*)
      from public.parking_feature_access access_row
      join public.group_members membership
        on membership.group_id = access_row.group_id
       and membership.user_id = access_row.user_id
       and membership.status = 'active'
      where access_row.group_id = p_group_id
        and access_row.revoked_at is null
    )::bigint
    * case when v_can_manage then 1 else 0 end;
end;
$$;

create or replace function public.list_parking_marks(
  p_group_id uuid,
  p_cursor_updated_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 100
)
returns table (items jsonb, next_cursor jsonb, has_more boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 100);
begin
  if not public.can_use_parking(p_group_id, auth.uid()) then
    raise exception 'parking access required' using errcode = '42501';
  end if;
  return query
  with ordered as (
    select
      mark.id,
      mark.group_id,
      mark.created_by,
      coalesce(profile.display_name, '共同成员') as creator_display_name,
      mark.geometry_type,
      mark.coordinates,
      mark.coordinate_system,
      mark.name,
      coalesce(mark.name, case mark.geometry_type when 'point' then '停车点' when 'line' then '路边停车' else '停车区域' end) as display_name,
      mark.is_convenient,
      mark.comment,
      mark.created_at,
      mark.updated_at,
      (mark.created_by = auth.uid()) as can_edit
    from public.parking_marks mark
    left join public.profiles profile on profile.id = mark.created_by
    where mark.group_id = p_group_id
      and mark.deleted_at is null
      and (
        p_cursor_updated_at is null
        or (mark.updated_at, mark.id) < (p_cursor_updated_at, p_cursor_id)
      )
    order by mark.updated_at desc, mark.id desc
    limit v_limit + 1
  ), page as (
    select * from ordered limit v_limit
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', page.id,
      'group_id', page.group_id,
      'created_by', page.created_by,
      'creator_display_name', page.creator_display_name,
      'geometry_type', page.geometry_type,
      'coordinates', page.coordinates,
      'coordinate_system', page.coordinate_system,
      'name', page.name,
      'display_name', page.display_name,
      'is_convenient', page.is_convenient,
      'comment', page.comment,
      'created_at', page.created_at,
      'updated_at', page.updated_at,
      'can_edit', page.can_edit
    ) order by page.updated_at desc, page.id desc), '[]'::jsonb),
    (select jsonb_build_object('updated_at', tail.updated_at, 'id', tail.id) from ordered tail offset v_limit limit 1),
    exists (select 1 from ordered offset v_limit);
end;
$$;

create or replace function public.create_parking_mark(
  p_group_id uuid,
  p_geometry_type text,
  p_coordinates jsonb,
  p_name text,
  p_is_convenient boolean,
  p_comment text,
  p_idempotency_key uuid
)
returns table (
  id uuid,
  group_id uuid,
  created_by uuid,
  creator_display_name text,
  geometry_type text,
  coordinates jsonb,
  coordinate_system text,
  name text,
  display_name text,
  is_convenient boolean,
  comment text,
  created_at timestamptz,
  updated_at timestamptz,
  can_edit boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_comment text := nullif(trim(coalesce(p_comment, '')), '');
  v_existing public.parking_marks;
begin
  if v_user_id is null or not public.can_use_parking(p_group_id, v_user_id) then
    raise exception 'parking access required' using errcode = '42501';
  end if;
  if p_idempotency_key is null
     or char_length(coalesce(v_name, '')) > 30
     or char_length(coalesce(v_comment, '')) > 500
     or p_is_convenient is not true
     or not public.parking_geometry_is_valid(p_geometry_type, p_coordinates) then
    raise exception 'invalid parking mark' using errcode = '22023';
  end if;

  select * into v_existing
  from public.parking_marks
  where group_id = p_group_id and created_by = v_user_id and idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_existing.geometry_type <> p_geometry_type
       or v_existing.coordinates <> p_coordinates
       or v_existing.name is distinct from v_name
       or v_existing.is_convenient <> p_is_convenient
       or v_existing.comment is distinct from v_comment then
      raise exception 'idempotency key already used' using errcode = '23505';
    end if;
  else
    insert into public.parking_marks (
      group_id, created_by, geometry_type, coordinates, name, is_convenient, comment, idempotency_key
    ) values (
      p_group_id, v_user_id, p_geometry_type, p_coordinates, v_name, p_is_convenient, v_comment, p_idempotency_key
    ) returning * into v_existing;
    insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id, metadata)
    values (p_group_id, v_user_id, 'parking.mark_created', 'parking_mark', v_existing.id, jsonb_build_object('geometry_type', p_geometry_type));
  end if;

  return query
  select v_existing.id, v_existing.group_id, v_existing.created_by,
    coalesce(profile.display_name, '共同成员'), v_existing.geometry_type, v_existing.coordinates,
    v_existing.coordinate_system, v_existing.name,
    coalesce(v_existing.name, case v_existing.geometry_type when 'point' then '停车点' when 'line' then '路边停车' else '停车区域' end),
    v_existing.is_convenient, v_existing.comment, v_existing.created_at, v_existing.updated_at, true
  from public.profiles profile where profile.id = v_existing.created_by;
end;
$$;

create or replace function public.update_parking_mark(
  p_mark_id uuid,
  p_geometry_type text,
  p_coordinates jsonb,
  p_name text,
  p_is_convenient boolean,
  p_comment text
)
returns table (
  id uuid,
  group_id uuid,
  created_by uuid,
  creator_display_name text,
  geometry_type text,
  coordinates jsonb,
  coordinate_system text,
  name text,
  display_name text,
  is_convenient boolean,
  comment text,
  created_at timestamptz,
  updated_at timestamptz,
  can_edit boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_mark public.parking_marks;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_comment text := nullif(trim(coalesce(p_comment, '')), '');
begin
  select * into v_mark from public.parking_marks where id = p_mark_id for update;
  if not found or v_mark.deleted_at is not null or v_mark.created_by <> v_user_id
     or not public.can_use_parking(v_mark.group_id, v_user_id) then
    raise exception 'parking mark edit not allowed' using errcode = '42501';
  end if;
  if char_length(coalesce(v_name, '')) > 30
     or char_length(coalesce(v_comment, '')) > 500
     or p_is_convenient is not true
     or not public.parking_geometry_is_valid(p_geometry_type, p_coordinates) then
    raise exception 'invalid parking mark' using errcode = '22023';
  end if;
  update public.parking_marks
     set geometry_type = p_geometry_type,
         coordinates = p_coordinates,
         name = v_name,
         is_convenient = p_is_convenient,
         comment = v_comment
   where id = p_mark_id;
  select * into v_mark from public.parking_marks where id = p_mark_id;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_mark.group_id, v_user_id, 'parking.mark_updated', 'parking_mark', v_mark.id, jsonb_build_object('geometry_type', p_geometry_type));
  return query
  select v_mark.id, v_mark.group_id, v_mark.created_by,
    coalesce(profile.display_name, '共同成员'), v_mark.geometry_type, v_mark.coordinates,
    v_mark.coordinate_system, v_mark.name,
    coalesce(v_mark.name, case v_mark.geometry_type when 'point' then '停车点' when 'line' then '路边停车' else '停车区域' end),
    v_mark.is_convenient, v_mark.comment, v_mark.created_at, v_mark.updated_at, true
  from public.profiles profile where profile.id = v_mark.created_by;
end;
$$;

create or replace function public.delete_parking_mark(p_mark_id uuid)
returns table (id uuid, group_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mark public.parking_marks;
  v_user_id uuid := auth.uid();
begin
  select * into v_mark from public.parking_marks where id = p_mark_id for update;
  if not found or v_mark.created_by <> v_user_id or not public.can_use_parking(v_mark.group_id, v_user_id) then
    raise exception 'parking mark delete not allowed' using errcode = '42501';
  end if;
  if v_mark.deleted_at is null then
    update public.parking_marks set deleted_at = now() where id = p_mark_id;
    insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id)
    values (v_mark.group_id, v_user_id, 'parking.mark_deleted', 'parking_mark', v_mark.id);
  end if;
  return query select v_mark.id, v_mark.group_id;
end;
$$;

create or replace function public.list_parking_members_for_management(
  p_group_id uuid,
  p_query text default null,
  p_limit integer default 100
)
returns table (
  user_id uuid,
  display_name text,
  email text,
  role public.group_role,
  parking_granted boolean,
  granted_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  select
    membership.user_id,
    profile.display_name,
    auth_user.email,
    membership.role,
    (access_row.revoked_at is null and access_row.user_id is not null) as parking_granted,
    access_row.granted_at
  from public.group_members membership
  join public.profiles profile on profile.id = membership.user_id
  join auth.users auth_user on auth_user.id = membership.user_id
  join public.parking_feature_config config on config.group_id = membership.group_id
  left join public.parking_feature_access access_row
    on access_row.group_id = membership.group_id and access_row.user_id = membership.user_id
  where membership.group_id = p_group_id
    and membership.status = 'active'
    and membership.user_id <> config.manager_user_id
    and public.is_parking_access_manager(p_group_id, auth.uid())
    and (
      nullif(trim(coalesce(p_query, '')), '') is null
      or profile.display_name ilike '%' || trim(p_query) || '%'
      or auth_user.email ilike '%' || trim(p_query) || '%'
    )
  order by profile.display_name, membership.joined_at, membership.user_id
  limit least(greatest(coalesce(p_limit, 100), 1), 100);
$$;

create or replace function public.grant_parking_access(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_manager uuid;
begin
  if not public.is_parking_access_manager(p_group_id, auth.uid()) then
    raise exception 'parking access manager required' using errcode = '42501';
  end if;
  select manager_user_id into v_manager from public.parking_feature_config where group_id = p_group_id;
  if p_user_id = v_manager
     or not exists (select 1 from public.group_members where group_id = p_group_id and user_id = p_user_id and status = 'active') then
    raise exception 'active non-manager member required' using errcode = '22023';
  end if;
  insert into public.parking_feature_access (group_id, user_id, granted_by, granted_at, revoked_at)
  values (p_group_id, p_user_id, auth.uid(), now(), null)
  on conflict (group_id, user_id) do update
    set granted_by = excluded.granted_by, granted_at = now(), revoked_at = null;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id)
  values (p_group_id, auth.uid(), 'parking.access_granted', 'parking_feature_access', p_user_id);
end;
$$;

create or replace function public.revoke_parking_access(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_manager uuid;
begin
  if not public.is_parking_access_manager(p_group_id, auth.uid()) then
    raise exception 'parking access manager required' using errcode = '42501';
  end if;
  select manager_user_id into v_manager from public.parking_feature_config where group_id = p_group_id;
  if p_user_id = v_manager then
    raise exception 'parking manager cannot be revoked' using errcode = '42501';
  end if;
  update public.parking_feature_access
     set revoked_at = coalesce(revoked_at, now())
   where group_id = p_group_id and user_id = p_user_id;
  if found then
    insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id)
    values (p_group_id, auth.uid(), 'parking.access_revoked', 'parking_feature_access', p_user_id);
  end if;
end;
$$;

create or replace function public.initialize_parking_feature(
  p_group_id uuid,
  p_manager_user_id uuid,
  p_enabled boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.parking_feature_config;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'controlled initialization required' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.groups group_row
    join public.group_members membership on membership.group_id = group_row.id
    where group_row.id = p_group_id
      and group_row.status = 'active'
      and membership.user_id = p_manager_user_id
      and membership.role = 'owner'
      and membership.status = 'active'
  ) then
    raise exception 'verified active owner manager required' using errcode = '22023';
  end if;
  select * into v_existing from public.parking_feature_config where group_id = p_group_id for update;
  if found and v_existing.manager_user_id <> p_manager_user_id then
    raise exception 'parking manager is already bound to another account' using errcode = '23505';
  end if;
  insert into public.parking_feature_config (group_id, manager_user_id, enabled)
  values (p_group_id, p_manager_user_id, p_enabled)
  on conflict (group_id) do update set enabled = excluded.enabled;
end;
$$;

create or replace function public.set_parking_feature_enabled(p_group_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'controlled configuration required' using errcode = '42501';
  end if;
  update public.parking_feature_config set enabled = p_enabled where group_id = p_group_id;
  if not found then raise exception 'parking feature is not initialized' using errcode = '22023'; end if;
end;
$$;

revoke all on function public.parking_coordinate_value(jsonb, integer) from public, anon, authenticated;
revoke all on function public.parking_coordinate_is_valid(jsonb) from public, anon, authenticated;
revoke all on function public.parking_cross(jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.parking_point_on_segment(jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.parking_segments_intersect(jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.parking_geometry_is_valid(text, jsonb) from public, anon, authenticated;
revoke all on function public.is_parking_access_manager(uuid, uuid) from public, anon, authenticated;
revoke all on function public.can_use_parking(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_parking_access(uuid) from public, anon;
revoke all on function public.list_parking_marks(uuid, timestamptz, uuid, integer) from public, anon;
revoke all on function public.create_parking_mark(uuid, text, jsonb, text, boolean, text, uuid) from public, anon;
revoke all on function public.update_parking_mark(uuid, text, jsonb, text, boolean, text) from public, anon;
revoke all on function public.delete_parking_mark(uuid) from public, anon;
revoke all on function public.list_parking_members_for_management(uuid, text, integer) from public, anon;
revoke all on function public.grant_parking_access(uuid, uuid) from public, anon;
revoke all on function public.revoke_parking_access(uuid, uuid) from public, anon;
grant execute on function public.get_parking_access(uuid) to authenticated;
grant execute on function public.list_parking_marks(uuid, timestamptz, uuid, integer) to authenticated;
grant execute on function public.create_parking_mark(uuid, text, jsonb, text, boolean, text, uuid) to authenticated;
grant execute on function public.update_parking_mark(uuid, text, jsonb, text, boolean, text) to authenticated;
grant execute on function public.delete_parking_mark(uuid) to authenticated;
grant execute on function public.list_parking_members_for_management(uuid, text, integer) to authenticated;
grant execute on function public.grant_parking_access(uuid, uuid) to authenticated;
grant execute on function public.revoke_parking_access(uuid, uuid) to authenticated;
revoke all on function public.initialize_parking_feature(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.set_parking_feature_enabled(uuid, boolean) from public, anon, authenticated;
grant execute on function public.initialize_parking_feature(uuid, uuid, boolean) to service_role;
grant execute on function public.set_parking_feature_enabled(uuid, boolean) to service_role;
