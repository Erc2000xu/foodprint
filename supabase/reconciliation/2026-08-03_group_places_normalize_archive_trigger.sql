-- One-time production recovery for a historical migration that was executed
-- manually without its migration-history entry. This file is intentionally not
-- in supabase/migrations: it must be run only by the guarded recovery workflow
-- before that historical version is marked applied.
begin;
set local lock_timeout = '5s';

drop trigger if exists group_places_normalize_archive_metadata on public.group_places;

create trigger group_places_normalize_archive_metadata
before insert or update of status, archived_at, archived_by, archived_reason
on public.group_places
for each row
execute function public.normalize_group_place_archive_metadata();

commit;
