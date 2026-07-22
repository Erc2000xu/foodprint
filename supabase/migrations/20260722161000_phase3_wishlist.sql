-- Phase 3: a personal wishlist is separate from a real-experience mark.
create table public.wishlist_items (
  user_id uuid not null references public.profiles(id) on delete cascade,
  group_place_id uuid not null references public.group_places(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, group_place_id)
);

create index wishlist_items_group_place_idx on public.wishlist_items (group_place_id, created_at desc);

alter table public.wishlist_items enable row level security;

create policy "members read their own wishlist" on public.wishlist_items
  for select to authenticated using (user_id = auth.uid());

create or replace function public.set_wishlist_item(p_group_place_id uuid, p_wanted boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_user_id uuid := auth.uid();
begin
  select group_id into v_group_id
    from public.group_places
    where id = p_group_place_id and status = 'active'
    for share;
  if v_user_id is null or v_group_id is null or not public.is_active_group_member(v_group_id, v_user_id) then
    raise exception 'active group membership and an active place are required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.place_marks
    where group_place_id = p_group_place_id and deleted_at is null
  ) then
    raise exception 'only places with a real mark can be saved to wishlist' using errcode = '22023';
  end if;

  if p_wanted then
    insert into public.wishlist_items (user_id, group_place_id) values (v_user_id, p_group_place_id)
    on conflict do nothing;
  else
    delete from public.wishlist_items where user_id = v_user_id and group_place_id = p_group_place_id;
  end if;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id)
  values (v_group_id, v_user_id, case when p_wanted then 'wishlist.added' else 'wishlist.removed' end, 'group_place', p_group_place_id);
  return p_wanted;
end;
$$;

revoke all on table public.wishlist_items from anon, authenticated;
grant select on table public.wishlist_items to authenticated;
revoke all on function public.set_wishlist_item(uuid, boolean) from public, anon;
grant execute on function public.set_wishlist_item(uuid, boolean) to authenticated;
