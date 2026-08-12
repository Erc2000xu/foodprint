-- Foodprint V2.2 additive read models and private photo thumbnails.
-- Do not edit or replay an earlier migration. Canonical photo objects remain
-- untouched; every thumbnail field and RPC below is forward compatible with
-- an older application that still reads object_key.

alter table public.photos
  add column if not exists thumbnail_object_key text,
  add column if not exists thumbnail_width integer,
  add column if not exists thumbnail_height integer,
  add column if not exists thumbnail_size_bytes integer,
  add column if not exists thumbnail_generated_at timestamptz;

alter table public.photos drop constraint if exists photos_thumbnail_width_check;
alter table public.photos add constraint photos_thumbnail_width_check check (thumbnail_width is null or thumbnail_width between 1 and 2000);
alter table public.photos drop constraint if exists photos_thumbnail_height_check;
alter table public.photos add constraint photos_thumbnail_height_check check (thumbnail_height is null or thumbnail_height between 1 and 2000);
alter table public.photos drop constraint if exists photos_thumbnail_size_check;
alter table public.photos add constraint photos_thumbnail_size_check check (thumbnail_size_bytes is null or thumbnail_size_bytes between 1 and 122880);
alter table public.photos drop constraint if exists photos_thumbnail_metadata_complete_check;
alter table public.photos add constraint photos_thumbnail_metadata_complete_check check (
  (thumbnail_object_key is null and thumbnail_width is null and thumbnail_height is null and thumbnail_size_bytes is null and thumbnail_generated_at is null)
  or (thumbnail_object_key is not null and thumbnail_width is not null and thumbnail_height is not null and thumbnail_size_bytes is not null and thumbnail_generated_at is not null)
);
alter table public.photos drop constraint if exists photos_thumbnail_object_key_length_check;
alter table public.photos add constraint photos_thumbnail_object_key_length_check check (thumbnail_object_key is null or char_length(thumbnail_object_key) between 1 and 800);

create unique index if not exists photos_thumbnail_object_key_unique_idx
  on public.photos (thumbnail_object_key) where thumbnail_object_key is not null;
create index if not exists photos_thumbnail_backfill_idx
  on public.photos (id) where deleted_at is null and hidden_at is null and thumbnail_object_key is null;

-- Application roles can still soft-delete a photo, but cannot rewrite either
-- canonical or thumbnail metadata after insertion. Controlled SECURITY DEFINER
-- functions run as the database owner and may fill a missing thumbnail.
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
        or new.hidden_reason is distinct from old.hidden_reason
        or new.thumbnail_object_key is distinct from old.thumbnail_object_key
        or new.thumbnail_width is distinct from old.thumbnail_width
        or new.thumbnail_height is distinct from old.thumbnail_height
        or new.thumbnail_size_bytes is distinct from old.thumbnail_size_bytes
        or new.thumbnail_generated_at is distinct from old.thumbnail_generated_at)
      and current_user <> 'postgres' then
      raise exception 'photo linkage, moderation, and thumbnail metadata are server-governed';
    end if;
    return new;
  end if;

  if new.thumbnail_object_key is not null and (
    new.visit_record_id is null
    or new.thumbnail_object_key <> format('groups/%s/users/%s/visits/%s/photos/%s/thumb.webp', new.group_id, new.user_id, new.visit_record_id, new.id)
  ) then
    raise exception 'invalid private thumbnail path' using errcode = '22023';
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

create or replace function public.register_photo_thumbnail(
  p_photo_id uuid,
  p_thumbnail_object_key text,
  p_thumbnail_width integer,
  p_thumbnail_height integer,
  p_thumbnail_size_bytes integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo public.photos;
begin
  select * into v_photo
  from public.photos
  where id = p_photo_id and deleted_at is null and hidden_at is null
  for update;
  if not found then
    raise exception 'photo is not eligible for thumbnail registration' using errcode = '22023';
  end if;
  if auth.uid() is not null and (v_photo.user_id <> auth.uid() or not public.is_active_group_member(v_photo.group_id, auth.uid())) then
    raise exception 'active photo author required' using errcode = '42501';
  end if;
  if v_photo.id is null or v_photo.visit_record_id is null then
    raise exception 'photo is not eligible for thumbnail registration' using errcode = '22023';
  end if;
  if p_thumbnail_object_key <> format('groups/%s/users/%s/visits/%s/photos/%s/thumb.webp', v_photo.group_id, v_photo.user_id, v_photo.visit_record_id, v_photo.id) then
    raise exception 'thumbnail path does not match photo scope' using errcode = '22023';
  end if;
  if p_thumbnail_width not between 1 and 2000 or p_thumbnail_height not between 1 and 2000 or p_thumbnail_size_bytes not between 1 and 122880 then
    raise exception 'thumbnail metadata is outside the allowed range' using errcode = '22023';
  end if;
  update public.photos
  set thumbnail_object_key = p_thumbnail_object_key,
      thumbnail_width = p_thumbnail_width,
      thumbnail_height = p_thumbnail_height,
      thumbnail_size_bytes = p_thumbnail_size_bytes,
      thumbnail_generated_at = now()
  where id = p_photo_id;
  return true;
end;
$$;

create or replace function public.delete_my_photo_v2(p_photo_id uuid)
returns table (group_place_id uuid, object_keys text[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo public.photos;
begin
  select * into v_photo from public.photos
  where id = p_photo_id and user_id = auth.uid() and deleted_at is null
  for update;
  if not found or not public.is_active_group_member(v_photo.group_id, auth.uid()) then
    raise exception 'only an active photo author can delete this photo' using errcode = '42501';
  end if;
  update public.photos set deleted_at = now() where id = p_photo_id;
  return query
  select v_photo.group_place_id,
    array_remove(array[v_photo.object_key, v_photo.thumbnail_object_key], null)::text[];
end;
$$;

-- Keep the existing visit deletion API name, but include both private objects
-- in the returned cleanup list. This is a forward-compatible replacement.
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
  update public.visit_records set deleted_at = now() where id = p_visit_record_id;
  select * into v_snapshot
  from public.visit_records
  where group_place_id = v_group_place_id and user_id = v_user_id and deleted_at is null
  order by visited_on desc nulls last, created_at desc
  limit 1
  for update;
  if found then
    update public.current_opinions
    set strength = v_snapshot.strength,
        tags = v_snapshot.tags,
        is_anonymous = v_snapshot.is_anonymous,
        first_visited_on = v_snapshot.visited_on,
        last_visited_on = v_snapshot.visited_on
    where group_place_id = v_group_place_id and user_id = v_user_id;
  else
    delete from public.current_opinions where group_place_id = v_group_place_id and user_id = v_user_id;
  end if;
  if not exists (select 1 from public.current_opinions where group_place_id = v_group_place_id) then
    update public.group_places
    set status = 'inactive_no_marks', archived_at = null, archived_by = null, archived_reason = null
    where id = v_group_place_id and status <> 'archived';
  end if;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id)
  values (v_group_id, v_user_id, 'visit_record.deleted', 'visit_record', p_visit_record_id);
  return query
  with deleted_photos as (
    update public.photos set deleted_at = now()
    where visit_record_id = p_visit_record_id and deleted_at is null
    returning object_key, thumbnail_object_key
  ), keys as (
    select object_key as object_key from deleted_photos
    union all select thumbnail_object_key from deleted_photos where thumbnail_object_key is not null
  )
  select v_group_place_id, coalesce(array_agg(keys.object_key), '{}'::text[]) from keys;
end;
$$;

create or replace function public.get_active_group_context_v2()
returns table (user_id uuid, group_id uuid, role public.group_role, group_name text)
language sql
security definer
stable
set search_path = public
as $$
  select member.user_id, member.group_id, member.role, group_row.name
  from public.group_members member
  join public.groups group_row on group_row.id = member.group_id
  where member.user_id = auth.uid()
    and member.status = 'active'
    and group_row.status = 'active'
  order by member.joined_at asc, member.group_id
  limit 1;
$$;

create or replace function public.list_discovery_cards_v2(
  p_limit integer default 20,
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
  average_rating numeric,
  mark_count bigint,
  recommend_count bigint,
  price_per_person numeric,
  short_review text,
  recommended_items text[],
  cuisine_slugs text[],
  last_marked_at timestamptz,
  bowl_strength smallint,
  tasty_count bigint,
  comfortable_count bigint,
  good_for_chat_count bigint,
  good_value_count bigint,
  saved_for_later boolean,
  thumbnail_object_key text,
  thumbnail_width integer,
  thumbnail_height integer,
  cover_photo_id uuid,
  next_cursor_created_at timestamptz,
  next_cursor_id uuid
)
language sql
security definer
stable
set search_path = public
as $$
  with active_group as (select group_id from public.get_active_group_context_v2())
  select gp.id,
    place.name,
    gp.primary_category,
    place.address,
    place.city,
    place.district,
    place.latitude,
    place.longitude,
    stats.average_rating,
    stats.mark_count,
    stats.recommend_count,
    mark.price_per_person,
    mark.short_review,
    mark.recommended_items,
    coalesce(cuisines.cuisine_slugs, '{}'::text[]),
    coalesce(stats.last_marked_at, gp.created_at),
    opinion.bowl_strength,
    opinion.tasty_count,
    opinion.comfortable_count,
    opinion.good_for_chat_count,
    opinion.good_value_count,
    exists (select 1 from public.wishlist_items item where item.group_place_id = gp.id and item.user_id = auth.uid()),
    cover.thumbnail_object_key,
    cover.thumbnail_width,
    cover.thumbnail_height,
    cover.id,
    gp.created_at,
    gp.id
  from public.group_places gp
  join active_group on active_group.group_id = gp.group_id
  join public.places place on place.id = gp.place_id
  left join public.group_place_stats stats on stats.group_place_id = gp.id
  left join lateral (
    select pm.price_per_person, pm.short_review, pm.recommended_items
    from public.place_marks pm
    where pm.group_place_id = gp.id and pm.deleted_at is null
    order by pm.updated_at desc limit 1
  ) mark on true
  left join lateral (
    select round(avg(co.strength))::smallint as bowl_strength,
      count(*)::bigint as friend_count,
      count(*) filter (where 'tasty' = any(co.tags))::bigint as tasty_count,
      count(*) filter (where 'comfortable' = any(co.tags))::bigint as comfortable_count,
      count(*) filter (where 'good_for_chat' = any(co.tags))::bigint as good_for_chat_count,
      count(*) filter (where 'good_value' = any(co.tags))::bigint as good_value_count
    from public.current_opinions co
    where co.group_place_id = gp.id
  ) opinion on true
  left join lateral (select array_agg(pc.cuisine_slug order by pc.is_primary desc, pc.cuisine_slug) as cuisine_slugs from public.place_cuisines pc where pc.group_place_id = gp.id) cuisines on true
  left join lateral (
    select photo.id, photo.thumbnail_object_key, photo.thumbnail_width, photo.thumbnail_height
    from public.photos photo
    where photo.group_place_id = gp.id and photo.deleted_at is null and photo.hidden_at is null and photo.thumbnail_object_key is not null
    order by photo.sort_order, photo.created_at desc limit 1
  ) cover on true
  where gp.status = 'active'
    and (p_before_created_at is null or (gp.created_at, gp.id) < (p_before_created_at, p_before_id))
  order by gp.created_at desc, gp.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 20));
$$;

create or replace function public.list_group_visit_feed_v2(
  p_limit integer default 20,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  visit_record_id uuid,
  group_place_id uuid,
  place_name text,
  visited_on date,
  strength smallint,
  tags text[],
  note text,
  dishes text[],
  created_at timestamptz,
  display_name text,
  thumbnail_object_keys text[]
)
language sql
security definer
set search_path = public
as $$
  with active_group as (select group_id from public.get_active_group_context_v2())
  select visit.id, gp.id, place.name, visit.visited_on, visit.strength, visit.tags, visit.note, visit.dishes, visit.created_at,
    case when visit.is_anonymous then '匿名成员' when member.status <> 'active' then '已离开成员' else profile.display_name end,
    coalesce(photo_keys.thumbnail_object_keys, '{}'::text[])
  from public.visit_records visit
  join public.group_places gp on gp.id = visit.group_place_id
  join active_group on active_group.group_id = gp.group_id
  join public.places place on place.id = gp.place_id
  join public.group_members member on member.group_id = gp.group_id and member.user_id = visit.user_id
  left join public.profiles profile on profile.id = visit.user_id
  left join lateral (
    select array_agg(selected.thumbnail_object_key order by selected.sort_order, selected.created_at desc) as thumbnail_object_keys
    from (
      select photo.thumbnail_object_key, photo.sort_order, photo.created_at
      from public.photos photo
      where photo.visit_record_id = visit.id and photo.deleted_at is null and photo.hidden_at is null and photo.thumbnail_object_key is not null
      order by photo.sort_order, photo.created_at desc limit 2
    ) selected
  ) photo_keys on true
  where gp.status = 'active' and visit.deleted_at is null and visit.hidden_at is null
    and (p_before_created_at is null or (visit.created_at, visit.id) < (p_before_created_at, p_before_id))
  order by visit.created_at desc, visit.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 20));
$$;

create or replace function public.get_group_place_detail_v2(p_group_place_id uuid, p_timeline_limit integer default 20)
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
set search_path = public
as $$
  select gp.id, gp.group_id, gp.place_id, gp.primary_category, gp.status, group_row.name,
    place.name, place.branch_name, place.address, place.city, place.district, place.latitude, place.longitude, place.phone,
    stats.average_rating, stats.mark_count, stats.recommend_count,
    opinion.bowl_strength, opinion.friend_count, opinion.tasty_count, opinion.comfortable_count, opinion.good_for_chat_count, opinion.good_value_count,
    coalesce(timeline.rows, '[]'::jsonb),
    coalesce(gallery.thumbnail_object_keys, '{}'::text[])
  from public.group_places gp
  join public.groups group_row on group_row.id = gp.group_id and group_row.status = 'active'
  join public.places place on place.id = gp.place_id
  left join public.group_place_stats stats on stats.group_place_id = gp.id
  left join lateral (
    select round(avg(co.strength))::smallint as bowl_strength,
      count(*)::bigint as friend_count,
      count(*) filter (where 'tasty' = any(co.tags))::bigint as tasty_count,
      count(*) filter (where 'comfortable' = any(co.tags))::bigint as comfortable_count,
      count(*) filter (where 'good_for_chat' = any(co.tags))::bigint as good_for_chat_count,
      count(*) filter (where 'good_value' = any(co.tags))::bigint as good_value_count
    from public.current_opinions co where co.group_place_id = gp.id
  ) opinion on true
  left join lateral (
    select jsonb_agg(to_jsonb(items) order by items.created_at desc) as rows
    from (
      select visit.id as visit_record_id, visit.visited_on, visit.strength, visit.tags, visit.note, visit.dishes, visit.created_at,
        case when visit.is_anonymous then '匿名成员' when member.status <> 'active' then '已离开成员' else profile.display_name end as display_name,
        visit.user_id = auth.uid() as can_delete
      from public.visit_records visit
      join public.group_members member on member.group_id = gp.group_id and member.user_id = visit.user_id
      left join public.profiles profile on profile.id = visit.user_id
      where visit.group_place_id = gp.id and visit.deleted_at is null and visit.hidden_at is null
      order by visit.created_at desc limit greatest(1, least(coalesce(p_timeline_limit, 20), 20))
    ) items
  ) timeline on true
  left join lateral (
    select array_agg(selected.thumbnail_object_key order by selected.sort_order, selected.created_at desc) as thumbnail_object_keys
    from (
      select photo.thumbnail_object_key, photo.sort_order, photo.created_at
      from public.photos photo
      where photo.group_place_id = gp.id and photo.deleted_at is null and photo.hidden_at is null and photo.thumbnail_object_key is not null
      order by photo.sort_order, photo.created_at desc limit 12
    ) selected
  ) gallery on true
  where gp.id = p_group_place_id and gp.status <> 'archived' and public.is_active_group_member(gp.group_id);
$$;

revoke all on function public.get_active_group_context_v2() from public, anon;
grant execute on function public.get_active_group_context_v2() to authenticated;
revoke all on function public.list_discovery_cards_v2(integer, timestamptz, uuid) from public, anon;
grant execute on function public.list_discovery_cards_v2(integer, timestamptz, uuid) to authenticated;
revoke all on function public.list_group_visit_feed_v2(integer, timestamptz, uuid) from public, anon;
grant execute on function public.list_group_visit_feed_v2(integer, timestamptz, uuid) to authenticated;
revoke all on function public.get_group_place_detail_v2(uuid, integer) from public, anon;
grant execute on function public.get_group_place_detail_v2(uuid, integer) to authenticated;
revoke all on function public.register_photo_thumbnail(uuid, text, integer, integer, integer) from public, anon;
grant execute on function public.register_photo_thumbnail(uuid, text, integer, integer, integer) to authenticated, service_role;
revoke all on function public.delete_my_photo_v2(uuid) from public, anon;
grant execute on function public.delete_my_photo_v2(uuid) to authenticated;
revoke all on function public.delete_my_visit_record(uuid) from public, anon;
grant execute on function public.delete_my_visit_record(uuid) to authenticated;
