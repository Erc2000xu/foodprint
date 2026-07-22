-- Supabase installs pgcrypto in the extensions schema. Keep the function's
-- public-only search_path and qualify this security-sensitive random generator.
create or replace function public.create_invitation(p_group_id uuid, p_expires_at timestamptz default now() + interval '7 days', p_max_uses integer default 1)
returns table (id uuid, token text, expires_at timestamptz, max_uses integer)
language plpgsql
security definer
set search_path = public
as $$
declare v_token text := encode(extensions.gen_random_bytes(32), 'hex'); v_id uuid;
begin
  if not public.has_group_role(p_group_id, array['owner'::public.group_role, 'admin'::public.group_role]) then
    raise exception 'administrator role required' using errcode = '42501';
  end if;
  if p_expires_at <= now() or p_max_uses not between 1 and 100 then raise exception 'invalid invitation settings' using errcode = '22023'; end if;
  insert into public.invitations (group_id, token_hash, created_by, expires_at, max_uses)
  values (p_group_id, encode(digest(v_token, 'sha256'), 'hex'), auth.uid(), p_expires_at, p_max_uses)
  returning invitations.id into v_id;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id)
  values (p_group_id, auth.uid(), 'invitation.created', 'invitation', v_id);
  return query select v_id, v_token, p_expires_at, p_max_uses;
end;
$$;
