-- Phase 4: export events are auditable without granting clients direct audit-log writes.

create or replace function public.record_data_export(p_group_id uuid, p_scope text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid := auth.uid(); v_role public.group_role;
begin
  if v_user_id is null or p_scope not in ('mine', 'group') then
    raise exception 'authentication and a valid export scope are required' using errcode = '22023';
  end if;
  select role into v_role from public.group_members
    where group_id = p_group_id and user_id = v_user_id and status = 'active';
  if v_role is null or (p_scope = 'group' and v_role <> 'owner') then
    raise exception 'you do not have permission to export this data' using errcode = '42501';
  end if;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_group_id, v_user_id, 'data.exported', 'group', p_group_id, jsonb_build_object('scope', p_scope));
end;
$$;

revoke all on function public.record_data_export(uuid, text) from public, anon;
grant execute on function public.record_data_export(uuid, text) to authenticated;
