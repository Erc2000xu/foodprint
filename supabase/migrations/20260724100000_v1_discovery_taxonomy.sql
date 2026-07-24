-- Foodprint V1: controlled discovery taxonomy for Beijing.
-- This migration is additive. Existing places remain readable until metadata
-- is progressively confirmed by members or an Owner/Admin.

create table public.cuisine_categories (
  slug text primary key check (slug ~ '^[a-z0-9_]+$'),
  parent_slug text references public.cuisine_categories(slug) on delete restrict,
  name text not null unique check (char_length(trim(name)) between 1 and 40),
  aliases text[] not null default '{}'::text[],
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.place_cuisines (
  group_place_id uuid not null references public.group_places(id) on delete cascade,
  cuisine_slug text not null references public.cuisine_categories(slug) on delete restrict,
  is_primary boolean not null default false,
  source text not null default 'manual' check (source in ('manual', 'amap', 'admin')),
  created_at timestamptz not null default now(),
  primary key (group_place_id, cuisine_slug)
);

create unique index place_cuisines_one_primary_idx
  on public.place_cuisines (group_place_id)
  where is_primary;

create table public.geo_entities (
  id uuid primary key default gen_random_uuid(),
  city text not null default '北京' check (char_length(trim(city)) between 1 and 80),
  kind text not null check (kind in ('district', 'business_district', 'metro_line', 'metro_station')),
  name text not null check (char_length(trim(name)) between 1 and 80),
  normalized_name text not null,
  aliases text[] not null default '{}'::text[],
  parent_id uuid references public.geo_entities(id) on delete restrict,
  latitude numeric(10,7),
  longitude numeric(10,7),
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (city, kind, normalized_name)
);

create table public.place_geo_entities (
  group_place_id uuid not null references public.group_places(id) on delete cascade,
  geo_entity_id uuid not null references public.geo_entities(id) on delete cascade,
  source text not null default 'manual' check (source in ('manual', 'amap', 'proximity', 'admin')),
  confidence numeric(3,2) check (confidence is null or confidence between 0 and 1),
  is_primary boolean not null default false,
  walking_distance_m integer check (walking_distance_m is null or walking_distance_m >= 0),
  created_at timestamptz not null default now(),
  primary key (group_place_id, geo_entity_id)
);

create table public.group_place_discovery_metadata (
  group_place_id uuid primary key references public.group_places(id) on delete cascade,
  price_status text not null default 'unknown' check (price_status in ('known', 'unknown')),
  cover_photo_id uuid references public.photos(id) on delete set null,
  metadata_status text not null default 'pending' check (metadata_status in ('pending', 'complete')),
  updated_at timestamptz not null default now()
);

create trigger group_place_discovery_metadata_set_updated_at
before update on public.group_place_discovery_metadata
for each row execute function public.set_updated_at();

create index place_cuisines_slug_idx on public.place_cuisines (cuisine_slug, group_place_id);
create index geo_entities_lookup_idx on public.geo_entities (city, kind, normalized_name);
create index place_geo_entities_entity_idx on public.place_geo_entities (geo_entity_id, group_place_id);

alter table public.cuisine_categories enable row level security;
alter table public.place_cuisines enable row level security;
alter table public.geo_entities enable row level security;
alter table public.place_geo_entities enable row level security;
alter table public.group_place_discovery_metadata enable row level security;

create policy "authenticated users read cuisine taxonomy"
  on public.cuisine_categories for select to authenticated using (is_active);
create policy "authenticated users read geo taxonomy"
  on public.geo_entities for select to authenticated using (is_active);
create policy "members read group place cuisines"
  on public.place_cuisines for select to authenticated
  using (exists (select 1 from public.group_places gp where gp.id = place_cuisines.group_place_id and public.is_active_group_member(gp.group_id)));
create policy "members read group place geo entities"
  on public.place_geo_entities for select to authenticated
  using (exists (select 1 from public.group_places gp where gp.id = place_geo_entities.group_place_id and public.is_active_group_member(gp.group_id)));
create policy "members read group place discovery metadata"
  on public.group_place_discovery_metadata for select to authenticated
  using (exists (select 1 from public.group_places gp where gp.id = group_place_discovery_metadata.group_place_id and public.is_active_group_member(gp.group_id)));

revoke all on public.cuisine_categories, public.place_cuisines, public.geo_entities, public.place_geo_entities, public.group_place_discovery_metadata from anon, authenticated;
grant select on public.cuisine_categories, public.place_cuisines, public.geo_entities, public.place_geo_entities, public.group_place_discovery_metadata to authenticated;

create or replace function public.set_group_place_cuisines(
  p_group_place_id uuid,
  p_cuisine_slugs text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_slug text;
begin
  select group_id into v_group_id from public.group_places where id = p_group_place_id;
  if v_group_id is null or not public.is_active_group_member(v_group_id, auth.uid()) then
    raise exception 'active group membership required' using errcode = '42501';
  end if;
  if coalesce(array_length(p_cuisine_slugs, 1), 0) < 1 or coalesce(array_length(p_cuisine_slugs, 1), 0) > 4 then
    raise exception 'select one primary cuisine and at most three detail tags' using errcode = '22023';
  end if;
  foreach v_slug in array p_cuisine_slugs loop
    if not exists (select 1 from public.cuisine_categories where slug = v_slug and is_active) then
      raise exception 'unknown cuisine' using errcode = '22023';
    end if;
  end loop;
  delete from public.place_cuisines where group_place_id = p_group_place_id and source = 'manual';
  insert into public.place_cuisines (group_place_id, cuisine_slug, is_primary, source)
  select p_group_place_id, value, ordinal = 1, 'manual'
  from unnest(p_cuisine_slugs) with ordinality as cuisines(value, ordinal);
end;
$$;

revoke all on function public.set_group_place_cuisines(uuid, text[]) from public, anon;
grant execute on function public.set_group_place_cuisines(uuid, text[]) to authenticated;

insert into public.cuisine_categories (slug, name, aliases, sort_order) values
  ('beijing_northern', '北京菜/北方菜', array['北京菜','北方菜','烤鸭'], 10),
  ('cantonese', '粤菜', array['广东菜','粤式'], 20),
  ('sichuan_hunan', '川菜/湘菜', array['川菜','湘菜'], 30),
  ('jiangzhe', '江浙菜/本帮菜', array['江浙菜','本帮菜'], 40),
  ('hotpot', '火锅', array['涮肉','涮锅'], 50),
  ('barbecue', '烧烤', array['烤串','烤肉'], 60),
  ('japanese', '日料', array['日本料理','寿司'], 70),
  ('korean', '韩餐', array['韩国料理'], 80),
  ('southeast_asian', '东南亚菜', array['泰餐','越南菜'], 90),
  ('western', '西餐', array['意大利菜','牛排'], 100),
  ('quick_bite', '小吃快餐/面食', array['面馆','小吃','快餐'], 110),
  ('seafood', '海鲜', array['海鲜料理'], 120),
  ('vegetarian_light', '素食/轻食', array['轻食','素食'], 130),
  ('coffee_tea', '咖啡/茶饮', array['咖啡馆','咖啡','茶饮'], 140),
  ('dessert_bakery', '甜品/烘焙', array['甜品','烘焙'], 150),
  ('chaoshan', '潮汕菜', array['潮州菜'], 201),
  ('shunde', '顺德菜', array['顺德'], 202),
  ('yunnan', '云南菜', array['云南'], 203),
  ('guizhou', '贵州菜', array['贵州'], 204),
  ('izakaya', '居酒屋', array['日式居酒屋'], 205),
  ('omakase', 'Omakase', array['omakase'], 206),
  ('brunch', 'Brunch', array['早午餐'], 207)
on conflict (slug) do update set name = excluded.name, aliases = excluded.aliases, sort_order = excluded.sort_order, is_active = true;

insert into public.geo_entities (city, kind, name, normalized_name, sort_order) values
  ('北京', 'district', '东城区', '东城区', 10),
  ('北京', 'district', '西城区', '西城区', 20),
  ('北京', 'district', '朝阳区', '朝阳区', 30),
  ('北京', 'district', '海淀区', '海淀区', 40),
  ('北京', 'district', '丰台区', '丰台区', 50),
  ('北京', 'business_district', '王府井', '王府井', 10),
  ('北京', 'business_district', '三里屯', '三里屯', 20),
  ('北京', 'business_district', '国贸', '国贸', 30),
  ('北京', 'business_district', '望京', '望京', 40),
  ('北京', 'business_district', '中关村', '中关村', 50)
on conflict (city, kind, normalized_name) do update set name = excluded.name, is_active = true;
