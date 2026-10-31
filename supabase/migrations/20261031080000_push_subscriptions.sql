-- Web push (FR16). A browser that said yes stores its push subscription here; the server sends
-- each notice to its recipient's subscriptions once, after the notice row exists. Nothing
-- depends on push: the inbox is the record, and a failed or missing delivery loses nothing.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 1 and 2000 and endpoint like 'https://%'),
  p256dh text not null check (char_length(p256dh) between 1 and 200),
  auth text not null check (char_length(auth) between 1 and 200),
  user_agent text check (char_length(user_agent) <= 200),
  created_at timestamptz not null default now(),
  -- clock_timestamp(): several subscribes in one transaction still order by recency.
  last_used_at timestamptz not null default clock_timestamp()
);

comment on table public.push_subscriptions is 'Web push subscriptions (FR16): one row per browser that allowed notifications. The keys are the browser''s own; the server signs sends with VAPID. Written only by push_subscribe / push_unsubscribe; a dead endpoint (404/410) is deleted by the dispatcher.';

create index push_subscriptions_profile_idx on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select on public.push_subscriptions to authenticated;

create policy "Push subscriptions are the owner's"
  on public.push_subscriptions for select to authenticated
  using (profile_id = (select auth.uid()));
-- No insert/update/delete policies: writes go through the functions below.

-- ---------------------------------------------------------------------------
-- Subscribe / unsubscribe, as the signed-in member
-- ---------------------------------------------------------------------------

-- A browser is one endpoint. If another account used this device, the endpoint now belongs to
-- the caller: a notice for the parent must never pop up on the child's screen, or the reverse.
-- One person has a handful of devices, so the caller keeps their newest 10 subscriptions: a
-- member cannot register thousands of endpoints and turn each notice into thousands of sends.
create or replace function public.push_subscribe(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null
     or not exists (
       select 1 from public.family_members m
       where m.profile_id = v_uid and m.status = 'approved'
     )
  then
    raise exception using errcode = '42501', message = 'Join a family first';
  end if;

  delete from public.push_subscriptions s where s.endpoint = p_endpoint and s.profile_id <> v_uid;

  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent)
  values (v_uid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 200))
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        last_used_at = clock_timestamp()
  returning id into v_id;

  delete from public.push_subscriptions s
  where s.profile_id = v_uid
    and s.id not in (
      select k.id from public.push_subscriptions k
      where k.profile_id = v_uid
      order by k.last_used_at desc, k.id
      limit 10
    );
  return v_id;
end;
$$;

comment on function public.push_subscribe(text, text, text, text) is 'Stores (or refreshes) the caller''s push subscription for this browser endpoint, taking it over from any other account that used the device, and keeps only the caller''s newest 10. 42501 unless the caller is an approved family member. Endpoint scheme and key lengths are checked by the table.';

create or replace function public.push_unsubscribe(p_endpoint text)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.push_subscriptions s
    where s.endpoint = p_endpoint and s.profile_id = auth.uid()
    returning s.id
  )
  select exists (select 1 from gone);
$$;

comment on function public.push_unsubscribe(text) is 'Forgets the caller''s subscription for this endpoint. True when a row went.';

revoke execute on function public.push_subscribe(text, text, text, text) from public, anon;
revoke execute on function public.push_unsubscribe(text) from public, anon;
grant execute on function public.push_subscribe(text, text, text, text) to authenticated;
grant execute on function public.push_unsubscribe(text) to authenticated;

-- ---------------------------------------------------------------------------
-- notifications.pushed_at: each notice is pushed at most once
-- ---------------------------------------------------------------------------

alter table public.notifications add column pushed_at timestamptz;
comment on column public.notifications.pushed_at is 'When the notice was claimed by the push dispatcher (sent, or nothing to send to). Null means not yet.';

create index notifications_unpushed_idx on public.notifications (created_at) where pushed_at is null;

-- The dispatcher claims a batch of unpushed notices from the last day, so two instances never
-- send the same one and a notice older than a day stays in the inbox without a late ping.
-- Each row carries what the push text needs: the recipient's role, the family currency and the
-- child's nickname.
create or replace function public.claim_unpushed_notifications(p_limit integer default 50)
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
  created_at timestamptz
)
language sql
volatile
security definer
set search_path = ''
as $$
  with claimed as (
    update public.notifications n
      set pushed_at = now()
      where n.id in (
        select u.id from public.notifications u
        where u.pushed_at is null
          and u.created_at > now() - interval '1 day'
          -- A member removed since the notice was written sees it in no inbox (RLS), so it
          -- gets no push either; the row is left alone and ages out of the window.
          and exists (
            select 1 from public.family_members m
            where m.profile_id = u.recipient_id
              and m.family_id = u.family_id
              and m.status = 'approved'
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
    c.created_at
  from claimed c
  join public.families f on f.id = c.family_id
  left join public.family_members m on m.profile_id = c.recipient_id
  left join public.profiles p on p.id = c.child_id
  order by c.created_at;
$$;

comment on function public.claim_unpushed_notifications(integer) is 'Server only. Marks up to p_limit (1..200) unpushed notices from the last day, for recipients still approved in the family, as pushed and returns them with recipient role, currency and child nickname; skip locked, so parallel dispatchers never double-send.';

revoke execute on function public.claim_unpushed_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_unpushed_notifications(integer) to service_role;

create or replace function public.push_subscriptions_for(p_recipient_ids uuid[])
returns table (id uuid, profile_id uuid, endpoint text, p256dh text, auth text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.profile_id, s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  where s.profile_id = any (p_recipient_ids);
$$;

comment on function public.push_subscriptions_for(uuid[]) is 'Server only. The push subscriptions of these recipients, for the dispatcher.';

revoke execute on function public.push_subscriptions_for(uuid[]) from public, anon, authenticated;
grant execute on function public.push_subscriptions_for(uuid[]) to service_role;

-- A removed child's subscriptions go with the profile (on delete cascade). A kept identity keeps
-- its subscriptions; nothing is pushed to it because the claim skips recipients who are no
-- longer approved members and notify_* writes no new notice for them.
