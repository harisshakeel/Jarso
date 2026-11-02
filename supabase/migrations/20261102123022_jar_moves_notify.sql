-- Jar moves without asking (FR14 follow-up, 2026-11-02): a parent can set, per child, that
-- moving money between the child's own jars (take out of Save, put into Save) is recorded at
-- once and the parent is told, instead of waiting for a yes and a hand-over. Extra-money
-- requests always ask: only jar-to-jar moves can be notify-only. The child's caps still apply.

-- ---------------------------------------------------------------------------
-- The setting
-- ---------------------------------------------------------------------------

alter table public.child_settings
  add column jar_moves_approval text not null default 'ask'
  check (jar_moves_approval in ('ask', 'notify'));

comment on column public.child_settings.jar_moves_approval is
  'How the child moves money between jars: ask (a request waits for the parent) or notify (recorded at once, the parent gets a jar_moved notice). Written only by set_jar_moves_approval.';

comment on table public.child_settings is
  'Per-child parent-controlled settings. A missing row means defaults. Written only by set_allow_negative_spend and set_jar_moves_approval.';

create or replace function public.set_jar_moves_approval(p_child_id uuid, p_mode text)
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
  if not public.is_parent_of(p_child_id) then
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

  if p_mode is null or p_mode not in ('ask', 'notify') then
    raise exception using errcode = '22023', message = 'Invalid setting';
  end if;

  insert into public.child_settings (child_id, family_id, jar_moves_approval, updated_by)
  values (p_child_id, v_family_id, p_mode, v_uid)
  on conflict (child_id) do update
    set jar_moves_approval = excluded.jar_moves_approval,
        updated_by = excluded.updated_by;

  insert into public.audit_log (family_id, actor_id, action, subject_id, details)
  values (v_family_id, v_uid, 'settings.jar_moves', p_child_id, pg_catalog.jsonb_build_object('mode', p_mode));
end;
$$;

comment on function public.set_jar_moves_approval(uuid, text) is
  'Parent sets how a child moves money between jars: ask (default) or notify; upserts child_settings and audits settings.jar_moves. JA403, 22023 (not ask or notify).';

revoke execute on function public.set_jar_moves_approval(uuid, text) from public, anon;
grant execute on function public.set_jar_moves_approval(uuid, text) to authenticated;

/** Internal: whether this child's jar moves are recorded at once. */
create or replace function public.jar_moves_without_asking(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select cs.jar_moves_approval = 'notify' from public.child_settings cs where cs.child_id = p_child_id),
    false);
$$;

comment on function public.jar_moves_without_asking(uuid) is
  'Internal, no grants: true when the child''s jar moves are set to notify (recorded at once).';

revoke execute on function public.jar_moves_without_asking(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Notifications: jar_moved (a move recorded without asking)
-- ---------------------------------------------------------------------------

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'limit_exceeded', 'withdrawal_requested', 'withdrawal_decided',
  'deposit_requested', 'deposit_decided',
  'emergency_requested', 'emergency_decided',
  'allowance_due', 'handover_reminder',
  'card_charge_failed',
  'money_received', 'entry_corrected',
  'jar_moved'
));

-- ---------------------------------------------------------------------------
-- create_withdrawal: same as 20261031020001, plus the notify branch after the caps
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
    return pg_catalog.jsonb_build_object(
      'status', v_existing.status, 'request_id', v_existing.id,
      'settled_now', v_existing.auto and v_existing.status = 'handed_over');
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

  -- "Just tell me": recorded at once, under the caps above; the parent gets a note.
  if public.jar_moves_without_asking(p_child_id) then
    insert into public.requests (
      family_id, child_id, kind, status, amount_minor, reason, auto, decided_at, idempotency_key
    )
    values (
      v_family_id, p_child_id, 'withdrawal', 'approved', p_amount_minor, v_reason,
      true, pg_catalog.now(), p_idempotency_key
    )
    returning id into v_id;
    -- Save was checked above under the same lock, so posting cannot be refused.
    if public.post_request(v_id, p_child_id) <> 'completed' then
      raise exception using errcode = '22023', message = 'Could not record the move';
    end if;
    perform public.notify_parents(
      p_child_id, 'jar_moved', 'request', v_id, null,
      pg_catalog.jsonb_build_object(
        'amount_minor', p_amount_minor, 'reason', v_reason, 'direction', 'save_to_spend'));
    return pg_catalog.jsonb_build_object('status', 'handed_over', 'request_id', v_id, 'settled_now', true);
  end if;

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
    family_id, child_id, kind, status, amount_minor, reason, auto, decided_at, idempotency_key
  )
  values (
    v_family_id, p_child_id, 'withdrawal', v_status, p_amount_minor, v_reason,
    v_status = 'approved',
    case when v_status = 'approved' then pg_catalog.now() end,
    p_idempotency_key
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
  'Child asks to take money out of Save. Returns {status: pending|approved, request_id}, {status: handed_over, request_id, settled_now: true} when the parent set jar moves to notify (recorded at once through post_request, actor the child, auto, then a jar_moved notice to the parents), {status: over_available, available_minor} or {status: over_cap, period, cap_minor, used_minor}; a repeated (child, key) returns that request''s current status and id. Caps count pending+approved+handed_over (first broken: item, week, month) in every mode; auto-approve needs every withdrawal_auto_approve rule to pass over approved+handed_over, then notifies nobody; otherwise notifies parents. JA403 (not the child), JA409 (key used by a deposit), 22023 (amount outside 1..100000000000, reason over 140, blank key or over 200).';

-- ---------------------------------------------------------------------------
-- create_deposit: same as 20261031020001, plus the notify branch
-- ---------------------------------------------------------------------------

create or replace function public.create_deposit(
  p_child_id uuid,
  p_amount_minor bigint,
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
  v_existing public.requests;
  v_available bigint;
  v_rule record;
  v_start timestamptz;
  v_used bigint;
  v_has_auto boolean := false;
  v_auto_ok boolean := true;
  v_notify boolean;
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
     or p_idempotency_key is null or pg_catalog.btrim(p_idempotency_key) = ''
     or pg_catalog.char_length(p_idempotency_key) > 200 then
    raise exception using errcode = '22023', message = 'Invalid deposit';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ledger:' || p_child_id::text, 0));

  select * into v_existing
  from public.requests r
  where r.child_id = p_child_id and r.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.kind <> 'deposit' then
      raise exception using errcode = 'JA409', message = 'Key already used';
    end if;
    return pg_catalog.jsonb_build_object(
      'status', v_existing.status, 'request_id', v_existing.id,
      'settled_now', v_existing.auto and v_existing.status = 'confirmed'
        and public.jar_moves_without_asking(p_child_id));
  end if;

  v_available := public.available_spend(p_child_id);
  if p_amount_minor > v_available then
    return pg_catalog.jsonb_build_object('status', 'over_available', 'available_minor', v_available);
  end if;

  v_notify := public.jar_moves_without_asking(p_child_id);

  -- Auto-confirm: needs at least one rule, and every rule must pass.
  if not v_notify then
    for v_rule in
      select r.period, r.amount_minor
      from public.money_rules r
      where r.child_id = p_child_id and r.kind = 'deposit_auto_confirm'
    loop
      v_has_auto := true;
      if v_rule.period = 'item' then
        v_used := 0;
      else
        v_start := public.rule_window_start(v_family_id, v_rule.period, pg_catalog.now());
        v_used := public.request_window_total(p_child_id, 'deposit', array['confirmed'], v_start);
      end if;
      if v_used + p_amount_minor > v_rule.amount_minor then
        v_auto_ok := false;
      end if;
    end loop;
  end if;

  insert into public.requests (family_id, child_id, kind, status, amount_minor, auto, idempotency_key)
  values (
    v_family_id, p_child_id, 'deposit', 'pending', p_amount_minor,
    v_notify or (v_has_auto and v_auto_ok), p_idempotency_key
  )
  returning id into v_id;

  if v_notify or (v_has_auto and v_auto_ok) then
    -- Spend was checked above under the same lock, so posting cannot be refused.
    if public.post_request(v_id, p_child_id) <> 'completed' then
      raise exception using errcode = '22023', message = 'Could not confirm the deposit';
    end if;
    v_status := 'confirmed';
    -- "Just tell me": the parent hears about it; an auto-confirm rule stays silent, as before.
    if v_notify then
      perform public.notify_parents(
        p_child_id, 'jar_moved', 'request', v_id, null,
        pg_catalog.jsonb_build_object('amount_minor', p_amount_minor, 'direction', 'spend_to_save'));
    end if;
  else
    perform public.notify_parents(
      p_child_id, 'deposit_requested', 'request', v_id, null,
      pg_catalog.jsonb_build_object('amount_minor', p_amount_minor));
  end if;

  return pg_catalog.jsonb_build_object(
    'status', v_status, 'request_id', v_id, 'settled_now', v_notify and v_status = 'confirmed');
end;
$$;

comment on function public.create_deposit(uuid, bigint, text) is
  'Child records money put into Save. Returns {status: pending|confirmed, request_id, settled_now} or {status: over_available, available_minor} (amount > available_spend); a repeated (child, key) returns that request''s current status and id. Pending deposits hold Spend. With the parent''s jar moves set to notify, the deposit posts at once through post_request (actor = the child), sets auto, and the parents get a jar_moved notice (settled_now true). Otherwise auto-confirm needs every deposit_auto_confirm rule to pass over confirmed deposits in the window (item: amount <= limit); it posts the same way and notifies nobody; else the deposit waits and notifies parents. JA403 (not the child), JA409 (key used by a withdrawal), 22023 (amount outside 1..100000000000, blank key or over 200).';
