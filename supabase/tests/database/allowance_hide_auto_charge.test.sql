begin;
\ir _helpers.psql
select plan(9);

-- A child reads their own schedule but never its auto-charge state; parents read it through
-- allowance_schedule_auto_charge.

select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('px@example.com') as px \gset
select tests.create_user('c1@example.com', 'child') as c1 \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('INR', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select tests.clear_auth();

select tests.authenticate_as(:'px'::uuid);
select public.create_family('INR', 'UTC');
select tests.clear_auth();

insert into public.allowance_schedules (
  family_id, child_id, amount_minor, frequency, anchor_on,
  auto_charge, auto_charge_by, auto_charge_since, auto_charge_provider
)
values (:'fa'::uuid, :'c1'::uuid, 500, 'weekly', date '2030-01-01', true, :'pa'::uuid, now(), 'fake')
returning id as s1 \gset

-- The child
select tests.authenticate_as(:'c1'::uuid);
select is(
  (select amount_minor::int from public.allowance_schedules where id = :'s1'::uuid),
  500, 'the child still reads their schedule');
select throws_ok(
  format($$select auto_charge from public.allowance_schedules where id = %L$$, :'s1'),
  '42501', null, 'the child cannot read auto_charge');
select throws_ok(
  format($$select auto_charge_by, auto_charge_since, auto_charge_provider from public.allowance_schedules where id = %L$$, :'s1'),
  '42501', null, 'the child cannot read who or which card pays');
select throws_ok(
  format($$select * from public.allowance_schedules where id = %L$$, :'s1'),
  '42501', null, 'select * does not reveal the hidden columns');
select throws_ok(
  format($$select * from public.allowance_schedule_auto_charge(%L)$$, :'s1'),
  'JA403', 'Not allowed', 'the child cannot read auto charge through the function');
select tests.clear_auth();

-- The parent
select tests.authenticate_as(:'pa'::uuid);
select throws_ok(
  format($$select auto_charge from public.allowance_schedules where id = %L$$, :'s1'),
  '42501', null, 'a parent cannot read the columns directly either');
select is(
  (select auto_charge::text || ':' || auto_charge_provider || ':' || auto_charge_by::text
   from public.allowance_schedule_auto_charge(:'s1'::uuid)),
  format('true:fake:%s', :'pa'), 'a parent reads auto charge through the function');
select tests.clear_auth();

-- Another family's parent, and a missing schedule
select tests.authenticate_as(:'px'::uuid);
select throws_ok(
  format($$select * from public.allowance_schedule_auto_charge(%L)$$, :'s1'),
  'JA403', 'Not allowed', 'another family''s parent cannot read it');
select throws_ok(
  format($$select * from public.allowance_schedule_auto_charge(%L)$$, gen_random_uuid()),
  'JA403', 'Not allowed', 'a missing schedule is not allowed');
select tests.clear_auth();

select * from finish();
rollback;
