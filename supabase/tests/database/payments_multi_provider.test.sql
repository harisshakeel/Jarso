begin;
\ir _helpers.psql
select plan(40);

-- Several providers at once (spec 2026-11-01-multi-provider-razorpay §4): razorpay is accepted
-- everywhere a provider is stored, and every auto-charge toggle records which provider's saved
-- card it charges.

select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('c1@example.com', 'child') as c1 \gset
select tests.create_user('c2@example.com', 'child') as c2 \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('INR', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select public.register_child(:'c2'::uuid, :'fa'::uuid, 'Ana', '1234', true);
select tests.clear_auth();

-- pb is a second parent in the family.
insert into public.family_members (family_id, profile_id, role, status)
values (:'fa'::uuid, :'pb'::uuid, 'parent', 'approved');

select (now() at time zone 'UTC')::date as today \gset

insert into public.allowance_schedules (family_id, child_id, amount_minor, frequency, anchor_on)
values (:'fa'::uuid, :'c1'::uuid, 500, 'weekly', date '2030-01-01')
returning id as s1 \gset
insert into public.allowance_schedules (family_id, child_id, amount_minor, frequency, anchor_on)
values (:'fa'::uuid, :'c2'::uuid, 600, 'weekly', date '2030-01-01')
returning id as s2 \gset
insert into public.allowance_occurrences (schedule_id, family_id, child_id, period_key, due_on, amount_minor)
values
  (:'s1'::uuid, :'fa'::uuid, :'c1'::uuid, 'o1', :'today'::date, 500),
  (:'s2'::uuid, :'fa'::uuid, :'c2'::uuid, 'o2', :'today'::date, 600);
select id as o1 from public.allowance_occurrences where period_key = 'o1' \gset
select id as o2 from public.allowance_occurrences where period_key = 'o2' \gset
insert into public.parent_gifts (family_id, child_id, amount_minor, give_on, created_by, idempotency_key)
values (:'fa'::uuid, :'c1'::uuid, 700, :'today'::date, :'pa'::uuid, gen_random_uuid())
returning id as g1 \gset

-- ---------------------------------------------------------------------------
-- razorpay is a valid provider in every provider column; anything else is not
-- ---------------------------------------------------------------------------
select lives_ok(
  format($$insert into public.payment_customers (parent_id, provider, customer_ref, method_ref, card_brand, card_last4)
           values (%L, 'razorpay', 'cust_a', 'cust_a:token_a:pay_a', 'visa', '1111')$$, :'pa'),
  'payment_customers accepts razorpay');
select lives_ok(
  format($$insert into public.payment_setups (parent_id, provider, provider_ref) values (%L, 'razorpay', 'order_a')$$, :'pa'),
  'payment_setups accepts razorpay');
select lives_ok(
  format($$insert into public.payments (family_id, child_id, payer_id, provider, source_type, source_id,
             amount_minor, currency, cash_minor, saved_minor)
           values (%L, %L, %L, 'razorpay', 'occurrence', %L, 500, 'INR', 500, 0)$$,
         :'fa', :'c1', :'pa', :'o1'),
  'payments accepts razorpay');
select lives_ok(
  $$insert into public.payment_webhook_events (provider, event_id) values ('razorpay', 'evt_a')$$,
  'payment_webhook_events accepts razorpay');
select throws_ok(
  $$insert into public.payment_webhook_events (provider, event_id) values ('paypal', 'evt_b')$$,
  '23514', null, 'an unknown provider is still rejected');
delete from public.payments where provider = 'razorpay';

select has_column('public', 'allowance_schedules', 'auto_charge_provider', 'allowance_schedules has auto_charge_provider');
select has_column('public', 'parent_gifts', 'auto_charge_provider', 'parent_gifts has auto_charge_provider');

-- ---------------------------------------------------------------------------
-- auto_charge and auto_charge_provider move together
-- ---------------------------------------------------------------------------
select throws_ok(
  format($$update public.allowance_schedules set auto_charge = true, auto_charge_by = %L, auto_charge_since = now() where id = %L$$, :'pa', :'s1'),
  '23514', null, 'auto charge on without a provider is rejected');
select throws_ok(
  format($$update public.parent_gifts set auto_charge_provider = 'fake' where id = %L$$, :'g1'),
  '23514', null, 'a provider without auto charge on is rejected');
select throws_ok(
  format($$update public.parent_gifts set auto_charge = true, auto_charge_by = %L, auto_charge_since = now(), auto_charge_provider = 'paypal' where id = %L$$, :'pa', :'g1'),
  '23514', null, 'an unknown auto charge provider is rejected');

-- ---------------------------------------------------------------------------
-- write_auto_charge records the provider; auto_charge_since needs same payer and provider
-- ---------------------------------------------------------------------------
insert into public.payment_customers (parent_id, provider, customer_ref, method_ref)
values (:'pa'::uuid, 'fake', 'cus_fake', 'pm_fake'), (:'pb'::uuid, 'razorpay', 'cust_b', 'cust_b:token_b:pay_b');

select tests.authenticate_as(:'pa'::uuid);
select public.set_auto_charge('allowance_schedule', :'s1'::uuid, true, 'razorpay');
select tests.clear_auth();
select is(
  (select auto_charge_provider from public.allowance_schedules where id = :'s1'::uuid),
  'razorpay', 'turning on records the provider');

update public.allowance_schedules set auto_charge_since = now() - interval '1 day' where id = :'s1'::uuid;
select tests.authenticate_as(:'pa'::uuid);
select public.set_auto_charge('allowance_schedule', :'s1'::uuid, true, 'razorpay');
select tests.clear_auth();
select ok(
  (select auto_charge_since < now() - interval '12 hours' from public.allowance_schedules where id = :'s1'::uuid),
  'same payer and provider turning on again keeps auto_charge_since');

select tests.authenticate_as(:'pa'::uuid);
select public.set_auto_charge('allowance_schedule', :'s1'::uuid, true, 'fake');
select tests.clear_auth();
select is(
  (select auto_charge_provider from public.allowance_schedules where id = :'s1'::uuid),
  'fake', 'switching provider updates the provider');
select ok(
  (select auto_charge_since >= now() - interval '1 minute' from public.allowance_schedules where id = :'s1'::uuid),
  'a different provider restarts auto_charge_since');

update public.allowance_schedules set auto_charge_since = now() - interval '1 day' where id = :'s1'::uuid;
select tests.authenticate_as(:'pb'::uuid);
select public.set_auto_charge('allowance_schedule', :'s1'::uuid, true, 'razorpay');
select tests.clear_auth();
select ok(
  (select auto_charge_by = :'pb'::uuid and auto_charge_provider = 'razorpay' and auto_charge_since >= now() - interval '1 minute'
   from public.allowance_schedules where id = :'s1'::uuid),
  'a different payer restarts auto_charge_since');

select tests.authenticate_as(:'pb'::uuid);
select public.set_auto_charge('allowance_schedule', :'s1'::uuid, false, 'razorpay');
select tests.clear_auth();
select is(
  (select coalesce(auto_charge_provider, 'null') || ':' || coalesce(auto_charge_by::text, 'null') || ':' || coalesce(auto_charge_since::text, 'null') || ':' || auto_charge
   from public.allowance_schedules where id = :'s1'::uuid),
  'null:null:null:false', 'turning off clears the provider with the other columns');

select tests.authenticate_as(:'pa'::uuid);
select throws_ok(
  format($$select public.set_auto_charge('parent_gift', %L, true, 'stripe')$$, :'g1'),
  'JA409', 'Save a card first', 'on needs a saved card at that provider');
select public.set_auto_charge('parent_gift', :'g1'::uuid, true, 'fake');
select tests.clear_auth();
select is(
  (select auto_charge_provider from public.parent_gifts where id = :'g1'::uuid),
  'fake', 'gifts record the provider too');

set local role service_role;
select public.arm_auto_charge(:'pb'::uuid, 'allowance_schedule', :'s2'::uuid, 'razorpay');
reset role;
select is(
  (select auto_charge_provider from public.allowance_schedules where id = :'s2'::uuid),
  'razorpay', 'arm_auto_charge records the provider');

-- ---------------------------------------------------------------------------
-- due_auto_charges(text[]): filters by provider list, returns the provider
-- ---------------------------------------------------------------------------
-- Now: s2 (razorpay, pb) and g1 (fake, pa) are on; s1 is off.
set local role service_role;
select is(
  (select string_agg(provider, ',' order by provider) from public.due_auto_charges(array['fake', 'razorpay', 'stripe'])),
  'fake,razorpay', 'every provider in the list is returned, with its provider column');
select is(
  (select source_id::text from public.due_auto_charges(array['razorpay'])),
  :'o2', 'only items on a listed provider are due');
select is(
  (select provider || ':' || customer_ref || ':' || method_ref || ':' || payer_id::text
   from public.due_auto_charges(array['razorpay'])),
  format('razorpay:cust_b:cust_b:token_b:pay_b:%s', :'pb'), 'the row carries that provider''s saved card');
select is(
  (select provider || ':' || customer_ref || ':' || method_ref from public.due_auto_charges(array['fake'])),
  'fake:cus_fake:pm_fake', 'the fake item charges the fake card');
select is(
  (select count(*)::int from public.due_auto_charges(array['stripe'])),
  0, 'a provider with no toggles returns nothing');
select is((select count(*)::int from public.due_auto_charges(array[]::text[])), 0, 'an empty list returns nothing');
select is((select count(*)::int from public.due_auto_charges(null::text[])), 0, 'a null list returns nothing');
reset role;

-- A payer who also holds a card with another provider is charged on the item's provider.
insert into public.payment_customers (parent_id, provider, customer_ref, method_ref)
values (:'pb'::uuid, 'stripe', 'cus_s', 'pm_s');
set local role service_role;
select is(
  (select provider from public.due_auto_charges(array['razorpay', 'stripe']) where source_id = :'o2'::uuid),
  'razorpay', 'a second saved card does not change which card an item charges');
reset role;

-- ---------------------------------------------------------------------------
-- clear_auto_charge_by(parent, provider) spares the other providers
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'pb'::uuid);
select public.set_auto_charge('parent_gift', :'g1'::uuid, true, 'stripe');
select tests.clear_auth();
set local role service_role;
select public.clear_auto_charge_by(:'pb'::uuid, 'stripe');
reset role;
select is(
  (select auto_charge from public.parent_gifts where id = :'g1'::uuid),
  false, 'clear_auto_charge_by turns off that parent''s toggles on that provider');
select is(
  (select auto_charge_provider || ':' || auto_charge_by::text from public.allowance_schedules where id = :'s2'::uuid),
  format('razorpay:%s', :'pb'), 'clear_auto_charge_by spares the same parent''s toggles on other providers');

update public.parent_gifts
set auto_charge = true, auto_charge_by = :'pa'::uuid, auto_charge_since = now(), auto_charge_provider = 'stripe'
where id = :'g1'::uuid;
set local role service_role;
select public.clear_auto_charge_by(:'pb'::uuid, 'stripe');
reset role;
select is(
  (select auto_charge from public.parent_gifts where id = :'g1'::uuid),
  true, 'clear_auto_charge_by spares other parents'' toggles');
set local role service_role;
select public.clear_auto_charge_by(:'pb'::uuid, 'razorpay');
reset role;
select is(
  (select auto_charge from public.allowance_schedules where id = :'s2'::uuid),
  false, 'clear_auto_charge_by turns off the matching provider');

-- ---------------------------------------------------------------------------
-- Signatures and grants
-- ---------------------------------------------------------------------------
select hasnt_function('public', 'due_auto_charges', array['text', 'timestamp with time zone', 'integer'], 'the single-provider due_auto_charges is gone');
select hasnt_function('public', 'clear_auto_charge_by', array['uuid'], 'the one-argument clear_auto_charge_by is gone');
select ok(
  has_function_privilege('service_role', 'public.due_auto_charges(text[], timestamptz, int)', 'execute')
  and has_function_privilege('service_role', 'public.clear_auto_charge_by(uuid, text)', 'execute'),
  'service_role can execute the new signatures');
select ok(
  not has_function_privilege('authenticated', 'public.due_auto_charges(text[], timestamptz, int)', 'execute')
  and not has_function_privilege('anon', 'public.due_auto_charges(text[], timestamptz, int)', 'execute')
  and not has_function_privilege('authenticated', 'public.clear_auto_charge_by(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.clear_auto_charge_by(uuid, text)', 'execute'),
  'neither is executable by anon or authenticated');
select ok(
  not has_function_privilege('authenticated', 'public.write_auto_charge(uuid, text, uuid, boolean, text)', 'execute'),
  'write_auto_charge keeps no grant for authenticated');

-- ---------------------------------------------------------------------------
-- Backfill (the same statements the migration ran on existing rows): the payer's saved card,
-- Stripe first then by provider name; rows with no card are turned off.
-- ---------------------------------------------------------------------------
alter table public.allowance_schedules drop constraint allowance_schedules_auto_charge_provider_pair;
alter table public.parent_gifts drop constraint parent_gifts_auto_charge_provider_pair;

-- pa holds fake and razorpay (and a stripe customer without a saved card); pb holds razorpay and stripe.
insert into public.payment_customers (parent_id, provider, customer_ref) values (:'pa'::uuid, 'stripe', 'cus_nocard');

update public.allowance_schedules
set auto_charge = true, auto_charge_by = :'pb'::uuid, auto_charge_since = now(), auto_charge_provider = null
where id = :'s1'::uuid;
update public.allowance_schedules
set auto_charge = true, auto_charge_by = :'pa'::uuid, auto_charge_since = now(), auto_charge_provider = null
where id = :'s2'::uuid;
update public.parent_gifts
set auto_charge = true, auto_charge_by = :'pa'::uuid, auto_charge_since = now(), auto_charge_provider = null
where id = :'g1'::uuid;

update public.allowance_schedules s
set auto_charge_provider = (
  select pc.provider from public.payment_customers pc
  where pc.parent_id = s.auto_charge_by and pc.method_ref is not null
  order by pc.provider <> 'stripe', pc.provider
  limit 1)
where s.auto_charge;
update public.allowance_schedules
set auto_charge = false, auto_charge_by = null, auto_charge_since = null
where auto_charge and auto_charge_provider is null;
update public.parent_gifts g
set auto_charge_provider = (
  select pc.provider from public.payment_customers pc
  where pc.parent_id = g.auto_charge_by and pc.method_ref is not null
  order by pc.provider <> 'stripe', pc.provider
  limit 1)
where g.auto_charge;
update public.parent_gifts
set auto_charge = false, auto_charge_by = null, auto_charge_since = null
where auto_charge and auto_charge_provider is null;

select is(
  (select auto_charge_provider from public.allowance_schedules where id = :'s1'::uuid),
  'stripe', 'backfill prefers the Stripe card');
select is(
  (select auto_charge_provider from public.allowance_schedules where id = :'s2'::uuid),
  'fake', 'backfill otherwise takes the first provider by name');
select is(
  (select auto_charge_provider from public.parent_gifts where id = :'g1'::uuid),
  'fake', 'backfill covers gifts');

delete from public.payment_customers where parent_id = :'pa'::uuid;
update public.parent_gifts
set auto_charge = true, auto_charge_by = :'pa'::uuid, auto_charge_since = now(), auto_charge_provider = null
where id = :'g1'::uuid;
update public.parent_gifts g
set auto_charge_provider = (
  select pc.provider from public.payment_customers pc
  where pc.parent_id = g.auto_charge_by and pc.method_ref is not null
  order by pc.provider <> 'stripe', pc.provider
  limit 1)
where g.auto_charge;
update public.parent_gifts
set auto_charge = false, auto_charge_by = null, auto_charge_since = null
where auto_charge and auto_charge_provider is null;
select is(
  (select auto_charge::text || ':' || coalesce(auto_charge_by::text, 'null') || ':' || coalesce(auto_charge_since::text, 'null') || ':' || coalesce(auto_charge_provider, 'null')
   from public.parent_gifts where id = :'g1'::uuid),
  'false:null:null:null', 'backfill turns off a toggle whose payer has no saved card');

select * from finish();
rollback;
