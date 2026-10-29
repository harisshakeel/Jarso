begin;
\ir _helpers.psql
select plan(15);

-- Fixtures: PA owns family A (UTC), PB owns family B (Asia/Kolkata).
select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('c1@example.com', 'child') as c1 \gset
select tests.create_user('c2@example.com', 'child') as c2 \gset
select tests.create_user('c3@example.com', 'child') as c3 \gset
select tests.create_user('c4@example.com', 'child') as c4 \gset
select tests.create_user('c5@example.com', 'child') as c5 \gset
select tests.create_user('c6@example.com', 'child') as c6 \gset

select tests.authenticate_as(:'pb'::uuid);
select public.create_family('INR', 'Asia/Kolkata') as fb \gset
select public.register_child(:'c2'::uuid, :'fb'::uuid, 'Asha', '1234', true);

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select public.register_child(:'c3'::uuid, :'fa'::uuid, 'Alex', '1234', true);
select public.register_child(:'c4'::uuid, :'fa'::uuid, 'Kim', '1234', true);
select public.register_child(:'c5'::uuid, :'fa'::uuid, 'Lee', '1234', true);
select public.register_child(:'c6'::uuid, :'fa'::uuid, 'Rae', '1234', true);
select tests.clear_auth();

select public.family_today(:'fa'::uuid) as today \gset

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'pa'::uuid);
select throws_ok('select public.generate_due_occurrences()', '42501', null, 'authenticated cannot run the generator');
select tests.clear_auth();
set local role anon;
select throws_ok('select public.generate_due_occurrences()', '42501', null, 'anon cannot run the generator');
reset role;

-- ---------------------------------------------------------------------------
-- Weekly schedule anchored 3 weeks ago: 4 occurrences, once each
-- ---------------------------------------------------------------------------

insert into public.allowance_schedules (family_id, child_id, amount_minor, frequency, anchor_on)
values (:'fa'::uuid, :'c1'::uuid, 500, 'weekly', :'today'::date - 21)
returning id as s1 \gset

select is(public.generate_due_occurrences(), 4, 'first run inserts 4 occurrences');
select is(public.generate_due_occurrences(), 0, 'second run inserts nothing');
select is((select count(*)::int from public.allowance_occurrences where schedule_id = :'s1'::uuid), 4, 'four occurrences in total');
select is(
  (select count(*)::int from public.job_runs where job = 'generate-due-occurrences' and status = 'ok' and finished_at is not null),
  2, 'each run writes an ok job_runs row');
select is(
  (select details from public.job_runs where job = 'generate-due-occurrences' order by started_at desc, id limit 1)->>'failed',
  '0', 'job_runs details record zero failures');

-- ---------------------------------------------------------------------------
-- Timezone: Kolkata is the next day from 18:30 UTC
-- ---------------------------------------------------------------------------

insert into public.allowance_schedules (family_id, child_id, amount_minor, frequency, anchor_on)
values (:'fb'::uuid, :'c2'::uuid, 500, 'weekly', '2026-11-02')
returning id as s2 \gset

select is(public.generate_due_occurrences('2026-11-01 18:29+00'), 0, 'Kolkata: nothing before local midnight');
select is(public.generate_due_occurrences('2026-11-01 18:31+00'), 1, 'Kolkata: due after local midnight');

-- ---------------------------------------------------------------------------
-- Auto-resume: periods inside the pause are never generated
-- ---------------------------------------------------------------------------

insert into public.allowance_schedules (family_id, child_id, amount_minor, frequency, anchor_on, next_index, status, paused_through)
values (:'fa'::uuid, :'c3'::uuid, 500, 'weekly', '2026-11-01', 1, 'paused', '2026-11-10')
returning id as s3 \gset
insert into public.allowance_occurrences (schedule_id, family_id, child_id, period_key, due_on, amount_minor)
values (:'s3'::uuid, :'fa'::uuid, :'c3'::uuid, '2026-11-01', '2026-11-01', 500);

select public.generate_due_occurrences('2026-11-09 12:00+00');
select is((select count(*)::int from public.allowance_occurrences where schedule_id = :'s3'::uuid), 1, 'still paused: nothing generated');
select is((select status from public.allowance_schedules where id = :'s3'::uuid), 'paused', 'stays paused until paused_through passes');
select public.generate_due_occurrences('2026-11-20 12:00+00');
select is((select count(*)::int from public.allowance_occurrences where schedule_id = :'s3'::uuid), 2, 'after the pause only 11-15 is generated');
select results_eq(
  format('select due_on from public.allowance_occurrences where schedule_id = %L order by due_on', :'s3'),
  $$ values ('2026-11-01'::date), ('2026-11-15'::date) $$,
  '11-08 skipped, 11-15 created');
select is(
  (select status || ':' || coalesce(paused_through::text, 'null') from public.allowance_schedules where id = :'s3'::uuid),
  'active:null', 'auto-resumed and pause cleared');

-- ---------------------------------------------------------------------------
-- Skipped schedules
-- ---------------------------------------------------------------------------

insert into public.allowance_schedules (family_id, child_id, amount_minor, frequency, anchor_on, status)
values (:'fa'::uuid, :'c4'::uuid, 500, 'weekly', '2026-11-01', 'paused');
insert into public.allowance_schedules (family_id, child_id, amount_minor, frequency, anchor_on, status)
values (:'fa'::uuid, :'c5'::uuid, 500, 'weekly', '2026-11-01', 'stopped');
insert into public.allowance_schedules (family_id, child_id, amount_minor, frequency, anchor_on)
values (:'fa'::uuid, :'c6'::uuid, 500, 'weekly', '2026-11-01');
update public.family_members set status = 'removed' where profile_id = :'c6'::uuid;

select public.generate_due_occurrences('2026-12-01 12:00+00');
select is(
  (select count(*)::int from public.allowance_occurrences where child_id in (:'c4'::uuid, :'c5'::uuid, :'c6'::uuid)),
  0, 'no occurrences for paused-forever, stopped or removed children');

select * from finish();
rollback;
