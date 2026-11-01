-- Money diary complete (FR04): what a purchase was for, money received, and fixes.
-- A purchase carries a category; the child records money received (gift_in, source diary) into
-- either jar; a purchase or money-received line can be undone within 24 hours or fixed within
-- 7 days. A fix never rewrites history: it reverses the current line and writes a new one linked
-- to it (corrects_entry_id), so a chain walks back to the first line. Both windows count from the
-- first line's created_at, so a purchase synced late from the outbox keeps its full time.
-- No new tables, so RLS is unchanged; every new or replaced function repeats its grants.

-- ---------------------------------------------------------------------------
-- ledger_entries: category and the fix chain
-- ---------------------------------------------------------------------------

alter table public.ledger_entries
  add column category text,
  add column corrects_entry_id uuid references public.ledger_entries (id);

comment on column public.ledger_entries.category is
  'What a diary line was for: a spend key on a purchase, a received key on diary money received, the reversed line''s key on a reversal, null otherwise. Purchases written before categories are null (read as other).';
comment on column public.ledger_entries.corrects_entry_id is
  'Set only on the new line a fix writes: the line it replaces (which the same fix reversed). Walk it back to reach the first line of the chain.';

-- Spend keys: snacks, games, clothes, going_out, gift_for_someone, school, travel, apps, other.
-- Received keys: family, birthday, job, sold, found, other. The lists are fixed in code
-- (features/diary/schemas.ts) and repeated in the functions below.
alter table public.ledger_entries add constraint ledger_entries_category_check check (
  category is null
  or (kind = 'purchase' and category in (
    'snacks', 'games', 'clothes', 'going_out', 'gift_for_someone', 'school', 'travel', 'apps', 'other'
  ))
  or (kind = 'gift_in' and source_type = 'diary' and category in (
    'family', 'birthday', 'job', 'sold', 'found', 'other'
  ))
  or (kind = 'reversal' and category in (
    'snacks', 'games', 'clothes', 'going_out', 'gift_for_someone', 'school', 'travel', 'apps',
    'family', 'birthday', 'job', 'sold', 'found', 'other'
  ))
);

-- Only a diary purchase or diary money received can replace another line, and never itself.
alter table public.ledger_entries add constraint ledger_entries_corrects_entry_check check (
  corrects_entry_id is null
  or (kind in ('purchase', 'gift_in') and source_type = 'diary' and corrects_entry_id <> id)
);

-- A line is replaced at most once (the index also serves the foreign key).
create unique index ledger_entries_corrects_entry_id_key
  on public.ledger_entries (corrects_entry_id)
  where corrects_entry_id is not null;

-- ---------------------------------------------------------------------------
-- Notifications: money_received and entry_corrected (source type ledger_entry)
-- ---------------------------------------------------------------------------

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'limit_exceeded', 'withdrawal_requested', 'withdrawal_decided',
  'deposit_requested', 'deposit_decided',
  'emergency_requested', 'emergency_decided',
  'allowance_due', 'handover_reminder',
  'card_charge_failed',
  'money_received', 'entry_corrected'
));

-- ---------------------------------------------------------------------------
-- diary_chain_root: the first line of a fix chain
-- ---------------------------------------------------------------------------

create function public.diary_chain_root(p_entry_id uuid)
returns public.ledger_entries
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_e public.ledger_entries;
begin
  select * into v_e from public.ledger_entries le where le.id = p_entry_id;
  if not found then
    return null;
  end if;

  -- Chains are a few fixes long. A line can only point at a line that already existed and the
  -- ledger is append-only, so the walk cannot loop.
  while v_e.corrects_entry_id is not null loop
    select * into v_e from public.ledger_entries le where le.id = v_e.corrects_entry_id;
  end loop;

  return v_e;
end;
$$;

comment on function public.diary_chain_root(uuid) is
  'Internal, no grants. The first line of the entry''s fix chain (walks corrects_entry_id back; an unfixed line is its own root). Null for a missing entry.';

-- ---------------------------------------------------------------------------
-- evaluate_spend_limits: the item notice is keyed by the chain root
-- ---------------------------------------------------------------------------
-- Same as 20261029183422_purchases except the item window key uses the first line of the fix
-- chain, so fixing a purchase that already sent its item notice sends no second one.

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
  v_end timestamptz;
  v_after numeric;
  v_notices int := 0;
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
      if v_e.amount_minor > v_rule.amount_minor
         and public.notify_parents(
          v_e.child_id, 'limit_exceeded', 'ledger_entry', v_e.id,
          'spend_limit:item:' || (public.diary_chain_root(v_e.id)).id::text,
          pg_catalog.jsonb_build_object(
            'amount_minor', v_e.amount_minor, 'limit_minor', v_rule.amount_minor,
            'period', v_rule.period, 'total_minor', v_e.amount_minor
          )
        ) > 0 then
        v_notices := v_notices + 1;
      end if;
    else
      v_start := public.rule_window_start(v_e.family_id, v_rule.period, v_e.occurred_at);
      -- Next local window start, so a purchase already committed in the next window (a writer that
      -- waited on the ledger lock carries an earlier occurred_at) is not counted here.
      v_end := ((v_start at time zone v_tz)
        + case v_rule.period when 'week' then interval '1 week' else interval '1 month' end)
        at time zone v_tz;

      -- Every live (not reversed) recorded purchase in the window, this one included. The ledger
      -- lock serialises writers, so a purchase stamped earlier still counts one committed before it.
      -- A fixed purchase counts once: its replaced line is reversed.
      select coalesce(pg_catalog.sum(le.amount_minor), 0)
      into v_after
      from public.ledger_entries le
      where le.child_id = v_e.child_id
        and le.mode = 'recorded'
        and le.jar = 'spend'
        and le.kind = 'purchase'
        and le.occurred_at >= v_start
        and le.occurred_at < v_end
        and not exists (select 1 from public.ledger_entries r where r.reverses_entry_id = le.id);

      -- Notify only on the purchase that first takes the window total over the limit.
      if v_after - v_e.amount_minor <= v_rule.amount_minor and v_after > v_rule.amount_minor
         and public.notify_parents(
          v_e.child_id, 'limit_exceeded', 'ledger_entry', v_e.id,
          -- Local date of the window start, so the key never depends on the session timezone.
          'spend_limit:' || v_rule.period || ':' || (v_start at time zone v_tz)::date::text,
          pg_catalog.jsonb_build_object(
            'amount_minor', v_e.amount_minor, 'limit_minor', v_rule.amount_minor,
            'period', v_rule.period, 'total_minor', v_after::bigint
          )
        ) > 0 then
        v_notices := v_notices + 1;
      end if;
    end if;
  end loop;

  -- Rules whose notice this purchase actually wrote (a repeat window is deduplicated).
  return v_notices;
end;
$$;

comment on function public.evaluate_spend_limits(uuid) is
  'Internal, no grants. For each spend_limit rule of the purchase''s child: item notifies when the amount is over the limit (window spend_limit:item:<first line of the fix chain>); week/month notify when this purchase takes the window total (every live purchase in the window, this one included) over the limit (window spend_limit:<period>:<local window start date>). Returns the number of rules whose notice this purchase wrote (from notify_parents row counts). Call under the child''s ledger lock.';

-- ---------------------------------------------------------------------------
-- record_purchase(…, p_category)
-- ---------------------------------------------------------------------------
-- Same as 20261029183422_purchases / 20261030130002_device_occurred_at plus the category.
-- p_category is last so every existing positional call keeps working; null means other.

drop function public.record_purchase(uuid, bigint, text, text, timestamptz);
drop function public.record_purchase_at(uuid, bigint, text, text, timestamptz);

create function public.record_purchase_at(
  p_child_id uuid,
  p_amount_minor bigint,
  p_label text,
  p_idempotency_key text,
  p_now timestamptz,
  p_category text default 'other'
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
  v_category text := coalesce(p_category, 'other');
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
     or pg_catalog.char_length(p_idempotency_key) > 200
     or p_now is null
     or v_category not in (
       'snacks', 'games', 'clothes', 'going_out', 'gift_for_someone', 'school', 'travel', 'apps', 'other'
     ) then
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
    family_id, child_id, mode, jar, kind, direction, amount_minor, label, category,
    source_type, idempotency_key, created_by, occurred_at
  )
  values (
    v_family_id, p_child_id, 'recorded', 'spend', 'purchase', 'out', p_amount_minor, v_label, v_category,
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

comment on function public.record_purchase_at(uuid, bigint, text, text, timestamptz, text) is
  'Internal, no grants: the clock seam behind record_purchase (pgTAP, demo clock). Records the purchase at p_now with p_category (null is other). JA403, 22023.';

create function public.record_purchase(
  p_child_id uuid,
  p_amount_minor bigint,
  p_label text,
  p_idempotency_key text,
  p_occurred_at timestamptz default null,
  p_category text default 'other'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_entry_id uuid;
begin
  -- A replay always wins, even when its device time has since gone out of range: refusing it
  -- could make the child enter the purchase again and debit Spend twice. Same gate and reply
  -- as the replay inside record_purchase_at; a new key goes through the time check and the lock.
  if public.is_self(p_child_id) and exists (
    select 1 from public.family_members fm
    where fm.profile_id = p_child_id and fm.role = 'child' and fm.status = 'approved'
  ) then
    select le.id into v_entry_id
    from public.ledger_entries le
    where le.idempotency_key = 'purchase:' || p_child_id::text || ':' || p_idempotency_key;
    if found then
      return pg_catalog.jsonb_build_object('status', 'recorded', 'entry_id', v_entry_id, 'notices', 0);
    end if;
  end if;

  return public.record_purchase_at(
    p_child_id, p_amount_minor, p_label, p_idempotency_key, public.resolve_occurred_at(p_occurred_at),
    p_category
  );
end;
$$;

comment on function public.record_purchase(uuid, bigint, text, text, timestamptz, text) is
  'Child records a purchase from Spend (key purchase:<child>:<key>) at p_occurred_at (device time via resolve_occurred_at; null is now) for p_category (a spend key; null is other). Returns {status: recorded, entry_id, notices} or {status: not_enough_spend, free_minor}; a repeated key returns the original entry, checked before the device time. Overspend off refuses amount > balance(spend) - held_spend; on refuses only going below held_spend. Then evaluates spending limits. JA403 (not the child), 22023 (amount outside 1..100000000000, label over 60, blank key or key over 200, unknown category, device time over 7 days old; a future time is now).';

-- ---------------------------------------------------------------------------
-- record_money_received: the child writes down money from other sources
-- ---------------------------------------------------------------------------

create function public.record_money_received_at(
  p_child_id uuid,
  p_amount_minor bigint,
  p_jar text,
  p_category text,
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
     or p_jar is null or p_jar not in ('spend', 'save')
     or p_category is null or p_category not in ('family', 'birthday', 'job', 'sold', 'found', 'other')
     or pg_catalog.char_length(v_label) > 60
     or p_idempotency_key is null or pg_catalog.btrim(p_idempotency_key) = ''
     or pg_catalog.char_length(p_idempotency_key) > 200
     or p_now is null then
    raise exception using errcode = '22023', message = 'Invalid money received';
  end if;

  v_key := 'received:' || p_child_id::text || ':' || p_idempotency_key;

  -- No source row: the child's ledger advisory lock is the only lock (database.md Lock order).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ledger:' || p_child_id::text, 0));

  -- A retry returns the original entry and sends no second notice.
  select le.id into v_entry_id from public.ledger_entries le where le.idempotency_key = v_key;
  if found then
    return pg_catalog.jsonb_build_object('status', 'recorded', 'entry_id', v_entry_id);
  end if;

  -- Money in counts at once: no request, no rule, no balance check.
  insert into public.ledger_entries (
    family_id, child_id, mode, jar, kind, direction, amount_minor, label, category,
    source_type, idempotency_key, created_by, occurred_at
  )
  values (
    v_family_id, p_child_id, 'recorded', p_jar, 'gift_in', 'in', p_amount_minor, v_label, p_category,
    'diary', v_key, v_uid, p_now
  )
  returning id into v_entry_id;

  perform public.notify_parents(
    p_child_id, 'money_received', 'ledger_entry', v_entry_id, null,
    pg_catalog.jsonb_build_object('amount_minor', p_amount_minor, 'category', p_category, 'jar', p_jar)
  );

  return pg_catalog.jsonb_build_object('status', 'recorded', 'entry_id', v_entry_id);
end;
$$;

comment on function public.record_money_received_at(uuid, bigint, text, text, text, text, timestamptz) is
  'Internal, no grants: the clock seam behind record_money_received (pgTAP, demo clock). Records the money at p_now. JA403, 22023.';

create function public.record_money_received(
  p_child_id uuid,
  p_amount_minor bigint,
  p_jar text,
  p_category text,
  p_label text,
  p_idempotency_key text
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select public.record_money_received_at(
    p_child_id, p_amount_minor, p_jar, p_category, p_label, p_idempotency_key, pg_catalog.now()
  );
$$;

comment on function public.record_money_received(uuid, bigint, text, text, text, text) is
  'Child writes down money received from other sources into Spend or Save (gift_in, source diary, key received:<child>:<key>). It counts at once; each approved parent gets a money_received notice ({amount_minor, category, jar}). Returns {status: recorded, entry_id}; a repeated key returns the original entry and sends nothing. JA403 (not an approved child), 22023 (amount outside 1..100000000000, jar not spend/save, category not a received key, label over 60, blank key or key over 200).';

-- ---------------------------------------------------------------------------
-- undo_diary_entry: undo a purchase or money received (undo_purchase is its alias)
-- ---------------------------------------------------------------------------
-- Widens undo_purchase_at from 20261029183422_purchases: money received can be undone too, with
-- the same balance guards as recording; the window counts from the chain root's created_at;
-- the reversal keeps the line's occurred_at, so it lands where the line is.

create function public.undo_diary_entry_at(p_entry_id uuid, p_now timestamptz)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_e public.ledger_entries;
  v_balance bigint;
  v_held bigint;
  v_overspend boolean;
begin
  -- Lock order: the entry (source row) first, then the child's ledger advisory lock.
  -- No key update is enough to serialise undos and fixes and does not block foreign-key
  -- (key share) checks.
  select * into v_e from public.ledger_entries le where le.id = p_entry_id for no key update;
  -- A missing and a foreign entry both raise JA403 so existence does not leak.
  if not found or not public.is_self(v_e.child_id) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;
  -- Same gate as record_purchase: only an approved child member may write.
  if not exists (
    select 1 from public.family_members fm
    where fm.profile_id = v_e.child_id
      and fm.family_id = v_e.family_id
      and fm.role = 'child'
      and fm.status = 'approved'
  ) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;
  if not (v_e.kind = 'purchase' or (v_e.kind = 'gift_in' and v_e.source_type = 'diary'))
     or p_now is null then
    raise exception using errcode = '22023', message = 'Only a purchase or money received can be undone';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ledger:' || v_e.child_id::text, 0));

  -- A replaced line is history: only the current line of a chain can be undone.
  if exists (select 1 from public.ledger_entries n where n.corrects_entry_id = v_e.id) then
    raise exception using errcode = '22023', message = 'This line was fixed';
  end if;
  if exists (select 1 from public.ledger_entries r where r.reverses_entry_id = v_e.id) then
    return 'already_undone';
  end if;
  if (public.diary_chain_root(v_e.id)).created_at < p_now - interval '24 hours' then
    return 'too_late';
  end if;

  -- Taking received money out uses the same guards as recording: Spend as record_purchase,
  -- Save never below what open withdrawals have reserved.
  if v_e.kind = 'gift_in' then
    if v_e.jar = 'spend' then
      v_balance := public.balance(v_e.child_id, 'spend', 'recorded');
      v_held := public.held_spend(v_e.child_id);
      v_overspend := coalesce(
        (select cs.allow_negative_spend from public.child_settings cs where cs.child_id = v_e.child_id),
        false
      );
      if (not v_overspend and v_e.amount_minor > v_balance - v_held)
         or (v_overspend and v_held > 0 and v_balance - v_e.amount_minor < v_held) then
        return 'not_enough_spend';
      end if;
    elsif public.balance(v_e.child_id, 'save', 'recorded') - v_e.amount_minor
          < public.reserved_save(v_e.child_id) then
      return 'not_enough_save';
    end if;
  end if;

  -- Undo never touches notices: a limit or money_received notice already sent stays.
  insert into public.ledger_entries (
    family_id, child_id, mode, jar, kind, direction, amount_minor, label, category,
    source_type, source_id, reverses_entry_id, idempotency_key, created_by, occurred_at
  )
  values (
    v_e.family_id, v_e.child_id, v_e.mode, v_e.jar, 'reversal',
    case v_e.direction when 'out' then 'in' else 'out' end,
    v_e.amount_minor, v_e.label, v_e.category,
    v_e.source_type, v_e.source_id, v_e.id, 'reversal:' || v_e.id::text, v_uid, v_e.occurred_at
  );

  return 'undone';
end;
$$;

comment on function public.undo_diary_entry_at(uuid, timestamptz) is
  'Internal, no grants: the clock seam behind undo_diary_entry and undo_purchase. JA403, 22023.';

create function public.undo_diary_entry(p_entry_id uuid)
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select public.undo_diary_entry_at(p_entry_id, pg_catalog.now());
$$;

comment on function public.undo_diary_entry(uuid) is
  'Child undoes their own purchase or diary money received (the current line of a fix chain) within 24 hours of the chain''s first created_at, by posting a reversal at the line''s occurred_at (key reversal:<entry>). Returns undone, already_undone, too_late, not_enough_spend (taking received money out of Spend breaks the overspend rule) or not_enough_save (Save would drop below reserved_save). JA403 (not the entry''s child, missing, or no approved child membership), 22023 (not a purchase or diary money received, or a line replaced by a fix).';

create or replace function public.undo_purchase(p_entry_id uuid)
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select public.undo_diary_entry_at(p_entry_id, pg_catalog.now());
$$;

comment on function public.undo_purchase(uuid) is
  'Alias of undo_diary_entry, kept for callers that predate money received. Same results and errors.';

drop function public.undo_purchase_at(uuid, timestamptz);

-- ---------------------------------------------------------------------------
-- correct_diary_entry: fix a purchase or money received
-- ---------------------------------------------------------------------------

create function public.correct_diary_entry_at(
  p_entry_id uuid,
  p_amount_minor bigint,
  p_category text,
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
  v_e public.ledger_entries;
  v_label text := nullif(pg_catalog.btrim(p_label), '');
  v_key text;
  v_entry_id uuid;
  v_take bigint;
  v_balance bigint;
  v_held bigint;
  v_overspend boolean;
begin
  -- Lock order: the entry (source row) first, then the child's ledger advisory lock (as undo).
  select * into v_e from public.ledger_entries le where le.id = p_entry_id for no key update;
  -- A missing and a foreign entry both raise JA403 so existence does not leak.
  if not found or not public.is_self(v_e.child_id) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;
  if not exists (
    select 1 from public.family_members fm
    where fm.profile_id = v_e.child_id
      and fm.family_id = v_e.family_id
      and fm.role = 'child'
      and fm.status = 'approved'
  ) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  if p_amount_minor is null or p_amount_minor < 1 or p_amount_minor > 100000000000
     or pg_catalog.char_length(v_label) > 60
     or p_idempotency_key is null or pg_catalog.btrim(p_idempotency_key) = ''
     or pg_catalog.char_length(p_idempotency_key) > 200
     or p_now is null then
    raise exception using errcode = '22023', message = 'Invalid fix';
  end if;

  v_key := 'fix:' || v_e.child_id::text || ':' || p_idempotency_key;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ledger:' || v_e.child_id::text, 0));

  -- A retry returns the line the first call wrote, before any check (the original is now replaced).
  select le.id into v_entry_id from public.ledger_entries le where le.idempotency_key = v_key;
  if found then
    return pg_catalog.jsonb_build_object('status', 'fixed', 'entry_id', v_entry_id);
  end if;

  -- Fixable: a diary purchase or money received, the current line (not replaced, not undone),
  -- first written no more than 7 days ago.
  if not (v_e.kind = 'purchase' or (v_e.kind = 'gift_in' and v_e.source_type = 'diary'))
     or exists (select 1 from public.ledger_entries n where n.corrects_entry_id = v_e.id)
     or exists (select 1 from public.ledger_entries r where r.reverses_entry_id = v_e.id)
     or (public.diary_chain_root(v_e.id)).created_at < p_now - interval '7 days' then
    return pg_catalog.jsonb_build_object('status', 'not_fixable');
  end if;

  if p_category is null
     or (v_e.kind = 'purchase' and p_category not in (
       'snacks', 'games', 'clothes', 'going_out', 'gift_for_someone', 'school', 'travel', 'apps', 'other'
     ))
     or (v_e.kind = 'gift_in' and p_category not in ('family', 'birthday', 'job', 'sold', 'found', 'other')) then
    raise exception using errcode = '22023', message = 'Invalid fix';
  end if;

  -- A purchase written before categories (null) reads as other.
  if p_amount_minor = v_e.amount_minor
     and p_category = coalesce(v_e.category, 'other')
     and v_label is not distinct from v_e.label then
    return pg_catalog.jsonb_build_object('status', 'unchanged');
  end if;

  -- Money the fix takes out of the jar: a bigger purchase, or less money received.
  v_take := case v_e.kind
    when 'purchase' then p_amount_minor - v_e.amount_minor
    else v_e.amount_minor - p_amount_minor
  end;

  -- Same guards as recording and undo. free_minor is the free Spend now, as record_purchase reports it.
  if v_take > 0 then
    if v_e.jar = 'spend' then
      v_balance := public.balance(v_e.child_id, 'spend', 'recorded');
      v_held := public.held_spend(v_e.child_id);
      v_overspend := coalesce(
        (select cs.allow_negative_spend from public.child_settings cs where cs.child_id = v_e.child_id),
        false
      );
      if (not v_overspend and v_take > v_balance - v_held)
         or (v_overspend and v_held > 0 and v_balance - v_take < v_held) then
        return pg_catalog.jsonb_build_object('status', 'not_enough_spend', 'free_minor', v_balance - v_held);
      end if;
    elsif public.balance(v_e.child_id, 'save', 'recorded') - v_take < public.reserved_save(v_e.child_id) then
      return pg_catalog.jsonb_build_object('status', 'not_enough_save');
    end if;
  end if;

  -- 1. Reverse the current line, exactly as undo does.
  insert into public.ledger_entries (
    family_id, child_id, mode, jar, kind, direction, amount_minor, label, category,
    source_type, source_id, reverses_entry_id, idempotency_key, created_by, occurred_at
  )
  values (
    v_e.family_id, v_e.child_id, v_e.mode, v_e.jar, 'reversal',
    case v_e.direction when 'out' then 'in' else 'out' end,
    v_e.amount_minor, v_e.label, v_e.category,
    v_e.source_type, v_e.source_id, v_e.id, 'reversal:' || v_e.id::text, v_uid, v_e.occurred_at
  );

  -- 2. The new line: same kind, jar and occurred_at (same week, same limit window), linked back.
  insert into public.ledger_entries (
    family_id, child_id, mode, jar, kind, direction, amount_minor, label, category,
    source_type, source_id, corrects_entry_id, idempotency_key, created_by, occurred_at
  )
  values (
    v_e.family_id, v_e.child_id, v_e.mode, v_e.jar, v_e.kind, v_e.direction,
    p_amount_minor, v_label, p_category,
    v_e.source_type, v_e.source_id, v_e.id, v_key, v_uid, v_e.occurred_at
  )
  returning id into v_entry_id;

  -- 3. A fixed purchase is checked against the limits like a new one (the item key dedupes on the root).
  if v_e.kind = 'purchase' then
    perform public.evaluate_spend_limits(v_entry_id);
  end if;

  -- 4. Parents hear about a new amount only; a category or name change alone is quiet.
  if p_amount_minor <> v_e.amount_minor then
    perform public.notify_parents(
      v_e.child_id, 'entry_corrected', 'ledger_entry', v_entry_id, null,
      pg_catalog.jsonb_build_object(
        'kind', v_e.kind, 'old_amount_minor', v_e.amount_minor, 'amount_minor', p_amount_minor
      )
    );
  end if;

  return pg_catalog.jsonb_build_object('status', 'fixed', 'entry_id', v_entry_id);
end;
$$;

comment on function public.correct_diary_entry_at(uuid, bigint, text, text, text, timestamptz) is
  'Internal, no grants: the clock seam behind correct_diary_entry. The 7-day window counts back from p_now. JA403, 22023.';

create function public.correct_diary_entry(
  p_entry_id uuid,
  p_amount_minor bigint,
  p_category text,
  p_label text,
  p_idempotency_key text
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select public.correct_diary_entry_at(
    p_entry_id, p_amount_minor, p_category, p_label, p_idempotency_key, pg_catalog.now()
  );
$$;

comment on function public.correct_diary_entry(uuid, bigint, text, text, text) is
  'Child fixes the amount, category or name of their own purchase or diary money received. Locks the entry, then the ledger lock; posts a reversal of the line (key reversal:<entry>) and a new line of the same kind, jar and occurred_at with corrects_entry_id = the entry (key fix:<child>:<key>); a purchase then runs evaluate_spend_limits; a new amount sends entry_corrected ({kind, old_amount_minor, amount_minor}) to the parents. Returns {status: fixed, entry_id}, {status: unchanged}, {status: not_fixable} (replaced, undone, not a diary purchase or money received, or the chain''s first created_at over 7 days ago), {status: not_enough_spend, free_minor} or {status: not_enough_save}; a repeated key returns the first fixed line. JA403 (not the entry''s child, missing, or no approved child membership), 22023 (amount outside 1..100000000000, category not a key for the line''s kind, label over 60, blank key or key over 200).';

-- ---------------------------------------------------------------------------
-- list_ledger_history v4: category and the fix chain. Body otherwise v3 (20261031064410_payments).
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
  reversed boolean,
  method text,
  category text,
  corrects_entry_id uuid,
  replaced boolean,
  window_from timestamptz,
  prev_amount_minor bigint,
  prev_category text,
  prev_label text
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
         exists (select 1 from public.ledger_entries r where r.reverses_entry_id = le.id),
         le.method,
         le.category,
         le.corrects_entry_id,
         exists (select 1 from public.ledger_entries n where n.corrects_entry_id = le.id),
         case when le.corrects_entry_id is null then le.created_at
              else (public.diary_chain_root(le.id)).created_at end,
         prev.amount_minor,
         prev.category,
         prev.label
  from public.ledger_entries le
  left join public.ledger_entries prev on prev.id = le.corrects_entry_id
  where le.child_id = p_child_id
    and le.mode = 'recorded'
    and (p_before is null or le.occurred_at < p_before)
  order by le.occurred_at desc, le.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

comment on function public.list_ledger_history(uuid, int, timestamptz) is 'Recorded-mode ledger entries, newest first, optionally only those before p_before (limit clamped 1-200), with reverses_entry_id, reversed (an entry reverses this row), method (cash or card), category, corrects_entry_id, replaced (a fix replaced this row), window_from (created_at of the first line of its fix chain, where the undo and fix windows start) and prev_amount_minor / prev_category / prev_label (the line this row replaced). Reversal and replaced rows are included. Caller must be the child or their parent. JA403.';

-- ---------------------------------------------------------------------------
-- list_entry_versions: every version of a fixed line, oldest first
-- ---------------------------------------------------------------------------

create function public.list_entry_versions(p_entry_id uuid)
returns table (
  id uuid,
  amount_minor bigint,
  category text,
  label text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_child_id uuid;
  v_root_id uuid;
begin
  select le.child_id into v_child_id from public.ledger_entries le where le.id = p_entry_id;
  -- A missing and a foreign entry both raise JA403 so existence does not leak.
  if v_child_id is null or not (public.is_self(v_child_id) or public.is_parent_of(v_child_id)) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  v_root_id := (public.diary_chain_root(p_entry_id)).id;

  return query
  with recursive chain (entry_id, depth) as (
    select v_root_id, 0
    union all
    select n.id, c.depth + 1
    from chain c
    join public.ledger_entries n on n.corrects_entry_id = c.entry_id
  )
  select le.id, le.amount_minor, le.category, le.label, le.created_at
  from chain c
  join public.ledger_entries le on le.id = c.entry_id
  order by c.depth;
end;
$$;

comment on function public.list_entry_versions(uuid) is 'Every version of the entry''s fix chain (any line in it), oldest first: id, amount_minor, category, label, created_at. An unfixed line returns itself. Caller must be the child or their parent. JA403.';

-- ---------------------------------------------------------------------------
-- Grants: Supabase grants new functions to anon/authenticated/service_role by default
-- ---------------------------------------------------------------------------

-- Replaced internals: as before (20261029183422_purchases).
revoke execute on function
  public.evaluate_spend_limits(uuid),
  public.record_purchase_at(uuid, bigint, text, text, timestamptz, text)
from public, anon, authenticated;

-- New internals.
revoke execute on function
  public.diary_chain_root(uuid),
  public.record_money_received_at(uuid, bigint, text, text, text, text, timestamptz),
  public.undo_diary_entry_at(uuid, timestamptz),
  public.correct_diary_entry_at(uuid, bigint, text, text, text, timestamptz)
from public, anon, authenticated, service_role;

revoke execute on function
  public.record_purchase(uuid, bigint, text, text, timestamptz, text),
  public.record_money_received(uuid, bigint, text, text, text, text),
  public.undo_diary_entry(uuid),
  public.undo_purchase(uuid),
  public.correct_diary_entry(uuid, bigint, text, text, text),
  public.list_ledger_history(uuid, int, timestamptz),
  public.list_entry_versions(uuid)
from public, anon;

grant execute on function
  public.record_purchase(uuid, bigint, text, text, timestamptz, text),
  public.record_money_received(uuid, bigint, text, text, text, text),
  public.undo_diary_entry(uuid),
  public.undo_purchase(uuid),
  public.correct_diary_entry(uuid, bigint, text, text, text),
  public.list_ledger_history(uuid, int, timestamptz),
  public.list_entry_versions(uuid)
to authenticated;
