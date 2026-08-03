-- V1.3.3 follow-up: the photo INSERT RLS policy checks visit_records.
-- RLS controls which rows are visible, but the policy subquery still needs
-- table-level SELECT privilege for the authenticated role.

grant select on table public.visit_records to authenticated;
