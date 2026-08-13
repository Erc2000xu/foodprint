-- V2.3: complete, authorized discovery index for the dynamic map.
-- This is forward-only. The V2.2 read model remains available to older clients.

create or replace function public.list_discovery_index_v2_3(
  p_limit integer default 100,
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
  coordinate_system text,
  average_rating numeric,
  mark_count bigint,
  recommend_count bigint,
  price_per_person numeric,
  short_review text,
  recommended_items text[],
  cuisine_slugs text[],
  scene_tags text[],
  geo_entity_ids uuid[],
  geo_labels text[],
  business_area_name text,
  business_area_adcode text,
  last_marked_at timestamptz,
  bowl_strength smallint,
  friend_count bigint,
  tasty_count bigint,
  comfortable_count bigint,
  good_for_chat_count bigint,
  good_value_count bigint,
  saved_for_later boolean,
  cover_photo_id uuid,
  cover_photo_width integer,
  cover_photo_height integer,
  next_cursor_created_at timestamptz,
  next_cursor_id uuid,
  has_more boolean
)
language sql
security definer
stable
set search_path = public
as $$
  with active_group as (
    select group_id from public.get_active_group_context_v2()
  ),
  selected as (
    select
      gp.id as group_place_id,
      place.name as place_name,
      gp.primary_category,
      place.address,
      place.city,
      place.district,
      place.latitude,
      place.longitude,
      place.coordinate_system,
      coalesce(legacy_stats.average_rating, 0)::numeric as average_rating,
      coalesce(opinion.friend_count, 0)::bigint as mark_count,
      coalesce(opinion.friend_count, 0)::bigint as recommend_count,
      latest_content.price_per_person,
      latest_content.short_review,
      coalesce(latest_content.recommended_items, '{}'::text[]) as recommended_items,
      coalesce(cuisines.cuisine_slugs, '{}'::text[]) as cuisine_slugs,
      coalesce(scenes.scene_tags, '{}'::text[]) as scene_tags,
      coalesce(geo.geo_entity_ids, '{}'::uuid[]) as geo_entity_ids,
      coalesce(geo.geo_labels, '{}'::text[]) as geo_labels,
      business_area.business_area_name,
      business_area.adcode as business_area_adcode,
      coalesce(opinion.last_visited_at, gp.created_at) as last_marked_at,
      opinion.bowl_strength,
      coalesce(opinion.friend_count, 0)::bigint as friend_count,
      coalesce(opinion.tasty_count, 0)::bigint as tasty_count,
      coalesce(opinion.comfortable_count, 0)::bigint as comfortable_count,
      coalesce(opinion.good_for_chat_count, 0)::bigint as good_for_chat_count,
      coalesce(opinion.good_value_count, 0)::bigint as good_value_count,
      exists (
        select 1
        from public.wishlist_items item
        where item.group_place_id = gp.id and item.user_id = auth.uid()
      ) as saved_for_later,
      cover.id as cover_photo_id,
      cover.thumbnail_width as cover_photo_width,
      cover.thumbnail_height as cover_photo_height,
      gp.created_at
    from public.group_places gp
    join active_group on active_group.group_id = gp.group_id
    join public.places place on place.id = gp.place_id
    left join public.group_place_stats legacy_stats on legacy_stats.group_place_id = gp.id
    left join lateral (
      select
        round(avg(co.strength))::smallint as bowl_strength,
        count(*)::bigint as friend_count,
        count(*) filter (where 'tasty' = any(co.tags))::bigint as tasty_count,
        count(*) filter (where 'comfortable' = any(co.tags))::bigint as comfortable_count,
        count(*) filter (where 'good_for_chat' = any(co.tags))::bigint as good_for_chat_count,
        count(*) filter (where 'good_value' = any(co.tags))::bigint as good_value_count,
        max(coalesce(co.last_visited_on::timestamptz, co.updated_at)) as last_visited_at
      from public.current_opinions co
      where co.group_place_id = gp.id
    ) opinion on true
    left join lateral (
      select content.price_per_person, content.short_review, content.recommended_items
      from (
        select
          visit_record.visited_on,
          visit_record.created_at,
          null::numeric as price_per_person,
          visit_record.note as short_review,
          visit_record.dishes as recommended_items
        from public.visit_records visit_record
        where visit_record.group_place_id = gp.id
          and visit_record.deleted_at is null
          and visit_record.hidden_at is null
        union all
        select
          mark.last_visited_on,
          mark.updated_at,
          mark.price_per_person,
          mark.short_review,
          mark.recommended_items
        from public.place_marks mark
        where mark.group_place_id = gp.id and mark.deleted_at is null
      ) content
      order by content.visited_on desc nulls last, content.created_at desc
      limit 1
    ) latest_content on true
    left join lateral (
      select array_agg(pc.cuisine_slug order by pc.is_primary desc, pc.cuisine_slug) as cuisine_slugs
      from public.place_cuisines pc
      where pc.group_place_id = gp.id
    ) cuisines on true
    left join lateral (
      select
        array_agg(distinct scene_tag.scene_tag_slug order by scene_tag.scene_tag_slug) as scene_tags
      from public.place_marks mark
      join public.place_mark_scene_tags scene_tag on scene_tag.place_mark_id = mark.id
      where mark.group_place_id = gp.id and mark.deleted_at is null
    ) scenes on true
    left join lateral (
      select
        array_agg(entity.id order by entity.sort_order, entity.id) as geo_entity_ids,
        array_agg(entity.name order by entity.sort_order, entity.id) as geo_labels
      from public.place_geo_entities link
      join public.geo_entities entity on entity.id = link.geo_entity_id and entity.is_active
      where link.group_place_id = gp.id
    ) geo on true
    left join lateral (
      select cache.business_area_name, cache.adcode
      from public.place_amap_business_area_cache cache
      where cache.place_id = place.id and cache.status = 'success'
      limit 1
    ) business_area on true
    left join lateral (
      select photo.id, photo.thumbnail_width, photo.thumbnail_height
      from public.photos photo
      where photo.group_place_id = gp.id
        and photo.deleted_at is null
        and photo.hidden_at is null
        and photo.thumbnail_object_key is not null
      order by photo.sort_order, photo.created_at desc
      limit 1
    ) cover on true
    where gp.status = 'active'
      and opinion.friend_count > 0
      and (
        p_before_created_at is null
        or (gp.created_at, gp.id) < (p_before_created_at, p_before_id)
      )
    order by gp.created_at desc, gp.id desc
    limit least(greatest(coalesce(p_limit, 100), 1), 100) + 1
  ),
  page as (
    select selected.*
    from selected
    order by selected.created_at desc, selected.group_place_id desc
    limit least(greatest(coalesce(p_limit, 100), 1), 100)
  ),
  page_cursor as (
    select page.created_at as cursor_created_at, page.group_place_id as cursor_id
    from page
    order by page.created_at asc, page.group_place_id asc
    limit 1
  ),
  page_meta as (
    select count(*) > least(greatest(coalesce(p_limit, 100), 1), 100) as has_more
    from selected
  )
  select
    page.group_place_id,
    page.place_name,
    page.primary_category,
    page.address,
    page.city,
    page.district,
    page.latitude,
    page.longitude,
    page.coordinate_system,
    page.average_rating,
    page.mark_count,
    page.recommend_count,
    page.price_per_person,
    page.short_review,
    page.recommended_items,
    page.cuisine_slugs,
    page.scene_tags,
    page.geo_entity_ids,
    page.geo_labels,
    page.business_area_name,
    page.business_area_adcode,
    page.last_marked_at,
    page.bowl_strength,
    page.friend_count,
    page.tasty_count,
    page.comfortable_count,
    page.good_for_chat_count,
    page.good_value_count,
    page.saved_for_later,
    page.cover_photo_id,
    page.cover_photo_width,
    page.cover_photo_height,
    page_cursor.cursor_created_at,
    page_cursor.cursor_id,
    page_meta.has_more
  from page
  cross join page_cursor
  cross join page_meta;
$$;

revoke all on function public.list_discovery_index_v2_3(integer, timestamptz, uuid) from public, anon;
grant execute on function public.list_discovery_index_v2_3(integer, timestamptz, uuid) to authenticated;
