-- Slice 1 hardening after the final review and security audit:
--   A  revoke_user_sessions: service_role ends every session of a user (PIN reset).
--   F  PIN lockout per (child, source) in child_pin_attempts, plus a per-child 24 h safety cap;
--      lock starts are audited as child.locked. Replaces the per-child counters on
--      child_credentials (dropped below) and verify_child_pin(text, text, text).
--   G  invitations.parent_email is cleared when the invitation is accepted.
--   H  nicknames limited to letters, digits, space and _ . ' - (register_child, create_invitation).
--   J5 only parent profiles may update their own display columns.
--   J6 find_invitation is service_role only (the app calls it after its own parent check).

-- ---------------------------------------------------------------------------
-- A. revoke_user_sessions
-- ---------------------------------------------------------------------------

create or replace function public.revoke_user_sessions(p_user_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- Refresh tokens and MFA claims cascade from auth.sessions.
  delete from auth.sessions s where s.user_id = p_user_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.revoke_user_sessions(uuid) is 'Deletes every auth session (and, by cascade, refresh token) of a user; returns the count. Access tokens already issued live until they expire. service_role only, after the caller''s own authz.';

-- ---------------------------------------------------------------------------
-- F. Per-source PIN lockout
-- ---------------------------------------------------------------------------

create table public.child_pin_attempts (
  child_id uuid not null references public.profiles (id) on delete cascade,
  source_hash text not null,
  failed_attempts int not null default 0 check (failed_attempts >= 0),
  lock_count int not null default 0 check (lock_count >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (child_id, source_hash)
);

comment on table public.child_pin_attempts is 'PIN lockout state per (child, sign-in source). A lock from one source never locks the child elsewhere. RLS on with no policies: service role and security definer functions only.';
comment on column public.child_pin_attempts.source_hash is 'SHA-256 hex of the client IP. Never the raw address.';
comment on column public.child_pin_attempts.failed_attempts is 'Wrong PINs from this source since its last success or lock; 5 locks the source.';
comment on column public.child_pin_attempts.lock_count is 'Locks from this source since its last success or a PIN reset; lock n lasts 15 min × 2^(n-1), capped at 24 hours.';

create trigger child_pin_attempts_set_updated_at
  before update on public.child_pin_attempts
  for each row execute function public.set_updated_at();

alter table public.child_pin_attempts enable row level security;

revoke all on public.child_pin_attempts from anon, authenticated;

-- Per-child counters move to child_pin_attempts. child_credentials keeps only the
-- cross-source safety cap: 100 wrong PINs within 24 h freezes the child everywhere.
alter table public.child_credentials
  drop column failed_attempts,
  drop column locked_until,
  drop column lock_count,
  add column recent_failures int not null default 0 check (recent_failures >= 0),
  add column recent_failures_since timestamptz,
  add column frozen_at timestamptz;

comment on table public.child_credentials is 'Child PIN (bcrypt) and the cross-source safety cap. Per-source lockout lives in child_pin_attempts. RLS on with no policies: service role and security definer functions only.';
comment on column public.child_credentials.recent_failures is 'Wrong PINs from all sources in the 24 h window starting at recent_failures_since.';
comment on column public.child_credentials.recent_failures_since is 'Start of the current 24 h failure window; null before the first failure.';
comment on column public.child_credentials.frozen_at is 'Set when recent_failures reaches 100: every sign-in is refused until a parent resets the PIN.';

drop function public.verify_child_pin(text, text, text);

-- Never raises for a bad sign-in: an exception would roll back the counters. Callers map
-- 'invalid' → UNAUTHORIZED and 'locked' → RATE_LIMITED.
create or replace function public.verify_child_pin(
  p_family_code text,
  p_nickname text,
  p_pin text,
  p_source_hash text
)
returns table (child_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text := pg_catalog.upper(pg_catalog.regexp_replace(coalesce(p_family_code, ''), '[[:space:]-]', '', 'g'));
  v_key text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_nickname, '')));
  v_source text := coalesce(p_source_hash, '');
  v_child_id uuid;
  v_family_id uuid;
  v_cred public.child_credentials%rowtype;
  v_attempt public.child_pin_attempts%rowtype;
  v_failures int;
  v_since timestamptz;
  v_lock_count int;
  v_locked_until timestamptz;
  c_freeze_after constant int := 100;
begin
  select fm.profile_id, fm.family_id into v_child_id, v_family_id
  from public.families f
  join public.family_members fm on fm.family_id = f.id
  where f.code = v_code
    and fm.nickname_key = v_key
    and fm.role = 'child'
    and fm.status = 'approved';

  if v_child_id is not null then
    -- Row lock serialises every attempt for this child (all sources), so none escape a counter.
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

  if v_cred.frozen_at is not null then
    return query select null::uuid, 'locked'::text;
    return;
  end if;

  select * into v_attempt
  from public.child_pin_attempts a
  where a.child_id = v_child_id and a.source_hash = v_source;

  if v_attempt.locked_until is not null and v_attempt.locked_until > now() then
    return query select null::uuid, 'locked'::text;
    return;
  end if;

  if p_pin is not null and extensions.crypt(p_pin, v_cred.pin_hash) = v_cred.pin_hash then
    -- Success clears this source only; the cross-source window runs its full 24 h.
    delete from public.child_pin_attempts a
    where a.child_id = v_child_id and a.source_hash = v_source;

    return query select v_child_id, 'ok'::text;
    return;
  end if;

  -- Cross-source safety cap against distributed guessing.
  if v_cred.recent_failures_since is null or v_cred.recent_failures_since <= now() - interval '24 hours' then
    v_failures := 1;
    v_since := now();
  else
    v_failures := v_cred.recent_failures + 1;
    v_since := v_cred.recent_failures_since;
  end if;

  update public.child_credentials cc
  set recent_failures = v_failures,
      recent_failures_since = v_since,
      frozen_at = case when v_failures >= c_freeze_after then now() end
  where cc.profile_id = v_child_id;

  if v_failures >= c_freeze_after then
    insert into public.audit_log (family_id, action, subject_id, details)
    values (v_family_id, 'child.locked', v_child_id, pg_catalog.jsonb_build_object('scope', 'all'));
  end if;

  -- Per-source lock: n-th lock lasts 15 min × 2^(n-1), capped at 24 h (the exponent cap keeps
  -- the interval in range). The count restarts so each window allows five tries.
  if coalesce(v_attempt.failed_attempts, 0) + 1 >= 5 then
    v_lock_count := coalesce(v_attempt.lock_count, 0) + 1;
    v_locked_until := now() + least(
      interval '15 minutes' * pg_catalog.power(2, least(v_lock_count - 1, 7)),
      interval '24 hours'
    );

    insert into public.child_pin_attempts as a (child_id, source_hash, failed_attempts, lock_count, locked_until)
    values (v_child_id, v_source, 0, v_lock_count, v_locked_until)
    on conflict on constraint child_pin_attempts_pkey do update
      set failed_attempts = 0, lock_count = excluded.lock_count, locked_until = excluded.locked_until;

    insert into public.audit_log (family_id, action, subject_id, details)
    values (
      v_family_id, 'child.locked', v_child_id,
      pg_catalog.jsonb_build_object('scope', 'source', 'lock_count', v_lock_count, 'locked_until', v_locked_until)
    );
  else
    insert into public.child_pin_attempts as a (child_id, source_hash, failed_attempts)
    values (v_child_id, v_source, 1)
    on conflict on constraint child_pin_attempts_pkey do update
      set failed_attempts = a.failed_attempts + 1;
  end if;

  return query select null::uuid, 'invalid'::text;
end;
$$;

comment on function public.verify_child_pin(text, text, text, text) is 'Child sign-in check from one source (hashed IP). Returns (child_id, status) with status ok | invalid | locked. Each 5 wrong PINs from a source lock that source for 15 min, doubling per lock up to 24 h; 100 wrong PINs from all sources within 24 h lock the child everywhere until a PIN reset. service_role only.';

-- ---------------------------------------------------------------------------
-- set_child_pin: clears every lock for the child
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
        recent_failures = 0,
        recent_failures_since = null,
        frozen_at = null;

  delete from public.child_pin_attempts a where a.child_id = p_child_id;

  insert into public.audit_log (family_id, actor_id, action, subject_id)
  values (v_family_id, v_uid, 'child.pin_reset', p_child_id);
end;
$$;

comment on function public.set_child_pin(uuid, text) is 'Parent sets or resets a child''s PIN and clears every lock (all sources and the safety cap). JA401/JA403, 22023.';

-- ---------------------------------------------------------------------------
-- invitations: parent_email is dropped on acceptance (G)
-- ---------------------------------------------------------------------------

alter table public.invitations alter column parent_email drop not null;

comment on column public.invitations.parent_email is 'Where the optional invitation email goes; cleared when the invitation is accepted. Never shown back to clients.';

-- ---------------------------------------------------------------------------
-- register_child: nickname charset, parent_email cleared on accept, fresh lock state
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

  if v_nickname is null or pg_catalog.char_length(v_nickname) not between 1 and 20
     or v_nickname !~ '^[[:alpha:][:digit:] _.''-]+$' then
    raise exception using errcode = '22023', message = 'Nickname must be 1 to 20 letters, numbers, spaces or _ . '' -';
  end if;

  if not exists (select 1 from public.profiles pr where pr.id = p_child_id and pr.role = 'child')
     or exists (select 1 from public.family_members fm where fm.profile_id = p_child_id) then
    raise exception using errcode = 'JA409', message = 'Child account is not available';
  end if;

  if p_invitation_id is not null then
    -- Row lock: a concurrent accept waits, then sees 'accepted' and fails.
    perform 1
    from public.invitations i
    where i.id = p_invitation_id
      and i.status = 'pending'
      and i.expires_at > now()
    for update;

    if not found then
      raise exception using errcode = 'JA404', message = 'Invitation not found or no longer valid';
    end if;
  end if;

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

  -- A leftover row (e.g. from a half-finished earlier attempt) is overwritten, not surfaced as 23505.
  insert into public.child_credentials (profile_id, pin_hash, set_by)
  values (p_child_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), v_uid)
  on conflict (profile_id) do update
    set pin_hash = excluded.pin_hash,
        set_by = excluded.set_by,
        recent_failures = 0,
        recent_failures_since = null,
        frozen_at = null;

  delete from public.child_pin_attempts a where a.child_id = p_child_id;

  insert into public.audit_log (family_id, actor_id, action, subject_id, details)
  values (
    p_family_id, v_uid, 'child.added', p_child_id,
    pg_catalog.jsonb_build_object('nickname', v_nickname)
  );

  if p_invitation_id is not null then
    update public.invitations
    set status = 'accepted', accepted_by = v_uid, child_id = p_child_id, family_id = p_family_id,
        parent_email = null
    where id = p_invitation_id;

    insert into public.audit_log (family_id, actor_id, action, subject_id)
    values (p_family_id, v_uid, 'invitation.accepted', p_invitation_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_invitation: nickname charset (H)
-- ---------------------------------------------------------------------------

create or replace function public.create_invitation(
  p_nickname text,
  p_parent_email text,
  p_token_hash text,
  p_code_hash text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nickname text := pg_catalog.btrim(p_nickname);
  v_id uuid;
begin
  if v_nickname is null or pg_catalog.char_length(v_nickname) not between 1 and 20
     or v_nickname !~ '^[[:alpha:][:digit:] _.''-]+$' then
    raise exception using errcode = '22023', message = 'Nickname must be 1 to 20 letters, numbers, spaces or _ . '' -';
  end if;

  insert into public.invitations (nickname, parent_email, token_hash, code_hash, expires_at)
  values (v_nickname, pg_catalog.btrim(p_parent_email), p_token_hash, p_code_hash, now() + interval '7 days')
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- J5. Only parents update their own profile's display columns
-- ---------------------------------------------------------------------------

drop policy "Profiles are updatable by their owner" on public.profiles;

create policy "Parents can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()) and role = 'parent')
  with check (id = (select auth.uid()) and role = 'parent');

-- ---------------------------------------------------------------------------
-- Grants (Supabase grants new functions to anon/authenticated by default;
-- create or replace keeps the existing grants on replaced functions)
-- ---------------------------------------------------------------------------

revoke execute on function
  public.revoke_user_sessions(uuid),
  public.verify_child_pin(text, text, text, text)
from public, anon, authenticated;

revoke execute on function public.find_invitation(text) from authenticated;

grant execute on function
  public.revoke_user_sessions(uuid),
  public.verify_child_pin(text, text, text, text),
  public.find_invitation(text)
to service_role;
