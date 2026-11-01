begin;
\ir _helpers.psql
select plan(9);

-- Turning auto charge off clears a pending save-card session's arm, so its webhook
-- (arm_auto_charge_for_setup) saves the card without turning the toggle back on.

select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('c1@example.com', 'child') as c1 \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select tests.clear_auth();

insert into public.allowance_schedules (family_id, child_id, amount_minor, frequency, anchor_on)
values (:'fa'::uuid, :'c1'::uuid, 500, 'weekly', date '2030-01-01')
returning id as s1 \gset

insert into public.payment_customers (parent_id, provider, customer_ref, method_ref, card_brand, card_last4)
values (:'pa'::uuid, 'fake', 'cus_a', 'pm_a', 'visa', '4242');

-- A session that would turn the schedule on, a finished one with the same arm, and one with none.
insert into public.payment_setups (parent_id, provider, arm_type, arm_id)
values (:'pa'::uuid, 'fake', 'allowance_schedule', :'s1'::uuid)
returning id as open_setup \gset
insert into public.payment_setups (parent_id, provider, status, arm_type, arm_id)
values (:'pa'::uuid, 'fake', 'succeeded', 'allowance_schedule', :'s1'::uuid)
returning id as done_setup \gset
insert into public.payment_setups (parent_id, provider)
values (:'pa'::uuid, 'fake')
returning id as plain_setup \gset

select tests.authenticate_as(:'pa'::uuid);
select throws_ok(
  format($$select public.arm_auto_charge_for_setup(%L)$$, :'open_setup'),
  '42501', null, 'authenticated cannot execute arm_auto_charge_for_setup');
select lives_ok(
  format($$select public.set_auto_charge('allowance_schedule', %L, false, 'fake')$$, :'s1'),
  'the parent turns auto charge off while the session is open');
select tests.clear_auth();

select is(
  (select arm_type from public.payment_setups where id = :'open_setup'::uuid)::text,
  null::text, 'turning off clears the open session''s arm');
select is(
  (select arm_type from public.payment_setups where id = :'done_setup'::uuid),
  'allowance_schedule', 'a finished session keeps its arm');

set local role service_role;
select is(public.arm_auto_charge_for_setup(:'open_setup'::uuid), false,
  'the webhook does not arm a session whose arm was cleared');
select is(public.arm_auto_charge_for_setup(:'plain_setup'::uuid), false,
  'a session with no arm arms nothing');
reset role;

select is(
  (select auto_charge from public.allowance_schedules where id = :'s1'::uuid),
  false, 'the schedule stays off');

-- A session still armed turns the toggle on as its parent at its provider.
update public.payment_setups set arm_type = 'allowance_schedule', arm_id = :'s1'::uuid
where id = :'open_setup'::uuid;
set local role service_role;
select is(public.arm_auto_charge_for_setup(:'open_setup'::uuid), true,
  'the webhook arms a session whose arm is still set');
reset role;
select is(
  (select format('%s:%s:%s', auto_charge, auto_charge_by, auto_charge_provider)
   from public.allowance_schedules where id = :'s1'::uuid),
  format('true:%s:fake', :'pa'), 'it is on for the setup''s parent at its provider');

select * from finish();
rollback;
