-- V1.3: durable visit history, one current opinion per person/place, and
-- anonymous presentation. This is additive: V1.2 reads remain available until
-- the V1.3 detail and discovery read models are released.

create table public.opinion_tags (
  slug text primary key check (slug in ('tasty', 'comfortable', 'good_for_chat', 'good_value')),
  label text not null unique,
  sort_order smallint not null unique check (sort_order between 1 and 4)
);

insert into public.opinion_tags (slug, label, sort_order) values
  ('tasty', '吃得香', 1),
  ('comfortable', '坐得住', 2),
  ('good_for_chat', '聊得开', 3),
  ('good_value', '花得值', 4);

create table public.current_opinions (
  id uuid primary key default gen_random_uuid(),
  group_place_id uuid not null references public.group_places(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  strength smallint not null check (strength between 1 and 3),
  tags text[] not null default '{}'::text[] check (cardinality(tags) <= 2),
  is_anonymous boolean not null default false,
  first_visited_on date,
  last_visited_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_place_id, user_id),
  check (first_visited_on is null or last_visited_on is null or first_visited_on <= last_visited_on),
  check (tags <@ array['tasty', 'comfortable', 'good_for_chat', 'good_value']::text[])
);

create table public.visit_records (
  id uuid primary key default gen_random_uuid(),
  group_place_id uuid not null references public.group_places(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  legacy_visit_id uuid unique references public.visits(id) on delete set null,
  visited_on date,
  strength smallint not null check (strength between 1 and 3),
  tags text[] not null default '{}'::text[] check (cardinality(tags) <= 2),
  is_anonymous boolean not null default false,
  note text check (note is null or char_length(note) <= 1000),
  dishes text[] not null default '{}'::text[] check (cardinality(dishes) <= 12),
  hidden_at timestamptz,
  hidden_by uuid references public.profiles(id) on delete set null,
  hidden_reason text check (hidden_reason is null or char_length(hidden_reason) <= 280),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tags <@ array['tasty', 'comfortable', 'good_for_chat', 'good_value']::text[]),
  check ((hidden_at is null) = (hidden_by is null))
);

create index current_opinions_group_place_idx on public.current_opinions (group_place_id, updated_at desc);
create index visit_records_group_place_timeline_idx on public.visit_records (group_place_id, visited_on desc nulls last, created_at desc) where deleted_at is null and hidden_at is null;
create index visit_records_author_idx on public.visit_records (user_id, created_at desc) where deleted_at is null;

create trigger current_opinions_set_updated_at before update on public.current_opinions for each row execute function public.set_updated_at();
create trigger visit_records_set_updated_at before update on public.visit_records for each row execute function public.set_updated_at();

-- Preserve existing valid marks without inventing missing visit dates or the
-- new "why it is good" tags. The legacy five-point score is mapped only to the
-- new three-level display strength; the legacy mark remains unchanged.
insert into public.current_opinions (
  group_place_id, user_id, strength, tags, first_visited_on, last_visited_on, created_at, updated_at
)
select
  mark.group_place_id,
  mark.user_id,
  case when mark.overall_rating >= 4.5 then 3 when mark.overall_rating >= 3 then 2 else 1 end,
  '{}'::text[],
  mark.first_visited_on,
  mark.last_visited_on,
  mark.created_at,
  mark.updated_at
from public.place_marks mark
where mark.deleted_at is null
on conflict (group_place_id, user_id) do nothing;

insert into public.visit_records (
  group_place_id, user_id, legacy_visit_id, visited_on, strength, tags, note, dishes, created_at, updated_at
)
select
  mark.group_place_id,
  mark.user_id,
  visit.id,
  coalesce(visit.visited_on, mark.last_visited_on, mark.first_visited_on),
  case when mark.overall_rating >= 4.5 then 3 when mark.overall_rating >= 3 then 2 else 1 end,
  '{}'::text[],
  coalesce(visit.visit_note, mark.short_review),
  mark.recommended_items,
  visit.created_at,
  greatest(visit.updated_at, mark.updated_at)
from public.visits visit
join public.place_marks mark on mark.id = visit.place_mark_id
where visit.deleted_at is null and mark.deleted_at is null
on conflict (legacy_visit_id) do nothing;

alter table public.photos add column if not exists visit_record_id uuid references public.visit_records(id) on delete set null;
alter table public.photos add column if not exists hidden_at timestamptz;
alter table public.photos add column if not exists hidden_by uuid references public.profiles(id) on delete set null;
alter table public.photos add column if not exists hidden_reason text check (hidden_reason is null or char_length(hidden_reason) <= 280);
create index if not exists photos_visit_record_current_idx on public.photos (visit_record_id, sort_order, created_at desc) where deleted_at is null;
alter table public.photos drop constraint if exists photos_check;
alter table public.photos add constraint photos_attachment_required check (place_mark_id is not null or visit_id is not null or visit_record_id is not null);

-- V1.2's trigger deliberately only permits soft deletion. V1.3 adds three
-- server-managed fields, so retain that protection for application roles while
-- allowing the database owner (migration and SECURITY DEFINER moderation RPCs)
-- to backfill/maintain the new linkage and visibility fields.
create or replace function public.enforce_photo_rules()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.group_id is distinct from old.group_id
      or new.group_place_id is distinct from old.group_place_id
      or new.user_id is distinct from old.user_id
      or new.place_mark_id is distinct from old.place_mark_id
      or new.visit_id is distinct from old.visit_id
      or new.storage_provider is distinct from old.storage_provider
      or new.object_key is distinct from old.object_key
      or new.width is distinct from old.width
      or new.height is distinct from old.height
      or new.size_bytes is distinct from old.size_bytes
      or new.sort_order is distinct from old.sort_order
      or old.deleted_at is not null
      or new.deleted_at is null then
      raise exception 'photos can only be soft-deleted or server-governed';
    end if;
    if (new.visit_record_id is distinct from old.visit_record_id
        or new.hidden_at is distinct from old.hidden_at
        or new.hidden_by is distinct from old.hidden_by
        or new.hidden_reason is distinct from old.hidden_reason)
      and current_user <> 'postgres' then
      raise exception 'V1.3 photo linkage and moderation are server-governed';
    end if;
    return new;
  end if;

  if new.place_mark_id is not null and (
    select count(*) from public.photos where place_mark_id = new.place_mark_id and deleted_at is null
  ) >= 9 then
    raise exception 'a real mark can contain at most 9 photos';
  end if;
  if new.visit_id is not null and (
    select count(*) from public.photos where visit_id = new.visit_id and deleted_at is null
  ) >= 6 then
    raise exception 'a visit can contain at most 6 photos';
  end if;
  if new.visit_record_id is not null and (
    select count(*) from public.photos where visit_record_id = new.visit_record_id and deleted_at is null
  ) >= 6 then
    raise exception 'a V1.3 visit can contain at most 6 photos';
  end if;
  return new;
end;
$$;

update public.photos photo
set visit_record_id = record.id
from public.visit_records record
where photo.visit_record_id is null
  and record.legacy_visit_id = photo.visit_id;

update public.photos photo
set visit_record_id = (
  select record.id
  from public.visit_records record
  where record.group_place_id = photo.group_place_id
    and record.user_id = photo.user_id
    and record.deleted_at is null
  order by record.visited_on nulls last, record.created_at
  limit 1
)
where photo.visit_record_id is null and photo.place_mark_id is not null;

alter table public.current_opinions enable row level security;
alter table public.visit_records enable row level security;

create policy "members insert own visit record photos" on public.photos for insert to authenticated with check (
  user_id = auth.uid() and public.is_active_group_member(group_id, auth.uid()) and exists (
    select 1 from public.visit_records visit
    join public.group_places group_place on group_place.id = visit.group_place_id
    where visit.id = photos.visit_record_id
      and visit.user_id = auth.uid()
      and visit.deleted_at is null
      and group_place.id = photos.group_place_id
      and group_place.group_id = photos.group_id
  )
);

drop policy if exists "members read current group photos" on public.photos;
create policy "members read visible group photos" on public.photos for select to authenticated using (
  deleted_at is null and hidden_at is null and public.is_active_group_member(group_id)
);

create policy "members read current opinions in their group" on public.current_opinions
  for select to authenticated using (
    exists (
      select 1 from public.group_places group_place
      where group_place.id = current_opinions.group_place_id
        and public.is_active_group_member(group_place.group_id)
    )
  );

create policy "members read visible visit records in their group" on public.visit_records
  for select to authenticated using (
    deleted_at is null and hidden_at is null and exists (
      select 1 from public.group_places group_place
      where group_place.id = visit_records.group_place_id
        and public.is_active_group_member(group_place.group_id)
    )
  );

create or replace function public.record_place_visit(
  p_group_place_id uuid,
  p_visited_on date,
  p_opinion_changed boolean,
  p_strength smallint default null,
  p_tags text[] default null,
  p_note text default null,
  p_dishes text[] default '{}'::text[],
  p_is_anonymous boolean default false
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
  from public.group_places group_place
  where group_place.id = p_group_place_id and group_place.status = 'active'
  for share;

  if v_user_id is null or v_group_id is null or not public.is_active_group_member(v_group_id, v_user_id) then
    raise exception 'active group membership required' using errcode = '42501';
  end if;
  if p_visited_on is null or p_visited_on > current_date then
    raise exception 'a valid past or current visit date is required' using errcode = '22023';
  end if;
  if char_length(coalesce(trim(p_note), '')) > 1000 or cardinality(v_dishes) > 12 then
    raise exception 'visit content is outside the allowed limits' using errcode = '22023';
  end if;

  select * into v_opinion from public.current_opinions
  where group_place_id = p_group_place_id and user_id = v_user_id
  for update;

  if not found or p_opinion_changed then
    if coalesce(p_strength not between 1 and 3, true) or cardinality(v_tags) not between 1 and 2
      or not (v_tags <@ array['tasty', 'comfortable', 'good_for_chat', 'good_value']::text[]) then
      raise exception 'a strength and one or two valid opinion tags are required' using errcode = '22023';
    end if;
    insert into public.current_opinions (group_place_id, user_id, strength, tags, is_anonymous, first_visited_on, last_visited_on)
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

  insert into public.visit_records (group_place_id, user_id, visited_on, strength, tags, is_anonymous, note, dishes)
  values (p_group_place_id, v_user_id, p_visited_on, v_opinion.strength, v_opinion.tags, p_is_anonymous, nullif(trim(p_note), ''), v_dishes)
  returning id into v_visit_id;

  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_group_id, v_user_id, 'visit_record.created', 'visit_record', v_visit_id,
    jsonb_build_object('group_place_id', p_group_place_id, 'opinion_changed', p_opinion_changed, 'is_anonymous', p_is_anonymous));

  return query select v_visit_id, v_opinion.id;
end;
$$;

create or replace function public.get_my_current_opinion(p_group_place_id uuid)
returns table (strength smallint, tags text[], is_anonymous boolean, first_visited_on date, last_visited_on date)
language sql
security definer
set search_path = public
as $$
  select opinion.strength, opinion.tags, opinion.is_anonymous, opinion.first_visited_on, opinion.last_visited_on
  from public.current_opinions opinion
  join public.group_places group_place on group_place.id = opinion.group_place_id
  where opinion.group_place_id = p_group_place_id
    and opinion.user_id = auth.uid()
    and public.is_active_group_member(group_place.group_id);
$$;

create or replace function public.list_group_place_visit_timeline(p_group_place_id uuid)
returns table (
  visit_record_id uuid,
  visited_on date,
  strength smallint,
  tags text[],
  note text,
  dishes text[],
  created_at timestamptz,
  display_name text,
  can_delete boolean
)
language sql
security definer
set search_path = public
as $$
  select
    visit.id,
    visit.visited_on,
    visit.strength,
    visit.tags,
    visit.note,
    visit.dishes,
    visit.created_at,
    case
      when visit.is_anonymous then '匿名成员'
      when member.status <> 'active' then '已离开成员'
      else profile.display_name
    end,
    visit.user_id = auth.uid()
  from public.visit_records visit
  join public.group_places group_place on group_place.id = visit.group_place_id
  join public.group_members member on member.group_id = group_place.group_id and member.user_id = visit.user_id
  left join public.profiles profile on profile.id = visit.user_id
  where visit.group_place_id = p_group_place_id
    and visit.deleted_at is null
    and visit.hidden_at is null
    and public.is_active_group_member(group_place.group_id)
  order by visit.visited_on desc nulls last, visit.created_at desc;
$$;

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
begin
  select group_place.group_id, visit.group_place_id into v_group_id, v_group_place_id
  from public.visit_records visit
  join public.group_places group_place on group_place.id = visit.group_place_id
  where visit.id = p_visit_record_id
    and visit.user_id = v_user_id
    and visit.deleted_at is null
  for update of visit;

  if v_user_id is null or v_group_id is null or not public.is_active_group_member(v_group_id, v_user_id) then
    raise exception 'only an active author can delete this visit' using errcode = '42501';
  end if;

  update public.visit_records set deleted_at = now() where id = p_visit_record_id;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id)
  values (v_group_id, v_user_id, 'visit_record.deleted', 'visit_record', p_visit_record_id);

  return query
  with deleted_photos as (
    update public.photos
    set deleted_at = now()
    where visit_record_id = p_visit_record_id and deleted_at is null
    returning object_key
  )
  select v_group_place_id, coalesce(array_agg(deleted_photos.object_key), '{}'::text[])
  from deleted_photos;
end;
$$;

create or replace function public.hide_group_visit_record(p_visit_record_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_group_place_id uuid;
begin
  select group_place.group_id, visit.group_place_id into v_group_id, v_group_place_id
  from public.visit_records visit
  join public.group_places group_place on group_place.id = visit.group_place_id
  where visit.id = p_visit_record_id and visit.deleted_at is null
  for update of visit;
  if v_group_id is null or not public.has_group_role(v_group_id, array['owner'::public.group_role, 'admin'::public.group_role]) then
    raise exception 'owner or admin role required' using errcode = '42501';
  end if;
  if nullif(trim(p_reason), '') is null or char_length(trim(p_reason)) > 280 then
    raise exception 'a moderation reason of up to 280 characters is required' using errcode = '22023';
  end if;
  update public.visit_records set hidden_at = now(), hidden_by = auth.uid(), hidden_reason = trim(p_reason) where id = p_visit_record_id;
  update public.photos set hidden_at = now(), hidden_by = auth.uid(), hidden_reason = trim(p_reason)
    where visit_record_id = p_visit_record_id and deleted_at is null and hidden_at is null;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_group_id, auth.uid(), 'visit_record.hidden', 'visit_record', p_visit_record_id, jsonb_build_object('reason', trim(p_reason)));
  return v_group_place_id;
end;
$$;

create or replace function public.hide_group_photo(p_photo_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_group_place_id uuid;
begin
  select photo.group_id, photo.group_place_id into v_group_id, v_group_place_id
  from public.photos photo
  where photo.id = p_photo_id and photo.deleted_at is null
  for update;
  if v_group_id is null or not public.has_group_role(v_group_id, array['owner'::public.group_role, 'admin'::public.group_role]) then
    raise exception 'owner or admin role required' using errcode = '42501';
  end if;
  if nullif(trim(p_reason), '') is null or char_length(trim(p_reason)) > 280 then
    raise exception 'a moderation reason of up to 280 characters is required' using errcode = '22023';
  end if;
  update public.photos set hidden_at = now(), hidden_by = auth.uid(), hidden_reason = trim(p_reason) where id = p_photo_id;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_group_id, auth.uid(), 'photo.hidden', 'photo', p_photo_id, jsonb_build_object('reason', trim(p_reason)));
  return v_group_place_id;
end;
$$;

create or replace function public.get_group_place_opinion_summary(p_group_place_id uuid)
returns table (bowl_strength smallint, friend_count bigint, tasty_count bigint, comfortable_count bigint, good_for_chat_count bigint, good_value_count bigint)
language sql
security definer
set search_path = public
as $$
  select
    round(avg(opinion.strength))::smallint as bowl_strength,
    count(*)::bigint as friend_count,
    count(*) filter (where 'tasty' = any(opinion.tags))::bigint as tasty_count,
    count(*) filter (where 'comfortable' = any(opinion.tags))::bigint as comfortable_count,
    count(*) filter (where 'good_for_chat' = any(opinion.tags))::bigint as good_for_chat_count,
    count(*) filter (where 'good_value' = any(opinion.tags))::bigint as good_value_count
  from public.current_opinions opinion
  join public.group_places group_place on group_place.id = opinion.group_place_id
  where opinion.group_place_id = p_group_place_id
    and public.is_active_group_member(group_place.group_id);
$$;

create or replace function public.list_group_visit_feed(p_group_id uuid)
returns table (
  visit_record_id uuid,
  group_place_id uuid,
  place_name text,
  visited_on date,
  strength smallint,
  note text,
  dishes text[],
  created_at timestamptz,
  display_name text
)
language sql
security definer
set search_path = public
as $$
  select
    visit.id,
    group_place.id,
    place.name,
    visit.visited_on,
    visit.strength,
    visit.note,
    visit.dishes,
    visit.created_at,
    case
      when visit.is_anonymous then '匿名成员'
      when member.status <> 'active' then '已离开成员'
      else profile.display_name
    end
  from public.visit_records visit
  join public.group_places group_place on group_place.id = visit.group_place_id
  join public.places place on place.id = group_place.place_id
  join public.group_members member on member.group_id = group_place.group_id and member.user_id = visit.user_id
  left join public.profiles profile on profile.id = visit.user_id
  where group_place.group_id = p_group_id
    and group_place.status = 'active'
    and visit.deleted_at is null
    and visit.hidden_at is null
    and public.is_active_group_member(p_group_id)
  order by visit.created_at desc
  limit 30;
$$;

create or replace function public.list_group_place_opinion_summaries(p_group_id uuid)
returns table (
  group_place_id uuid,
  bowl_strength smallint,
  friend_count bigint,
  tasty_count bigint,
  comfortable_count bigint,
  good_for_chat_count bigint,
  good_value_count bigint,
  last_visited_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    group_place.id,
    round(avg(opinion.strength))::smallint,
    count(*)::bigint,
    count(*) filter (where 'tasty' = any(opinion.tags))::bigint,
    count(*) filter (where 'comfortable' = any(opinion.tags))::bigint,
    count(*) filter (where 'good_for_chat' = any(opinion.tags))::bigint,
    count(*) filter (where 'good_value' = any(opinion.tags))::bigint,
    max(opinion.updated_at)
  from public.group_places group_place
  join public.current_opinions opinion on opinion.group_place_id = group_place.id
  where group_place.group_id = p_group_id
    and group_place.status = 'active'
    and public.is_active_group_member(p_group_id)
  group by group_place.id;
$$;

-- Leaving a group ends a member's access without rewriting the experiences
-- they already shared. Owner transfer is intentionally a separate governance
-- operation, so an Owner cannot accidentally leave a group without one.
create or replace function public.leave_active_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.group_role;
begin
  select role into v_role
  from public.group_members
  where group_id = p_group_id and user_id = auth.uid() and status = 'active'
  for update;

  if v_role is null then
    raise exception 'active group membership required' using errcode = '42501';
  end if;
  if v_role = 'owner' then
    raise exception 'transfer ownership before leaving this group' using errcode = '22023';
  end if;

  update public.group_members
  set status = 'removed', removed_at = now()
  where group_id = p_group_id and user_id = auth.uid();

  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id)
  values (p_group_id, auth.uid(), 'group_member.left', 'group_member', auth.uid());
end;
$$;

-- Personal exports deliberately run through a function because direct table
-- access would expose other authors' stable identifiers to ordinary members.
create or replace function public.export_my_v1_3_records(p_group_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'current_opinions', coalesce((
      select jsonb_agg(to_jsonb(opinion) order by opinion.updated_at desc)
      from public.current_opinions opinion
      join public.group_places group_place on group_place.id = opinion.group_place_id
      where group_place.group_id = p_group_id and opinion.user_id = auth.uid()
    ), '[]'::jsonb),
    'visit_records', coalesce((
      select jsonb_agg(to_jsonb(visit) order by visit.created_at desc)
      from public.visit_records visit
      join public.group_places group_place on group_place.id = visit.group_place_id
      where group_place.group_id = p_group_id and visit.user_id = auth.uid()
    ), '[]'::jsonb)
  )
  where public.is_active_group_member(p_group_id);
$$;

revoke all on table public.opinion_tags, public.current_opinions, public.visit_records from anon, authenticated;
grant select on table public.opinion_tags to authenticated;
revoke all on function public.record_place_visit(uuid, date, boolean, smallint, text[], text, text[], boolean) from public, anon;
grant execute on function public.record_place_visit(uuid, date, boolean, smallint, text[], text, text[], boolean) to authenticated;
revoke all on function public.get_my_current_opinion(uuid) from public, anon;
grant execute on function public.get_my_current_opinion(uuid) to authenticated;
revoke all on function public.list_group_place_visit_timeline(uuid) from public, anon;
grant execute on function public.list_group_place_visit_timeline(uuid) to authenticated;
revoke all on function public.get_group_place_opinion_summary(uuid) from public, anon;
grant execute on function public.get_group_place_opinion_summary(uuid) to authenticated;
revoke all on function public.list_group_visit_feed(uuid) from public, anon;
grant execute on function public.list_group_visit_feed(uuid) to authenticated;
revoke all on function public.list_group_place_opinion_summaries(uuid) from public, anon;
grant execute on function public.list_group_place_opinion_summaries(uuid) to authenticated;
revoke all on function public.delete_my_visit_record(uuid) from public, anon;
grant execute on function public.delete_my_visit_record(uuid) to authenticated;
revoke all on function public.hide_group_visit_record(uuid, text) from public, anon;
grant execute on function public.hide_group_visit_record(uuid, text) to authenticated;
revoke all on function public.hide_group_photo(uuid, text) from public, anon;
grant execute on function public.hide_group_photo(uuid, text) to authenticated;
revoke all on function public.leave_active_group(uuid) from public, anon;
grant execute on function public.leave_active_group(uuid) to authenticated;
revoke all on function public.export_my_v1_3_records(uuid) from public, anon;
grant execute on function public.export_my_v1_3_records(uuid) to authenticated;
