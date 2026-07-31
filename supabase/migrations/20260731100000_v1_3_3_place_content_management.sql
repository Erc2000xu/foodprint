-- V1.3.3: reversible, group-scoped place and content governance.
-- This migration intentionally only adds forward-compatible state and RPCs.

alter table public.group_places
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists archived_reason text;
alter table public.group_places
  drop constraint if exists group_places_archived_reason_length,
  add constraint group_places_archived_reason_length check (archived_reason is null or char_length(trim(archived_reason)) between 1 and 280);

-- Do not invent an actor for historic archived rows. This backfill must happen
-- before the stricter archive metadata constraint is added.
update public.group_places set archived_reason = '历史下架记录未留存原因'
where status = 'archived' and archived_reason is null;

alter table public.group_places
  drop constraint if exists group_places_archive_metadata_consistent,
  add constraint group_places_archive_metadata_consistent check (
    (status = 'archived' and archived_at is not null and archived_reason is not null)
    or (status <> 'archived' and archived_at is null and archived_by is null and archived_reason is null)
  );

alter table public.place_candidates
  add column if not exists resolution_type text,
  add column if not exists resolution_reason text;
alter table public.place_candidates
  drop constraint if exists place_candidates_resolution_type_valid,
  add constraint place_candidates_resolution_type_valid check (resolution_type is null or resolution_type in ('promoted', 'not_recommended', 'creator_removed', 'manager_removed')),
  drop constraint if exists place_candidates_resolution_reason_length,
  add constraint place_candidates_resolution_reason_length check (resolution_reason is null or char_length(trim(resolution_reason)) between 1 and 280),
  drop constraint if exists place_candidates_resolution_consistent,
  add constraint place_candidates_resolution_consistent check (
    (status = 'pending' and resolved_at is null and resolved_by is null and resolution_type is null and resolution_reason is null)
    or (status <> 'pending' and resolved_at is not null)
  );

update public.place_candidates set resolution_type = 'promoted'
where status = 'promoted' and resolution_type is null;

create index if not exists group_places_management_status_idx on public.group_places (group_id, status, updated_at desc);
create index if not exists place_candidates_management_status_idx on public.place_candidates (group_id, status, resolved_at desc);
create index if not exists visit_records_hidden_management_idx on public.visit_records (hidden_at desc) where hidden_at is not null and deleted_at is null;
create index if not exists photos_hidden_management_idx on public.photos (hidden_at desc) where hidden_at is not null and deleted_at is null;

create or replace function public.archive_group_place(p_group_place_id uuid, p_reason text)
returns table (previous_status public.group_place_status, current_status public.group_place_status, group_place_id uuid)
language plpgsql security definer set search_path = public as $$
declare v_place public.group_places; v_reason text := trim(coalesce(p_reason, ''));
begin
  select * into v_place from public.group_places where id = p_group_place_id for update;
  if not found then raise exception 'place not found' using errcode = '22023'; end if;
  if not public.has_group_role(v_place.group_id, array['owner'::public.group_role, 'admin'::public.group_role]) then raise exception 'owner or admin role required' using errcode = '42501'; end if;
  if char_length(v_reason) not between 1 and 280 then raise exception 'an archive reason of 1 to 280 characters is required' using errcode = '22023'; end if;
  if v_place.status = 'archived' then raise exception 'place is already archived' using errcode = '22023'; end if;
  update public.group_places set status = 'archived', archived_at = now(), archived_by = auth.uid(), archived_reason = v_reason where id = v_place.id;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_place.group_id, auth.uid(), 'group_place.archived', 'group_place', v_place.id, jsonb_build_object('previous_status', v_place.status, 'reason', v_reason));
  return query select v_place.status, 'archived'::public.group_place_status, v_place.id;
end; $$;

create or replace function public.restore_group_place(p_group_place_id uuid)
returns table (previous_status public.group_place_status, current_status public.group_place_status, group_place_id uuid)
language plpgsql security definer set search_path = public as $$
declare v_place public.group_places; v_next public.group_place_status;
begin
  select * into v_place from public.group_places where id = p_group_place_id for update;
  if not found then raise exception 'place not found' using errcode = '22023'; end if;
  if not public.has_group_role(v_place.group_id, array['owner'::public.group_role, 'admin'::public.group_role]) then raise exception 'owner or admin role required' using errcode = '42501'; end if;
  if v_place.status <> 'archived' then raise exception 'place is not archived' using errcode = '22023'; end if;
  v_next := case when exists (select 1 from public.current_opinions where group_place_id = v_place.id) then 'active'::public.group_place_status else 'inactive_no_marks'::public.group_place_status end;
  update public.group_places set status = v_next, archived_at = null, archived_by = null, archived_reason = null where id = v_place.id;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_place.group_id, auth.uid(), 'group_place.restored', 'group_place', v_place.id, jsonb_build_object('previous_status', 'archived', 'current_status', v_next));
  return query select 'archived'::public.group_place_status, v_next, v_place.id;
end; $$;

create or replace function public.remove_place_candidate(p_candidate_id uuid, p_reason text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_candidate public.place_candidates; v_reason text := nullif(trim(coalesce(p_reason, '')), ''); v_manager boolean;
begin
  select * into v_candidate from public.place_candidates where id = p_candidate_id for update;
  if not found or v_candidate.status <> 'pending' then raise exception 'pending candidate not found' using errcode = '22023'; end if;
  if not public.is_active_group_member(v_candidate.group_id, auth.uid()) then raise exception 'active group membership required' using errcode = '42501'; end if;
  v_manager := public.has_group_role(v_candidate.group_id, array['owner'::public.group_role, 'admin'::public.group_role]);
  if v_candidate.created_by <> auth.uid() and not v_manager then raise exception 'only the creator or a manager may remove this candidate' using errcode = '42501'; end if;
  if v_candidate.created_by <> auth.uid() and (v_reason is null or char_length(v_reason) > 280) then raise exception 'a manager reason of 1 to 280 characters is required' using errcode = '22023'; end if;
  if v_candidate.created_by = auth.uid() and v_reason is not null and char_length(v_reason) > 280 then raise exception 'reason must be at most 280 characters' using errcode = '22023'; end if;
  update public.place_candidates set status = 'dismissed', resolved_by = auth.uid(), resolved_at = now(), resolution_type = case when v_candidate.created_by = auth.uid() then 'creator_removed' else 'manager_removed' end, resolution_reason = v_reason where id = v_candidate.id;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_candidate.group_id, auth.uid(), 'place_candidate.removed', 'place_candidate', v_candidate.id, jsonb_build_object('resolution_type', case when v_candidate.created_by = auth.uid() then 'creator_removed' else 'manager_removed' end, 'reason', v_reason));
  return v_candidate.id;
end; $$;

create or replace function public.delete_place_candidate(p_candidate_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin perform public.remove_place_candidate(p_candidate_id, null); end; $$;

create or replace function public.restore_place_candidate(p_candidate_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_candidate public.place_candidates;
begin
  select * into v_candidate from public.place_candidates where id = p_candidate_id for update;
  if not found then raise exception 'candidate not found' using errcode = '22023'; end if;
  if not public.is_active_group_member(v_candidate.group_id, auth.uid()) then raise exception 'active group membership required' using errcode = '42501'; end if;
  if v_candidate.resolution_type not in ('creator_removed', 'manager_removed') then raise exception 'this candidate cannot be restored' using errcode = '22023'; end if;
  if v_candidate.created_by <> auth.uid() and not public.has_group_role(v_candidate.group_id, array['owner'::public.group_role, 'admin'::public.group_role]) then raise exception 'only the creator or a manager may restore this candidate' using errcode = '42501'; end if;
  if exists (select 1 from public.group_places where group_id = v_candidate.group_id and place_id = v_candidate.place_id and status in ('active', 'inactive_no_marks')) or exists (select 1 from public.place_candidates where group_id = v_candidate.group_id and place_id = v_candidate.place_id and status = 'pending') then raise exception 'a current place or candidate already exists' using errcode = '22023'; end if;
  update public.place_candidates set status = 'pending', resolved_by = null, resolved_at = null, resolution_type = null, resolution_reason = null where id = v_candidate.id;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id) values (v_candidate.group_id, auth.uid(), 'place_candidate.restored', 'place_candidate', v_candidate.id);
  return v_candidate.id;
end; $$;

create or replace function public.resolve_place_candidate(p_candidate_id uuid, p_would_recommend boolean, p_experience_attested boolean)
returns table (group_place_id uuid, status public.place_candidate_status)
language plpgsql security definer set search_path = public as $$
declare v_candidate public.place_candidates; v_user_id uuid := auth.uid(); v_group_place_id uuid; v_status public.place_candidate_status;
begin
  select * into v_candidate from public.place_candidates where id = p_candidate_id for update;
  if not found then raise exception 'candidate not found' using errcode = '22023'; end if;
  if v_user_id is null or not public.is_active_group_member(v_candidate.group_id, v_user_id) then raise exception 'active group membership required' using errcode = '42501'; end if;
  if v_candidate.status <> 'pending' or not p_experience_attested then raise exception 'a pending, real experience is required' using errcode = '22023'; end if;
  if p_would_recommend then
    insert into public.group_places (group_id, place_id, primary_category, status, created_by) values (v_candidate.group_id, v_candidate.place_id, 'restaurant', 'active', v_user_id)
    on conflict (group_id, place_id) do update set status = 'active', archived_at = null, archived_by = null, archived_reason = null returning id into v_group_place_id;
    v_status := 'promoted';
  else v_status := 'dismissed'; end if;
  update public.place_candidates set status = v_status, resolved_by = v_user_id, resolved_at = now(), resolution_type = case when p_would_recommend then 'promoted' else 'not_recommended' end, resolution_reason = null where id = v_candidate.id;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id, metadata) values (v_candidate.group_id, v_user_id, case when p_would_recommend then 'place_candidate.promoted' else 'place_candidate.dismissed' end, 'place_candidate', v_candidate.id, jsonb_build_object('group_place_id', v_group_place_id));
  return query select v_group_place_id, v_status;
end; $$;

create or replace function public.delete_my_visit_record(p_visit_record_id uuid)
returns table (group_place_id uuid, object_keys text[]) language plpgsql security definer set search_path = public as $$
declare v_user_id uuid := auth.uid(); v_group_id uuid; v_group_place_id uuid; v_snapshot public.visit_records;
begin
  select gp.group_id, visit.group_place_id into v_group_id, v_group_place_id from public.visit_records visit join public.group_places gp on gp.id = visit.group_place_id where visit.id = p_visit_record_id and visit.user_id = v_user_id and visit.deleted_at is null for update of visit;
  if v_user_id is null or v_group_id is null or not public.is_active_group_member(v_group_id, v_user_id) then raise exception 'only an active author can delete this visit' using errcode = '42501'; end if;
  update public.visit_records set deleted_at = now() where id = p_visit_record_id;
  select * into v_snapshot from public.visit_records where group_place_id = v_group_place_id and user_id = v_user_id and deleted_at is null order by visited_on desc nulls last, created_at desc limit 1 for update;
  if found then update public.current_opinions set strength = v_snapshot.strength, tags = v_snapshot.tags, is_anonymous = v_snapshot.is_anonymous, first_visited_on = v_snapshot.visited_on, last_visited_on = v_snapshot.visited_on where group_place_id = v_group_place_id and user_id = v_user_id;
  else delete from public.current_opinions where group_place_id = v_group_place_id and user_id = v_user_id; end if;
  if not exists (select 1 from public.current_opinions where group_place_id = v_group_place_id) then update public.group_places set status = 'inactive_no_marks', archived_at = null, archived_by = null, archived_reason = null where id = v_group_place_id and status <> 'archived'; end if;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id) values (v_group_id, v_user_id, 'visit_record.deleted', 'visit_record', p_visit_record_id);
  return query with deleted_photos as (update public.photos set deleted_at = now() where visit_record_id = p_visit_record_id and deleted_at is null returning object_key) select v_group_place_id, coalesce(array_agg(object_key), '{}'::text[]) from deleted_photos;
end; $$;

create or replace function public.restore_group_visit_record(p_visit_record_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_group_id uuid; v_group_place_id uuid;
begin
  select gp.group_id, visit.group_place_id into v_group_id, v_group_place_id from public.visit_records visit join public.group_places gp on gp.id = visit.group_place_id where visit.id = p_visit_record_id and visit.deleted_at is null for update of visit;
  if v_group_id is null or not public.has_group_role(v_group_id, array['owner'::public.group_role, 'admin'::public.group_role]) then raise exception 'owner or admin role required' using errcode = '42501'; end if;
  update public.visit_records set hidden_at = null, hidden_by = null, hidden_reason = null where id = p_visit_record_id;
  update public.photos set hidden_at = null, hidden_by = null, hidden_reason = null where visit_record_id = p_visit_record_id and deleted_at is null;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id) values (v_group_id, auth.uid(), 'visit_record.restored', 'visit_record', p_visit_record_id);
  return v_group_place_id;
end; $$;

create or replace function public.restore_group_photo(p_photo_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_group_id uuid; v_group_place_id uuid;
begin
  select group_id, group_place_id into v_group_id, v_group_place_id from public.photos where id = p_photo_id and deleted_at is null for update;
  if v_group_id is null or not public.has_group_role(v_group_id, array['owner'::public.group_role, 'admin'::public.group_role]) then raise exception 'owner or admin role required' using errcode = '42501'; end if;
  update public.photos set hidden_at = null, hidden_by = null, hidden_reason = null where id = p_photo_id;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id) values (v_group_id, auth.uid(), 'photo.restored', 'photo', p_photo_id);
  return v_group_place_id;
end; $$;

create or replace function public.list_group_place_management(p_group_id uuid, p_status text default 'active', p_query text default null, p_cursor timestamptz default null, p_limit integer default 50)
returns table (group_place_id uuid, place_name text, address text, primary_category text, status public.group_place_status, archived_at timestamptz, archived_reason text, archived_by_name text, bowl_strength smallint, opinion_count bigint, visit_count bigint, photo_count bigint, last_visited_on date, next_cursor timestamptz)
language sql security definer set search_path = public as $$
  with selected as (
    select gp.*, place.name as resolved_place_name, place.address as resolved_address
    from public.group_places gp join public.places place on place.id = gp.place_id
    where gp.group_id = p_group_id and gp.status::text = p_status and public.has_group_role(p_group_id, array['owner'::public.group_role, 'admin'::public.group_role])
      and (nullif(trim(p_query), '') is null or place.name ilike '%' || trim(p_query) || '%') and (p_cursor is null or gp.updated_at < p_cursor)
    order by gp.updated_at desc limit greatest(1, least(coalesce(p_limit, 50), 50))
  ) select selected.id, selected.resolved_place_name, selected.resolved_address, selected.primary_category, selected.status, selected.archived_at, selected.archived_reason, profile.display_name,
    round(avg(opinion.strength))::smallint, count(distinct opinion.id), count(distinct visit.id) filter (where visit.deleted_at is null), count(distinct photo.id) filter (where photo.deleted_at is null), max(visit.visited_on), selected.updated_at
  from selected left join public.profiles profile on profile.id = selected.archived_by left join public.current_opinions opinion on opinion.group_place_id = selected.id left join public.visit_records visit on visit.group_place_id = selected.id left join public.photos photo on photo.group_place_id = selected.id
  group by selected.id, selected.resolved_place_name, selected.resolved_address, selected.primary_category, selected.status, selected.archived_at, selected.archived_reason, profile.display_name, selected.updated_at
  order by selected.updated_at desc;
$$;

create or replace function public.list_hidden_group_content(p_group_id uuid, p_limit integer default 50)
returns table (content_id uuid, content_type text, group_place_id uuid, place_name text, hidden_at timestamptz, hidden_reason text)
language sql security definer set search_path = public as $$
  select visit.id, 'visit'::text, visit.group_place_id, place.name, visit.hidden_at, visit.hidden_reason
  from public.visit_records visit join public.group_places gp on gp.id = visit.group_place_id join public.places place on place.id = gp.place_id
  where gp.group_id = p_group_id and visit.deleted_at is null and visit.hidden_at is not null and public.has_group_role(p_group_id, array['owner'::public.group_role, 'admin'::public.group_role])
  union all
  select photo.id, 'photo'::text, photo.group_place_id, place.name, photo.hidden_at, photo.hidden_reason
  from public.photos photo join public.group_places gp on gp.id = photo.group_place_id join public.places place on place.id = gp.place_id
  where gp.group_id = p_group_id and photo.deleted_at is null and photo.hidden_at is not null and public.has_group_role(p_group_id, array['owner'::public.group_role, 'admin'::public.group_role])
  order by hidden_at desc limit greatest(1, least(coalesce(p_limit, 50), 50));
$$;

create or replace function public.list_managed_place_candidates(p_group_id uuid, p_status text default 'pending', p_limit integer default 50)
returns table (candidate_id uuid, place_name text, status public.place_candidate_status, created_at timestamptz, resolution_type text, resolution_reason text, resolved_at timestamptz)
language sql security definer set search_path = public as $$
  select candidate.id, place.name, candidate.status, candidate.created_at, candidate.resolution_type, candidate.resolution_reason, candidate.resolved_at
  from public.place_candidates candidate join public.places place on place.id = candidate.place_id
  where candidate.group_id = p_group_id and candidate.status::text = p_status and public.has_group_role(p_group_id, array['owner'::public.group_role, 'admin'::public.group_role])
  order by coalesce(candidate.resolved_at, candidate.created_at) desc limit greatest(1, least(coalesce(p_limit, 50), 50));
$$;

drop function if exists public.list_group_visit_feed(uuid);
create function public.list_group_visit_feed(p_group_id uuid)
returns table (visit_record_id uuid, group_place_id uuid, place_name text, visited_on date, strength smallint, tags text[], note text, dishes text[], created_at timestamptz, display_name text)
language sql security definer set search_path = public as $$
  select visit.id, gp.id, place.name, visit.visited_on, visit.strength, visit.tags, visit.note, visit.dishes, visit.created_at,
    case when visit.is_anonymous then '匿名成员' when member.status <> 'active' then '已离开成员' else profile.display_name end
  from public.visit_records visit join public.group_places gp on gp.id = visit.group_place_id join public.places place on place.id = gp.place_id join public.group_members member on member.group_id = gp.group_id and member.user_id = visit.user_id left join public.profiles profile on profile.id = visit.user_id
  where gp.group_id = p_group_id and gp.status = 'active' and visit.deleted_at is null and visit.hidden_at is null and public.is_active_group_member(p_group_id)
  order by visit.created_at desc limit 30;
$$;

revoke all on function public.archive_group_place(uuid, text), public.restore_group_place(uuid), public.remove_place_candidate(uuid, text), public.restore_place_candidate(uuid), public.restore_group_visit_record(uuid), public.restore_group_photo(uuid), public.list_group_place_management(uuid, text, text, timestamptz, integer), public.list_hidden_group_content(uuid, integer), public.list_managed_place_candidates(uuid, text, integer) from public, anon;
grant execute on function public.archive_group_place(uuid, text), public.restore_group_place(uuid), public.remove_place_candidate(uuid, text), public.restore_place_candidate(uuid), public.restore_group_visit_record(uuid), public.restore_group_photo(uuid), public.list_group_place_management(uuid, text, text, timestamptz, integer), public.list_hidden_group_content(uuid, integer), public.list_managed_place_candidates(uuid, text, integer), public.list_group_visit_feed(uuid) to authenticated;
