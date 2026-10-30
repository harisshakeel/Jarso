-- Savings requests (slice 4): withdrawal functions. Task 10 appends the deposit functions.
-- Lock order (database.md): the request row first (if one exists), then the child's ledger
-- advisory lock, then balance checks and inserts.

-- ---------------------------------------------------------------------------
-- create_withdrawal
-- ---------------------------------------------------------------------------

create or replace function public.create_withdrawal(
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
  v_available bigint;
  v_rule record;
  v_start timestamptz;
  v_used bigint;
  v_has_auto boolean := false;
  v_auto_ok boolean := true;
  v_id uuid;
  v_status text := 'pending';
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

  if p_amount_minor is null or p_amount_minor < 1 or p_amount_minor > 100000000000
     or pg_catalog.char_length(v_reason) > 140
     or p_idempotency_key is null or pg_catalog.btrim(p_idempotency_key) = ''
     or pg_catalog.char_length(p_idempotency_key) > 200 then
    raise exception using errcode = '22023', message = 'Invalid withdrawal';
  end if;

  -- No source row yet: the child's ledger advisory lock is the only lock.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ledger:' || p_child_id::text, 0));

  -- A retry returns the request as it is now, without re-checking anything.
  select * into v_existing
  from public.requests r
  where r.child_id = p_child_id and r.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.kind <> 'withdrawal' then
      raise exception using errcode = 'JA409', message = 'Key already used';
    end if;
    return pg_catalog.jsonb_build_object('status', v_existing.status, 'request_id', v_existing.id);
  end if;

  v_available := public.available_save(p_child_id);
  if p_amount_minor > v_available then
    return pg_catalog.jsonb_build_object('status', 'over_available', 'available_minor', v_available);
  end if;

  -- Caps: pending, approved and handed-over requests count; the first rule broken wins.
  for v_rule in
    select r.period, r.amount_minor
    from public.money_rules r
    where r.child_id = p_child_id and r.kind = 'withdrawal_cap'
    order by case r.period when 'item' then 1 when 'week' then 2 else 3 end
  loop
    if v_rule.period = 'item' then
      v_used := 0;
    else
      v_start := public.rule_window_start(v_family_id, v_rule.period, pg_catalog.now());
      v_used := public.request_window_total(
        p_child_id, 'withdrawal', array['pending', 'approved', 'handed_over'], v_start);
    end if;
    if v_used + p_amount_minor > v_rule.amount_minor then
      return pg_catalog.jsonb_build_object(
        'status', 'over_cap', 'period', v_rule.period,
        'cap_minor', v_rule.amount_minor, 'used_minor', v_used);
    end if;
  end loop;

  -- Auto-approve: needs at least one rule, and every rule must pass.
  for v_rule in
    select r.period, r.amount_minor
    from public.money_rules r
    where r.child_id = p_child_id and r.kind = 'withdrawal_auto_approve'
  loop
    v_has_auto := true;
    if v_rule.period = 'item' then
      v_used := 0;
    else
      v_start := public.rule_window_start(v_family_id, v_rule.period, pg_catalog.now());
      v_used := public.request_window_total(
        p_child_id, 'withdrawal', array['approved', 'handed_over'], v_start);
    end if;
    if v_used + p_amount_minor > v_rule.amount_minor then
      v_auto_ok := false;
    end if;
  end loop;
  if v_has_auto and v_auto_ok then
    v_status := 'approved';
  end if;

  insert into public.requests (
    family_id, child_id, kind, status, amount_minor, reason, auto, idempotency_key
  )
  values (
    v_family_id, p_child_id, 'withdrawal', v_status, p_amount_minor, v_reason,
    v_status = 'approved', p_idempotency_key
  )
  returning id into v_id;

  if v_status = 'pending' then
    perform public.notify_parents(
      p_child_id, 'withdrawal_requested', 'request', v_id, null,
      pg_catalog.jsonb_build_object('amount_minor', p_amount_minor, 'reason', v_reason));
  end if;

  return pg_catalog.jsonb_build_object('status', v_status, 'request_id', v_id);
end;
$$;

comment on function public.create_withdrawal(uuid, bigint, text, text) is
  'Child asks to take money out of Save. Returns {status: pending|approved, request_id}, {status: over_available, available_minor} or {status: over_cap, period, cap_minor, used_minor}; a repeated (child, key) returns that request''s current status and id. Caps count pending+approved+handed_over (first broken: item, week, month); auto-approve needs every withdrawal_auto_approve rule to pass over approved+handed_over, then notifies nobody; otherwise notifies parents. JA403 (not the child), JA409 (key used by a deposit), 22023 (amount outside 1..100000000000, reason over 140, blank key or over 200).';

-- ---------------------------------------------------------------------------
-- decide_withdrawal
-- ---------------------------------------------------------------------------

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
  if v_r.kind <> 'withdrawal' or p_approve is null or pg_catalog.char_length(v_note) > 140 then
    raise exception using errcode = '22023', message = 'Invalid decision';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ledger:' || v_r.child_id::text, 0));

  if v_r.status <> 'pending' then
    return 'already_decided';
  end if;

  -- This request is already in reserved_save, so Save must cover everything else reserved plus it.
  if p_approve and v_r.amount_minor >
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
    v_r.child_id, 'withdrawal_decided', 'request', v_r.id, null,
    pg_catalog.jsonb_build_object('amount_minor', v_r.amount_minor, 'approved', p_approve));

  return case when p_approve then 'approved' else 'rejected' end;
end;
$$;

comment on function public.decide_withdrawal(uuid, boolean, text) is
  'Parent approves or rejects a pending withdrawal. Locks the request, then the ledger lock. Returns approved, rejected, already_decided (not pending) or over_available (approve only: Save no longer covers it; the request stays pending). Notifies the child. JA403 (not a parent of the child, or missing), 22023 (not a withdrawal, note over 140).';

-- ---------------------------------------------------------------------------
-- post_request: the only path that posts a request to the ledger (provider seam)
-- ---------------------------------------------------------------------------

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
    -- Only Save is re-checked (this request's own reservation is released first).
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
  end if;

  return 'completed';
end;
$$;

comment on function public.post_request(uuid, uuid) is
  'Internal, no grants: the one place a request reaches the ledger. Call under the request row lock and the child''s ledger lock. Withdrawal: re-checks Save only (over_available), posts withdrawal_out (save) and withdrawal_in (spend) with keys request:<id>:out|in, sets handed_over. Returns completed or over_available.';

-- ---------------------------------------------------------------------------
-- complete_request
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

  if v_r.status = 'handed_over' then
    return 'already_completed';
  end if;
  if v_r.kind <> 'withdrawal' or v_r.status <> 'approved' then
    return 'not_approved';
  end if;

  return public.post_request(v_r.id, v_uid);
end;
$$;

comment on function public.complete_request(uuid, text) is
  'Parent hands over an approved withdrawal. Locks the request, then the ledger lock. Returns completed, already_completed, not_approved or over_available (Save no longer covers it; stays approved). Posting is public.post_request. JA403, 22023 (blank key or over 200).';

-- ---------------------------------------------------------------------------
-- cancel_request
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
  if not v_is_child and v_r.kind <> 'withdrawal' then
    raise exception using errcode = '22023', message = 'Parents decide deposits';
  end if;

  -- The child cancels their own pending request; a parent may also cancel an approved withdrawal.
  if v_r.status = 'pending' or (not v_is_child and v_r.status = 'approved') then
    update public.requests set status = 'cancelled' where id = v_r.id;
    return 'cancelled';
  end if;
  return 'already_closed';
end;
$$;

comment on function public.cancel_request(uuid) is
  'Child cancels their own pending request; a parent cancels a pending or approved withdrawal (deposits go through decide_deposit). Locks the row, posts nothing, frees the reservation or hold. Returns cancelled or already_closed. JA403 (not the child or a parent, or missing), 22023 (a parent on a deposit).';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function public.post_request(uuid, uuid) from public, anon, authenticated;

revoke execute on function
  public.create_withdrawal(uuid, bigint, text, text),
  public.decide_withdrawal(uuid, boolean, text),
  public.complete_request(uuid, text),
  public.cancel_request(uuid)
from public, anon;

grant execute on function
  public.create_withdrawal(uuid, bigint, text, text),
  public.decide_withdrawal(uuid, boolean, text),
  public.complete_request(uuid, text),
  public.cancel_request(uuid)
to authenticated;
