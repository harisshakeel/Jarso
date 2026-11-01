begin;
\ir _helpers.psql
select plan(81);

select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('pc@example.com') as pc \gset
select tests.create_user('pd@example.com') as pd \gset
select tests.create_user('c1@example.com', 'child') as c1 \gset
select tests.create_user('c2@example.com', 'child') as c2 \gset

select tests.authenticate_as(:'pb'::uuid);
select public.create_family('GBP', 'UTC') as fb \gset
select public.register_child(:'c2'::uuid, :'fb'::uuid, 'Ana', '1234', true);

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select tests.clear_auth();

-- pc and pd are second parents in family A.
insert into public.family_members (family_id, profile_id, role, status)
values (:'fa'::uuid, :'pc'::uuid, 'parent', 'approved'), (:'fa'::uuid, :'pd'::uuid, 'parent', 'approved');

select (now() at time zone 'UTC')::date as today \gset

-- Anchor far in the future so the generator never adds rows; occurrences are inserted by hand.
insert into public.allowance_schedules (family_id, child_id, amount_minor, frequency, anchor_on)
values (:'fa'::uuid, :'c1'::uuid, 500, 'weekly', date '2030-01-01')
returning id as s1 \gset
insert into public.allowance_schedules (family_id, child_id, amount_minor, frequency, anchor_on)
values (:'fb'::uuid, :'c2'::uuid, 500, 'weekly', date '2030-01-01')
returning id as s2 \gset

insert into public.allowance_occurrences (schedule_id, family_id, child_id, period_key, due_on, amount_minor)
values
  (:'s1'::uuid, :'fa'::uuid, :'c1'::uuid, 'o1', :'today'::date - 30, 500),
  (:'s1'::uuid, :'fa'::uuid, :'c1'::uuid, 'o2', :'today'::date - 29, 500),
  (:'s1'::uuid, :'fa'::uuid, :'c1'::uuid, 'o3', :'today'::date - 28, 500),
  (:'s1'::uuid, :'fa'::uuid, :'c1'::uuid, 'o4', :'today'::date - 27, 500),
  (:'s1'::uuid, :'fa'::uuid, :'c1'::uuid, 'o5', :'today'::date - 26, 500),
  (:'s1'::uuid, :'fa'::uuid, :'c1'::uuid, 'o6', :'today'::date - 25, 500),
  (:'s1'::uuid, :'fa'::uuid, :'c1'::uuid, 'o7', :'today'::date - 1, 500),
  (:'s1'::uuid, :'fa'::uuid, :'c1'::uuid, 'o8', :'today'::date, 500),
  (:'s2'::uuid, :'fb'::uuid, :'c2'::uuid, 'o9', :'today'::date, 500);
select id as o1 from public.allowance_occurrences where period_key = 'o1' \gset
select id as o2 from public.allowance_occurrences where period_key = 'o2' \gset
select id as o3 from public.allowance_occurrences where period_key = 'o3' \gset
select id as o4 from public.allowance_occurrences where period_key = 'o4' \gset
select id as o5 from public.allowance_occurrences where period_key = 'o5' \gset
select id as o6 from public.allowance_occurrences where period_key = 'o6' \gset
select id as o7 from public.allowance_occurrences where period_key = 'o7' \gset
select id as o8 from public.allowance_occurrences where period_key = 'o8' \gset
select id as o9 from public.allowance_occurrences where period_key = 'o9' \gset

insert into public.parent_gifts (family_id, child_id, amount_minor, give_on, note, created_by, idempotency_key)
values (:'fa'::uuid, :'c1'::uuid, 1000, :'today'::date, 'Well done', :'pa'::uuid, gen_random_uuid())
returning id as g1 \gset
insert into public.parent_gifts (family_id, child_id, amount_minor, give_on, created_by, idempotency_key)
values (:'fa'::uuid, :'c1'::uuid, 700, :'today'::date, :'pa'::uuid, gen_random_uuid())
returning id as g2 \gset
insert into public.parent_gifts (family_id, child_id, amount_minor, give_on, created_by, idempotency_key)
values (:'fa'::uuid, :'c1'::uuid, 900, :'today'::date + 3, :'pa'::uuid, gen_random_uuid())
returning id as g3 \gset

-- ---------------------------------------------------------------------------
-- apply_payment: an occurrence paid by card
-- ---------------------------------------------------------------------------
insert into public.payments (family_id, child_id, payer_id, provider, source_type, source_id,
  amount_minor, currency, cash_minor, saved_minor, trigger, status, expires_at)
values (:'fa'::uuid, :'c1'::uuid, :'pa'::uuid, 'fake', 'occurrence', :'o1'::uuid,
  500, 'GBP', 300, 200, 'manual', 'pending', now() + interval '30 minutes')
returning id as p1 \gset

set local role service_role;
select is(public.apply_payment(:'p1'::uuid), 'confirmed', 'apply_payment on a due occurrence confirms');
reset role;
select is(tests.holds_ledger_lock(:'c1'::uuid), true, 'apply_payment takes the child''s ledger advisory lock');
select is(
  (select count(*)::int from public.ledger_entries where source_id = :'o1'::uuid and method = 'card'),
  2, 'two card ledger rows');
select is(
  (select string_agg(jar || ':' || amount_minor || ':' || label || ':' || idempotency_key, ',' order by jar)
   from public.ledger_entries where source_id = :'o1'::uuid),
  format('save:200:Allowance:occurrence:%s:save,spend:300:Allowance:occurrence:%s:spend', :'o1', :'o1'),
  'ledger rows use the handover keys, split and label');
select is(
  (select bool_and(created_by = :'pa'::uuid) from public.ledger_entries where source_id = :'o1'::uuid),
  true, 'ledger rows are created by the payer');
select is(
  (select status || ':' || confirmed_by::text || ':' || cash_minor || ':' || saved_minor || ':' || shortfall_minor
   from public.allowance_occurrences where id = :'o1'::uuid),
  format('confirmed:%s:300:200:0', :'pa'), 'occurrence confirmed by the payer with the split');
select is((select status from public.payments where id = :'p1'::uuid), 'succeeded', 'payment succeeded');
set local role service_role;
select is(public.apply_payment(:'p1'::uuid), 'already_applied', 'a second apply is already_applied');
reset role;
select is(
  (select count(*)::int from public.ledger_entries where source_id = :'o1'::uuid),
  2, 'still two ledger rows');

-- ---------------------------------------------------------------------------
-- Cash first, then the card
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'pa'::uuid);
select is(public.confirm_handover(:'o2'::uuid, 500, 0, 'cash-o2'), 'confirmed', 'cash handover confirms');
select tests.clear_auth();
insert into public.payments (family_id, child_id, payer_id, provider, source_type, source_id,
  amount_minor, currency, cash_minor, saved_minor, status)
values (:'fa'::uuid, :'c1'::uuid, :'pa'::uuid, 'fake', 'occurrence', :'o2'::uuid, 500, 'GBP', 500, 0, 'pending')
returning id as p2 \gset
set local role service_role;
select is(public.apply_payment(:'p2'::uuid), 'already_confirmed', 'card after cash is already_confirmed');
reset role;
select is((select status from public.payments where id = :'p2'::uuid), 'succeeded_unapplied', 'card after cash is succeeded_unapplied');
select is(
  (select count(*)::int from public.ledger_entries where source_id = :'o2'::uuid and method = 'card'),
  0, 'no card ledger rows after cash');
select is(
  (select count(*)::int from public.ledger_entries where source_id = :'o2'::uuid and method = 'cash'),
  1, 'the cash row is method cash');

-- ---------------------------------------------------------------------------
-- Guards while a card payment is in progress
-- ---------------------------------------------------------------------------
insert into public.payments (family_id, child_id, payer_id, provider, source_type, source_id,
  amount_minor, currency, cash_minor, saved_minor, status, expires_at)
values (:'fa'::uuid, :'c1'::uuid, :'pa'::uuid, 'fake', 'parent_gift', :'g1'::uuid, 1000, 'GBP', 600, 400, 'pending',
  now() + interval '30 minutes')
returning id as pg1 \gset
insert into public.payments (family_id, child_id, payer_id, provider, source_type, source_id,
  amount_minor, currency, cash_minor, saved_minor, status, expires_at)
values (:'fa'::uuid, :'c1'::uuid, :'pa'::uuid, 'fake', 'occurrence', :'o3'::uuid, 500, 'GBP', 500, 0, 'requires_action',
  now() + interval '30 minutes')
returning id as p3 \gset

select tests.authenticate_as(:'pa'::uuid);
select throws_ok(
  format($$select public.update_gift(%L, 1200, %L, null)$$, :'g1', :'today'),
  'JA409', 'A card payment is in progress', 'update_gift is blocked while a card payment is pending');
select throws_ok(
  format($$select public.cancel_gift(%L)$$, :'g1'),
  'JA409', 'A card payment is in progress', 'cancel_gift is blocked while a card payment is pending');
select throws_ok(
  format($$select public.mark_not_given(%L)$$, :'o3'),
  'JA409', 'A card payment is in progress', 'mark_not_given is blocked while a card payment needs action');
select is(public.update_gift(:'g2'::uuid, 800, :'today'::date, null), :'g2'::uuid, 'update_gift still works without a payment');
select tests.clear_auth();

-- The gift payment applies with the gift's label.
set local role service_role;
select is(public.apply_payment(:'pg1'::uuid), 'confirmed', 'apply_payment on a due gift confirms');
reset role;
select is(
  (select string_agg(jar || ':' || amount_minor || ':' || label || ':' || kind || ':' || method, ',' order by jar)
   from public.ledger_entries where source_id = :'g1'::uuid),
  'save:400:Well done:parent_gift_in:card,spend:600:Well done:parent_gift_in:card',
  'gift ledger rows carry the note as label and method card');
select is(
  (select status || ':' || given_by::text from public.parent_gifts where id = :'g1'::uuid),
  format('given:%s', :'pa'), 'gift given by the payer');

-- Expired payment releases the guard; a late success then finds the occurrence closed.
set local role service_role;
select lives_ok(format($$select public.fail_payment(%L, 'expired', null)$$, :'p3'), 'fail_payment expires a payment');
reset role;
select tests.authenticate_as(:'pa'::uuid);
select is(public.mark_not_given(:'o3'::uuid), 'closed', 'mark_not_given works once the payment has expired');
select tests.clear_auth();
insert into public.payments (family_id, child_id, payer_id, provider, source_type, source_id,
  amount_minor, currency, cash_minor, saved_minor, status)
values (:'fa'::uuid, :'c1'::uuid, :'pa'::uuid, 'fake', 'occurrence', :'o3'::uuid, 500, 'GBP', 500, 0, 'pending')
returning id as p3b \gset
set local role service_role;
select is(public.apply_payment(:'p3b'::uuid), 'not_given', 'card on a closed occurrence is not_given');
reset role;
select is((select status from public.payments where id = :'p3b'::uuid), 'succeeded_unapplied', 'not_given is succeeded_unapplied');

-- Cancelled gift.
update public.parent_gifts set status = 'cancelled' where id = :'g2'::uuid;
insert into public.payments (family_id, child_id, payer_id, provider, source_type, source_id,
  amount_minor, currency, cash_minor, saved_minor, status)
values (:'fa'::uuid, :'c1'::uuid, :'pa'::uuid, 'fake', 'parent_gift', :'g2'::uuid, 800, 'GBP', 800, 0, 'pending')
returning id as pg2 \gset
set local role service_role;
select is(public.apply_payment(:'pg2'::uuid), 'cancelled', 'card on a cancelled gift is cancelled');
reset role;
select is((select status from public.payments where id = :'pg2'::uuid), 'succeeded_unapplied', 'cancelled is succeeded_unapplied');

-- ---------------------------------------------------------------------------
-- Amount changed
-- ---------------------------------------------------------------------------
insert into public.payments (family_id, child_id, payer_id, provider, source_type, source_id,
  amount_minor, currency, cash_minor, saved_minor, status)
values (:'fa'::uuid, :'c1'::uuid, :'pa'::uuid, 'fake', 'occurrence', :'o4'::uuid, 400, 'GBP', 400, 0, 'pending')
returning id as p4 \gset
set local role service_role;
select is(public.apply_payment(:'p4'::uuid), 'amount_changed', 'a payment for a different amount is amount_changed');
reset role;
select is((select status from public.payments where id = :'p4'::uuid), 'succeeded_unapplied', 'amount_changed is succeeded_unapplied');
select is((select status from public.allowance_occurrences where id = :'o4'::uuid), 'due', 'occurrence stays due');
select is((select count(*)::int from public.ledger_entries where source_id = :'o4'::uuid), 0, 'amount_changed posts nothing');

-- ---------------------------------------------------------------------------
-- Payer removed from the family before the webhook
-- ---------------------------------------------------------------------------
insert into public.payments (family_id, child_id, payer_id, provider, source_type, source_id,
  amount_minor, currency, cash_minor, saved_minor, status)
values (:'fa'::uuid, :'c1'::uuid, :'pc'::uuid, 'fake', 'occurrence', :'o5'::uuid, 500, 'GBP', 0, 500, 'pending')
returning id as p5 \gset
update public.family_members set status = 'removed' where profile_id = :'pc'::uuid;
set local role service_role;
select is(public.apply_payment(:'p5'::uuid), 'confirmed', 'a removed payer''s captured payment still confirms');
reset role;
select is((select confirmed_by from public.allowance_occurrences where id = :'o5'::uuid), :'pc'::uuid, 'confirmed_by is the payer');

-- ---------------------------------------------------------------------------
-- Unique indexes
-- ---------------------------------------------------------------------------
insert into public.payments (family_id, child_id, payer_id, provider, source_type, source_id,
  amount_minor, currency, cash_minor, saved_minor, trigger, status)
values (:'fa'::uuid, :'c1'::uuid, :'pa'::uuid, 'fake', 'occurrence', :'o6'::uuid, 500, 'GBP', 500, 0, 'auto', 'failed');
select throws_like(
  format($$insert into public.payments (family_id, child_id, payer_id, provider, source_type, source_id,
    amount_minor, currency, cash_minor, saved_minor, trigger, status)
    values (%L, %L, %L, 'fake', 'occurrence', %L, 500, 'GBP', 500, 0, 'auto', 'pending')$$,
    :'fa', :'c1', :'pa', :'o6'),
  '%payments_one_auto_per_source%', 'a second auto payment for the same source is refused');
insert into public.payments (family_id, child_id, payer_id, provider, source_type, source_id,
  amount_minor, currency, cash_minor, saved_minor, status)
values (:'fa'::uuid, :'c1'::uuid, :'pa'::uuid, 'fake', 'occurrence', :'o6'::uuid, 500, 'GBP', 500, 0, 'pending');
select throws_like(
  format($$insert into public.payments (family_id, child_id, payer_id, provider, source_type, source_id,
    amount_minor, currency, cash_minor, saved_minor, status)
    values (%L, %L, %L, 'fake', 'occurrence', %L, 500, 'GBP', 500, 0, 'pending')$$,
    :'fa', :'c1', :'pa', :'o6'),
  '%payments_one_live_per_source%', 'a second live payment for the same source is refused');
select throws_like(
  format($$insert into public.payments (family_id, child_id, payer_id, provider, source_type, source_id,
    amount_minor, currency, cash_minor, saved_minor, status)
    values (%L, %L, %L, 'fake', 'occurrence', %L, 500, 'GBP', 300, 100, 'failed')$$,
    :'fa', :'c1', :'pa', :'o6'),
  '%payments_split_check%', 'cash + saved must equal the amount');

-- ---------------------------------------------------------------------------
-- set_auto_charge / arm_auto_charge
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'pa'::uuid);
select throws_ok(
  format($$select public.set_auto_charge('allowance_schedule', %L, true, 'fake')$$, :'s1'),
  'JA409', 'Save a card first', 'auto charge needs a saved card');
select tests.clear_auth();
insert into public.payment_customers (parent_id, provider, customer_ref, method_ref, card_brand, card_last4)
values (:'pa'::uuid, 'fake', 'cus_a', 'pm_a', 'visa', '4242');
select tests.authenticate_as(:'pa'::uuid);
select lives_ok(
  format($$select public.set_auto_charge('allowance_schedule', %L, true, 'fake')$$, :'s1'),
  'parent with a card turns auto charge on');
select is(
  (select auto_charge::text || ':' || auto_charge_by::text || ':' || (auto_charge_since = now())::text
   from public.allowance_schedules where id = :'s1'::uuid),
  format('true:%s:true', :'pa'), 'auto charge on records who and since when');
select tests.authenticate_as(:'c1'::uuid);
select throws_ok(
  format($$select public.set_auto_charge('allowance_schedule', %L, false, 'fake')$$, :'s1'),
  'JA403', null, 'the child cannot change auto charge');
select tests.authenticate_as(:'pb'::uuid);
select throws_ok(
  format($$select public.set_auto_charge('allowance_schedule', %L, false, 'fake')$$, :'s1'),
  'JA403', null, 'another family''s parent cannot change auto charge');
select throws_ok(
  format($$select public.arm_auto_charge(%L, 'allowance_schedule', %L, 'fake')$$, :'pa', :'s1'),
  '42501', null, 'authenticated cannot execute arm_auto_charge');
select tests.clear_auth();

set local role service_role;
select lives_ok(
  format($$select public.arm_auto_charge(%L, 'parent_gift', %L, 'fake')$$, :'pa', :'g3'),
  'arm_auto_charge turns auto charge on for the parent');
select throws_ok(
  format($$select public.arm_auto_charge(%L, 'allowance_schedule', %L, 'fake')$$, :'pb', :'s1'),
  'JA403', null, 'arm_auto_charge refuses a parent of another family');
select throws_ok(
  format($$select public.arm_auto_charge(%L, 'allowance_schedule', %L, 'fake')$$, :'pd', :'s1'),
  'JA409', 'Save a card first', 'arm_auto_charge refuses a parent without a card');
reset role;
select is(
  (select auto_charge::text || ':' || auto_charge_by::text from public.parent_gifts where id = :'g3'::uuid),
  format('true:%s', :'pa'), 'arm_auto_charge records the parent');

-- ---------------------------------------------------------------------------
-- due_auto_charges
-- ---------------------------------------------------------------------------
-- Family B: auto charge on since yesterday, but the payer has no saved method.
update public.allowance_schedules
set auto_charge = true, auto_charge_by = :'pb'::uuid, auto_charge_since = now() - interval '1 day', auto_charge_provider = 'fake'
where id = :'s2'::uuid;
insert into public.payment_customers (parent_id, provider, customer_ref)
values (:'pb'::uuid, 'fake', 'cus_b');

set local role service_role;
select is(
  (select string_agg(source_id::text, ',' order by source_id) from public.due_auto_charges(array['fake'])),
  :'o8', 'only the occurrence due on or after auto_charge_since is due (not o7, not family B without a card)');
select is(
  (select payer_id::text || ':' || amount_minor || ':' || currency || ':' || customer_ref || ':' || method_ref
   from public.due_auto_charges(array['fake']) where source_id = :'o8'::uuid),
  format('%s:500:GBP:cus_a:pm_a', :'pa'), 'due row carries the payer, amount and saved card');
select is(
  (select count(*)::int from public.due_auto_charges(array['stripe'])),
  0, 'nothing is due for a provider the payer has no card with');
reset role;

-- The gift becomes due on its give_on.
update public.parent_gifts set give_on = :'today'::date where id = :'g3'::uuid;
set local role service_role;
select is(
  (select count(*)::int from public.due_auto_charges(array['fake']) where source_id = :'g3'::uuid and source_type = 'parent_gift'),
  1, 'a due auto-charge gift is included');
reset role;

-- A live manual payment excludes the gift; an auto payment of any status excludes the occurrence.
insert into public.payments (family_id, child_id, payer_id, provider, source_type, source_id,
  amount_minor, currency, cash_minor, saved_minor, status)
values (:'fa'::uuid, :'c1'::uuid, :'pa'::uuid, 'fake', 'parent_gift', :'g3'::uuid, 900, 'GBP', 900, 0, 'pending');
insert into public.payments (family_id, child_id, payer_id, provider, source_type, source_id,
  amount_minor, currency, cash_minor, saved_minor, trigger, status)
values (:'fa'::uuid, :'c1'::uuid, :'pa'::uuid, 'fake', 'occurrence', :'o8'::uuid, 500, 'GBP', 500, 0, 'auto', 'failed');
update public.payment_customers set method_ref = 'pm_b' where parent_id = :'pb'::uuid;
set local role service_role;
select is(
  (select string_agg(source_id::text, ',' order by source_id) from public.due_auto_charges(array['fake'])),
  :'o9', 'auto and live payments exclude their sources; a saved card includes family B');
reset role;

-- ---------------------------------------------------------------------------
-- fail_payment
-- ---------------------------------------------------------------------------
insert into public.payments (family_id, child_id, payer_id, provider, source_type, source_id,
  amount_minor, currency, cash_minor, saved_minor, trigger, status)
values (:'fa'::uuid, :'c1'::uuid, :'pa'::uuid, 'fake', 'occurrence', :'o7'::uuid, 500, 'GBP', 500, 0, 'auto', 'pending')
returning id as pf1 \gset
insert into public.payments (family_id, child_id, payer_id, provider, source_type, source_id,
  amount_minor, currency, cash_minor, saved_minor, status)
values (:'fa'::uuid, :'c1'::uuid, :'pa'::uuid, 'fake', 'occurrence', :'o8'::uuid, 500, 'GBP', 500, 0, 'pending')
returning id as pm1 \gset

set local role service_role;
select public.fail_payment(:'pf1'::uuid, 'failed', 'declined');
select public.fail_payment(:'pm1'::uuid, 'failed', 'declined');
select public.fail_payment(:'p1'::uuid, 'failed', 'declined');
select throws_ok(
  format($$select public.fail_payment(%L, 'succeeded', null)$$, :'pm1'),
  '22023', null, 'fail_payment only moves to failed, expired or canceled');
reset role;
select is(
  (select status || ':' || failure_code from public.payments where id = :'pf1'::uuid),
  'failed:declined', 'auto payment failed with its code');
select is(
  (select count(*)::int from public.notifications
   where kind = 'card_charge_failed' and source_type = 'payment' and source_id = :'pf1'::uuid and recipient_id = :'pa'::uuid),
  1, 'a failed auto charge notifies the payer');
select is(
  (select count(*)::int from public.notifications where kind = 'card_charge_failed' and source_id = :'pm1'::uuid),
  0, 'a failed manual payment does not notify');
select is((select status from public.payments where id = :'p1'::uuid), 'succeeded', 'fail_payment never moves a succeeded payment back');

-- Expired auto charges notify like failed ones; expired manual and canceled auto do not.
insert into public.payments (family_id, child_id, payer_id, provider, source_type, source_id,
  amount_minor, currency, cash_minor, saved_minor, trigger, status)
values (:'fa'::uuid, :'c1'::uuid, :'pa'::uuid, 'fake', 'occurrence', gen_random_uuid(), 500, 'GBP', 500, 0, 'auto', 'pending')
returning id as pe1 \gset
insert into public.payments (family_id, child_id, payer_id, provider, source_type, source_id,
  amount_minor, currency, cash_minor, saved_minor, status)
values (:'fa'::uuid, :'c1'::uuid, :'pa'::uuid, 'fake', 'occurrence', gen_random_uuid(), 500, 'GBP', 500, 0, 'pending')
returning id as pe2 \gset
insert into public.payments (family_id, child_id, payer_id, provider, source_type, source_id,
  amount_minor, currency, cash_minor, saved_minor, trigger, status)
values (:'fa'::uuid, :'c1'::uuid, :'pa'::uuid, 'fake', 'occurrence', gen_random_uuid(), 500, 'GBP', 500, 0, 'auto', 'pending')
returning id as pc1 \gset

set local role service_role;
select public.fail_payment(:'pe1'::uuid, 'expired', null);
select public.fail_payment(:'pe2'::uuid, 'expired', null);
select public.fail_payment(:'pc1'::uuid, 'canceled', null);
reset role;
select is(
  (select count(*)::int from public.notifications
   where kind = 'card_charge_failed' and source_type = 'payment' and source_id = :'pe1'::uuid and recipient_id = :'pa'::uuid),
  1, 'an expired auto charge notifies the payer once');
select is(
  (select count(*)::int from public.notifications where kind = 'card_charge_failed' and source_id = :'pe2'::uuid),
  0, 'an expired manual payment does not notify');
select is(
  (select count(*)::int from public.notifications where kind = 'card_charge_failed' and source_id = :'pc1'::uuid),
  0, 'a canceled auto charge does not notify');

-- ---------------------------------------------------------------------------
-- set_auto_charge off and clear_auto_charge_by
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'pa'::uuid);
select public.set_auto_charge('allowance_schedule', :'s1'::uuid, false, 'fake');
select tests.clear_auth();
select is(
  (select auto_charge::text || ':' || coalesce(auto_charge_by::text, 'null') || ':' || coalesce(auto_charge_since::text, 'null')
   from public.allowance_schedules where id = :'s1'::uuid),
  'false:null:null', 'auto charge off clears all three columns');
set local role service_role;
select public.clear_auto_charge_by(:'pa'::uuid, 'fake');
reset role;
select is(
  (select auto_charge from public.parent_gifts where id = :'g3'::uuid),
  false, 'clear_auto_charge_by turns off every toggle the parent set');
select is(
  (select auto_charge from public.allowance_schedules where id = :'s2'::uuid),
  true, 'clear_auto_charge_by leaves other parents'' toggles');

-- ---------------------------------------------------------------------------
-- A late success on a failed attempt still posts and cancels the newer live attempt
-- ---------------------------------------------------------------------------
insert into public.allowance_occurrences (schedule_id, family_id, child_id, period_key, due_on, amount_minor)
values (:'s1'::uuid, :'fa'::uuid, :'c1'::uuid, 'o10', :'today'::date - 20, 500)
returning id as o10 \gset
insert into public.payments (family_id, child_id, payer_id, provider, source_type, source_id,
  amount_minor, currency, cash_minor, saved_minor, status, failure_code)
values (:'fa'::uuid, :'c1'::uuid, :'pa'::uuid, 'fake', 'occurrence', :'o10'::uuid, 500, 'GBP', 500, 0, 'failed', 'declined')
returning id as pla \gset
insert into public.payments (family_id, child_id, payer_id, provider, source_type, source_id,
  amount_minor, currency, cash_minor, saved_minor, status, expires_at)
values (:'fa'::uuid, :'c1'::uuid, :'pa'::uuid, 'fake', 'occurrence', :'o10'::uuid, 500, 'GBP', 200, 300, 'pending',
  now() + interval '30 minutes')
returning id as plb \gset

set local role service_role;
select is(public.apply_payment(:'pla'::uuid), 'confirmed', 'a success after a failed attempt still confirms');
reset role;
select is(
  (select string_agg(id::text || ':' || status, ',' order by status) from public.payments where id in (:'pla'::uuid, :'plb'::uuid)),
  format('%s:canceled,%s:succeeded', :'plb', :'pla'),
  'the late success is succeeded and the newer live attempt is canceled');
select is(
  (select count(*)::int from public.ledger_entries where source_id = :'o10'::uuid and method = 'card'),
  1, 'the late success posts its own split (cash only)');
set local role service_role;
select is(public.apply_payment(:'plb'::uuid), 'already_confirmed', 'the canceled attempt completing later is already_confirmed');
reset role;
select is((select status from public.payments where id = :'plb'::uuid), 'succeeded_unapplied', 'it becomes succeeded_unapplied');
select is(
  (select count(*)::int from public.ledger_entries where source_id = :'o10'::uuid),
  1, 'no extra ledger rows for the source');

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
insert into public.payment_setups (parent_id, provider, arm_type, arm_id)
values (:'pa'::uuid, 'fake', 'allowance_schedule', :'s1'::uuid);
insert into public.payment_webhook_events (provider, event_id) values ('fake', 'evt_1');

select tests.authenticate_as(:'c1'::uuid);
select is((select count(*)::int from public.payments), 0, 'the child sees no payments');
select is((select count(*)::int from public.payment_customers), 0, 'the child sees no payment customers');
select is((select count(*)::int from public.payment_setups), 0, 'the child sees no payment setups');
select is(
  (select method from public.list_ledger_history(:'c1'::uuid) where source_id = :'o1'::uuid limit 1),
  'card', 'list_ledger_history returns method card for the child');
select is(
  (select method from public.list_ledger_history(:'c1'::uuid) where source_id = :'o2'::uuid limit 1),
  'cash', 'list_ledger_history returns method cash for a cash handover');

select tests.authenticate_as(:'pa'::uuid);
select is(
  (select count(*)::int from public.payments where id = :'p1'::uuid),
  1, 'the parent sees their child''s payment');
select is((select count(*)::int from public.payment_customers), 1, 'the parent sees their own payment customer');
select is((select count(*)::int from public.payment_setups), 1, 'the parent sees their own payment setup');
select throws_ok($$select count(*) from public.payment_webhook_events$$, '42501', null, 'webhook events are never readable by users');
select throws_ok(
  format($$select public.apply_payment(%L)$$, :'p1'),
  '42501', null, 'authenticated cannot execute apply_payment');
select throws_ok(
  format($$update public.payments set status = 'succeeded' where id = %L$$, :'pm1'),
  '42501', null, 'authenticated cannot update payments');
select throws_ok(
  $$select * from public.due_auto_charges(array['fake'])$$,
  '42501', null, 'authenticated cannot execute due_auto_charges');

select tests.authenticate_as(:'pb'::uuid);
select is((select count(*)::int from public.payments), 0, 'another family''s parent sees none of these payments');
select tests.clear_auth();

select * from finish();
rollback;
