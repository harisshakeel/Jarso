-- Demo clock (D11, slice 6): a family's clock can be moved forward so a demo can show an
-- allowance falling due and a reminder firing without waiting for the calendar.
--
-- Callers keep passing real time (p_now, now()). The family's offset is added at leaf points
-- only, so no wrapper or *_at seam changes, and with the default offset of 0 nothing moves:
--   * family_today(family_id, p_now) adds it when computing the family's day;
--   * family_now(family_id) supplies it where now is compared with a stored business time
--     (the money-rule windows in create_withdrawal, create_deposit, withdrawal_cap_remaining);
--   * triggers add it when a business timestamp is written (20261102200100).
-- Forward only, no reset (a reset is a re-seed). Auto charge never runs for a family whose
-- clock has moved: a card is never charged on a day that has not really come.

-- ---------------------------------------------------------------------------
-- families: the offset and the per-family switch
-- ---------------------------------------------------------------------------

alter table public.families
  add column clock_offset interval not null default '0'
    constraint families_clock_offset_check check (clock_offset >= interval '0'),
  add column demo_clock_enabled boolean not null default false;

comment on column public.families.clock_offset is 'Demo clock (D11): how far this family''s clock is ahead of real time. 0 for every real family. Moved forward only by advance_family_clock; never readable by signed-in users.';
comment on column public.families.demo_clock_enabled is 'Demo clock (D11): advance_family_clock works only when true. Set by the demo seed or an admin, never by users.';

-- Signed-in users read every column except the two above (same pattern as 20261101230000).
-- Nobody but the seed or an admin writes them: authenticated has no write grants on families.
revoke select on public.families from anon, authenticated;
grant select (id, code, currency, timezone, created_by, created_at, updated_at)
  on public.families to authenticated;

-- ---------------------------------------------------------------------------
-- family_clock_offset / family_now
-- ---------------------------------------------------------------------------

create function public.family_clock_offset(p_family_id uuid)
returns interval
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select f.clock_offset
    from public.families f
    where f.id = p_family_id
      and ((select auth.uid()) is null or public.is_approved_member(p_family_id))
  ), interval '0');
$$;

comment on function public.family_clock_offset(uuid) is 'Demo clock offset of the family when the caller is a service job (no auth.uid()) or an approved member of it; otherwise (and for an unknown family) 0.';

create function public.family_now(p_family_id uuid)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select pg_catalog.now() + public.family_clock_offset(p_family_id);
$$;

comment on function public.family_now(uuid) is 'The family''s now: now() plus its demo clock offset (see family_clock_offset). The app reads it to compute the family''s today.';

revoke execute on function
  public.family_clock_offset(uuid),
  public.family_now(uuid)
from public, anon;

grant execute on function
  public.family_clock_offset(uuid),
  public.family_now(uuid)
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- family_today: same signature (grants kept), now with the offset
-- ---------------------------------------------------------------------------

create or replace function public.family_today(p_family_id uuid, p_now timestamptz default now())
returns date
language sql
stable
set search_path = ''
as $$
  select ((p_now + public.family_clock_offset(f.id)) at time zone f.timezone)::date
  from public.families f
  where f.id = p_family_id;
$$;

comment on function public.family_today(uuid, timestamptz) is 'The family''s local date at p_now plus its demo clock offset. Security invoker: null for a family the caller cannot see.';

-- ---------------------------------------------------------------------------
-- generate_due_occurrences: copied from 20261102100400 (45 s budget, lock_timeout 5s) plus an
-- optional family filter, so advance_family_clock can run it for one family.
-- ---------------------------------------------------------------------------

drop function public.generate_due_occurrences(timestamptz);

create function public.generate_due_occurrences(
  p_now timestamptz default now(),
  p_family_id uuid default null
)
returns int
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_run_id uuid;
  v_s public.allowance_schedules;
  v_id uuid;
  v_today date;
  v_index int;
  v_inserted int := 0;
  v_failed int := 0;
  v_errors jsonb := '[]'::jsonb;
  -- Below the cron command's 60 s statement_timeout, so the run row is written in time.
  c_budget constant interval := '45 seconds';
  v_started timestamptz := pg_catalog.clock_timestamp();
  v_stopped_early boolean := false;
begin
  insert into public.job_runs (job) values ('generate-due-occurrences') returning id into v_run_id;

  -- Active schedules, and paused ones with a pause date, whose child is still
  -- an approved child member of the schedule's family.
  for v_id in
    select s.id
    from public.allowance_schedules s
    where (s.status = 'active' or (s.status = 'paused' and s.paused_through is not null))
      and (p_family_id is null or s.family_id = p_family_id)
      and exists (
        select 1 from public.family_members fm
        where fm.family_id = s.family_id
          and fm.profile_id = s.child_id
          and fm.role = 'child'
          and fm.status = 'approved'
      )
    order by s.created_at, s.id
  loop
    -- Out of time: stop here and let the next hourly run catch up.
    if pg_catalog.clock_timestamp() - v_started > c_budget then
      v_stopped_early := true;
      exit;
    end if;

    -- One bad schedule must not stop the others: record it and carry on.
    begin
      -- Skip a schedule a parent is editing right now; the next run catches up.
      select * into v_s from public.allowance_schedules s where s.id = v_id for update skip locked;
      continue when not found;

      v_today := public.family_today(v_s.family_id, p_now);
      -- No family row (being deleted): nothing to generate.
      continue when v_today is null;

      if v_s.status = 'paused' then
        continue when v_s.paused_through is null or v_s.paused_through >= v_today;

        -- Periods inside the pause are never generated: first period after it.
        v_index := v_s.next_index;
        while public.allowance_due_on(v_s.anchor_on, v_s.frequency, v_index) <= v_s.paused_through loop
          v_index := v_index + 1;
        end loop;

        update public.allowance_schedules
        set status = 'active',
            next_index = v_index,
            paused_through = null,
            pause_message = null
        where id = v_s.id;

        insert into public.audit_log (family_id, actor_id, action, subject_id, details)
        values (
          v_s.family_id, null, 'allowance.resumed', v_s.id,
          pg_catalog.jsonb_build_object('auto', true, 'skipped_periods', v_index - v_s.next_index)
        );
      end if;

      v_inserted := v_inserted + public.generate_for_schedule(v_s.id, v_today);
    exception when others then
      v_failed := v_failed + 1;
      if pg_catalog.jsonb_array_length(v_errors) < 20 then
        v_errors := v_errors || pg_catalog.jsonb_build_object(
          'schedule_id', v_id, 'sqlstate', sqlstate, 'message', pg_catalog.left(sqlerrm, 200)
        );
      end if;
    end;
  end loop;

  update public.job_runs
  set finished_at = pg_catalog.clock_timestamp(),
      status = case when v_failed = 0 and not v_stopped_early then 'ok' else 'error' end,
      details = pg_catalog.jsonb_build_object(
        'inserted', v_inserted, 'failed', v_failed, 'errors', v_errors,
        'stopped_early', v_stopped_early
      )
  where id = v_run_id;

  return v_inserted;
end;
$$;

comment on function public.generate_due_occurrences(timestamptz, uuid) is 'Cron job (and advance_family_clock for one family via p_family_id; null = every family). Auto-resumes paused schedules whose paused_through has passed (skipping periods inside the pause), then generates due periods for every active schedule at its family''s local date (demo clock offset included). Skips schedules whose child is no longer an approved child member. A failing schedule (including a 5 s lock timeout) is recorded in job_runs.details (schedule_id, sqlstate, message cut to 200 chars) and the run ends as error; others still run. Stops starting new schedules after 45 s (details.stopped_early, run ends as error) so the run row is written before the cron 60 s timeout; the next run catches up. Returns rows inserted.';

-- As before: cron (the owner) only. service_role was revoked in 20261029163318.
revoke execute on function public.generate_due_occurrences(timestamptz, uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- send_handover_reminders: copied from 20261030164347 plus the same optional family filter.
-- ---------------------------------------------------------------------------

drop function public.send_handover_reminders(timestamptz);

create function public.send_handover_reminders(
  p_now timestamptz default now(),
  p_family_id uuid default null
)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run_id uuid;
  v_o record;
  v_today date;
  v_days int;
  v_payload jsonb;
  v_inserted int := 0;
  v_failed int := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  insert into public.job_runs (job) values ('send-handover-reminders') returning id into v_run_id;

  for v_o in
    select o.id, o.family_id, o.child_id, o.due_on, o.amount_minor
    from public.allowance_occurrences o
    where o.status = 'due'
      and (p_family_id is null or o.family_id = p_family_id)
    order by o.due_on, o.id
  loop
    begin
      v_today := public.family_today(v_o.family_id, p_now);
      continue when v_today is null;
      v_days := v_today - v_o.due_on;
      continue when v_days < 0 or (v_days > 0 and v_days % 3 <> 0);

      v_payload := pg_catalog.jsonb_build_object(
        'amount_minor', v_o.amount_minor, 'due_on', v_o.due_on, 'days_overdue', v_days
      );

      if v_days = 0 then
        v_inserted := v_inserted
          + public.notify_parents(v_o.child_id, 'allowance_due', 'allowance_occurrence', v_o.id, v_o.id::text || ':due', v_payload)
          + public.notify_child(v_o.child_id, 'allowance_due', 'allowance_occurrence', v_o.id, v_o.id::text || ':due', v_payload);
      else
        v_inserted := v_inserted
          + public.notify_parents(v_o.child_id, 'handover_reminder', 'allowance_occurrence', v_o.id, v_o.id::text || ':' || v_today::text, v_payload);
      end if;
    exception when others then
      v_failed := v_failed + 1;
      if pg_catalog.jsonb_array_length(v_errors) < 20 then
        v_errors := v_errors || pg_catalog.jsonb_build_object(
          'occurrence_id', v_o.id, 'sqlstate', sqlstate, 'message', pg_catalog.left(sqlerrm, 200)
        );
      end if;
    end;
  end loop;

  update public.job_runs
  set finished_at = pg_catalog.clock_timestamp(),
      status = case when v_failed = 0 then 'ok' else 'error' end,
      details = pg_catalog.jsonb_build_object('inserted', v_inserted, 'failed', v_failed, 'errors', v_errors)
  where id = v_run_id;

  return v_inserted;
end;
$$;

comment on function public.send_handover_reminders(timestamptz, uuid) is
  'Cron job (and advance_family_clock for one family via p_family_id; null = every family), no user grants. For each allowance occurrence still ''due'': on the due date (family-local, demo clock offset included) notifies the parents and the child (allowance_due); every third day after, notifies the parents (handover_reminder). Deduplicated per day by window_key, so reruns add nothing. An occurrence first seen late waits for its next 3-day mark. A failing occurrence is recorded in job_runs.details (occurrence_id, sqlstate, message cut to 200 chars) and the run ends as error; others still run. Returns rows inserted.';

-- As before: no user grants; service_role keeps it (the e2e suite runs it).
revoke execute on function public.send_handover_reminders(timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.send_handover_reminders(timestamptz, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- due_auto_charges: same as 20261101095802, but never for a family whose clock has moved.
-- ---------------------------------------------------------------------------

create or replace function public.due_auto_charges(
  p_providers text[],
  p_now timestamptz default now(),
  p_limit int default 50
)
returns table (
  source_type text,
  source_id uuid,
  family_id uuid,
  child_id uuid,
  payer_id uuid,
  amount_minor bigint,
  currency text,
  customer_ref text,
  method_ref text,
  provider text
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.source_type, d.source_id, d.family_id, d.child_id, d.payer_id,
         d.amount_minor, d.currency, pc.customer_ref, pc.method_ref, pc.provider
  from (
    select 'occurrence'::text as source_type, o.id as source_id, o.family_id, o.child_id,
           s.auto_charge_by as payer_id, o.amount_minor, f.currency, o.due_on, o.created_at,
           s.auto_charge_provider as provider
    from public.allowance_occurrences o
    join public.allowance_schedules s on s.id = o.schedule_id
    join public.families f on f.id = o.family_id
    where o.status = 'due'
      and s.auto_charge
      and f.clock_offset = interval '0'
      and o.due_on >= (s.auto_charge_since at time zone f.timezone)::date
      and o.due_on <= public.family_today(o.family_id, p_now)
    union all
    select 'parent_gift'::text, g.id, g.family_id, g.child_id,
           g.auto_charge_by, g.amount_minor, f.currency, g.give_on, g.created_at,
           g.auto_charge_provider
    from public.parent_gifts g
    join public.families f on f.id = g.family_id
    where g.status = 'pending'
      and g.auto_charge
      and f.clock_offset = interval '0'
      and g.give_on >= (g.auto_charge_since at time zone f.timezone)::date
      and g.give_on <= public.family_today(g.family_id, p_now)
  ) d
  join public.payment_customers pc
    on pc.parent_id = d.payer_id
   and pc.provider = d.provider
   and pc.method_ref is not null
  where d.provider = any (coalesce(p_providers, array[]::text[]))
    and exists (
      -- The payer is still an approved parent of the child.
      select 1
      from public.family_members p
      join public.family_members c on c.family_id = p.family_id
      where p.profile_id = d.payer_id and p.role = 'parent' and p.status = 'approved'
        and c.profile_id = d.child_id and c.role = 'child' and c.status = 'approved'
    )
    and not exists (
      select 1
      from public.payments pay
      where pay.source_type = d.source_type
        and pay.source_id = d.source_id
        and (pay.trigger = 'auto' or pay.status in ('pending', 'requires_action', 'succeeded'))
    )
  order by d.due_on, d.created_at, d.source_id
  limit least(greatest(coalesce(p_limit, 50), 1), 500);
$$;

comment on function public.due_auto_charges(text[], timestamptz, int) is 'Service role only. Due occurrences and gifts with auto charge on at one of p_providers (null or empty = none), due on or after auto_charge_since (family date) and by family today at p_now, whose payer is still an approved parent with a saved card (method_ref) at the item''s auto_charge_provider, and that have no auto payment of any status and no live payment. Skips every family whose demo clock has moved (clock_offset <> 0): a card is never charged on a day that has not really come. Returns that provider with the card refs. Oldest first; limit clamped 1-500.';

-- ---------------------------------------------------------------------------
-- Money-rule windows: copied from 20261031020001, with the window taken at the family's now
-- (requests.occurred_at is written in family time by 20261102200100).
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
      v_start := public.rule_window_start(v_family_id, v_rule.period, public.family_now(v_family_id));
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
      v_start := public.rule_window_start(v_family_id, v_rule.period, public.family_now(v_family_id));
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
    return pg_catalog.jsonb_build_object('status', v_existing.status, 'request_id', v_existing.id);
  end if;

  v_available := public.available_spend(p_child_id);
  if p_amount_minor > v_available then
    return pg_catalog.jsonb_build_object('status', 'over_available', 'available_minor', v_available);
  end if;

  -- Auto-confirm: needs at least one rule, and every rule must pass.
  for v_rule in
    select r.period, r.amount_minor
    from public.money_rules r
    where r.child_id = p_child_id and r.kind = 'deposit_auto_confirm'
  loop
    v_has_auto := true;
    if v_rule.period = 'item' then
      v_used := 0;
    else
      v_start := public.rule_window_start(v_family_id, v_rule.period, public.family_now(v_family_id));
      v_used := public.request_window_total(p_child_id, 'deposit', array['confirmed'], v_start);
    end if;
    if v_used + p_amount_minor > v_rule.amount_minor then
      v_auto_ok := false;
    end if;
  end loop;

  insert into public.requests (family_id, child_id, kind, status, amount_minor, auto, idempotency_key)
  values (
    v_family_id, p_child_id, 'deposit', 'pending', p_amount_minor,
    v_has_auto and v_auto_ok, p_idempotency_key
  )
  returning id into v_id;

  if v_has_auto and v_auto_ok then
    -- Spend was checked above under the same lock, so posting cannot be refused.
    if public.post_request(v_id, p_child_id) <> 'completed' then
      raise exception using errcode = '22023', message = 'Could not confirm the deposit';
    end if;
    v_status := 'confirmed';
  else
    perform public.notify_parents(
      p_child_id, 'deposit_requested', 'request', v_id, null,
      pg_catalog.jsonb_build_object('amount_minor', p_amount_minor));
  end if;

  return pg_catalog.jsonb_build_object('status', v_status, 'request_id', v_id);
end;
$$;

create or replace function public.withdrawal_cap_remaining(p_child_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_family_id uuid;
  v_rule record;
  v_used bigint;
  v_remaining bigint;
  v_min bigint;
begin
  if not (public.is_self(p_child_id) or public.is_parent_of(p_child_id)) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.profile_id = p_child_id
    and fm.role = 'child'
    and fm.status = 'approved';

  for v_rule in
    select r.period, r.amount_minor
    from public.money_rules r
    where r.child_id = p_child_id and r.kind = 'withdrawal_cap'
  loop
    if v_rule.period = 'item' then
      v_used := 0;
    else
      v_used := public.request_window_total(
        p_child_id, 'withdrawal', array['pending', 'approved', 'handed_over'],
        public.rule_window_start(v_family_id, v_rule.period, public.family_now(v_family_id)));
    end if;
    v_remaining := case when v_rule.amount_minor > v_used then v_rule.amount_minor - v_used else 0 end;
    if v_min is null or v_remaining < v_min then
      v_min := v_remaining;
    end if;
  end loop;

  return v_min;
end;
$$;

-- create or replace keeps the comments and grants of all three (20261031020001).

-- ---------------------------------------------------------------------------
-- advance_family_clock: a parent moves a demo family's clock forward
-- ---------------------------------------------------------------------------

create function public.advance_family_clock(p_family_id uuid, p_days int)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_enabled boolean;
  v_offset interval;
  v_generated int;
  v_reminders int := 0;
  v_k int;
begin
  if v_uid is null or not exists (
    select 1
    from public.family_members fm
    where fm.family_id = p_family_id
      and fm.profile_id = v_uid
      and fm.role = 'parent'
      and fm.status = 'approved'
  ) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  if p_days is null or p_days < 1 or p_days > 60 then
    raise exception using errcode = '22023', message = 'Move the clock 1 to 60 days at a time';
  end if;

  -- One move at a time per family.
  select f.demo_clock_enabled, f.clock_offset
  into v_enabled, v_offset
  from public.families f
  where f.id = p_family_id
  for update;

  if not coalesce(v_enabled, false) then
    raise exception using errcode = 'JA409', message = 'The demo clock is off for this family';
  end if;

  v_offset := v_offset + pg_catalog.make_interval(days => p_days);
  if v_offset > interval '366 days' then
    raise exception using errcode = '22023', message = 'The demo clock can move at most a year';
  end if;

  update public.families set clock_offset = v_offset where id = p_family_id;

  -- Catch up the allowance at the new today (every skipped period falls due), then replay the
  -- reminder job once per skipped day, oldest first, so each day's notices land.
  v_generated := public.generate_due_occurrences(pg_catalog.now(), p_family_id);
  for v_k in reverse p_days - 1 .. 0 loop
    v_reminders := v_reminders + public.send_handover_reminders(
      pg_catalog.now() - pg_catalog.make_interval(days => v_k), p_family_id);
  end loop;

  insert into public.audit_log (family_id, actor_id, action, subject_id, details)
  values (
    p_family_id, v_uid, 'family.clock_advanced', p_family_id,
    pg_catalog.jsonb_build_object(
      'days', p_days, 'offset_days', extract(day from v_offset)::int)
  );

  return pg_catalog.jsonb_build_object(
    'offset_days', extract(day from v_offset)::int,
    'today', public.family_today(p_family_id),
    'generated', v_generated,
    'reminders', v_reminders
  );
end;
$$;

comment on function public.advance_family_clock(uuid, int) is 'Demo clock (D11). An approved parent of the family moves its clock forward p_days (1..60) days; forward only. Needs families.demo_clock_enabled; the total offset is at most 366 days. Locks the family row, adds the days, generates due allowance periods at the new today (generate_due_occurrences for this family), then runs send_handover_reminders for this family once per skipped day so each day''s notices land; audit_log family.clock_advanced {days, offset_days}. Returns {offset_days, today, generated, reminders}. JA403 (not an approved parent of the family), 22023 (days outside 1..60, offset over 366 days), JA409 (demo clock off).';

revoke execute on function public.advance_family_clock(uuid, int) from public, anon;
grant execute on function public.advance_family_clock(uuid, int) to authenticated;

