begin;
\ir _helpers.psql
select plan(19);

-- The planned Spend/Save split (ADR 0019): the schedule stores the Save part, each due item
-- copies it, and nothing reaches the ledger.

select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('c1@example.com', 'child') as c1 \gset
select tests.create_user('c2@example.com', 'child') as c2 \gset
select tests.create_user('c3@example.com', 'child') as c3 \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('INR', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select public.register_child(:'c2'::uuid, :'fa'::uuid, 'Alex', '1234', true);
select public.register_child(:'c3'::uuid, :'fa'::uuid, 'Kim', '1234', true);
select tests.clear_auth();

select public.family_today(:'fa'::uuid) as today \gset

-- ---------------------------------------------------------------------------
-- create_allowance
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'pa'::uuid);
select public.create_allowance(:'c1'::uuid, 50000, 'weekly', :'today'::date, 12500) as s1 \gset
select is(
  (select save_minor::int from public.allowance_schedules where id = :'s1'::uuid),
  12500, 'create stores the planned Save');
select is(
  (select save_minor::int from public.allowance_occurrences where schedule_id = :'s1'::uuid and due_on = :'today'::date),
  12500, 'the item due today carries the plan');
select is(
  (select (details ->> 'save_minor')::int from public.audit_log
   where subject_id = :'s1'::uuid and action = 'allowance.created'),
  12500, 'the audit row has the Save');
select throws_ok(
  format('select public.create_allowance(%L, 500, %L, %L, 501)', :'c2', 'weekly', :'today'),
  '22023', null, 'a Save over the amount is refused');
select throws_ok(
  format('select public.create_allowance(%L, 500, %L, %L, -1)', :'c2', 'weekly', :'today'),
  '22023', null, 'a negative Save is refused');

-- Four named arguments, as an older phone build sends them: no plan.
select public.create_allowance(
  p_child_id => :'c2'::uuid, p_amount_minor => 1000, p_frequency => 'weekly', p_first_on => :'today'::date
) as s2 \gset
select is(
  (select save_minor from public.allowance_schedules where id = :'s2'::uuid),
  null::bigint, 'without a Save there is no plan');
select is(
  (select save_minor from public.allowance_occurrences where schedule_id = :'s2'::uuid),
  null::bigint, 'and its due item has none either');

-- ---------------------------------------------------------------------------
-- change_allowance
-- ---------------------------------------------------------------------------

select public.change_allowance(:'s1'::uuid, 60000, 'weekly', (:'today'::date + 7), 30000);
select is(
  (select save_minor::int from public.allowance_schedules where id = :'s1'::uuid),
  30000, 'change stores a new Save');
select is(
  (select save_minor::int from public.allowance_occurrences where schedule_id = :'s1'::uuid and due_on = :'today'::date),
  12500, 'an item already due keeps its plan');

select public.change_allowance(:'s1'::uuid, 40000, 'weekly', (:'today'::date + 7));
select is(
  (select save_minor::int from public.allowance_schedules where id = :'s1'::uuid),
  30000, 'a change without a Save keeps one that still fits');

select public.change_allowance(:'s1'::uuid, 20000, 'weekly', (:'today'::date + 7));
select is(
  (select save_minor from public.allowance_schedules where id = :'s1'::uuid),
  null::bigint, 'a change without a Save clears one that no longer fits');
select throws_ok(
  format('select public.change_allowance(%L, 500, %L, %L, 600)', :'s1', 'weekly', (:'today'::date + 7)),
  '22023', null, 'change refuses a Save over the amount');

-- ---------------------------------------------------------------------------
-- list_due_for_parent
-- ---------------------------------------------------------------------------

select public.create_allowance(:'c3'::uuid, 800, 'weekly', :'today'::date, 0) as s3 \gset
select public.create_gift(:'c3'::uuid, 300, :'today'::date, null, gen_random_uuid()::text) as g3 \gset
select is(
  (select save_minor::int from public.list_due_for_parent(:'c3'::uuid) where kind = 'allowance'),
  0, 'the due allowance carries a planned All Spend');
select is(
  (select save_minor from public.list_due_for_parent(:'c3'::uuid) where kind = 'gift'),
  null::bigint, 'a gift has no plan');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- Integrity, grants and the ledger
-- ---------------------------------------------------------------------------

select throws_ok(
  format('update public.allowance_schedules set save_minor = amount_minor + 1 where id = %L', :'s3'),
  '23514', null, 'the column check refuses a Save over the amount');

select tests.authenticate_as(:'c3'::uuid);
select is(
  (select save_minor::int from public.allowance_schedules where id = :'s3'::uuid),
  0, 'the child reads their plan');
select throws_ok(
  format($$select auto_charge from public.allowance_schedules where id = %L$$, :'s3'),
  '42501', null, 'the child still cannot read auto charge');
select tests.clear_auth();

select is(
  (select count(*)::int from public.ledger_entries where family_id = :'fa'::uuid),
  0, 'setting, changing and generating a plan writes no ledger row');

set local role anon;
select throws_ok(
  format('select public.create_allowance(%L, 500, %L, %L, 100)', :'c2', 'weekly', :'today'),
  '42501', null, 'anon cannot create an allowance');
reset role;

select * from finish();
rollback;
