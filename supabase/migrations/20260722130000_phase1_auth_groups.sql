-- Foodprint Phase 1: invitation-only authentication, groups and membership.
-- Apply only through Supabase migrations. Do not recreate these tables in the dashboard.

create extension if not exists pgcrypto;

create type public.group_role as enum ('owner', 'admin', 'member');
create type public.member_status as enum ('active', 'suspended', 'removed');
create type public.group_status as enum ('active', 'archived');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  avatar_path text,
  bio text check (char_length(bio) <= 280),
  preferred_theme text not null default 'system' check (preferred_theme in ('system', 'light', 'dark', 'skin_id')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  status public.group_status not null default 'active',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  role public.group_role not null default 'member',
  status public.member_status not null default 'active',
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id),
  check ((status = 'removed') = (removed_at is not null))
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references public.profiles(id) on delete restrict,
  role public.group_role not null default 'member' check (role = 'member'),
  expires_at timestamptz not null,
  max_uses integer not null default 1 check (max_uses between 1 and 100),
  use_count integer not null default 0 check (use_count between 0 and max_uses),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete set null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index group_members_user_active_idx on public.group_members(user_id, group_id) where status = 'active';
create index invitations_group_active_idx on public.invitations(group_id, expires_at) where revoked_at is null;
create index audit_logs_group_created_idx on public.audit_logs(group_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$ begin new.updated_at = now(); return new; end; $$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger groups_set_updated_at before update on public.groups for each row execute function public.set_updated_at();
create trigger group_members_set_updated_at before update on public.group_members for each row execute function public.set_updated_at();

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger auth_user_profile_after_insert
after insert on auth.users
for each row execute procedure public.create_profile_for_auth_user();

create or replace function public.is_active_group_member(p_group_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members gm
    join public.groups g on g.id = gm.group_id
    where gm.group_id = p_group_id and gm.user_id = p_user_id
      and gm.status = 'active' and g.status = 'active'
  );
$$;

create or replace function public.has_group_role(p_group_id uuid, p_roles public.group_role[], p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = p_user_id
      and gm.status = 'active' and gm.role = any(p_roles)
  );
$$;

create or replace function public.get_invitation_status(p_token text)
returns table (valid boolean, group_name text, expires_at timestamptz, remaining_uses integer)
language plpgsql
security definer
set search_path = public
as $$
declare v_inv public.invitations;
begin
  select * into v_inv from public.invitations
  where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if not found then return query select false, null::text, null::timestamptz, null::integer; return; end if;
  return query
  select (v_inv.revoked_at is null and v_inv.expires_at > now() and v_inv.use_count < v_inv.max_uses),
         g.name, v_inv.expires_at, greatest(v_inv.max_uses - v_inv.use_count, 0)
  from public.groups g where g.id = v_inv.group_id and g.status = 'active';
end;
$$;

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_inv public.invitations; v_existing public.group_members; v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select * into v_inv from public.invitations
  where token_hash = encode(digest(p_token, 'sha256'), 'hex') for update;
  if not found or v_inv.revoked_at is not null or v_inv.expires_at <= now() or v_inv.use_count >= v_inv.max_uses then
    raise exception 'invitation is invalid, expired, revoked, or exhausted' using errcode = '22023';
  end if;
  select * into v_existing from public.group_members where group_id = v_inv.group_id and user_id = v_user;
  if found and v_existing.status = 'active' then return v_inv.group_id; end if;
  insert into public.group_members (group_id, user_id, role, status, joined_at, removed_at)
  values (v_inv.group_id, v_user, v_inv.role, 'active', now(), null)
  on conflict (group_id, user_id) do update set status = 'active', role = excluded.role, joined_at = now(), removed_at = null;
  update public.invitations set use_count = use_count + 1 where id = v_inv.id;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id)
  values (v_inv.group_id, v_user, 'invitation.accepted', 'invitation', v_inv.id);
  return v_inv.group_id;
end;
$$;

create or replace function public.create_invitation(p_group_id uuid, p_expires_at timestamptz default now() + interval '7 days', p_max_uses integer default 1)
returns table (id uuid, token text, expires_at timestamptz, max_uses integer)
language plpgsql
security definer
set search_path = public
as $$
declare v_token text := encode(gen_random_bytes(32), 'hex'); v_id uuid;
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

create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_group_id uuid;
begin
  select group_id into v_group_id from public.invitations where id = p_invitation_id for update;
  if v_group_id is null or not public.has_group_role(v_group_id, array['owner'::public.group_role, 'admin'::public.group_role]) then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.invitations set revoked_at = now() where id = p_invitation_id and revoked_at is null;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id) values (v_group_id, auth.uid(), 'invitation.revoked', 'invitation', p_invitation_id);
end;
$$;

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
  if v_actor_role not in ('owner', 'admin') or v_target_role is null or v_target_role <> 'member' then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.group_members set status = p_status, removed_at = case when p_status = 'removed' then now() else null end where group_id = p_group_id and user_id = p_user_id;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id, metadata) values (p_group_id, auth.uid(), 'member.status_changed', 'group_member', p_user_id, jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.set_member_role(p_group_id uuid, p_user_id uuid, p_role public.group_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_group_role(p_group_id, array['owner'::public.group_role]) or p_role = 'owner' then raise exception 'owner role required' using errcode = '42501'; end if;
  update public.group_members set role = p_role where group_id = p_group_id and user_id = p_user_id and role <> 'owner';
  if not found then raise exception 'member not found or owner role protected' using errcode = '22023'; end if;
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id, metadata) values (p_group_id, auth.uid(), 'member.role_changed', 'group_member', p_user_id, jsonb_build_object('role', p_role));
end;
$$;

create or replace function public.bootstrap_initial_owner(p_owner_user_id uuid, p_group_name text, p_group_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_group_id uuid;
begin
  if exists (select 1 from public.groups) then raise exception 'initial group already exists' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = p_owner_user_id) then raise exception 'owner profile does not exist' using errcode = '22023'; end if;
  insert into public.groups (name, slug, owner_user_id) values (p_group_name, p_group_slug, p_owner_user_id) returning id into v_group_id;
  insert into public.group_members (group_id, user_id, role) values (v_group_id, p_owner_user_id, 'owner');
  insert into public.audit_logs (group_id, actor_user_id, action, entity_type, entity_id) values (v_group_id, p_owner_user_id, 'group.bootstrapped', 'group', v_group_id);
  return v_group_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_logs enable row level security;

create policy "members read shared profiles" on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from public.group_members mine join public.group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id = auth.uid() and mine.status = 'active' and theirs.user_id = profiles.id and theirs.status = 'active'
  )
);
create policy "users update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "members read their groups" on public.groups for select to authenticated using (public.is_active_group_member(id));
create policy "members read group members" on public.group_members for select to authenticated using (public.is_active_group_member(group_id));
create policy "administrators read invitations" on public.invitations for select to authenticated using (public.has_group_role(group_id, array['owner'::public.group_role, 'admin'::public.group_role]));
create policy "members read group audit logs" on public.audit_logs for select to authenticated using (group_id is not null and public.is_active_group_member(group_id));

revoke all on function public.bootstrap_initial_owner(uuid, text, text) from public, anon, authenticated;
revoke all on function public.is_active_group_member(uuid, uuid) from public, anon;
revoke all on function public.has_group_role(uuid, public.group_role[], uuid) from public, anon;
revoke all on function public.create_invitation(uuid, timestamptz, integer) from public, anon;
revoke all on function public.revoke_invitation(uuid) from public, anon;
revoke all on function public.update_member_status(uuid, uuid, public.member_status) from public, anon;
revoke all on function public.set_member_role(uuid, uuid, public.group_role) from public, anon;
grant execute on function public.get_invitation_status(text) to anon, authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.create_invitation(uuid, timestamptz, integer) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.update_member_status(uuid, uuid, public.member_status) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, public.group_role) to authenticated;
