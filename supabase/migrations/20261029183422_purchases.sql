-- Purchases: the child records spending from Spend and may undo it within 24 hours.
-- Overspending (D2) can refuse a purchase; spending limits never block but notify parents
-- once per window. History gains the reversal link so the app can show "Undone".

-- ---------------------------------------------------------------------------
-- held_spend: Spend that is spoken for (pending deposits, slice 4)
-- ---------------------------------------------------------------------------

create or replace function public.held_spend(p_child_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_self(p_child_id) or public.is_parent_of(p_child_id)) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  -- Slice 4 replaces this body with the sum of the child's pending deposits.
  return 0;
end;
$$;

comment on function public.held_spend(uuid) is 'Spend held by pending deposits, in minor units (0 until deposits exist). Caller must be the child or their parent. JA403.';

-- ---------------------------------------------------------------------------
-- evaluate_spend_limits: one notice per spending-limit rule the purchase crosses
-- ---------------------------------------------------------------------------

create or replace function public.evaluate_spend_limits(p_entry_id uuid)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_e public.ledger_entries;
  v_tz text;
  v_rule record;
  v_start timestamptz;
  v_after numeric;
  v_notices int;
begin
  select * into v_e from public.ledger_entries le where le.id = p_entry_id;
  if not found or v_e.kind <> 'purchase' or v_e.mode <> 'recorded' then
    return 0;
  end if;

  select f.timezone into v_tz from public.families f where f.id = v_e.family_id;

  for v_rule in
    select r.period, r.amount_minor
    from public.money_rules r
    where r.child_id = v_e.child_id
      and r.kind = 'spend_limit'
  loop
    if v_rule.period = 'item' then
      if v_e.amount_minor > v_rule.amount_minor then
        perform public.notify_parents(
          v_e.child_id, 'limit_exceeded', 'ledger_entry', v_e.id,
          'spend_limit:item:' || v_e.id::text,
          pg_catalog.jsonb_build_object(
            'amount_minor', v_e.amount_minor, 'limit_minor', v_rule.amount_minor,
            'period', v_rule.period, 'total_minor', v_e.amount_minor
          )
        );
      end if;
    else
      v_start := public.rule_window_start(v_e.family_id, v_rule.period, v_e.occurred_at);

      -- Every live (not reversed) recorded purchase in the window, this one included. No upper
      -- bound: occurred_at is the transaction start, so a writer that waited on the ledger lock
      -- can carry an earlier time than a purchase already committed; the lock serialises this.
      select coalesce(pg_catalog.sum(le.amount_minor), 0)
      into v_after
      from public.ledger_entries le
      where le.child_id = v_e.child_id
        and le.mode = 'recorded'
        and le.jar = 'spend'
        and le.kind = 'purchase'
        and le.occurred_at >= v_start
        and not exists (select 1 from public.ledger_entries r where r.reverses_entry_id = le.id);

      -- Notify only on the purchase that first takes the window total over the limit.
      if v_after - v_e.amount_minor <= v_rule.amount_minor and v_after > v_rule.amount_minor then
        perform public.notify_parents(
          v_e.child_id, 'limit_exceeded', 'ledger_entry', v_e.id,
          -- Local date of the window start, so the key never depends on the session timezone.
          'spend_limit:' || v_rule.period || ':' || (v_start at time zone v_tz)::date::text,
          pg_catalog.jsonb_build_object(
            'amount_minor', v_e.amount_minor, 'limit_minor', v_rule.amount_minor,
            'period', v_rule.period, 'total_minor', v_after::bigint
          )
        );
      end if;
    end if;
  end loop;

  -- Rules whose notice this purchase actually wrote (a repeat window is deduplicated).
  select pg_catalog.count(distinct n.window_key)::int
  into v_notices
  from public.notifications n
  where n.kind = 'limit_exceeded'
    and n.source_type = 'ledger_entry'
    and n.source_id = v_e.id;

  return v_notices;
end;
$$;

comment on function public.evaluate_spend_limits(uuid) is
  'Internal, no grants. For each spend_limit rule of the purchase''s child: item notifies when the amount is over the limit (window spend_limit:item:<entry>); week/month notify when this purchase takes the window total (every live purchase in the window, this one included) over the limit (window spend_limit:<period>:<local window start date>). Returns the number of rules noticed for this entry. Call under the child''s ledger lock.';

-- ---------------------------------------------------------------------------
-- record_purchase
-- ---------------------------------------------------------------------------

create or replace function public.record_purchase_at(
  p_child_id uuid,
  p_amount_minor bigint,
  p_label text,
  p_idempotency_key text,
  p_now timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_family_id uuid;
  v_label text := nullif(pg_catalog.btrim(p_label), '');
  v_key text;
  v_entry_id uuid;
  v_balance bigint;
  v_held bigint;
  v_overspend boolean;
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
     or pg_catalog.char_length(v_label) > 60
     or p_idempotency_key is null or pg_catalog.btrim(p_idempotency_key) = ''
     or p_now is null then
    raise exception using errcode = '22023', message = 'Invalid purchase';
  end if;

  v_key := 'purchase:' || p_child_id::text || ':' || p_idempotency_key;

  -- No source row: the child's ledger advisory lock is the only lock (database.md Lock order).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ledger:' || p_child_id::text, 0));

  -- A retry returns the original entry without re-checking Spend or limits.
  select le.id into v_entry_id from public.ledger_entries le where le.idempotency_key = v_key;
  if found then
    return pg_catalog.jsonb_build_object('status', 'recorded', 'entry_id', v_entry_id, 'notices', 0);
  end if;

  v_balance := public.balance(p_child_id, 'spend', 'recorded');
  v_held := public.held_spend(p_child_id);
  v_overspend := coalesce(
    (select cs.allow_negative_spend from public.child_settings cs where cs.child_id = p_child_id),
    false
  );

  -- Off: never spend more than the free Spend. On: Spend may go below zero, but never
  -- below the held amount while a deposit is pending (held money is spoken for).
  if (not v_overspend and p_amount_minor > v_balance - v_held)
     or (v_overspend and v_held > 0 and v_balance - p_amount_minor < v_held) then
    return pg_catalog.jsonb_build_object('status', 'not_enough_spend', 'free_minor', v_balance - v_held);
  end if;

  insert into public.ledger_entries (
    family_id, child_id, mode, jar, kind, direction, amount_minor, label,
    source_type, idempotency_key, created_by, occurred_at
  )
  values (
    v_family_id, p_child_id, 'recorded', 'spend', 'purchase', 'out', p_amount_minor, v_label,
    'diary', v_key, v_uid, p_now
  )
  returning id into v_entry_id;

  return pg_catalog.jsonb_build_object(
    'status', 'recorded',
    'entry_id', v_entry_id,
    'notices', public.evaluate_spend_limits(v_entry_id)
  );
end;
$$;

comment on function public.record_purchase_at(uuid, bigint, text, text, timestamptz) is
  'Internal, no grants: the clock seam behind record_purchase (pgTAP, demo clock). Records the purchase at p_now. JA403, 22023.';

create or replace function public.record_purchase(
  p_child_id uuid,
  p_amount_minor bigint,
  p_label text,
  p_idempotency_key text
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select public.record_purchase_at(p_child_id, p_amount_minor, p_label, p_idempotency_key, pg_catalog.now());
$$;

comment on function public.record_purchase(uuid, bigint, text, text) is
  'Child records a purchase from Spend (key purchase:<child>:<key>). Returns {status: recorded, entry_id, notices} or {status: not_enough_spend, free_minor}; a repeated key returns the original entry. Overspend off refuses amount > balance(spend) - held_spend; on refuses only going below held_spend. Then evaluates spending limits. JA403 (not the child), 22023 (amount outside 1..100000000000, label over 60, blank key).';

-- ---------------------------------------------------------------------------
-- undo_purchase
-- ---------------------------------------------------------------------------

create or replace function public.undo_purchase_at(p_entry_id uuid, p_now timestamptz)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_e public.ledger_entries;
begin
  -- Lock order: the entry (source row) first, then the child's ledger advisory lock.
  select * into v_e from public.ledger_entries le where le.id = p_entry_id for update;
  -- A missing and a foreign entry both raise JA403 so existence does not leak.
  if not found or not public.is_self(v_e.child_id) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;
  if v_e.kind <> 'purchase' or p_now is null then
    raise exception using errcode = '22023', message = 'Only a purchase can be undone';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ledger:' || v_e.child_id::text, 0));

  if exists (select 1 from public.ledger_entries r where r.reverses_entry_id = v_e.id) then
    return 'already_undone';
  end if;
  if v_e.occurred_at < p_now - interval '24 hours' then
    return 'too_late';
  end if;

  -- Undo never touches limit notices: one already sent stays.
  insert into public.ledger_entries (
    family_id, child_id, mode, jar, kind, direction, amount_minor, label,
    source_type, source_id, reverses_entry_id, idempotency_key, created_by, occurred_at
  )
  values (
    v_e.family_id, v_e.child_id, v_e.mode, v_e.jar, 'reversal', 'in', v_e.amount_minor, v_e.label,
    v_e.source_type, v_e.source_id, v_e.id, 'reversal:' || v_e.id::text, v_uid, p_now
  );

  return 'undone';
end;
$$;

comment on function public.undo_purchase_at(uuid, timestamptz) is
  'Internal, no grants: the clock seam behind undo_purchase. JA403, 22023.';

create or replace function public.undo_purchase(p_entry_id uuid)
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select public.undo_purchase_at(p_entry_id, pg_catalog.now());
$$;

comment on function public.undo_purchase(uuid) is
  'Child undoes their own purchase within 24 hours by posting a reversal (key reversal:<entry>). Returns undone, already_undone or too_late. JA403 (not the entry''s child, or missing), 22023 (not a purchase).';

-- ---------------------------------------------------------------------------
-- list_ledger_history v2: reversal link and reversed flag
-- ---------------------------------------------------------------------------

drop function public.list_ledger_history(uuid, int, timestamptz);

create function public.list_ledger_history(
  p_child_id uuid,
  p_limit int default 50,
  p_before timestamptz default null
)
returns table (
  id uuid,
  kind text,
  jar text,
  direction text,
  amount_minor bigint,
  label text,
  source_type text,
  source_id uuid,
  occurred_at timestamptz,
  reverses_entry_id uuid,
  reversed boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_self(p_child_id) or public.is_parent_of(p_child_id)) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  return query
  select le.id, le.kind, le.jar, le.direction, le.amount_minor, le.label,
         le.source_type, le.source_id, le.occurred_at, le.reverses_entry_id,
         exists (select 1 from public.ledger_entries r where r.reverses_entry_id = le.id)
  from public.ledger_entries le
  where le.child_id = p_child_id
    and le.mode = 'recorded'
    and (p_before is null or le.occurred_at < p_before)
  order by le.occurred_at desc, le.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

comment on function public.list_ledger_history(uuid, int, timestamptz) is 'Recorded-mode ledger entries, newest first, optionally only those before p_before (limit clamped 1-200), with reverses_entry_id and reversed (an entry reverses this row). Reversal rows are included. Caller must be the child or their parent. JA403.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function
  public.evaluate_spend_limits(uuid),
  public.record_purchase_at(uuid, bigint, text, text, timestamptz),
  public.undo_purchase_at(uuid, timestamptz)
from public, anon, authenticated;

revoke execute on function
  public.held_spend(uuid),
  public.record_purchase(uuid, bigint, text, text),
  public.undo_purchase(uuid),
  public.list_ledger_history(uuid, int, timestamptz)
from public, anon;

grant execute on function
  public.held_spend(uuid),
  public.record_purchase(uuid, bigint, text, text),
  public.undo_purchase(uuid),
  public.list_ledger_history(uuid, int, timestamptz)
to authenticated;
