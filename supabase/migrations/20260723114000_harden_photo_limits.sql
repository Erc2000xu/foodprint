-- Keep the server-side rules true even if a client calls Storage or the table directly.

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
      raise exception 'photos can only be soft-deleted';
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
  return new;
end;
$$;

create trigger photos_enforce_rules
before insert or update on public.photos
for each row execute function public.enforce_photo_rules();
