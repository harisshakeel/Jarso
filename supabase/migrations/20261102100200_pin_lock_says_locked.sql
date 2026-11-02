-- The wrong PIN that starts a lock now answers 'locked', not 'invalid', so the child sees the
-- "too many tries" copy on that attempt instead of only on the next one. Same for the attempt
-- that reaches the 100-failure safety cap. Otherwise the same as 20261029013254.

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

  -- This attempt started a lock (per source, or the safety cap): say so now.
  if v_locked_until is not null or v_failures >= c_freeze_after then
    return query select null::uuid, 'locked'::text;
    return;
  end if;

  return query select null::uuid, 'invalid'::text;
end;
$$;

comment on function public.verify_child_pin(text, text, text, text) is 'Child sign-in check from one source (hashed IP). Returns (child_id, status) with status ok | invalid | locked; the wrong PIN that starts a lock already answers locked. Each 5 wrong PINs from a source lock that source for 15 min, doubling per lock up to 24 h; 100 wrong PINs from all sources within 24 h lock the child everywhere until a PIN reset. service_role only.';
