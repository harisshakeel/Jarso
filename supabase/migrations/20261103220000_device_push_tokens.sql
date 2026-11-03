-- Phone push (mobile wave 3, Android). A phone that allowed notifications stores its Expo push
-- token here; the dispatcher sends each claimed notice to its recipient's tokens through the
-- Expo Push API, next to web push. A separate table rather than a kind column on
-- push_subscriptions, so the web-push shape, its functions and its tests stay untouched.
--
-- Same rules as push_subscriptions: written only through the definer functions below, at most
-- 10 tokens per member, and a token moves to whichever account registers it, so a notice for
-- one family member never buzzes a phone another member has signed in on since.

create table public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$'),
  platform text not null check (platform = 'android'),
  created_at timestamptz not null default now(),
  -- clock_timestamp(): several registers in one transaction still order by recency.
  last_seen_at timestamptz not null default clock_timestamp()
);

comment on table public.device_push_tokens is 'Expo push tokens (mobile wave 3): one row per phone that allowed notifications. Written only by register_device_push_token / unregister_device_push_token; a token Expo reports as DeviceNotRegistered is deleted by the dispatcher.';

create index device_push_tokens_profile_idx on public.device_push_tokens (profile_id);

alter table public.device_push_tokens enable row level security;
revoke all on public.device_push_tokens from anon, authenticated;
grant select on public.device_push_tokens to authenticated;

create policy "Device push tokens are the owner's"
  on public.device_push_tokens for select to authenticated
  using (profile_id = (select auth.uid()));
-- No insert/update/delete policies: writes go through the functions below.

-- Expo answers a send with a ticket id; the delivery receipt for it is fetched on a later sweep.
-- Only the admin client (the dispatcher) reads or writes this table.
create table public.device_push_tickets (
  id text primary key check (char_length(id) between 1 and 100),
  token_id uuid not null references public.device_push_tokens (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.device_push_tickets is 'Server only. Expo push ticket ids awaiting a receipt check, with the token they were sent to. Deleted once their receipt is checked.';

create index device_push_tickets_created_idx on public.device_push_tickets (created_at);
create index device_push_tickets_token_idx on public.device_push_tickets (token_id);

alter table public.device_push_tickets enable row level security;
revoke all on public.device_push_tickets from anon, authenticated;
-- No policies: the service role bypasses RLS; nobody else may touch it.

-- ---------------------------------------------------------------------------
-- Register / unregister, as the signed-in member
-- ---------------------------------------------------------------------------

create or replace function public.register_device_push_token(p_token text, p_platform text)
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

  -- The phone now belongs to the caller: drop the token from whoever held it before.
  delete from public.device_push_tokens t where t.token = p_token and t.profile_id <> v_uid;

  insert into public.device_push_tokens (profile_id, token, platform)
  values (v_uid, p_token, p_platform)
  on conflict (token) do update
    set platform = excluded.platform,
        last_seen_at = clock_timestamp()
  returning id into v_id;

  delete from public.device_push_tokens t
  where t.profile_id = v_uid
    and t.id not in (
      select k.id from public.device_push_tokens k
      where k.profile_id = v_uid
      order by k.last_seen_at desc, k.id
      limit 10
    );
  return v_id;
end;
$$;

comment on function public.register_device_push_token(text, text) is 'Stores (or refreshes) the caller''s Expo push token for this phone, taking it over from any other account that used the phone, and keeps only the caller''s newest 10. 42501 unless the caller is an approved family member. Token shape and platform are checked by the table.';

create or replace function public.unregister_device_push_token(p_token text)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.device_push_tokens t
    where t.token = p_token and t.profile_id = auth.uid()
    returning t.id
  )
  select exists (select 1 from gone);
$$;

comment on function public.unregister_device_push_token(text) is 'Forgets the caller''s row for this token. True when a row went.';

revoke execute on function public.register_device_push_token(text, text) from public, anon;
revoke execute on function public.unregister_device_push_token(text) from public, anon;
grant execute on function public.register_device_push_token(text, text) to authenticated;
grant execute on function public.unregister_device_push_token(text) to authenticated;

-- ---------------------------------------------------------------------------
-- For the dispatcher
-- ---------------------------------------------------------------------------

create or replace function public.device_push_tokens_for(p_recipient_ids uuid[])
returns table (id uuid, profile_id uuid, token text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.profile_id, t.token
  from public.device_push_tokens t
  where t.profile_id = any (p_recipient_ids);
$$;

comment on function public.device_push_tokens_for(uuid[]) is 'Server only. The Expo push tokens of these recipients, for the dispatcher.';

revoke execute on function public.device_push_tokens_for(uuid[]) from public, anon, authenticated;
grant execute on function public.device_push_tokens_for(uuid[]) to service_role;

-- A removed child's tokens go with the profile (on delete cascade), and their tickets with them.
