begin;
\ir _helpers.psql
select plan(61);

-- ---------------------------------------------------------------------------
-- allowance_due_on: stepped from the anchor, month-end clamped
-- ---------------------------------------------------------------------------

select is(public.allowance_due_on('2026-01-31', 'monthly', 0), '2026-01-31'::date, 'index 0 is the anchor');
select is(public.allowance_due_on('2026-01-31', 'monthly', 1), '2026-02-28'::date, 'monthly clamps to Feb 28');
select is(public.allowance_due_on('2026-01-31', 'monthly', 2), '2026-03-31'::date, 'monthly returns to the 31st');
select is(public.allowance_due_on('2026-01-31', 'monthly', 3), '2026-04-30'::date, 'monthly clamps to Apr 30');
select is(public.allowance_due_on('2026-11-30', 'quarterly', 1), '2027-02-28'::date, 'quarterly clamps to Feb 28');
select is(public.allowance_due_on('2027-11-30', 'quarterly', 1), '2028-02-29'::date, 'quarterly clamps to leap Feb 29');
select is(public.allowance_due_on('2026-11-01', 'weekly', 2), '2026-11-15'::date, 'weekly steps 7 days');
select is(public.allowance_due_on('2028-02-29', 'annual', 1), '2029-02-28'::date, 'annual clamps leap day');

-- ---------------------------------------------------------------------------
-- Fixtures: PA owns family A (UTC) with children C1, C2, C3; PB owns family B.
-- ---------------------------------------------------------------------------

select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('c1@example.com', 'child') as c1 \gset
select tests.create_user('c2@example.com', 'child') as c2 \gset
select tests.create_user('c3@example.com', 'child') as c3 \gset
select tests.create_user('c4@example.com', 'child') as c4 \gset

select tests.authenticate_as(:'pb'::uuid);
select public.create_family('INR', 'Asia/Kolkata') as fb \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select public.register_child(:'c2'::uuid, :'fa'::uuid, 'Alex', '1234', true);
select public.register_child(:'c3'::uuid, :'fa'::uuid, 'Kim', '1234', true);
select public.register_child(:'c4'::uuid, :'fa'::uuid, 'Jo', '1234', true);
select tests.clear_auth();

select public.family_today(:'fa'::uuid) as today \gset
select is(:'today'::date, (now() at time zone 'UTC')::date, 'family_today uses the family timezone');
select is(public.family_today(:'fb'::uuid, '2026-11-01 18:31+00'), '2026-11-02'::date, 'Kolkata is already the next day at 18:31 UTC');
select is(public.family_today(:'fb'::uuid, '2026-11-01 18:29+00'), '2026-11-01'::date, 'Kolkata is still the same day at 18:29 UTC');

-- ---------------------------------------------------------------------------
-- create_allowance
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'pa'::uuid);
select public.create_allowance(:'c1'::uuid, 500, 'weekly', :'today'::date) as s1 \gset
select is((select status from public.allowance_schedules where id = :'s1'::uuid), 'active', 'parent creates an active schedule');
select is((select family_id from public.allowance_schedules where id = :'s1'::uuid), :'fa'::uuid, 'family derived from the child membership');
select is(
  (select array_agg(status) from public.allowance_occurrences where schedule_id = :'s1'::uuid and due_on = :'today'::date),
  array['due'], 'first date of today is due immediately');
select throws_ok(
  format('select public.create_allowance(%L, 500, %L, %L)', :'c1', 'weekly', :'today'),
  'JA409', null, 'second schedule for the same child refused');
select throws_ok(
  format('select public.create_allowance(%L, 500, %L, %L)', :'c2', 'weekly', (:'today'::date - 1)),
  '22023', null, 'past first date refused');
select throws_ok(
  format('select public.create_allowance(%L, 0, %L, %L)', :'c2', 'weekly', :'today'),
  '22023', null, 'non-positive amount refused');
select throws_ok(
  format('select public.create_allowance(%L, 100000000001, %L, %L)', :'c2', 'weekly', :'today'),
  '22023', null, 'amount above the maximum refused');
select throws_ok(
  format('select public.create_allowance(%L, 500, %L, %L)', :'c2', 'weekly', (:'today'::date + 367)),
  '22023', null, 'first date more than 366 days ahead refused');
select throws_ok(
  format('select public.generate_for_schedule(%L, %L)', :'s1', :'today'),
  '42501', null, 'generate_for_schedule not executable by authenticated');
select tests.clear_auth();

select tests.authenticate_as(:'c2'::uuid);
select throws_ok(
  format('select public.create_allowance(%L, 500, %L, %L)', :'c2', 'weekly', :'today'),
  'JA403', null, 'child cannot create an allowance');
select tests.clear_auth();

select tests.authenticate_as(:'pb'::uuid);
select throws_ok(
  format('select public.create_allowance(%L, 500, %L, %L)', :'c2', 'weekly', :'today'),
  'JA403', null, 'other-family parent cannot create');
select throws_ok(
  format('select public.pause_allowance(%L, null, null)', :'s1'),
  'JA403', null, 'other-family parent cannot pause');
select is((select count(*)::int from public.allowance_schedules), 0, 'other family sees no schedules');
select throws_ok(
  format('select public.allowance_next_due_on(%L)', :'s1'),
  'JA403', null, 'other family cannot read next due');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- change_allowance (D6): generated occurrences keep their amount
-- ---------------------------------------------------------------------------

-- Seed: anchor a week back so index 0 (today - 7) is due too; today's already exists.
update public.allowance_schedules set anchor_on = :'today'::date - 7, next_index = 0 where id = :'s1'::uuid;
select is(public.generate_for_schedule(:'s1'::uuid, :'today'::date), 1, 'generator inserts the missing period only');
select is(public.generate_for_schedule(:'s1'::uuid, :'today'::date), 0, 'generator is idempotent');

select tests.authenticate_as(:'pa'::uuid);
select throws_ok(
  format('select public.change_allowance(%L, 800, %L, %L)', :'s1', 'monthly', :'today'),
  '22023', null, 'next date not after the last generated due refused');
select throws_ok(
  format('select public.change_allowance(%L, 800, %L, %L)', :'s1', 'monthly', (:'today'::date + 367)),
  '22023', null, 'next date more than 366 days ahead refused');
select throws_ok(
  format('select public.change_allowance(%L, 100000000001, %L, %L)', :'s1', 'monthly', (:'today'::date + 1)),
  '22023', null, 'changed amount above the maximum refused');
select lives_ok(
  format('select public.change_allowance(%L, 800, %L, %L)', :'s1', 'monthly', (:'today'::date + 1)),
  'change with a later next date succeeds');
select is(
  (select array_agg(amount_minor order by due_on) from public.allowance_occurrences where schedule_id = :'s1'::uuid),
  array[500, 500]::bigint[], 'generated occurrences keep their amount');
select is(
  (select row(amount_minor, frequency, anchor_on, next_index)::text from public.allowance_schedules where id = :'s1'::uuid),
  row(800::bigint, 'monthly'::text, :'today'::date + 1, 0)::text, 'schedule re-anchored on the next date');
select is(public.allowance_next_due_on(:'s1'::uuid), :'today'::date + 1, 'next due follows the new anchor');
select is(
  (select array_agg(action order by created_at, action) from public.audit_log where subject_id = :'s1'::uuid),
  array['allowance.changed', 'allowance.created'], 'create and change each write one audit row');
select tests.clear_auth();

select tests.authenticate_as(:'c1'::uuid);
select is((select count(*)::int from public.allowance_schedules), 1, 'child sees own schedule');
select is((select count(*)::int from public.allowance_occurrences), 2, 'child sees own occurrences');
select is(public.allowance_next_due_on(:'s1'::uuid), :'today'::date + 1, 'child can read next due');
select tests.clear_auth();

select tests.authenticate_as(:'pb'::uuid);
select is((select count(*)::int from public.allowance_occurrences), 0, 'other family sees no occurrences');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- pause / resume: paused periods never become due
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'pa'::uuid);
select public.create_allowance(:'c2'::uuid, 300, 'weekly', :'today'::date) as s2 \gset
select public.pause_allowance(:'s2'::uuid, null, '  Back soon  ');
select tests.clear_auth();

select is(
  (select row(status, paused_through, pause_message)::text from public.allowance_schedules where id = :'s2'::uuid),
  row('paused'::text, null::date, 'Back soon'::text)::text, 'pause sets status and trimmed message');
select is(
  (select count(*)::int from public.allowance_occurrences where schedule_id = :'s2'::uuid),
  1, 'today''s period is due before the pause');
select is(public.allowance_next_due_on(:'s2'::uuid), null::date, 'paused until resumed has no next due');

-- Simulate four weeks passing while paused: shift the schedule and its occurrence back.
update public.allowance_schedules set anchor_on = anchor_on - 28 where id = :'s2'::uuid;
update public.allowance_occurrences
  set due_on = due_on - 28, period_key = to_char(due_on - 28, 'YYYY-MM-DD')
  where schedule_id = :'s2'::uuid;
select is(public.generate_for_schedule(:'s2'::uuid, :'today'::date), 0, 'generator skips a paused schedule');

select tests.authenticate_as(:'pa'::uuid);
select public.resume_allowance(:'s2'::uuid);
select tests.clear_auth();

select is(
  (select array_agg(due_on order by due_on) from public.allowance_occurrences where schedule_id = :'s2'::uuid),
  array[:'today'::date - 28, :'today'::date], 'no occurrence for paused periods; today becomes due');
select is(
  (select row(status, next_index, pause_message)::text from public.allowance_schedules where id = :'s2'::uuid),
  row('active'::text, 5, null::text)::text, 'resume clears pause and moves past today');
select is(
  (select array_agg(action order by created_at, action) from public.audit_log where subject_id = :'s2'::uuid),
  array['allowance.created', 'allowance.paused', 'allowance.resumed'], 'pause and resume each write one audit row');

select tests.authenticate_as(:'pa'::uuid);
select throws_ok(
  format('select public.resume_allowance(%L)', :'s2'),
  'JA409', null, 'resume only from paused');
select throws_ok(
  format('select public.pause_allowance(%L, %L, null)', :'s2', (:'today'::date - 1)),
  '22023', null, 'pause through a past date refused');
select throws_ok(
  format('select public.pause_allowance(%L, %L, null)', :'s2', (:'today'::date + 367)),
  '22023', null, 'pause more than 366 days ahead refused');
select lives_ok(
  format('select public.pause_allowance(%L, %L, null)', :'s2', (:'today'::date + 366)),
  'pause exactly 366 days ahead accepted');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- stop: already-due occurrences stay due
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'pa'::uuid);
select public.create_allowance(:'c3'::uuid, 200, 'weekly', :'today'::date) as s3 \gset
select tests.clear_auth();
update public.allowance_schedules set anchor_on = :'today'::date - 7, next_index = 0 where id = :'s3'::uuid;

select tests.authenticate_as(:'pa'::uuid);
select public.stop_allowance(:'s3'::uuid);
select is(
  (select array_agg(status order by due_on) from public.allowance_occurrences where schedule_id = :'s3'::uuid),
  array['due', 'due'], 'stop catches up and leaves occurrences due');
select is(public.allowance_next_due_on(:'s3'::uuid), null::date, 'stopped schedule has no next due');
select throws_ok(
  format('select public.change_allowance(%L, 100, %L, %L)', :'s3', 'weekly', (:'today'::date + 1)),
  'JA409', null, 'change refused once stopped');
select public.create_allowance(:'c3'::uuid, 200, 'weekly', :'today'::date) as s4 \gset
select is((select status from public.allowance_schedules where id = :'s4'::uuid), 'active', 'new schedule allowed after stop');

-- Pause through a date: next due is the first period after it.
select public.pause_allowance(:'s4'::uuid, :'today'::date + 10, null);
select is(public.allowance_next_due_on(:'s4'::uuid), :'today'::date + 14, 'next due is the first period after the pause');
select throws_ok(
  format('select public.pause_allowance(%L, null, null)', :'s4'),
  'JA409', null, 'pause refused unless active');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- change_allowance: changing only the amount keeps the anchor (no month-end drift)
-- ---------------------------------------------------------------------------

-- The next 31st whose following month is shorter (e.g. 31 Jan -> 28 Feb -> 31 Mar).
select d::date as m31 from generate_series(:'today'::date + 1, :'today'::date + 120, interval '1 day') d
  where extract(day from d) = 31 and extract(day from d + interval '1 month') < 31
  order by d limit 1 \gset
select public.allowance_due_on(:'m31'::date, 'monthly', 1) as m_short \gset
select public.allowance_due_on(:'m31'::date, 'monthly', 2) as m_next31 \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_allowance(:'c4'::uuid, 500, 'monthly', :'m31'::date) as s5 \gset
select tests.clear_auth();
-- Catch up into the short month: the 31st is generated, the clamped date is next.
select is(public.generate_for_schedule(:'s5'::uuid, :'m31'::date), 1, 'catch-up generates the 31st');

select tests.authenticate_as(:'pa'::uuid);
select lives_ok(
  format('select public.change_allowance(%L, 900, %L, %L)', :'s5', 'monthly', :'m_short'),
  'amount-only change with the current next date succeeds');
select is(
  (select row(amount_minor, anchor_on, next_index)::text from public.allowance_schedules where id = :'s5'::uuid),
  row(900::bigint, :'m31'::date, 1)::text, 'amount-only change keeps the anchor and index');
select tests.clear_auth();

select public.generate_for_schedule(:'s5'::uuid, :'m_next31'::date);
select is(
  (select array_agg(row(due_on, amount_minor)::text order by due_on) from public.allowance_occurrences where schedule_id = :'s5'::uuid),
  array[row(:'m31'::date, 500::bigint)::text, row(:'m_short'::date, 900::bigint)::text, row(:'m_next31'::date, 900::bigint)::text],
  'later period returns to the 31st after the short month');

-- Table backstop: amounts above 100000000000 minor never get in.
select throws_ok(
  format($$update public.allowance_schedules set amount_minor = 100000000001 where id = %L$$, :'s5'),
  '23514', null, 'schedule amount above the maximum violates its check');
select * from finish();
rollback;
