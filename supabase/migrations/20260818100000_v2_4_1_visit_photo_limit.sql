-- Foodprint V2.4.1: the current visit-record photo contract is nine files.
-- This is a forward replacement only; published migrations remain unchanged.
-- Legacy visits retain their historical six-file guard.

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
  ) >= 9 then
    raise exception 'a visit record can contain at most 9 photos';
  end if;
  return new;
end;
$$;
