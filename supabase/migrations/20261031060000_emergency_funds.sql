-- Emergency funds (FR15): a third request kind on the savings-request machinery. The child asks
-- their parent for extra money with a reason; the parent approves or rejects; an approved grant
-- posts exactly once, into Spend (product owner, 2026-10-31), when the parent confirms handing it
-- over, as its own ledger kind (grant_in), never as an allowance. Rejection changes nothing.
--
-- Unlike a withdrawal it reserves nothing (it is new money), no cap or auto rule applies, and
-- the reason is required. Lock order as before: the request row, then the child's ledger lock.

-- ---------------------------------------------------------------------------
-- requests.kind gains 'emergency'; an emergency is never 'confirmed' (that word is for deposits)
-- ---------------------------------------------------------------------------

alter table public.requests drop constraint requests_kind_check;
alter table public.requests add constraint requests_kind_check
  check (kind in ('withdrawal', 'deposit', 'emergency'));
alter table public.requests add constraint requests_emergency_never_confirmed
  check (not (kind = 'emergency' and status = 'confirmed'));
alter table public.requests add constraint requests_emergency_has_reason
  check (not (kind = 'emergency' and coalesce(pg_catalog.btrim(reason), '') = ''));

comment on table public.requests is 'Requests: a child asks to take money out of Save (withdrawal), records money put into Save (deposit), or asks for extra money (emergency, FR15). Written only by definer functions.';

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'limit_exceeded', 'withdrawal_requested', 'withdrawal_decided',
  'deposit_requested', 'deposit_decided',
  'emergency_requested', 'emergency_decided',
  'allowance_due', 'handover_reminder'
));

-- ---------------------------------------------------------------------------
-- create_emergency
-- ---------------------------------------------------------------------------

create or replace function public.create_emergency(
  p_child_id uuid,
  p_amount_minor bigint,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_family_id uuid;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_existing public.requests;
  v_id uuid;
begin
  if not public.is_self(p_child_id) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.profile_id = p_child_id
    and fm.role = 'child'
    and fm.status = 'approved';
  if v_family_id is null then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  -- A reason is the whole point of asking: the parent decides on it.
  if p_amount_minor is null or p_amount_minor < 1 or p_amount_minor > 100000000000
     or v_reason is null or pg_catalog.char_length(v_reason) > 140
     or p_idempotency_key is null or pg_catalog.btrim(p_idempotency_key) = ''
     or pg_catalog.char_length(p_idempotency_key) > 200 then
    raise exception using errcode = '22023', message = 'Invalid request';
  end if;

  -- No source row yet: the child's ledger advisory lock is the only lock.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ledger:' || p_child_id::text, 0));

  -- A retry returns the request as it is now.
  select * into v_existing
  from public.requests r
  where r.child_id = p_child_id and r.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.kind <> 'emergency' then
      raise exception using errcode = 'JA409', message = 'Key already used';
    end if;
    return pg_catalog.jsonb_build_object('status', v_existing.status, 'request_id', v_existing.id);
  end if;

  insert into public.requests (family_id, child_id, kind, status, amount_minor, reason, idempotency_key)
  values (v_family_id, p_child_id, 'emergency', 'pending', p_amount_minor, v_reason, p_idempotency_key)
  returning id into v_id;

  perform public.notify_parents(
    p_child_id, 'emergency_requested', 'request', v_id, null,
    pg_catalog.jsonb_build_object('amount_minor', p_amount_minor, 'reason', v_reason));

  return pg_catalog.jsonb_build_object('status', 'pending', 'request_id', v_id);
end;
$$;

comment on function public.create_emergency(uuid, bigint, text, text) is
  'Child asks their parent for extra money (FR15). Always pending: no cap, no auto rule, nothing reserved. Returns {status: pending, request_id}; a repeated (child, key) returns that request''s current status and id. Notifies parents. JA403 (not the child), JA409 (key used by another kind), 22023 (amount outside 1..100000000000, missing reason or over 140, blank key or over 200).';

-- ---------------------------------------------------------------------------
-- decide_withdrawal also decides an emergency (same shape: approve or reject a pending ask)
-- ---------------------------------------------------------------------------
-- Same as 20261031020001 except the kind check and, for an emergency, no Save check (it is
-- new money) and an emergency_decided notice.

create or replace function public.decide_withdrawal(
  p_request_id uuid,
  p_approve boolean,
  p_note text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_r public.requests;
  v_note text := nullif(pg_catalog.btrim(p_note), '');
begin
  select * into v_r from public.requests r where r.id = p_request_id for update;
  -- A missing and a foreign request both raise JA403 so existence does not leak.
  if not found or not public.is_parent_of(v_r.child_id) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;
  if v_r.kind not in ('withdrawal', 'emergency') or p_approve is null
     or pg_catalog.char_length(v_note) > 140 then
    raise exception using errcode = '22023', message = 'Invalid decision';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ledger:' || v_r.child_id::text, 0));

  if v_r.status <> 'pending' then
    return 'already_decided';
  end if;

  -- A withdrawal is already in reserved_save, so Save must cover everything else reserved plus it.
  if v_r.kind = 'withdrawal' and p_approve and v_r.amount_minor >
     public.balance(v_r.child_id, 'save', 'recorded') - public.reserved_save(v_r.child_id) + v_r.amount_minor then
    return 'over_available';
  end if;

  update public.requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      decided_by = v_uid,
      decided_at = pg_catalog.now(),
      decision_note = v_note
  where id = v_r.id;

  perform public.notify_child(
    v_r.child_id,
    case when v_r.kind = 'emergency' then 'emergency_decided' else 'withdrawal_decided' end,
    'request', v_r.id, null,
    pg_catalog.jsonb_build_object('amount_minor', v_r.amount_minor, 'approved', p_approve));

  return case when p_approve then 'approved' else 'rejected' end;
end;
$$;

comment on function public.decide_withdrawal(uuid, boolean, text) is
  'Parent approves or rejects a pending withdrawal or emergency request. Locks the request, then the ledger lock. Returns approved, rejected, already_decided (not pending) or over_available (approving a withdrawal Save no longer covers; the request stays pending). Notifies the child (withdrawal_decided or emergency_decided). JA403 (not a parent of the child, or missing), 22023 (a deposit, note over 140).';

-- ---------------------------------------------------------------------------
-- post_request: an approved emergency posts one grant_in to Spend, exactly once
-- ---------------------------------------------------------------------------
-- Same as 20261031020001 plus the emergency branch. Ledger keys derive from the request id, so a
-- second post of the same request fails on the unique key and nothing doubles.

create or replace function public.post_request(p_request_id uuid, p_actor uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_r public.requests;
  v_label text;
begin
  select * into v_r from public.requests r where r.id = p_request_id;
  if not found then
    raise exception using errcode = 'JA404', message = 'Not found';
  end if;

  if v_r.kind = 'withdrawal' then
    -- Save must cover this and every other reservation (this request's own is released first).
    -- Rules are not: an approved withdrawal stays approved.
    if v_r.amount_minor >
       public.balance(v_r.child_id, 'save', 'recorded') - (public.reserved_save(v_r.child_id) - v_r.amount_minor) then
      return 'over_available';
    end if;

    v_label := coalesce(v_r.reason, 'Taken out of Save');

    insert into public.ledger_entries (
      family_id, child_id, mode, jar, kind, direction, amount_minor, label,
      source_type, source_id, idempotency_key, created_by
    )
    values
      (v_r.family_id, v_r.child_id, 'recorded', 'save', 'withdrawal_out', 'out', v_r.amount_minor, v_label,
       'request', v_r.id, 'request:' || v_r.id::text || ':out', p_actor),
      (v_r.family_id, v_r.child_id, 'recorded', 'spend', 'withdrawal_in', 'in', v_r.amount_minor, v_label,
       'request', v_r.id, 'request:' || v_r.id::text || ':in', p_actor);

    update public.requests
    set status = 'handed_over', completed_by = p_actor, completed_at = pg_catalog.now()
    where id = v_r.id;
  elsif v_r.kind = 'deposit' then
    -- Spend must cover this and every other pending hold (this request's own is released first).
    if v_r.amount_minor >
       public.balance(v_r.child_id, 'spend', 'recorded') - (public.held_spend(v_r.child_id) - v_r.amount_minor) then
      return 'over_available';
    end if;

    insert into public.ledger_entries (
      family_id, child_id, mode, jar, kind, direction, amount_minor, label,
      source_type, source_id, idempotency_key, created_by
    )
    values
      (v_r.family_id, v_r.child_id, 'recorded', 'spend', 'deposit_out', 'out', v_r.amount_minor, 'Put into Save',
       'request', v_r.id, 'request:' || v_r.id::text || ':out', p_actor),
      (v_r.family_id, v_r.child_id, 'recorded', 'save', 'deposit_in', 'in', v_r.amount_minor, 'Put into Save',
       'request', v_r.id, 'request:' || v_r.id::text || ':in', p_actor);

    update public.requests
    set status = 'confirmed', completed_by = p_actor, completed_at = pg_catalog.now()
    where id = v_r.id;
  elsif v_r.kind = 'emergency' then
    -- New money from the parent, into Spend (decided 2026-10-31). Nothing to re-check.
    insert into public.ledger_entries (
      family_id, child_id, mode, jar, kind, direction, amount_minor, label,
      source_type, source_id, idempotency_key, created_by
    )
    values
      (v_r.family_id, v_r.child_id, 'recorded', 'spend', 'grant_in', 'in', v_r.amount_minor,
       coalesce(v_r.reason, 'Extra money'), 'request', v_r.id, 'request:' || v_r.id::text || ':in', p_actor);

    update public.requests
    set status = 'handed_over', completed_by = p_actor, completed_at = pg_catalog.now()
    where id = v_r.id;
  else
    raise exception using errcode = '22023', message = 'Unknown request kind';
  end if;

  return 'completed';
end;
$$;

comment on function public.post_request(uuid, uuid) is
  'Internal, no grants: the one place a request reaches the ledger. Call under the request row lock and the child''s ledger lock. Withdrawal: re-checks Save only (Save must cover this and every other reservation, else over_available), posts withdrawal_out (save) and withdrawal_in (spend) with keys request:<id>:out|in, sets handed_over. Deposit: re-checks Spend only, posts deposit_out (spend) and deposit_in (save), label Put into Save, same keys, sets confirmed. Emergency (FR15): posts one grant_in to spend labelled with the reason, key request:<id>:in, sets handed_over. Unknown kind: 22023. Returns completed or over_available.';

-- ---------------------------------------------------------------------------
-- complete_request: an approved emergency is handed over like an approved withdrawal
-- ---------------------------------------------------------------------------

create or replace function public.complete_request(p_request_id uuid, p_idempotency_key text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_r public.requests;
begin
  select * into v_r from public.requests r where r.id = p_request_id for update;
  if not found or not public.is_parent_of(v_r.child_id) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;
  -- The key is not stored: ledger keys derive from the request id, which already makes this exactly-once.
  if p_idempotency_key is null or pg_catalog.btrim(p_idempotency_key) = ''
     or pg_catalog.char_length(p_idempotency_key) > 200 then
    raise exception using errcode = '22023', message = 'Invalid key';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ledger:' || v_r.child_id::text, 0));

  if v_r.status in ('handed_over', 'confirmed') then
    return 'already_completed';
  end if;
  -- A withdrawal or emergency is handed over once approved; a deposit is confirmed straight from pending.
  if not ((v_r.kind in ('withdrawal', 'emergency') and v_r.status = 'approved')
          or (v_r.kind = 'deposit' and v_r.status = 'pending')) then
    return 'not_approved';
  end if;

  return public.post_request(v_r.id, v_uid);
end;
$$;

comment on function public.complete_request(uuid, text) is
  'Parent hands over an approved withdrawal or emergency grant, or confirms a pending deposit. Locks the request, then the ledger lock. Returns completed, already_completed (handed_over or confirmed), not_approved (any other status) or over_available (Save, or for a deposit Spend, no longer covers it; the status is unchanged). Posting is public.post_request. JA403, 22023 (blank key or over 200).';

-- ---------------------------------------------------------------------------
-- cancel_request: a parent may also back out of an approved emergency
-- ---------------------------------------------------------------------------

create or replace function public.cancel_request(p_request_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_r public.requests;
  v_is_child boolean;
begin
  select * into v_r from public.requests r where r.id = p_request_id for update;
  if not found then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;
  v_is_child := public.is_self(v_r.child_id);
  if not (v_is_child or public.is_parent_of(v_r.child_id)) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;
  if not v_is_child and v_r.kind = 'deposit' then
    raise exception using errcode = '22023', message = 'Parents decide deposits';
  end if;

  -- The child cancels their own pending request; a parent may also cancel an approved one.
  if v_r.status = 'pending' or (not v_is_child and v_r.status = 'approved') then
    update public.requests set status = 'cancelled' where id = v_r.id;
    return 'cancelled';
  end if;
  return 'already_closed';
end;
$$;

comment on function public.cancel_request(uuid) is
  'Child cancels their own pending request; a parent cancels a pending or approved withdrawal or emergency (deposits go through decide_deposit). Locks the row, posts nothing, frees any reservation or hold. Returns cancelled or already_closed. JA403 (not the child or a parent, or missing), 22023 (a parent on a deposit).';

-- ---------------------------------------------------------------------------
-- Grants (create or replace keeps the existing ones; the new function needs its own)
-- ---------------------------------------------------------------------------

revoke execute on function public.create_emergency(uuid, bigint, text, text) from public, anon;
grant execute on function public.create_emergency(uuid, bigint, text, text) to authenticated;
