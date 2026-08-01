-- V1.3.3 follow-up: every active group_place must have empty archive metadata.
-- The original save_place_mark RPC predates archived_by/archived_reason and
-- only cleared archived_at when re-activating a place. Normalize the row before
-- the consistency check so re-marking an archived place cannot fail halfway
-- through the mark flow.

create or replace function public.normalize_group_place_archive_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status <> 'archived' then
    new.archived_at := null;
    new.archived_by := null;
    new.archived_reason := null;
  end if;
  return new;
end;
$$;

drop trigger if exists group_places_normalize_archive_metadata on public.group_places;
create trigger group_places_normalize_archive_metadata
before insert or update of status, archived_at, archived_by, archived_reason
on public.group_places
for each row
execute function public.normalize_group_place_archive_metadata();
