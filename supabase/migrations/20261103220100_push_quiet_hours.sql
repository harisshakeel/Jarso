-- Child quiet hours for push (mobile wave 3). From 21:00 to 07:00 in the family's timezone a
-- child's notices are not claimed for push: they stay unpushed (and land in the inbox as
-- always), and the first sweep at or after 07:00 claims them. Each claimed row now says whether
-- it is `overnight` (a child notice written during the family's night), so the dispatcher can
-- send two or more of one child's overnight notices as a single summary push. Parents are never
-- held. Applies to every transport (web push and phones): the claim is shared.
--
-- One-day window: the oldest held notice (written at 21:00) is claimed at 07:00, 10 h later
-- (11 h across a DST fall-back), well inside the claim's `interval '1 day'`.

create or replace function public.is_child_quiet_hour(p_at timestamptz, p_timezone text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (p_at at time zone p_timezone)::time >= time '21:00'
      or (p_at at time zone p_timezone)::time <  time '07:00';
$$;

comment on function public.is_child_quiet_hour(timestamptz, text) is 'Internal. True when p_at falls in the child quiet window [21:00, 07:00) of the given IANA timezone.';

revoke execute on function public.is_child_quiet_hour(timestamptz, text) from public, anon, authenticated;

-- The signature (p_now) and the return type (overnight) change, so drop and recreate.
drop function public.claim_unpushed_notifications(integer);

-- p_now lets pgTAP pick the clock; the dispatcher never passes it.
create function public.claim_unpushed_notifications(
  p_limit integer default 50,
  p_now timestamptz default now()
)
returns table (
  id uuid,
  recipient_id uuid,
  recipient_role text,
  currency text,
  child_id uuid,
  child_name text,
  kind text,
  source_type text,
  source_id uuid,
  payload jsonb,
  created_at timestamptz,
  overnight boolean
)
language sql
volatile
security definer
set search_path = ''
as $$
  with claimed as (
    update public.notifications n
      set pushed_at = p_now
      where n.id in (
        select u.id from public.notifications u
        where u.pushed_at is null
          and u.created_at > p_now - interval '1 day'
          -- A member removed since the notice was written sees it in no inbox (RLS), so it
          -- gets no push either; the row is left alone and ages out of the window.
          and exists (
            select 1 from public.family_members m
            where m.profile_id = u.recipient_id
              and m.family_id = u.family_id
              and m.status = 'approved'
          )
          -- A child is not claimed during their family's night; 07:00 claims it.
          and not exists (
            select 1 from public.family_members q
            join public.families qf on qf.id = u.family_id
            where q.profile_id = u.recipient_id
              and q.family_id = u.family_id
              and q.role = 'child'
              and public.is_child_quiet_hour(p_now, qf.timezone)
          )
        order by u.created_at
        limit least(greatest(coalesce(p_limit, 50), 1), 200)
        for update skip locked
      )
      returning n.id, n.family_id, n.recipient_id, n.child_id, n.kind, n.source_type, n.source_id,
        n.payload, n.created_at
  )
  select
    c.id,
    c.recipient_id,
    m.role,
    f.currency,
    c.child_id,
    coalesce(p.nickname, ''),
    c.kind,
    c.source_type,
    c.source_id,
    c.payload,
    c.created_at,
    coalesce(m.role = 'child' and public.is_child_quiet_hour(c.created_at, f.timezone), false)
  from claimed c
  join public.families f on f.id = c.family_id
  left join public.family_members m on m.profile_id = c.recipient_id
  left join public.profiles p on p.id = c.child_id
  order by c.created_at;
$$;

comment on function public.claim_unpushed_notifications(integer, timestamptz) is 'Server only. Marks up to p_limit (1..200) unpushed notices from the last day, for recipients still approved in the family, as pushed and returns them with recipient role, currency, child nickname and overnight; skip locked, so parallel dispatchers never double-send. A child''s notices are not claimed while it is 21:00-07:00 in the family timezone (is_child_quiet_hour); overnight is true for a child notice written in that window. p_now is for tests.';

revoke execute on function public.claim_unpushed_notifications(integer, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_unpushed_notifications(integer, timestamptz) to service_role;
