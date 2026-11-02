begin;
\ir _helpers.psql
select plan(51);

-- Demo clock (D11): families.clock_offset moves a family's day forward. Family A (UTC) is a demo
-- family with parent PA and child C1; family B (UTC) is a real family with parent PB and child C3.

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

select (now() at time zone 'UTC')::date as real_today \gset

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

select is(
  (select clock_offset from public.families where id = :'fa'::uuid), interval '0',
  'a new family''s clock is not moved');
select is(
  (select demo_clock_enabled from public.families where id = :'fa'::uuid), false,
  'a new family is not a demo family');
select throws_ok(
  format($$update public.families set clock_offset = interval '-1 day' where id = %L$$, :'fa'),
  '23514', null, 'the clock never goes behind real time');

-- Signed-in users read the family but never its clock columns, and write nothing.
select tests.authenticate_as(:'pa'::uuid);
select is((select timezone from public.families where id = :'fa'::uuid), 'UTC', 'a parent still reads the family');
select throws_ok(
  format($$select clock_offset from public.families where id = %L$$, :'fa'),
  '42501', null, 'a parent cannot read clock_offset');
select throws_ok(
  format($$select demo_clock_enabled from public.families where id = %L$$, :'fa'),
  '42501', null, 'a parent cannot read demo_clock_enabled');
select throws_ok(
  format($$update public.families set demo_clock_enabled = true where id = %L$$, :'fa'),
  '42501', null, 'a parent cannot turn the demo clock on');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- family_clock_offset, family_now, family_today
-- ---------------------------------------------------------------------------

update public.families set clock_offset = interval '3 days' where id = :'fa'::uuid;

select is(public.family_clock_offset(:'fa'::uuid), interval '3 days', 'a service job sees the offset');
select is(public.family_clock_offset(:'fb'::uuid), interval '0', 'a real family has none');
select is(public.family_clock_offset(gen_random_uuid()), interval '0', 'an unknown family has none');
select is(public.family_today(:'fa'::uuid, '2026-11-01 12:00+00'), date '2026-11-04', 'family_today adds the offset');
select is(public.family_today(:'fb'::uuid, '2026-11-01 12:00+00'), date '2026-11-01', 'other families keep the real day');

select tests.authenticate_as(:'c1'::uuid);
select is(public.family_clock_offset(:'fa'::uuid), interval '3 days', 'the family''s child sees the offset');
select is(public.family_now(:'fa'::uuid), now() + interval '3 days', 'family_now is now plus the offset');
select is(public.family_today(:'fa'::uuid), :'real_today'::date + 3, 'the child''s today is three days on');
select tests.authenticate_as(:'pb'::uuid);
select is(public.family_clock_offset(:'fa'::uuid), interval '0', 'another family''s parent sees no offset');
select is(public.family_now(:'fa'::uuid), now(), 'and gets real time from family_now');
select tests.clear_auth();

update public.families set clock_offset = interval '0' where id = :'fa'::uuid;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

select ok(
  has_function_privilege('authenticated', 'public.advance_family_clock(uuid, int)', 'execute')
  and has_function_privilege('authenticated', 'public.family_now(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.family_clock_offset(uuid)', 'execute'),
  'signed-in users can call advance_family_clock, family_now and family_clock_offset');
select ok(
  not has_function_privilege('anon', 'public.advance_family_clock(uuid, int)', 'execute')
  and not has_function_privilege('anon', 'public.family_now(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.family_clock_offset(uuid)', 'execute'),
  'anon can call none of them');
select ok(
  not has_function_privilege('authenticated', 'public.generate_due_occurrences(timestamptz, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.generate_due_occurrences(timestamptz, uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.generate_due_occurrences(timestamptz, uuid)', 'execute'),
  'the generator stays cron only');
select ok(
  not has_function_privilege('authenticated', 'public.send_handover_reminders(timestamptz, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.send_handover_reminders(timestamptz, uuid)', 'execute')
  and has_function_privilege('service_role', 'public.send_handover_reminders(timestamptz, uuid)', 'execute'),
  'reminders: no user grants, service_role keeps it');
select ok(
  (select 'lock_timeout=5s' = any(proconfig) from pg_proc
   where oid = 'public.generate_due_occurrences(timestamptz, uuid)'::regprocedure),
  'the generator keeps its 5 s lock timeout');

-- ---------------------------------------------------------------------------
-- The jobs' family filter
-- ---------------------------------------------------------------------------

-- Schedules due today in both families, inserted by hand so nothing generated them yet.
insert into public.allowance_schedules (family_id, child_id, amount_minor, frequency, anchor_on)
values (:'fb'::uuid, :'c3'::uuid, 500, 'weekly', :'real_today'::date);

select is(public.generate_due_occurrences(now(), :'fa'::uuid), 0, 'a run for family A generates nothing');
select is(
  (select count(*)::int from public.allowance_occurrences where family_id = :'fb'::uuid), 0,
  'and never touches family B');
select is(public.generate_due_occurrences(now(), :'fb'::uuid), 1, 'a run for family B generates its period');

select is(public.send_handover_reminders(now(), :'fa'::uuid), 0, 'reminders for family A send nothing');
select is(
  (select count(*)::int from public.notifications where family_id = :'fb'::uuid), 0,
  'and never notify family B');
select public.send_handover_reminders(now(), null) as r \gset
select is(
  (select count(*)::int from public.notifications where family_id = :'fb'::uuid), 2,
  'an unfiltered run (null) covers family B: its parent and child');

-- ---------------------------------------------------------------------------
-- advance_family_clock: refusals
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c1'::uuid);
select throws_ok(
  format($$select public.advance_family_clock(%L, 1)$$, :'fa'), 'JA403', null, 'a child cannot move the clock');
select tests.authenticate_as(:'pb'::uuid);
select throws_ok(
  format($$select public.advance_family_clock(%L, 1)$$, :'fa'), 'JA403', null, 'another family''s parent cannot');
select tests.authenticate_as(:'pa'::uuid);
select throws_ok(
  format($$select public.advance_family_clock(%L, 1)$$, :'fa'), 'JA409', null, 'not a demo family: refused');
select tests.clear_auth();

update public.families set demo_clock_enabled = true where id = :'fa'::uuid;

select tests.authenticate_as(:'pa'::uuid);
select throws_ok(
  format($$select public.advance_family_clock(%L, 0)$$, :'fa'), '22023', null, 'at least one day');
select throws_ok(
  format($$select public.advance_family_clock(%L, 61)$$, :'fa'), '22023', null, 'at most 60 days at a time');
select throws_ok(
  format($$select public.advance_family_clock(%L, null)$$, :'fa'), '22023', null, 'days are required');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- advance_family_clock: an allowance falls due and its notice lands on the skipped day
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'pa'::uuid);
select public.create_allowance(:'c1'::uuid, 500, 'weekly', :'real_today'::date + 2) as sa \gset
select tests.clear_auth();
select is(
  (select count(*)::int from public.allowance_occurrences where schedule_id = :'sa'::uuid), 0,
  'nothing is due before the clock moves');

select tests.authenticate_as(:'pa'::uuid);
select public.advance_family_clock(:'fa'::uuid, 3) as moved \gset
select tests.clear_auth();

select is((:'moved'::jsonb ->> 'offset_days')::int, 3, 'returns the new offset in days');
select is((:'moved'::jsonb ->> 'today')::date, :'real_today'::date + 3, 'returns the family''s new today');
select is((:'moved'::jsonb ->> 'generated')::int, 1, 'generates the period that fell due');
select is((:'moved'::jsonb ->> 'reminders')::int, 2, 'the due-day notice reaches the parent and the child');
select is(
  (select clock_offset from public.families where id = :'fa'::uuid), interval '3 days',
  'the offset is stored');
select is(
  (select due_on from public.allowance_occurrences where schedule_id = :'sa'::uuid), :'real_today'::date + 2,
  'the occurrence is due on its own day');
select is(
  (select count(*)::int from public.notifications where kind = 'allowance_due' and family_id = :'fa'::uuid), 2,
  'allowance_due notices were sent for the skipped due day');
select is(
  (select details from public.audit_log where family_id = :'fa'::uuid and action = 'family.clock_advanced'),
  '{"days": 3, "offset_days": 3}'::jsonb, 'the move is audited');

select tests.authenticate_as(:'pa'::uuid);
select public.advance_family_clock(:'fa'::uuid, 7) as moved \gset
select tests.clear_auth();
select is((:'moved'::jsonb ->> 'offset_days')::int, 10, 'moves add up');
select is(
  (select count(*)::int from public.notifications where kind = 'handover_reminder' and family_id = :'fa'::uuid), 2,
  'skipped days 3 and 6 after the due day each sent the parent a reminder');

update public.families set clock_offset = interval '360 days' where id = :'fa'::uuid;
select tests.authenticate_as(:'pa'::uuid);
select throws_ok(
  format($$select public.advance_family_clock(%L, 7)$$, :'fa'), '22023', null, 'the clock goes at most a year ahead');
select tests.clear_auth();
update public.families set clock_offset = interval '0' where id = :'fa'::uuid;

-- ---------------------------------------------------------------------------
-- Money-rule windows follow the family's week
-- ---------------------------------------------------------------------------

insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, source_type, idempotency_key, created_by, occurred_at)
values (:'fa'::uuid, :'c1'::uuid, 'save', 'allowance_in', 'in', 5000, 'Allowance', 'occurrence', 'seed:c1:save', :'pa'::uuid, '2025-01-01');

select tests.authenticate_as(:'pa'::uuid);
select public.set_money_rule(:'c1'::uuid, 'withdrawal_cap', 'week', 3000);
select tests.authenticate_as(:'c1'::uuid);
select public.create_withdrawal(:'c1'::uuid, 1000, null, 'demo-w1');
select is(public.withdrawal_cap_remaining(:'c1'::uuid), 2000::bigint, 'this week''s ask counts against the cap');
select tests.clear_auth();

update public.families set clock_offset = interval '14 days' where id = :'fa'::uuid;

select tests.authenticate_as(:'c1'::uuid);
select is(public.withdrawal_cap_remaining(:'c1'::uuid), 3000::bigint, 'two family weeks later it no longer counts');
select public.create_withdrawal(:'c1'::uuid, 500, null, 'demo-w2');
select is(public.withdrawal_cap_remaining(:'c1'::uuid), 2500::bigint, 'an ask in the family''s week counts');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- Auto charge never runs for a family whose clock has moved
-- ---------------------------------------------------------------------------

insert into public.payment_customers (parent_id, provider, customer_ref, method_ref, card_brand, card_last4)
values (:'pa'::uuid, 'fake', 'cus_a', 'pm_a', 'visa', '4242');
update public.families set clock_offset = interval '0' where id = :'fa'::uuid;
insert into public.parent_gifts (
  family_id, child_id, amount_minor, give_on, created_by, idempotency_key,
  auto_charge, auto_charge_by, auto_charge_since, auto_charge_provider
)
values (
  :'fa'::uuid, :'c1'::uuid, 1000, :'real_today'::date, :'pa'::uuid, gen_random_uuid(),
  true, :'pa'::uuid, now() - interval '1 day', 'fake'
);

select is(
  (select count(*)::int from public.due_auto_charges(array['fake']) where family_id = :'fa'::uuid), 1,
  'a gift due today is charged while the clock has not moved');
update public.families set clock_offset = interval '1 day' where id = :'fa'::uuid;
select is(
  (select count(*)::int from public.due_auto_charges(array['fake']) where family_id = :'fa'::uuid), 0,
  'once the clock has moved, the family is skipped');

select * from finish();
rollback;
