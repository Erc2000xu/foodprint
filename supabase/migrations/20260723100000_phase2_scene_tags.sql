-- Phase 2: controlled personal scene tags for a real-experience mark.
-- Tags are seeded by the product and may only be changed through the RPC below.

create table public.scene_tags (
  slug text primary key check (slug ~ '^[a-z0-9_]{2,50}$'),
  label text not null unique check (char_length(trim(label)) between 1 and 40),
  sort_order smallint not null unique check (sort_order > 0),
  created_at timestamptz not null default now()
);

insert into public.scene_tags (slug, label, sort_order) values
  ('business_dining', '商务宴请', 1),
  ('friends_gathering', '朋友聚会', 2),
  ('date', '约会', 3),
  ('family_meal', '家庭聚餐', 4),
  ('solo', '一个人', 5),
  ('quick_bite', '快速简餐', 6),
  ('work_study', '工作 / 学习', 7),
  ('celebration', '庆祝纪念', 8),
  ('late_night', '深夜', 9),
  ('out_of_town_friends', '带外地朋友', 10),
  ('travel_checkin', '旅行打卡', 11),
  ('takeaway', '外带 / 打包', 12);

create table public.place_mark_scene_tags (
  place_mark_id uuid not null references public.place_marks(id) on delete cascade,
  scene_tag_slug text not null references public.scene_tags(slug) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (place_mark_id, scene_tag_slug)
);

create index place_mark_scene_tags_mark_idx on public.place_mark_scene_tags (place_mark_id);

alter table public.scene_tags enable row level security;
alter table public.place_mark_scene_tags enable row level security;

create policy "members read controlled scene tags" on public.scene_tags
  for select to authenticated using (true);

create policy "members read scene tags for group marks" on public.place_mark_scene_tags
  for select to authenticated using (
    exists (
      select 1 from public.place_marks mark
      join public.group_places group_place on group_place.id = mark.group_place_id
      where mark.id = place_mark_scene_tags.place_mark_id
        and mark.deleted_at is null
        and public.is_active_group_member(group_place.group_id)
    )
  );

create or replace function public.set_place_mark_scene_tags(
  p_mark_id uuid,
  p_scene_tag_slugs text[] default '{}'::text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_group_id uuid;
  v_requested text[] := array(
    select distinct trim(requested_slug)
    from unnest(coalesce(p_scene_tag_slugs, '{}'::text[])) as requested_slug
    where nullif(trim(requested_slug), '') is not null
    order by trim(requested_slug)
  );
begin
  select group_place.group_id into v_group_id
  from public.place_marks mark
  join public.group_places group_place on group_place.id = mark.group_place_id
  where mark.id = p_mark_id
    and mark.user_id = v_user_id
    and mark.deleted_at is null
  for update of mark;

  if v_user_id is null or v_group_id is null or not public.is_active_group_member(v_group_id, v_user_id) then
    raise exception 'only an active member can update their own scene tags' using errcode = '42501';
  end if;
  if coalesce(cardinality(v_requested), 0) > 12 then
    raise exception 'at most 12 scene tags may be selected' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_requested) as requested(slug)
    left join public.scene_tags tag on tag.slug = requested.slug
    where tag.slug is null
  ) then
    raise exception 'one or more scene tags are invalid' using errcode = '22023';
  end if;

  delete from public.place_mark_scene_tags where place_mark_id = p_mark_id;
  insert into public.place_mark_scene_tags (place_mark_id, scene_tag_slug)
  select p_mark_id, requested.slug from unnest(v_requested) as requested(slug);

  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_group_id, v_user_id, 'place_mark.scene_tags_updated', 'place_mark', p_mark_id,
    jsonb_build_object('scene_tag_slugs', coalesce(v_requested, '{}'::text[])));
end;
$$;

revoke all on table public.scene_tags, public.place_mark_scene_tags from anon, authenticated;
grant select on table public.scene_tags, public.place_mark_scene_tags to authenticated;
revoke all on function public.set_place_mark_scene_tags(uuid, text[]) from public, anon;
grant execute on function public.set_place_mark_scene_tags(uuid, text[]) to authenticated;
