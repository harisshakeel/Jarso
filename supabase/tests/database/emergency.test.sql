begin;
\ir _helpers.psql
select plan(39);

-- Emergency funds (FR15): the child asks, the parent decides, the grant lands in Spend once.
-- Fixtures: PA owns family A with C1 and C2; PB owns family B with C3.
select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('c1@example.com', 'child') as c1 \gset
select tests.create_user('c2@example.com', 'child') as c2 \gset
select tests.create_user('c3@example.com', 'child') as c3 \gset

select tests.authenticate_as(:'pb'::uuid);
select public.create_family('INR', 'Asia/Kolkata') as fb \gset
select public.register_child(:'c3'::uuid, :'fb'::uuid, 'Ria', '1234', true);
select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select public.register_child(:'c2'::uuid, :'fa'::uuid, 'Max', '1234', true);
select tests.clear_auth();

-- C1: Spend 1000, Save 2000, with a withdrawal cap that must not apply to emergencies.
insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, source_type, idempotency_key, created_by, occurred_at)
values
  (:'fa'::uuid, :'c1'::uuid, 'spend', 'allowance_in', 'in', 1000, 'Allowance', 'occurrence', 'seed:spend', :'pa'::uuid, '2025-01-01'),
  (:'fa'::uuid, :'c1'::uuid, 'save', 'allowance_in', 'in', 2000, 'Allowance', 'occurrence', 'seed:save', :'pa'::uuid, '2025-01-01');
insert into public.money_rules (family_id, child_id, kind, period, amount_minor)
values (:'fa'::uuid, :'c1'::uuid, 'withdrawal_cap', 'item', 100);

-- ---------------------------------------------------------------------------
-- Schema and grants
-- ---------------------------------------------------------------------------

select throws_ok(
  format($$insert into public.requests (family_id, child_id, kind, status, amount_minor, reason, idempotency_key) values (%L, %L, 'emergency', 'confirmed', 100, 'x', 'bad1')$$, :'fa', :'c1'),
  '23514', null, 'an emergency is never confirmed');
select throws_ok(
  format($$insert into public.requests (family_id, child_id, kind, status, amount_minor, reason, idempotency_key) values (%L, %L, 'emergency', 'pending', 100, '  ', 'bad2')$$, :'fa', :'c1'),
  '23514', null, 'an emergency needs a reason');
select function_privs_are('public', 'create_emergency', array['uuid', 'bigint', 'text', 'text'],
  'authenticated', array['EXECUTE'], 'children can ask (the function checks it is their own)');
select function_privs_are('public', 'create_emergency', array['uuid', 'bigint', 'text', 'text'],
  'anon', array[]::text[], 'anon cannot');

-- ---------------------------------------------------------------------------
-- Ask
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c1'::uuid);
select public.create_emergency(:'c1'::uuid, 5000, '  school trip  ', 'e1')::text as r1 \gset
select is((:'r1'::jsonb)->>'status', 'pending', 'an ask is pending, however large: no cap and no Save check');
select ((:'r1'::jsonb)->>'request_id')::uuid as e1 \gset
select is((select reason from public.requests where id = :'e1'::uuid), 'school trip', 'reason trimmed');
select is(public.reserved_save(:'c1'::uuid), 0::bigint, 'an ask reserves nothing');
select is(public.held_spend(:'c1'::uuid), 0::bigint, 'and holds nothing');
select is((public.create_emergency(:'c1'::uuid, 5000, 'school trip', 'e1'))->>'request_id', :'e1', 'same key returns the same request (double tap)');

select throws_ok(format($$select public.create_emergency(%L, 100, null, 'ez')$$, :'c1'), '22023', null, 'a missing reason is refused');
select throws_ok(format($$select public.create_emergency(%L, 100, '   ', 'ez')$$, :'c1'), '22023', null, 'a blank reason is refused');
select throws_ok(format($$select public.create_emergency(%L, 0, 'x', 'ez')$$, :'c1'), '22023', null, 'amount 0 refused');
select throws_ok(format($$select public.create_emergency(%L, 100, %L, 'ez')$$, :'c1', repeat('x', 141)), '22023', null, 'reason over 140 refused');
select throws_ok(format($$select public.create_emergency(%L, 100, 'x', 'ez')$$, :'c2'), 'JA403', null, 'a sibling cannot ask for another child');
select throws_ok(format($$select public.create_withdrawal(%L, 50, null, 'e1')$$, :'c1'), 'JA409', null, 'the key cannot be reused by another kind');
select tests.authenticate_as(:'pa'::uuid);
select throws_ok(format($$select public.create_emergency(%L, 100, 'x', 'ez')$$, :'c1'), 'JA403', null, 'a parent cannot ask');

select tests.clear_auth();
select is(
  (select count(*)::int from public.notifications where child_id = :'c1'::uuid and kind = 'emergency_requested' and recipient_id = :'pa'::uuid),
  1, 'one parent notice');
select is(
  (select payload from public.notifications where child_id = :'c1'::uuid and kind = 'emergency_requested'),
  '{"amount_minor": 5000, "reason": "school trip"}'::jsonb, 'notice payload carries the reason');
select is(
  (select count(*)::int from public.notifications where child_id = :'c1'::uuid and kind = 'emergency_requested'),
  1, 'double tap adds no second notice');

-- ---------------------------------------------------------------------------
-- Decide and hand over
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c1'::uuid);
select throws_ok(format($$select public.decide_withdrawal(%L, true, null)$$, :'e1'), 'JA403', null, 'child cannot decide');
select tests.authenticate_as(:'pb'::uuid);
select throws_ok(format($$select public.decide_withdrawal(%L, true, null)$$, :'e1'), 'JA403', null, 'another family parent cannot decide');
select throws_ok(format($$select public.complete_request(%L, 'x1')$$, :'e1'), 'JA403', null, 'nor complete');

select tests.authenticate_as(:'pa'::uuid);
select is(public.complete_request(:'e1'::uuid, 'x1'), 'not_approved', 'a pending ask cannot be handed over');
select is(public.decide_withdrawal(:'e1'::uuid, true, 'ok'), 'approved', 'parent approves; Save is not checked for an emergency');
select is(public.decide_withdrawal(:'e1'::uuid, true, null), 'already_decided', 'deciding twice is already_decided');
select tests.clear_auth();
select is(
  (select kind || ':' || payload::text from public.notifications where child_id = :'c1'::uuid and recipient_id = :'c1'::uuid and source_id = :'e1'::uuid),
  'emergency_decided:{"approved": true, "amount_minor": 5000}', 'child gets an emergency_decided notice');
select tests.authenticate_as(:'pa'::uuid);

select is(public.complete_request(:'e1'::uuid, 'x1'), 'completed', 'parent hands it over');
select is(public.complete_request(:'e1'::uuid, 'x1'), 'already_completed', 'handing over again is already_completed');
select is((select status from public.requests where id = :'e1'::uuid), 'handed_over', 'status handed_over');
select is(public.balance(:'c1'::uuid, 'spend', 'recorded'), 6000::bigint, 'the grant lands in Spend');
select is(public.balance(:'c1'::uuid, 'save', 'recorded'), 2000::bigint, 'Save is untouched');
select is(
  (select string_agg(kind || ':' || jar || ':' || label || ':' || idempotency_key, ',')
   from public.ledger_entries where source_type = 'request' and source_id = :'e1'::uuid),
  'grant_in:spend:school trip:request:' || :'e1' || ':in',
  'exactly one grant_in row, its own kind, labelled with the reason, after two completes');

-- ---------------------------------------------------------------------------
-- Reject, cancel
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c1'::uuid);
select ((public.create_emergency(:'c1'::uuid, 300, 'lost bus pass', 'e2'))->>'request_id')::uuid as e2 \gset
select ((public.create_emergency(:'c1'::uuid, 200, 'snack', 'e3'))->>'request_id')::uuid as e3 \gset
select ((public.create_emergency(:'c1'::uuid, 100, 'book', 'e4'))->>'request_id')::uuid as e4 \gset
select is(public.cancel_request(:'e3'::uuid), 'cancelled', 'the child cancels their own pending ask');
select tests.authenticate_as(:'pa'::uuid);
select is(public.decide_withdrawal(:'e2'::uuid, false, 'Not now'), 'rejected', 'parent rejects');
select is((select count(*)::int from public.ledger_entries where source_id in (:'e2'::uuid, :'e3'::uuid)), 0, 'rejection and cancellation post nothing');
select is(public.complete_request(:'e2'::uuid, 'x2'), 'not_approved', 'a rejected ask cannot be handed over');
select is(public.decide_withdrawal(:'e4'::uuid, true, null), 'approved', 'another ask approved');
select is(public.cancel_request(:'e4'::uuid), 'cancelled', 'a parent backs out of an approved ask');
select is(public.balance(:'c1'::uuid, 'spend', 'recorded'), 6000::bigint, 'Spend unchanged by rejects and cancels');

select * from finish();
rollback;
