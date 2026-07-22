-- Return management-safe invitation metadata without exposing invitation tokens or hashes.
create or replace function public.list_group_invitations(p_group_id uuid)
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
    and public.has_group_role(p_group_id, array['owner'::public.group_role, 'admin'::public.group_role])
  order by invitation.created_at desc
  limit 12;
$$;

revoke all on function public.list_group_invitations(uuid) from public, anon;
grant execute on function public.list_group_invitations(uuid) to authenticated;
