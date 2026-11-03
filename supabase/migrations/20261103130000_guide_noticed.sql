-- Jarso noticed (demo 3, item 1; FR07, FR16): once a week the app looks at what changed for each
-- child and, when one of four signals fires (a saving streak, a goal quarter mark, a spending
-- jump, a quiet fortnight), sends one notice to the child and one to each parent. The signals
-- are computed by the app in code from the inputs below. Where Jarso is on for the child, Claude
-- may reword the child's line, and only figures the app looked up appear in it (ADR 0011); where
-- a parent turned Jarso off, the fixed line goes out and nothing is sent to Anthropic. A child
-- gets at most one nudge a week, and never the same signal twice.

-- ---------------------------------------------------------------------------
-- What was noticed, so a signal is never sent twice and a child is nudged at most weekly
-- ---------------------------------------------------------------------------

create table public.guide_noticed_runs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  child_id uuid not null references public.profiles (id) on delete cascade,
  signal_key text not null check (char_length(signal_key) between 1 and 120),
  noticed_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  unique (child_id, signal_key)
);

comment on table public.guide_noticed_runs is
  'One row per "Jarso noticed" nudge sent to a child (and their parents): the signal key and the lines as sent. Service role only; written by guide_noticed_record.';
comment on column public.guide_noticed_runs.signal_key is
  'The signal and what it was about, e.g. goal_quarter:<goal id>:2 or saving_streak:3:<first day>. Unique per child, so a signal is sent once.';

create index guide_noticed_runs_child_noticed_idx on public.guide_noticed_runs (child_id, noticed_at desc);
create index guide_noticed_runs_family_id_idx on public.guide_noticed_runs (family_id);

-- Like job_runs: RLS on with no policies, so only the service role reads or writes.
alter table public.guide_noticed_runs enable row level security;
revoke all on public.guide_noticed_runs from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Notifications: the guide_noticed kind, sourced from a guide_noticed_runs row
-- ---------------------------------------------------------------------------

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'limit_exceeded', 'withdrawal_requested', 'withdrawal_decided',
  'deposit_requested', 'deposit_decided',
  'emergency_requested', 'emergency_decided',
  'allowance_due', 'handover_reminder',
  'card_charge_failed',
  'money_received', 'entry_corrected',
  'jar_moved',
  'parent_note',
  'guide_noticed'
));

alter table public.notifications drop constraint notifications_source_type_check;
alter table public.notifications add constraint notifications_source_type_check
  check (source_type in ('ledger_entry', 'request', 'allowance_occurrence', 'payment', 'note', 'guide_noticed'));

comment on column public.notifications.source_id is
  'Originating ledger entry, request, allowance occurrence, payment or guide_noticed run; for a parent_note, the parent who wrote it. Polymorphic, no FK.';

-- ---------------------------------------------------------------------------
-- guide_noticed_inputs: the plain inputs the app's signal code reads, one row per child
-- ---------------------------------------------------------------------------

create or replace function public.guide_noticed_inputs(p_now timestamptz default now())
returns table (
  child_id uuid,
  family_id uuid,
  nickname text,
  currency text,
  timezone text,
  guide_on boolean,
  today date,
  last_noticed_at timestamptz,
  signal_keys text[],
  allowance_days jsonb,
  goal jsonb,
  spent_last_7_days_minor bigint,
  spent_7_days_before_minor bigint,
  last_move_on date
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.profile_id,
    c.family_id,
    coalesce(p.nickname, ''),
    f.currency,
    f.timezone,
    -- No switch row means on; only a parent's explicit off turns it off.
    not exists (select 1 from public.guide_access ga where ga.child_id = c.profile_id and not ga.enabled),
    (p_now at time zone f.timezone)::date,
    (select pg_catalog.max(r.noticed_at) from public.guide_noticed_runs r where r.child_id = c.profile_id),
    coalesce(
      (select pg_catalog.array_agg(r.signal_key) from public.guide_noticed_runs r where r.child_id = c.profile_id),
      '{}'::text[]),
    -- The newest 13 handed-over allowances, newest first: enough to see a streak of 12 exactly.
    coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('on', o.due_on, 'saved', coalesce(o.saved_minor, 0) > 0)
        order by o.due_on desc)
      from (
        select o.due_on, o.saved_minor
        from public.allowance_occurrences o
        where o.child_id = c.profile_id and o.status = 'confirmed'
        order by o.due_on desc
        limit 13
      ) o
    ), '[]'::jsonb),
    -- The active goal with what counts toward it: Save less money waiting to come out, as
    -- goal_progress counts it (never below 0).
    (select pg_catalog.jsonb_build_object(
        'id', g.id,
        'name', g.name,
        'target_minor', g.target_minor,
        'counted_minor', greatest(
          coalesce((
            select pg_catalog.sum(case le.direction when 'in' then le.amount_minor else -le.amount_minor end)::bigint
            from public.ledger_entries le
            where le.child_id = c.profile_id and le.jar = 'save' and le.mode = 'recorded'
          ), 0)
          - coalesce((
            select pg_catalog.sum(r.amount_minor)::bigint
            from public.requests r
            where r.child_id = c.profile_id and r.kind = 'withdrawal' and r.status in ('pending', 'approved')
          ), 0),
          0))
      from public.goals g
      where g.child_id = c.profile_id and g.status = 'active'),
    -- Live (not reversed) recorded purchases in the last 7 days, and in the 7 days before.
    coalesce((
      select pg_catalog.sum(le.amount_minor)::bigint
      from public.ledger_entries le
      where le.child_id = c.profile_id and le.mode = 'recorded' and le.kind = 'purchase'
        and le.occurred_at >= p_now - interval '7 days' and le.occurred_at < p_now
        and not exists (select 1 from public.ledger_entries rv where rv.reverses_entry_id = le.id)
    ), 0),
    coalesce((
      select pg_catalog.sum(le.amount_minor)::bigint
      from public.ledger_entries le
      where le.child_id = c.profile_id and le.mode = 'recorded' and le.kind = 'purchase'
        and le.occurred_at >= p_now - interval '14 days' and le.occurred_at < p_now - interval '7 days'
        and not exists (select 1 from public.ledger_entries rv where rv.reverses_entry_id = le.id)
    ), 0),
    (select (pg_catalog.max(le.occurred_at) at time zone f.timezone)::date
     from public.ledger_entries le
     where le.child_id = c.profile_id and le.mode = 'recorded')
  from public.family_members c
  join public.families f on f.id = c.family_id
  join public.profiles p on p.id = c.profile_id
  where c.role = 'child' and c.status = 'approved'
  order by c.profile_id;
$$;

comment on function public.guide_noticed_inputs(timestamptz) is
  'Server only (service_role). One row per approved child: nickname, currency, timezone, whether Jarso is on (no switch row = on), family-local today, when they were last nudged, the signal keys already sent, the newest 13 handed-over allowances with whether something was saved, the active goal with counted Save, live purchases in the last 7 days and the 7 before, and the family-local date of the last recorded money movement. The app computes the signals from these.';

revoke execute on function public.guide_noticed_inputs(timestamptz) from public, anon, authenticated;
grant execute on function public.guide_noticed_inputs(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- guide_noticed_record: one nudge, at most once a week per child and once per signal
-- ---------------------------------------------------------------------------

create or replace function public.guide_noticed_record(
  p_child_id uuid,
  p_signal_key text,
  p_child_payload jsonb,
  p_parent_payload jsonb
)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_family_id uuid;
  v_key text := pg_catalog.btrim(p_signal_key);
  v_id uuid;
  v_inserted int := 0;
begin
  if v_key is null or pg_catalog.char_length(v_key) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'Invalid signal key';
  end if;
  if p_child_payload is null and p_parent_payload is null then
    raise exception using errcode = '22023', message = 'Nothing to send';
  end if;

  -- Membership first (as in guide_remember): only an approved child is nudged.
  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.profile_id = p_child_id and fm.role = 'child' and fm.status = 'approved'
  for share;
  if v_family_id is null then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  -- One writer per child at a time, so two runs can't both pass the weekly check.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('noticed:' || p_child_id::text, 0));

  -- At most one nudge a week, whatever the signal (6 days, so a weekly cron never skips a week).
  if exists (
    select 1 from public.guide_noticed_runs r
    where r.child_id = p_child_id and r.noticed_at > pg_catalog.now() - interval '6 days'
  ) then
    return 0;
  end if;

  insert into public.guide_noticed_runs (family_id, child_id, signal_key, payload)
  values (v_family_id, p_child_id, v_key,
          pg_catalog.jsonb_build_object('child', p_child_payload, 'parent', p_parent_payload))
  on conflict (child_id, signal_key) do nothing
  returning id into v_id;
  if v_id is null then
    return 0;
  end if;

  if p_child_payload is not null then
    v_inserted := v_inserted
      + public.notify_child(p_child_id, 'guide_noticed', 'guide_noticed', v_id, v_key, p_child_payload);
  end if;
  if p_parent_payload is not null then
    v_inserted := v_inserted
      + public.notify_parents(p_child_id, 'guide_noticed', 'guide_noticed', v_id, v_key, p_parent_payload);
  end if;

  -- A signal from half a year ago can be news again.
  delete from public.guide_noticed_runs r
  where r.child_id = p_child_id and r.noticed_at < pg_catalog.now() - interval '180 days';

  return v_inserted;
end;
$$;

comment on function public.guide_noticed_record(uuid, text, jsonb, jsonb) is
  'Server only (service_role). Records one "Jarso noticed" nudge for a child and writes the notices: to the child when p_child_payload is given, to every approved parent when p_parent_payload is given (kind guide_noticed, source guide_noticed = the run row, window key = the signal key). Returns the notices written: 0 when the child was nudged in the last 6 days or this signal key was sent before (and forgets keys older than 180 days). JA403 (not an approved child), 22023 (bad key, or no payload).';

revoke execute on function public.guide_noticed_record(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.guide_noticed_record(uuid, text, jsonb, jsonb) to service_role;
