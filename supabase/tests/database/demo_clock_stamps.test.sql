begin;
\ir _helpers.psql
select plan(21);

-- Demo clock (D11): business timestamps are written in the family's time. Family A's clock is
-- 5 days ahead; family B's is not moved. Rows are written as postgres (a service job sees the
-- offset), then through a real function as a signed-in member.

select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('c1@example.com', 'child') as c1 \gset
select tests.create_user('c3@example.com', 'child') as c3 \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select tests.authenticate_as(:'pb'::uuid);
select public.create_family('GBP', 'UTC') as fb \gset
select public.register_child(:'c3'::uuid, :'fb'::uuid, 'Ria', '1234', true);
select tests.clear_auth();

update public.families set clock_offset = interval '5 days' where id = :'fa'::uuid;

-- ---------------------------------------------------------------------------
-- ledger_entries.occurred_at: shifted on insert, except reversals and fixes
-- ---------------------------------------------------------------------------

insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, category, source_type, idempotency_key, created_by, occurred_at)
values (:'fa'::uuid, :'c1'::uuid, 'spend', 'purchase', 'out', 100, 'Snack', 'snacks', 'diary', 'stamp:p1', :'c1'::uuid, '2026-11-01 10:00+00')
returning id as p1 \gset
select is(
  (select occurred_at from public.ledger_entries where id = :'p1'::uuid), '2026-11-06 10:00+00'::timestamptz,
  'a new line is written in family time');
select is(
  (select created_at from public.ledger_entries where id = :'p1'::uuid), now(),
  'created_at stays real time');

insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, category, source_type, reverses_entry_id, idempotency_key, created_by, occurred_at)
values (:'fa'::uuid, :'c1'::uuid, 'spend', 'reversal', 'in', 100, 'Snack', 'snacks', 'diary', :'p1'::uuid, 'reversal:' || :'p1', :'c1'::uuid, '2026-11-06 10:00+00')
returning id as r1 \gset
select is(
  (select occurred_at from public.ledger_entries where id = :'r1'::uuid), '2026-11-06 10:00+00'::timestamptz,
  'a reversal keeps the time it copied');

insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, category, source_type, corrects_entry_id, idempotency_key, created_by, occurred_at)
values (:'fa'::uuid, :'c1'::uuid, 'spend', 'purchase', 'out', 80, 'Snack', 'snacks', 'diary', :'p1'::uuid, 'stamp:fix1', :'c1'::uuid, '2026-11-06 10:00+00')
returning id as f1 \gset
select is(
  (select occurred_at from public.ledger_entries where id = :'f1'::uuid), '2026-11-06 10:00+00'::timestamptz,
  'a fix keeps the time of the line it replaces');

insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, source_type, idempotency_key, created_by, occurred_at)
values (:'fb'::uuid, :'c3'::uuid, 'save', 'allowance_in', 'in', 100, 'Allowance', 'occurrence', 'stamp:b1', :'pb'::uuid, '2026-11-01 10:00+00')
returning id as b1 \gset
select is(
  (select occurred_at from public.ledger_entries where id = :'b1'::uuid), '2026-11-01 10:00+00'::timestamptz,
  'a real family''s line is untouched');

-- Through a function, as the child: the device time is checked against real time, then shifted.
insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, source_type, idempotency_key, created_by)
values (:'fa'::uuid, :'c1'::uuid, 'spend', 'allowance_in', 'in', 1000, 'Allowance', 'occurrence', 'stamp:a1', :'pa'::uuid);
select tests.authenticate_as(:'c1'::uuid);
select public.record_purchase(:'c1'::uuid, 50, 'Pen', 'stamp-k1', null, 'school') as rp \gset
select tests.clear_auth();
select is(
  (select occurred_at from public.ledger_entries where id = (:'rp'::jsonb ->> 'entry_id')::uuid),
  now() + interval '5 days', 'a purchase the child records lands on the family''s day');

-- ---------------------------------------------------------------------------
-- requests: occurred_at on insert, decided_at and completed_at when set
-- ---------------------------------------------------------------------------

insert into public.requests (family_id, child_id, kind, status, amount_minor, idempotency_key, occurred_at)
values (:'fa'::uuid, :'c1'::uuid, 'withdrawal', 'pending', 100, 'stamp-w1', '2026-11-01 10:00+00')
returning id as w1 \gset
select is(
  (select occurred_at from public.requests where id = :'w1'::uuid), '2026-11-06 10:00+00'::timestamptz,
  'a request is made on the family''s day');
select is((select decided_at from public.requests where id = :'w1'::uuid), null, 'not decided yet');

update public.requests set status = 'approved', decided_at = '2026-11-02 10:00+00' where id = :'w1'::uuid;
select is(
  (select decided_at from public.requests where id = :'w1'::uuid), '2026-11-07 10:00+00'::timestamptz,
  'decided_at is shifted when set');
update public.requests set decision_note = 'ok' where id = :'w1'::uuid;
select is(
  (select decided_at from public.requests where id = :'w1'::uuid), '2026-11-07 10:00+00'::timestamptz,
  'another update does not shift it again');
update public.requests set status = 'handed_over', completed_at = '2026-11-03 10:00+00' where id = :'w1'::uuid;
select is(
  (select completed_at from public.requests where id = :'w1'::uuid), '2026-11-08 10:00+00'::timestamptz,
  'completed_at is shifted when set');

insert into public.requests (family_id, child_id, kind, status, amount_minor, auto, decided_at, idempotency_key, occurred_at)
values (:'fa'::uuid, :'c1'::uuid, 'withdrawal', 'approved', 100, true, '2026-11-01 10:00+00', 'stamp-w2', '2026-11-01 10:00+00')
returning id as w2 \gset
select is(
  (select decided_at from public.requests where id = :'w2'::uuid), '2026-11-06 10:00+00'::timestamptz,
  'an auto-approved request is decided on the family''s day');

-- ---------------------------------------------------------------------------
-- allowance_occurrences.confirmed_at, parent_gifts.given_at
-- ---------------------------------------------------------------------------

insert into public.allowance_schedules (family_id, child_id, amount_minor, frequency, anchor_on)
values (:'fa'::uuid, :'c1'::uuid, 500, 'weekly', date '2030-01-01')
returning id as s1 \gset
insert into public.allowance_occurrences (schedule_id, family_id, child_id, period_key, due_on, amount_minor)
values (:'s1'::uuid, :'fa'::uuid, :'c1'::uuid, 'p1', date '2026-11-02', 500)
returning id as o1 \gset
update public.allowance_occurrences
set status = 'confirmed', cash_minor = 500, saved_minor = 0, confirmed_at = '2026-11-02 10:00+00'
where id = :'o1'::uuid;
select is(
  (select confirmed_at from public.allowance_occurrences where id = :'o1'::uuid), '2026-11-07 10:00+00'::timestamptz,
  'an allowance is handed over on the family''s day');

insert into public.parent_gifts (family_id, child_id, amount_minor, give_on, idempotency_key)
values (:'fa'::uuid, :'c1'::uuid, 300, date '2026-11-02', gen_random_uuid())
returning id as g1 \gset
select is((select given_at from public.parent_gifts where id = :'g1'::uuid), null, 'a pending gift has no given_at');
update public.parent_gifts
set status = 'given', cash_minor = 300, saved_minor = 0, given_at = '2026-11-02 10:00+00'
where id = :'g1'::uuid;
select is(
  (select given_at from public.parent_gifts where id = :'g1'::uuid), '2026-11-07 10:00+00'::timestamptz,
  'a gift is given on the family''s day');

-- ---------------------------------------------------------------------------
-- mission_attempts: completed_at shifted, started_at real
-- ---------------------------------------------------------------------------

insert into public.mission_attempts (family_id, child_id, mission_key, content_version, started_at)
values (:'fa'::uuid, :'c1'::uuid, 'stamp-mission', 1, '2026-11-01 10:00+00')
returning id as m1 \gset
select is(
  (select started_at from public.mission_attempts where id = :'m1'::uuid), '2026-11-01 10:00+00'::timestamptz,
  'started_at stays real time (the 40-per-day limit reads it)');
update public.mission_attempts set status = 'completed', completed_at = '2026-11-01 10:05+00' where id = :'m1'::uuid;
select is(
  (select completed_at from public.mission_attempts where id = :'m1'::uuid), '2026-11-06 10:05+00'::timestamptz,
  'completed_at is shifted');

-- ---------------------------------------------------------------------------
-- Offset 0 changes nothing
-- ---------------------------------------------------------------------------

insert into public.requests (family_id, child_id, kind, status, amount_minor, idempotency_key, occurred_at)
values (:'fb'::uuid, :'c3'::uuid, 'deposit', 'pending', 100, 'stamp-d1', '2026-11-01 10:00+00')
returning id as d1 \gset
select is(
  (select occurred_at from public.requests where id = :'d1'::uuid), '2026-11-01 10:00+00'::timestamptz,
  'a real family''s request keeps its time');

insert into public.mission_attempts (family_id, child_id, mission_key, content_version, status, completed_at)
values (:'fb'::uuid, :'c3'::uuid, 'stamp-mission', 1, 'completed', '2026-11-01 10:05+00')
returning id as m2 \gset
select is(
  (select completed_at from public.mission_attempts where id = :'m2'::uuid), '2026-11-01 10:05+00'::timestamptz,
  'a real family''s mission keeps its time');

select is(
  (select pg_catalog.count(*)::int from pg_trigger
   where tgname in ('ledger_entries_family_time', 'requests_family_time', 'allowance_occurrences_family_time',
                    'parent_gifts_family_time', 'mission_attempts_family_time')
     and not tgisinternal),
  5, 'all five stamp triggers exist');

select ok(
  not has_function_privilege('authenticated', 'public.requests_family_time()', 'execute')
  and not has_function_privilege('anon', 'public.ledger_entries_family_time()', 'execute'),
  'trigger functions are not callable by users');

select * from finish();
rollback;
