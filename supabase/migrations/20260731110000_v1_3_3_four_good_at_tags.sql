-- V1.3.3 follow-up: users may describe a meal with any combination of the
-- four fixed "好在哪儿" dimensions. This is a forward-only change for projects
-- that have already applied the V1.3 visit-history migration.

do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.current_opinions'::regclass
      and contype = 'c'
      and position('cardinality(tags) <= 2' in pg_get_constraintdef(oid)) > 0
  loop
    execute format('alter table public.current_opinions drop constraint %I', v_constraint.conname);
  end loop;

  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.visit_records'::regclass
      and contype = 'c'
      and position('cardinality(tags) <= 2' in pg_get_constraintdef(oid)) > 0
  loop
    execute format('alter table public.visit_records drop constraint %I', v_constraint.conname);
  end loop;
end;
$$;

alter table public.current_opinions
  add constraint current_opinions_tags_max_four check (cardinality(tags) <= 4);

alter table public.visit_records
  add constraint visit_records_tags_max_four check (cardinality(tags) <= 4);

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
    if coalesce(p_strength not between 1 and 3, true) or cardinality(v_tags) not between 1 and 4
      or not (v_tags <@ array['tasty', 'comfortable', 'good_for_chat', 'good_value']::text[]) then
      raise exception 'a strength and one to four valid opinion tags are required' using errcode = '22023';
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
