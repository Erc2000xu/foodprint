-- Foodprint V1: Beijing metro seeds and recoverable discovery metadata refresh.
-- This migration is additive and may be applied after 20260724100000.

update public.cuisine_categories set parent_slug = case slug
  when 'chaoshan' then 'cantonese' when 'shunde' then 'cantonese'
  when 'izakaya' then 'japanese' when 'omakase' then 'japanese'
  when 'brunch' then 'western' when 'yunnan' then 'southeast_asian'
  when 'guizhou' then 'sichuan_hunan' else parent_slug end
where slug in ('chaoshan', 'shunde', 'izakaya', 'omakase', 'brunch', 'yunnan', 'guizhou');

insert into public.geo_entities (city, kind, name, normalized_name, sort_order) values
  ('北京', 'metro_line', '1号线', '1号线', 110),
  ('北京', 'metro_line', '4号线', '4号线', 120),
  ('北京', 'metro_line', '10号线', '10号线', 130),
  ('北京', 'metro_line', '15号线', '15号线', 140)
on conflict (city, kind, normalized_name) do update set name = excluded.name, is_active = true;

insert into public.geo_entities (city, kind, name, normalized_name, parent_id, sort_order) values
  ('北京', 'metro_station', '王府井站', '王府井站', (select id from public.geo_entities where city = '北京' and kind = 'metro_line' and normalized_name = '1号线'), 210),
  ('北京', 'metro_station', '国贸站', '国贸站', (select id from public.geo_entities where city = '北京' and kind = 'metro_line' and normalized_name = '1号线'), 220),
  ('北京', 'metro_station', '中关村站', '中关村站', (select id from public.geo_entities where city = '北京' and kind = 'metro_line' and normalized_name = '4号线'), 230),
  ('北京', 'metro_station', '团结湖站', '团结湖站', (select id from public.geo_entities where city = '北京' and kind = 'metro_line' and normalized_name = '10号线'), 240),
  ('北京', 'metro_station', '望京站', '望京站', (select id from public.geo_entities where city = '北京' and kind = 'metro_line' and normalized_name = '15号线'), 250)
on conflict (city, kind, normalized_name) do update set name = excluded.name, parent_id = excluded.parent_id, is_active = true;

-- Backfill only deterministic AMap district/address hints. Manual associations
-- are never overwritten by this source and can be confirmed in Admin later.
insert into public.place_geo_entities (group_place_id, geo_entity_id, source, confidence, is_primary)
select gp.id, entity.id, 'amap', 0.85, true
from public.group_places gp
join public.places place on place.id = gp.place_id
join public.geo_entities entity on entity.city = '北京' and entity.kind = 'district'
  and entity.normalized_name = coalesce(place.district, '')
where gp.status = 'active'
on conflict (group_place_id, geo_entity_id) do nothing;

insert into public.place_geo_entities (group_place_id, geo_entity_id, source, confidence, is_primary)
select gp.id, entity.id, 'amap', 0.60, false
from public.group_places gp
join public.places place on place.id = gp.place_id
join public.geo_entities entity on entity.city = '北京' and entity.kind = 'business_district'
  and position(entity.name in coalesce(place.address, '')) > 0
where gp.status = 'active'
on conflict (group_place_id, geo_entity_id) do nothing;

create or replace function public.refresh_group_place_discovery_metadata(p_group_place_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_place_id uuid;
  v_price_known boolean;
  v_cover_photo_id uuid;
begin
  select group_id, place_id into v_group_id, v_place_id from public.group_places where id = p_group_place_id;
  if v_group_id is null or not public.is_active_group_member(v_group_id, auth.uid()) then
    raise exception 'active group membership required' using errcode = '42501';
  end if;
  select exists(select 1 from public.place_marks where group_place_id = p_group_place_id and deleted_at is null and price_per_person is not null) into v_price_known;
  select id into v_cover_photo_id from public.photos where group_place_id = p_group_place_id and deleted_at is null order by sort_order, created_at limit 1;
  insert into public.group_place_discovery_metadata (group_place_id, price_status, cover_photo_id, metadata_status)
  values (p_group_place_id, case when v_price_known then 'known' else 'unknown' end, v_cover_photo_id, 'pending')
  on conflict (group_place_id) do update set price_status = excluded.price_status, cover_photo_id = coalesce(group_place_discovery_metadata.cover_photo_id, excluded.cover_photo_id), updated_at = now();
  insert into public.place_geo_entities (group_place_id, geo_entity_id, source, confidence, is_primary)
  select p_group_place_id, entity.id, 'amap', 0.85, true
  from public.places place join public.geo_entities entity on entity.city = '北京' and entity.kind = 'district' and entity.normalized_name = coalesce(place.district, '')
  where place.id = v_place_id
  on conflict (group_place_id, geo_entity_id) do nothing;
end;
$$;

create or replace function public.set_group_place_discovery_geo_entities(p_group_place_id uuid, p_geo_entity_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_group_id uuid;
begin
  select group_id into v_group_id from public.group_places where id = p_group_place_id;
  if v_group_id is null or not public.has_group_role(v_group_id, array['owner'::public.group_role, 'admin'::public.group_role]) then
    raise exception 'administrator role required' using errcode = '42501';
  end if;
  if coalesce(array_length(p_geo_entity_ids, 1), 0) > 4 then raise exception 'at most four geographic associations' using errcode = '22023'; end if;
  if exists (select 1 from unnest(p_geo_entity_ids) value where not exists (select 1 from public.geo_entities e where e.id = value and e.city = '北京' and e.is_active)) then
    raise exception 'unknown geo entity' using errcode = '22023';
  end if;
  delete from public.place_geo_entities where group_place_id = p_group_place_id and source = 'admin';
  insert into public.place_geo_entities (group_place_id, geo_entity_id, source, confidence, is_primary)
  select p_group_place_id, value, 'admin', 1, false from unnest(coalesce(p_geo_entity_ids, '{}'::uuid[])) value
  on conflict (group_place_id, geo_entity_id) do update set source = 'admin', confidence = 1;
  perform public.refresh_group_place_discovery_metadata(p_group_place_id);
end;
$$;

revoke all on function public.refresh_group_place_discovery_metadata(uuid) from public, anon;
revoke all on function public.set_group_place_discovery_geo_entities(uuid, uuid[]) from public, anon;
grant execute on function public.refresh_group_place_discovery_metadata(uuid) to authenticated;
grant execute on function public.set_group_place_discovery_geo_entities(uuid, uuid[]) to authenticated;

-- Make legacy rows visible in the controlled completion queue without forcing
-- members to re-enter their past recommendations.
insert into public.group_place_discovery_metadata (group_place_id, price_status, cover_photo_id, metadata_status)
select gp.id,
       case when exists(select 1 from public.place_marks mark where mark.group_place_id = gp.id and mark.deleted_at is null and mark.price_per_person is not null) then 'known' else 'unknown' end,
       (select photo.id from public.photos photo where photo.group_place_id = gp.id and photo.deleted_at is null order by photo.sort_order, photo.created_at limit 1),
       'pending'
from public.group_places gp
where gp.status = 'active'
on conflict (group_place_id) do nothing;
