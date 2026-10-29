-- list_my_invitations: a signed-in parent sees the pending child-started invitations sent to
-- their own confirmed email, so they can accept one without the link or code.

create index invitations_pending_parent_email_idx
  on public.invitations (pg_catalog.lower(parent_email))
  where status = 'pending';

create or replace function public.list_my_invitations()
returns table (id uuid, nickname text, created_at timestamptz, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.nickname, i.created_at, i.expires_at
  from public.invitations i
  join auth.users u on u.id = (select auth.uid())
  join public.profiles p on p.id = u.id
  where u.email_confirmed_at is not null
    and u.email is not null
    and p.role = 'parent'
    and i.status = 'pending'
    and i.expires_at > now()
    and pg_catalog.lower(i.parent_email) = pg_catalog.lower(u.email)
  order by i.created_at desc, i.id
  limit 50;
$$;

comment on function public.list_my_invitations() is 'Pending, unexpired invitations addressed to the caller''s confirmed email (case-insensitive), newest first, at most 50. Parents only; empty for anyone else. Never returns the email itself.';

-- Supabase grants new functions to anon/authenticated by default.
revoke execute on function public.list_my_invitations() from public, anon;
grant execute on function public.list_my_invitations() to authenticated;
