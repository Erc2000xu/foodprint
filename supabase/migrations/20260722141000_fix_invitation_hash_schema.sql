-- pgcrypto functions are in Supabase's extensions schema; qualify every call
-- because these SECURITY DEFINER functions intentionally use a public-only path.
create or replace function public.get_invitation_status(p_token text)
returns table (valid boolean, group_name text, expires_at timestamptz, remaining_uses integer)
language plpgsql security definer set search_path = public as $$
declare v_inv public.invitations;
begin
  select * into v_inv from public.invitations where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found then return query select false, null::text, null::timestamptz, null::integer; return; end if;
  return query select (v_inv.revoked_at is null and v_inv.expires_at > now() and v_inv.use_count < v_inv.max_uses), g.name, v_inv.expires_at, greatest(v_inv.max_uses - v_inv.use_count, 0) from public.groups g where g.id = v_inv.group_id and g.status = 'active';
end; $$;

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_inv public.invitations; v_existing public.group_members; v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select * into v_inv from public.invitations where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  if not found or v_inv.revoked_at is not null or v_inv.expires_at <= now() or v_inv.use_count >= v_inv.max_uses then raise exception 'invitation is invalid, expired, revoked, or exhausted' using errcode = '22023'; end if;
  select * into v_existing from public.group_members where group_id = v_inv.group_id and user_id = v_user;
  if found and v_existing.status = 'active' then return v_inv.group_id; end if;
  insert into public.group_members (group_id, user_id, role, status, joined_at, removed_at) values (v_inv.group_id, v_user, v_inv.role, 'active', now(), null) on conflict (group_id, user_id) do update set status = 'active', role = excluded.role, joined_at = now(), removed_at = null;
  update public.invitations set use_count = use_count + 1 where id = v_inv.id;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id) values (v_inv.group_id, v_user, 'invitation.accepted', 'invitation', v_inv.id);
  return v_inv.group_id;
end; $$;

create or replace function public.create_invitation(p_group_id uuid, p_expires_at timestamptz default now() + interval '7 days', p_max_uses integer default 1)
returns table (id uuid, token text, expires_at timestamptz, max_uses integer)
language plpgsql security definer set search_path = public as $$
declare v_token text := encode(extensions.gen_random_bytes(32), 'hex'); v_id uuid;
begin
  if not public.has_group_role(p_group_id, array['owner'::public.group_role, 'admin'::public.group_role]) then raise exception 'administrator role required' using errcode = '42501'; end if;
  if p_expires_at <= now() or p_max_uses not between 1 and 100 then raise exception 'invalid invitation settings' using errcode = '22023'; end if;
  insert into public.invitations (group_id, token_hash, created_by, expires_at, max_uses) values (p_group_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid(), p_expires_at, p_max_uses) returning invitations.id into v_id;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id) values (p_group_id, auth.uid(), 'invitation.created', 'invitation', v_id);
  return query select v_id, v_token, p_expires_at, p_max_uses;
end; $$;
