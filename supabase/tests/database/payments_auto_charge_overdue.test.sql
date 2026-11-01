begin;
\ir _helpers.psql
select plan(6);

-- Auto charge never back-charges (due_auto_charges needs give_on >= auto_charge_since), so a
-- pending gift whose day has passed can't be charged: turning it on is refused.

select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('c1@example.com', 'child') as c1 \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'Pacific/Auckland') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select tests.clear_auth();

select public.family_today(:'fa'::uuid) as today \gset

insert into public.payment_customers (parent_id, provider, customer_ref, method_ref, card_brand, card_last4)
values (:'pa'::uuid, 'fake', 'cus_a', 'pm_a', 'visa', '4242');

insert into public.parent_gifts (family_id, child_id, amount_minor, give_on, created_by, idempotency_key)
values (:'fa'::uuid, :'c1'::uuid, 1000, :'today'::date - 1, :'pa'::uuid, gen_random_uuid())
returning id as overdue \gset
insert into public.parent_gifts (family_id, child_id, amount_minor, give_on, created_by, idempotency_key)
values (:'fa'::uuid, :'c1'::uuid, 1000, :'today'::date, :'pa'::uuid, gen_random_uuid())
returning id as today_gift \gset

select tests.authenticate_as(:'pa'::uuid);
select throws_ok(
  format($$select public.set_auto_charge('parent_gift', %L, true, 'fake')$$, :'overdue'),
  'JA409', 'Nothing left to charge', 'auto charge cannot be turned on for a gift whose day has passed');
select lives_ok(
  format($$select public.set_auto_charge('parent_gift', %L, true, 'fake')$$, :'today_gift'),
  'auto charge can be turned on for a gift due today (family date)');
select lives_ok(
  format($$select public.set_auto_charge('parent_gift', %L, false, 'fake')$$, :'overdue'),
  'turning auto charge off still works for a gift whose day has passed');
select tests.clear_auth();

set local role service_role;
select throws_ok(
  format($$select public.arm_auto_charge(%L, 'parent_gift', %L, 'fake')$$, :'pa', :'overdue'),
  'JA409', 'Nothing left to charge', 'arm_auto_charge refuses a gift whose day has passed');
reset role;

select is(
  (select auto_charge from public.parent_gifts where id = :'overdue'::uuid),
  false, 'the overdue gift stays off');

select ok(
  not has_function_privilege('authenticated', 'public.write_auto_charge(uuid, text, uuid, boolean, text)', 'execute'),
  'write_auto_charge keeps no grant for authenticated');

select * from finish();
rollback;
