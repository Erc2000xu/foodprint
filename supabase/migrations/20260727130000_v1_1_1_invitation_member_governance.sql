-- Foodprint V1.1.1: recoverable (encrypted) invite links and private member governance.
-- Existing invitation tokens remain hash-only and valid, but cannot be reconstructed.

alter table public.invitations add column if not exists token_ciphertext text;

create or replace function public.create_managed_invitation(
  p_group_id uuid,
  p_expires_at timestamptz,
  p_max_uses integer,
  p_token_hash text,
  p_token_ciphertext text
)
returns table (id uuid, expires_at timestamptz, max_uses integer)
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.has_group_role(p_group_id, array['owner'::public.group_role, 'admin'::public.group_role]) then
    raise exception 'administrator role required' using errcode = '42501';
  end if;
  if p_expires_at <= now() or p_max_uses not between 1 and 100 then
    raise exception 'invalid invitation settings' using errcode = '22023';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' or char_length(p_token_ciphertext) < 24 then
    raise exception 'invalid invitation token material' using errcode = '22023';
  end if;

  insert into public.invitations (group_id, token_hash, token_ciphertext, created_by, expires_at, max_uses)
  values (p_group_id, p_token_hash, p_token_ciphertext, auth.uid(), p_expires_at, p_max_uses)
  returning invitations.id into v_id;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id)
  values (p_group_id, auth.uid(), 'invitation.created', 'invitation', v_id);
  return query select v_id, p_expires_at, p_max_uses;
end;
$$;

-- Prevent newly generated invitations from bypassing encrypted token retention.
revoke execute on function public.create_invitation(uuid, timestamptz, integer) from authenticated;
revoke all on function public.create_managed_invitation(uuid, timestamptz, integer, text, text) from public, anon;
grant execute on function public.create_managed_invitation(uuid, timestamptz, integer, text, text) to authenticated;

drop function if exists public.list_group_invitations(uuid);
create function public.list_group_invitations(p_group_id uuid)
returns table (
  id uuid,
  created_at timestamptz,
  expires_at timestamptz,
  max_uses integer,
  use_count integer,
  status text,
  token_ciphertext text
)
language sql
security definer
set search_path = public
as $$
  select
    invitation.id,
    invitation.created_at,
    invitation.expires_at,
    invitation.max_uses,
    invitation.use_count,
    '可使用'::text,
    invitation.token_ciphertext
  from public.invitations as invitation
  where invitation.group_id = p_group_id
    and invitation.revoked_at is null
    and invitation.expires_at > now()
    and invitation.use_count < invitation.max_uses
    and public.has_group_role(p_group_id, array['owner'::public.group_role, 'admin'::public.group_role])
  order by invitation.created_at desc;
$$;
revoke all on function public.list_group_invitations(uuid) from public, anon;
grant execute on function public.list_group_invitations(uuid) to authenticated;

-- Reserved for a future Owner/Admin export action. It never returns token material.
create or replace function public.list_group_invitation_history(p_group_id uuid, p_days integer default 30)
returns table (
  id uuid,
  created_at timestamptz,
  expires_at timestamptz,
  max_uses integer,
  use_count integer,
  status text
)
language sql
security definer
set search_path = public
as $$
  select
    invitation.id,
    invitation.created_at,
    invitation.expires_at,
    invitation.max_uses,
    invitation.use_count,
    case
      when invitation.revoked_at is not null then '已撤销'
      when invitation.expires_at <= now() then '已过期'
      when invitation.use_count >= invitation.max_uses then '已用完'
      else '可使用'
    end
  from public.invitations as invitation
  where invitation.group_id = p_group_id
    and invitation.created_at >= now() - make_interval(days => greatest(1, least(p_days, 90)))
    and public.has_group_role(p_group_id, array['owner'::public.group_role, 'admin'::public.group_role])
  order by invitation.created_at desc;
$$;
revoke all on function public.list_group_invitation_history(uuid, integer) from public, anon;
grant execute on function public.list_group_invitation_history(uuid, integer) to authenticated;

-- Members can retain access to their own membership row, but not the group directory.
drop policy if exists "members read group members" on public.group_members;
create policy "members read own membership or managers read group members"
on public.group_members for select to authenticated
using (
  user_id = auth.uid()
  or public.has_group_role(group_id, array['owner'::public.group_role, 'admin'::public.group_role])
);

create or replace function public.list_group_members_for_management(p_group_id uuid)
returns table (
  user_id uuid,
  display_name text,
  email text,
  role public.group_role,
  status public.member_status,
  joined_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  select
    membership.user_id,
    profile.display_name,
    auth_user.email,
    membership.role,
    membership.status,
    membership.joined_at
  from public.group_members as membership
  join public.profiles as profile on profile.id = membership.user_id
  join auth.users as auth_user on auth_user.id = membership.user_id
  where membership.group_id = p_group_id
    and public.has_group_role(p_group_id, array['owner'::public.group_role, 'admin'::public.group_role])
  order by membership.joined_at;
$$;
revoke all on function public.list_group_members_for_management(uuid) from public, anon;
grant execute on function public.list_group_members_for_management(uuid) to authenticated;

create or replace function public.update_member_status(p_group_id uuid, p_user_id uuid, p_status public.member_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_actor_role public.group_role; v_target_role public.group_role;
begin
  select role into v_actor_role from public.group_members where group_id = p_group_id and user_id = auth.uid() and status = 'active';
  select role into v_target_role from public.group_members where group_id = p_group_id and user_id = p_user_id for update;
  if v_actor_role <> 'owner' or v_target_role is null or v_target_role = 'owner' or p_status = 'removed' then
    raise exception 'owner may only pause or restore non-owner members' using errcode = '42501';
  end if;
  update public.group_members set status = p_status, removed_at = null where group_id = p_group_id and user_id = p_user_id;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_group_id, auth.uid(), 'member.status_changed', 'group_member', p_user_id, jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.set_member_role(p_group_id uuid, p_user_id uuid, p_role public.group_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_target_role public.group_role; v_target_status public.member_status;
begin
  if not public.has_group_role(p_group_id, array['owner'::public.group_role]) or p_role = 'owner' then
    raise exception 'owner role required' using errcode = '42501';
  end if;
  select role, status into v_target_role, v_target_status from public.group_members where group_id = p_group_id and user_id = p_user_id for update;
  if v_target_role is null or v_target_role = 'owner' or v_target_status <> 'active' then
    raise exception 'active non-owner member required' using errcode = '22023';
  end if;
  update public.group_members set role = p_role where group_id = p_group_id and user_id = p_user_id;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_group_id, auth.uid(), 'member.role_changed', 'group_member', p_user_id, jsonb_build_object('role', p_role));
end;
$$;
