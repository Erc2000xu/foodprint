-- Phase 3: private, group-scoped photos attached to a mark or a visit.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('place-photos', 'place-photos', false, 1572864, array['image/webp'])
on conflict (id) do update set public = false, file_size_limit = 1572864, allowed_mime_types = array['image/webp'];

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  group_place_id uuid not null references public.group_places(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  place_mark_id uuid references public.place_marks(id) on delete cascade,
  visit_id uuid references public.visits(id) on delete cascade,
  storage_provider text not null default 'supabase' check (storage_provider in ('supabase', 'cos')),
  object_key text not null unique check (char_length(object_key) between 1 and 800),
  width integer check (width is null or width between 1 and 10000),
  height integer check (height is null or height between 1 and 10000),
  size_bytes integer not null check (size_bytes between 1 and 1572864),
  sort_order smallint not null default 0 check (sort_order between 0 and 99),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (place_mark_id is not null or visit_id is not null)
);

create index photos_group_place_current_idx on public.photos (group_place_id, sort_order, created_at desc) where deleted_at is null;
create index photos_owner_current_idx on public.photos (user_id, created_at desc) where deleted_at is null;

alter table public.photos enable row level security;

create policy "members read current group photos" on public.photos for select to authenticated using (
  deleted_at is null and public.is_active_group_member(group_id)
);
create policy "members insert own mark photos" on public.photos for insert to authenticated with check (
  user_id = auth.uid() and public.is_active_group_member(group_id, auth.uid()) and exists (
    select 1 from public.place_marks mark
    join public.group_places group_place on group_place.id = mark.group_place_id
    where mark.id = photos.place_mark_id and mark.user_id = auth.uid()
      and group_place.id = photos.group_place_id and group_place.group_id = photos.group_id
  )
);
create policy "members soft delete own photos" on public.photos for update to authenticated using (
  user_id = auth.uid() and public.is_active_group_member(group_id, auth.uid())
) with check (
  user_id = auth.uid() and public.is_active_group_member(group_id, auth.uid())
);

create policy "members upload own group photos" on storage.objects for insert to authenticated with check (
  bucket_id = 'place-photos'
  and (storage.foldername(name))[1] = 'groups'
  and (storage.foldername(name))[3] = 'users'
  and (storage.foldername(name))[4] = auth.uid()::text
  and public.is_active_group_member(((storage.foldername(name))[2])::uuid, auth.uid())
);
create policy "members read own group photo objects" on storage.objects for select to authenticated using (
  bucket_id = 'place-photos'
  and (storage.foldername(name))[1] = 'groups'
  and public.is_active_group_member(((storage.foldername(name))[2])::uuid, auth.uid())
);
create policy "members delete own photo objects" on storage.objects for delete to authenticated using (
  bucket_id = 'place-photos'
  and (storage.foldername(name))[1] = 'groups'
  and (storage.foldername(name))[4] = auth.uid()::text
  and public.is_active_group_member(((storage.foldername(name))[2])::uuid, auth.uid())
);

revoke all on table public.photos from anon, authenticated;
grant select, insert, update on table public.photos to authenticated;
