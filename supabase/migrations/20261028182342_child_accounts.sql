-- Child accounts: PIN credentials with lockout, nickname uniqueness per family,
-- register_child / set_child_pin / verify_child_pin, and a fixed-window rate
-- limiter. ADR 0004; architecture.md §5.1.

-- ---------------------------------------------------------------------------
-- family_members.nickname_key
-- ---------------------------------------------------------------------------

alter table public.family_members
  add column nickname_key text check (role = 'child' or nickname_key is null);

comment on column public.family_members.nickname_key is 'lower(btrim(nickname)) for child rows; unique per family. Set by register_child.';

create unique index family_members_family_id_nickname_key_idx
  on public.family_members (family_id, nickname_key)
  where role = 'child';

-- ---------------------------------------------------------------------------
-- child_credentials
-- ---------------------------------------------------------------------------

create table public.child_credentials (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  pin_hash text not null,
  failed_attempts int not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  set_by uuid not null references public.profiles (id),
  updated_at timestamptz not null default now()
);

comment on table public.child_credentials is 'Child PIN (bcrypt) and lockout state. RLS on with no policies: service role and security definer functions only.';
comment on column public.child_credentials.failed_attempts is 'Consecutive wrong PINs since the last success or lock; 5 locks the account.';
comment on column public.child_credentials.locked_until is 'Sign-in refused while locked_until > now().';
comment on column public.child_credentials.set_by is 'Parent who last set the PIN.';

create index child_credentials_set_by_idx on public.child_credentials (set_by);

create trigger child_credentials_set_updated_at
  before update on public.child_credentials
  for each row execute function public.set_updated_at();

alter table public.child_credentials enable row level security;

-- ---------------------------------------------------------------------------
-- usage_counters
-- ---------------------------------------------------------------------------

create table public.usage_counters (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

comment on table public.usage_counters is 'Fixed-window rate-limit counters, written by hit_rate_limit. RLS on with no policies: service role only.';
comment on column public.usage_counters.key is 'Limiter scope, e.g. child-start:ip:<addr>.';

alter table public.usage_counters enable row level security;

-- No policies on either table; RLS also ignores TRUNCATE.
revoke all on public.child_credentials, public.usage_counters from anon;
revoke insert, update, delete, truncate on public.child_credentials, public.usage_counters from authenticated;

-- ---------------------------------------------------------------------------
-- register_child
-- ---------------------------------------------------------------------------

create or replace function public.register_child(
  p_child_id uuid,
  p_family_id uuid,
  p_nickname text,
  p_pin text,
  p_consent boolean,
  p_invitation_id uuid default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_nickname text := pg_catalog.btrim(p_nickname);
begin
  if v_uid is null then
    raise exception using errcode = 'JA401', message = 'Not signed in';
  end if;

  if not exists (
    select 1
    from public.family_members fm
    where fm.family_id = p_family_id
      and fm.profile_id = v_uid
      and fm.role = 'parent'
      and fm.status = 'approved'
  ) then
    raise exception using errcode = 'JA403', message = 'Only a parent in this family can add a child';
  end if;

  if p_consent is not true then
    raise exception using errcode = 'JA403', message = 'Parent consent is required';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then
    raise exception using errcode = '22023', message = 'PIN must be 4 to 6 digits';
  end if;

  if v_nickname is null or pg_catalog.char_length(v_nickname) not between 1 and 20 then
    raise exception using errcode = '22023', message = 'Nickname must be 1 to 20 characters';
  end if;

  if not exists (select 1 from public.profiles pr where pr.id = p_child_id and pr.role = 'child')
     or exists (select 1 from public.family_members fm where fm.profile_id = p_child_id) then
    raise exception using errcode = 'JA409', message = 'Child account is not available';
  end if;

  -- p_invitation_id is handled in a later migration.

  begin
    insert into public.family_members (
      family_id, profile_id, role, status, nickname_key,
      consent_at, consent_by, approved_by, approved_at
    )
    values (
      p_family_id, p_child_id, 'child', 'approved', pg_catalog.lower(v_nickname),
      now(), v_uid, v_uid, now()
    );
  exception when unique_violation then
    -- Nickname taken in this family, or a concurrent registration of the same child.
    raise exception using errcode = 'JA409', message = 'Nickname already used in this family';
  end;

  update public.profiles set nickname = v_nickname where id = p_child_id;

  insert into public.child_credentials (profile_id, pin_hash, set_by)
  values (p_child_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), v_uid);

  insert into public.audit_log (family_id, actor_id, action, subject_id, details)
  values (
    p_family_id, v_uid, 'child.added', p_child_id,
    pg_catalog.jsonb_build_object('nickname', v_nickname)
  );
end;
$$;

comment on function public.register_child(uuid, uuid, text, text, boolean, uuid) is 'Approved parent adds an existing child-role profile to their family with consent and a PIN. JA401/JA403/JA409, 22023.';

-- ---------------------------------------------------------------------------
-- set_child_pin
-- ---------------------------------------------------------------------------

create or replace function public.set_child_pin(p_child_id uuid, p_pin text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_family_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = 'JA401', message = 'Not signed in';
  end if;

  if not public.is_parent_of(p_child_id) then
    raise exception using errcode = 'JA403', message = 'Only the child''s parent can set the PIN';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then
    raise exception using errcode = '22023', message = 'PIN must be 4 to 6 digits';
  end if;

  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.profile_id = p_child_id;

  insert into public.child_credentials (profile_id, pin_hash, set_by)
  values (p_child_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), v_uid)
  on conflict (profile_id) do update
    set pin_hash = excluded.pin_hash,
        set_by = excluded.set_by,
        failed_attempts = 0,
        locked_until = null;

  insert into public.audit_log (family_id, actor_id, action, subject_id)
  values (v_family_id, v_uid, 'child.pin_reset', p_child_id);
end;
$$;

comment on function public.set_child_pin(uuid, text) is 'Parent sets or resets a child''s PIN and clears any lockout. JA401/JA403, 22023.';

-- ---------------------------------------------------------------------------
-- verify_child_pin
-- ---------------------------------------------------------------------------

-- Never raises for a bad sign-in: an exception would roll back the failed-attempt
-- counter. Callers map 'invalid' → UNAUTHORIZED and 'locked' → RATE_LIMITED.
create or replace function public.verify_child_pin(p_family_code text, p_nickname text, p_pin text)
returns table (child_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text := pg_catalog.upper(pg_catalog.regexp_replace(coalesce(p_family_code, ''), '[[:space:]-]', '', 'g'));
  v_key text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_nickname, '')));
  v_child_id uuid;
  v_cred public.child_credentials%rowtype;
begin
  select fm.profile_id into v_child_id
  from public.families f
  join public.family_members fm on fm.family_id = f.id
  where f.code = v_code
    and fm.nickname_key = v_key
    and fm.role = 'child'
    and fm.status = 'approved';

  if v_child_id is not null then
    -- Row lock serialises concurrent attempts so none escape the counter.
    select * into v_cred
    from public.child_credentials cc
    where cc.profile_id = v_child_id
    for update;
  end if;

  if v_cred.profile_id is null then
    -- Spend the same hashing time as a real check so timing does not reveal nicknames.
    perform extensions.crypt(coalesce(p_pin, ''), extensions.gen_salt('bf', 10));
    return query select null::uuid, 'invalid'::text;
    return;
  end if;

  if v_cred.locked_until is not null and v_cred.locked_until > now() then
    return query select null::uuid, 'locked'::text;
    return;
  end if;

  if p_pin is not null and extensions.crypt(p_pin, v_cred.pin_hash) = v_cred.pin_hash then
    update public.child_credentials cc
    set failed_attempts = 0, locked_until = null
    where cc.profile_id = v_child_id;

    return query select v_child_id, 'ok'::text;
    return;
  end if;

  if v_cred.failed_attempts + 1 >= 5 then
    -- Lock and restart the count so the next window allows five fresh tries.
    update public.child_credentials cc
    set failed_attempts = 0, locked_until = now() + interval '15 minutes'
    where cc.profile_id = v_child_id;
  else
    update public.child_credentials cc
    set failed_attempts = v_cred.failed_attempts + 1
    where cc.profile_id = v_child_id;
  end if;

  return query select null::uuid, 'invalid'::text;
end;
$$;

comment on function public.verify_child_pin(text, text, text) is 'Child sign-in check. Returns (child_id, status) with status ok | invalid | locked; 5 wrong PINs lock for 15 minutes. service_role only.';

-- ---------------------------------------------------------------------------
-- hit_rate_limit
-- ---------------------------------------------------------------------------

create or replace function public.hit_rate_limit(p_key text, p_window interval, p_max int)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if p_key is null or p_window is null or p_window <= interval '0' or p_max is null or p_max < 0 then
    raise exception using errcode = '22023', message = 'Invalid rate limit arguments';
  end if;

  insert into public.usage_counters as uc (key, window_start, count)
  values (p_key, pg_catalog.date_bin(p_window, now(), timestamptz 'epoch'), 1)
  on conflict (key, window_start) do update
    set count = uc.count + 1
  returning uc.count into v_count;

  return v_count <= p_max;
end;
$$;

comment on function public.hit_rate_limit(text, interval, int) is 'Counts a hit for key in the current fixed window; true when the hit is within p_max. service_role only.';

-- ---------------------------------------------------------------------------
-- Grants (Supabase grants new functions to anon/authenticated by default)
-- ---------------------------------------------------------------------------

revoke execute on function
  public.register_child(uuid, uuid, text, text, boolean, uuid),
  public.set_child_pin(uuid, text),
  public.verify_child_pin(text, text, text),
  public.hit_rate_limit(text, interval, int)
from public, anon;

revoke execute on function
  public.verify_child_pin(text, text, text),
  public.hit_rate_limit(text, interval, int)
from authenticated;

grant execute on function
  public.register_child(uuid, uuid, text, text, boolean, uuid),
  public.set_child_pin(uuid, text)
to authenticated;

grant execute on function
  public.verify_child_pin(text, text, text),
  public.hit_rate_limit(text, interval, int)
to service_role;
