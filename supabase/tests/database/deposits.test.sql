begin;
\ir _helpers.psql
select plan(54);

-- Fixtures: PA owns family A with C1..C5; PB owns family B (outsider).
select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('c1@example.com', 'child') as c1 \gset
select tests.create_user('c2@example.com', 'child') as c2 \gset
select tests.create_user('c3@example.com', 'child') as c3 \gset
select tests.create_user('c4@example.com', 'child') as c4 \gset
select tests.create_user('c5@example.com', 'child') as c5 \gset

select tests.authenticate_as(:'pb'::uuid);
select public.create_family('GBP', 'UTC') as fb \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select public.register_child(:'c2'::uuid, :'fa'::uuid, 'Max', '1234', true);
select public.register_child(:'c3'::uuid, :'fa'::uuid, 'Kit', '1234', true);
select public.register_child(:'c4'::uuid, :'fa'::uuid, 'Zed', '1234', true);
select public.register_child(:'c5'::uuid, :'fa'::uuid, 'Eve', '1234', true);
select public.set_money_rule(:'c3'::uuid, 'deposit_auto_confirm', 'week', 300);
select public.set_money_rule(:'c4'::uuid, 'deposit_auto_confirm', 'week', 300);
select public.set_money_rule(:'c4'::uuid, 'deposit_auto_confirm', 'item', 100);
select tests.clear_auth();

-- Spend seeds: C1 1000, C2 500, C3 1000, C4 1000, C5 400.
insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, source_type, idempotency_key, created_by, occurred_at)
select :'fa'::uuid, s.c, 'spend', 'allowance_in', 'in', s.amt, 'Allowance', 'occurrence', 'seed:' || s.c::text, :'pa'::uuid, '2025-01-01'
from (values (:'c1'::uuid, 1000), (:'c2'::uuid, 500), (:'c3'::uuid, 1000), (:'c4'::uuid, 1000), (:'c5'::uuid, 400)) s(c, amt);

insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, source_type, idempotency_key, created_by, occurred_at)
values (:'fa'::uuid, :'c1'::uuid, 'save', 'allowance_in', 'in', 100, 'Allowance', 'occurrence', 'seed:save:c1', :'pa'::uuid, '2025-01-01');

-- ---------------------------------------------------------------------------
-- Basic flow (C1)
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c1'::uuid);
select public.create_deposit(:'c1'::uuid, 500, 'd1')::text as r1 \gset
select is((:'r1'::jsonb)->>'status', 'pending', 'a deposit within Spend is pending');
select ((:'r1'::jsonb)->>'request_id')::uuid as d1 \gset
select is(public.held_spend(:'c1'::uuid), 500::bigint, 'held_spend 500');
select is(public.available_spend(:'c1'::uuid), 500::bigint, 'available_spend 500');

select tests.clear_auth();
select is(
  (select count(*)::int from public.notifications where child_id = :'c1'::uuid and kind = 'deposit_requested' and recipient_id = :'pa'::uuid),
  1, 'one parent notice');
select is(
  (select payload from public.notifications where child_id = :'c1'::uuid and kind = 'deposit_requested'),
  '{"amount_minor": 500}'::jsonb, 'notice payload has the amount only');
select is(
  (select source_type || ':' || (source_id = :'d1'::uuid)::text || ':' || coalesce(window_key, 'null') from public.notifications where child_id = :'c1'::uuid and kind = 'deposit_requested'),
  'request:true:null', 'notice source is the request, no window key');
select is((select count(*)::int from public.ledger_entries where child_id = :'c1'::uuid and source_type = 'request'), 0, 'pending posts nothing');

select tests.authenticate_as(:'c1'::uuid);
select public.create_deposit(:'c1'::uuid, 500, 'd1')::text as r1b \gset
select is((:'r1b'::jsonb)->>'request_id', :'d1', 'same key returns the same request (double tap)');
select tests.clear_auth();
select is((select count(*)::int from public.requests where child_id = :'c1'::uuid), 1, 'double tap adds no second request');
select is(
  (select count(*)::int from public.notifications where child_id = :'c1'::uuid and kind = 'deposit_requested'),
  1, 'double tap adds no second notice');

select tests.authenticate_as(:'c1'::uuid);
select is(public.create_deposit(:'c1'::uuid, 600, 'd2'), '{"status": "over_available", "available_minor": 500}'::jsonb, 'over available is a status');
select is((select count(*)::int from public.requests where child_id = :'c1'::uuid), 1, 'a refused deposit is not stored');

select throws_ok(format($$select public.create_deposit(%L, 0, 'kz')$$, :'c1'), '22023', null, 'amount 0 rejected');
select throws_ok(format($$select public.create_deposit(%L, 100000000001, 'kz')$$, :'c1'), '22023', null, 'amount over the max rejected');
select throws_ok(format($$select public.create_deposit(%L, 100, '  ')$$, :'c1'), '22023', null, 'blank key rejected');
select throws_ok(format($$select public.create_deposit(%L, 100, %L)$$, :'c1', repeat('k', 201)), '22023', null, 'key over 200 rejected');
select throws_ok(format($$select public.create_deposit(%L, 100, 'kz')$$, :'c2'), 'JA403', null, 'a sibling cannot deposit for another child');

select public.create_withdrawal(:'c1'::uuid, 1, null, 'wkey') is not null as ok \gset
select throws_ok(format($$select public.create_deposit(%L, 100, 'wkey')$$, :'c1'), 'JA409', null, 'a key used by a withdrawal is a conflict');

select tests.authenticate_as(:'pa'::uuid);
select throws_ok(format($$select public.create_deposit(%L, 100, 'kz')$$, :'c1'), 'JA403', null, 'a parent cannot create a deposit');
select throws_ok(format($$select public.post_request(%L, %L)$$, :'d1', :'pa'), '42501', null, 'post_request is not granted');
select tests.clear_auth();
set local role anon;
select throws_ok(format($$select public.create_deposit(%L, 100, 'kz')$$, :'c1'), '42501', null, 'anon cannot create a deposit');
reset role;

-- ---------------------------------------------------------------------------
-- Pending deposit then a purchase (C2: Spend 500, deposit 500, free 0)
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c2'::uuid);
select public.create_deposit(:'c2'::uuid, 500, 'd1')::text as r2 \gset
select ((:'r2'::jsonb)->>'request_id')::uuid as d2 \gset
select is(public.record_purchase(:'c2'::uuid, 300, null, 'p1'), '{"status": "not_enough_spend", "free_minor": 0}'::jsonb, 'purchase refused, overspend off');
select tests.authenticate_as(:'pa'::uuid);
select public.set_allow_negative_spend(:'c2'::uuid, true);
select tests.authenticate_as(:'c2'::uuid);
select is((public.record_purchase(:'c2'::uuid, 300, null, 'p2'))->>'status', 'not_enough_spend', 'purchase refused, overspend on (Spend would drop below held)');

select tests.authenticate_as(:'pa'::uuid);
select is(public.complete_request(:'d2'::uuid, 'x1'), 'completed', 'the parent can still confirm the deposit');
select is((select status from public.requests where id = :'d2'::uuid), 'confirmed', 'status confirmed');
select is(
  (select kind || ':' || jar || ':' || direction || ':' || amount_minor || ':' || label || ':' || idempotency_key from public.ledger_entries where child_id = :'c2'::uuid and kind = 'deposit_out'),
  'deposit_out:spend:out:500:Put into Save:request:' || :'d2' || ':out', 'deposit_out row');
select is(
  (select kind || ':' || jar || ':' || direction || ':' || amount_minor || ':' || label || ':' || idempotency_key from public.ledger_entries where child_id = :'c2'::uuid and kind = 'deposit_in'),
  'deposit_in:save:in:500:Put into Save:request:' || :'d2' || ':in', 'deposit_in row');
select is(
  (select (completed_by = :'pa'::uuid)::text || ':' || (completed_at is not null)::text from public.requests where id = :'d2'::uuid),
  'true:true', 'completed_by and completed_at set');
select is(public.held_spend(:'c2'::uuid), 0::bigint, 'hold released after confirm');
select is(public.balance(:'c2'::uuid, 'save', 'recorded'), 500::bigint, 'Save has the deposit');

select is(public.complete_request(:'d2'::uuid, 'x2'), 'already_completed', 'confirm twice is already_completed');
select is((select count(*)::int from public.ledger_entries where child_id = :'c2'::uuid and source_type = 'request'), 2, 'still two rows');
select is(public.decide_deposit(:'d2'::uuid, null), 'already_decided', 'a confirmed deposit cannot be rejected');

-- ---------------------------------------------------------------------------
-- Reject (C1)
-- ---------------------------------------------------------------------------

select is(public.decide_deposit(:'d1'::uuid, '  Not yet  '), 'rejected', 'parent rejects');
select is((select status || ':' || decision_note from public.requests where id = :'d1'::uuid), 'rejected:Not yet', 'rejected with a trimmed note');
select is((select count(*)::int from public.ledger_entries where child_id = :'c1'::uuid and source_type = 'request'), 0, 'reject posts nothing');
select is(public.held_spend(:'c1'::uuid), 0::bigint, 'reject releases the hold');
select tests.clear_auth();
select is(
  (select payload from public.notifications where child_id = :'c1'::uuid and kind = 'deposit_decided' and recipient_id = :'c1'::uuid),
  '{"amount_minor": 500, "approved": false}'::jsonb, 'child notice');
select tests.authenticate_as(:'pa'::uuid);
select is(public.decide_deposit(:'d1'::uuid, null), 'already_decided', 'second reject is already_decided');
select is(public.complete_request(:'d1'::uuid, 'x3'), 'not_approved', 'a rejected deposit cannot be confirmed');
select throws_ok(format($$select public.decide_deposit(%L, %L)$$, :'d1', repeat('x', 141)), '22023', null, 'note over 140 rejected');
select tests.authenticate_as(:'pb'::uuid);
select throws_ok(format($$select public.decide_deposit(%L, null)$$, :'d1'), 'JA403', null, 'another family''s parent cannot decide');
select tests.authenticate_as(:'c1'::uuid);
select throws_ok(format($$select public.decide_deposit(%L, null)$$, :'d1'), 'JA403', null, 'a child cannot decide');
select tests.authenticate_as(:'pa'::uuid);
select throws_ok(format($$select public.decide_deposit(%L, null)$$, '00000000-0000-0000-0000-000000000000'), 'JA403', null, 'a missing request is JA403');
select tests.authenticate_as(:'c1'::uuid);
select ((public.create_withdrawal(:'c1'::uuid, 10, null, 'w3'))->>'request_id')::uuid as w3 \gset
select tests.authenticate_as(:'pa'::uuid);
select throws_ok(format($$select public.decide_deposit(%L, null)$$, :'w3'), '22023', null, 'decide_deposit refuses a withdrawal');

-- ---------------------------------------------------------------------------
-- Confirm re-checks Spend (C5: Spend 400, deposit 400, then Spend drops)
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c5'::uuid);
select ((public.create_deposit(:'c5'::uuid, 400, 'd1'))->>'request_id')::uuid as d5 \gset
select tests.clear_auth();
insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, source_type, idempotency_key, created_by)
values (:'fa'::uuid, :'c5'::uuid, 'spend', 'purchase', 'out', 200, 'Sneaky', 'diary', 'seed:c5:out', :'c5'::uuid);
select tests.authenticate_as(:'pa'::uuid);
select is(public.complete_request(:'d5'::uuid, 'x5'), 'over_available', 'confirm re-checks Spend');
select is((select status from public.requests where id = :'d5'::uuid), 'pending', 'a refused confirm stays pending');

-- ---------------------------------------------------------------------------
-- Auto-confirm
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c3'::uuid);
select public.create_deposit(:'c3'::uuid, 200, 'a1')::text as r3 \gset
select is((:'r3'::jsonb)->>'status', 'confirmed', 'within the week rule it is confirmed');
select tests.clear_auth();
select is((select auto from public.requests where id = ((:'r3'::jsonb)->>'request_id')::uuid), true, 'auto is true');
select is((select count(*)::int from public.ledger_entries where child_id = :'c3'::uuid and source_type = 'request'), 2, 'auto-confirm posts both rows');
select is((select count(*)::int from public.notifications where child_id = :'c3'::uuid), 0, 'no notice for an auto-confirmed deposit');
select tests.authenticate_as(:'c3'::uuid);
select is((public.create_deposit(:'c3'::uuid, 200, 'a2'))->>'status', 'pending', 'over the week rule it waits for a parent');

select tests.authenticate_as(:'c4'::uuid);
select is((public.create_deposit(:'c4'::uuid, 150, 'a1'))->>'status', 'pending', 'an item rule that fails keeps it pending');
select is((public.create_deposit(:'c4'::uuid, 100, 'a2'))->>'status', 'confirmed', 'every rule passing confirms it');

select * from finish();
rollback;
