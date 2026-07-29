-- V1.3 privacy baseline: only the Owner may access other members' email
-- addresses or account-management directory.

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
    and public.has_group_role(p_group_id, array['owner'::public.group_role])
  order by membership.joined_at;
$$;

revoke all on function public.list_group_members_for_management(uuid) from public, anon;
grant execute on function public.list_group_members_for_management(uuid) to authenticated;
