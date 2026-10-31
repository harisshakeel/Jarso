begin;
\ir _helpers.psql
select plan(67);

-- Fixtures: PA owns family A (UTC) with C1..C7; PB owns family B with C8.
select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('c1@example.com', 'child') as c1 \gset
select tests.create_user('c2@example.com', 'child') as c2 \gset
select tests.create_user('c3@example.com', 'child') as c3 \gset
select tests.create_user('c4@example.com', 'child') as c4 \gset
select tests.create_user('c5@example.com', 'child') as c5 \gset
select tests.create_user('c6@example.com', 'child') as c6 \gset
select tests.create_user('c7@example.com', 'child') as c7 \gset
select tests.create_user('c8@example.com', 'child') as c8 \gset

select tests.authenticate_as(:'pb'::uuid);
select public.create_family('INR', 'Asia/Kolkata') as fb \gset
select public.register_child(:'c8'::uuid, :'fb'::uuid, 'Ria', '1234', true);

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select public.register_child(:'c2'::uuid, :'fa'::uuid, 'Max', '1234', true);
select public.register_child(:'c3'::uuid, :'fa'::uuid, 'Kit', '1234', true);
select public.register_child(:'c4'::uuid, :'fa'::uuid, 'Zed', '1234', true);
select public.register_child(:'c5'::uuid, :'fa'::uuid, 'Eve', '1234', true);
select public.register_child(:'c6'::uuid, :'fa'::uuid, 'Fay', '1234', true);
select public.register_child(:'c7'::uuid, :'fa'::uuid, 'Gus', '1234', true);
select tests.clear_auth();

-- Seed Save 2000 for C1..C7 (C8 too).
insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, source_type, idempotency_key, created_by, occurred_at)
select :'fa'::uuid, c, 'save', 'allowance_in', 'in', 2000, 'Allowance', 'occurrence', 'seed:' || c::text, :'pa'::uuid, '2025-01-01'
from unnest(array[:'c1', :'c2', :'c3', :'c4', :'c5', :'c6', :'c7']::uuid[]) c;
insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, source_type, idempotency_key, created_by, occurred_at)
values (:'fb'::uuid, :'c8'::uuid, 'save', 'allowance_in', 'in', 2000, 'Allowance', 'occurrence', 'seed:c8', :'pb'::uuid, '2025-01-01');

-- ---------------------------------------------------------------------------
-- Basic flow (C1)
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c1'::uuid);
select public.create_withdrawal(:'c1'::uuid, 500, null, 'k1')::text as r1 \gset
select is((:'r1'::jsonb)->>'status', 'pending', 'a request within Save is pending');
select ((:'r1'::jsonb)->>'request_id')::uuid as w1 \gset
select is(public.reserved_save(:'c1'::uuid), 500::bigint, 'reserved_save 500');
select is(public.available_save(:'c1'::uuid), 1500::bigint, 'available_save 1500');

select tests.clear_auth();
select is(
  (select count(*)::int from public.notifications where child_id = :'c1'::uuid and kind = 'withdrawal_requested' and recipient_id = :'pa'::uuid),
  1, 'one parent notice');
select is(
  (select payload from public.notifications where child_id = :'c1'::uuid and kind = 'withdrawal_requested'),
  '{"amount_minor": 500, "reason": null}'::jsonb, 'notice payload');
select is(
  (select source_type || ':' || (source_id = :'w1'::uuid)::text || ':' || coalesce(window_key, 'null') from public.notifications where child_id = :'c1'::uuid and kind = 'withdrawal_requested'),
  'request:true:null', 'notice source is the request, no window key');

select tests.authenticate_as(:'c1'::uuid);
select public.create_withdrawal(:'c1'::uuid, 500, null, 'k1')::text as r1b \gset
select is((:'r1b'::jsonb)->>'request_id', :'w1', 'same key returns the same request id (double tap)');
select is((:'r1b'::jsonb)->>'status', 'pending', 'same key returns its current status');
select tests.clear_auth();
select is(
  (select count(*)::int from public.notifications where child_id = :'c1'::uuid and kind = 'withdrawal_requested'),
  1, 'double tap adds no second notice');
select tests.authenticate_as(:'c1'::uuid);

select is(public.create_withdrawal(:'c1'::uuid, 1600, null, 'k2'), '{"status": "over_available", "available_minor": 1500}'::jsonb, 'over available is a status');
select is((select count(*)::int from public.requests where child_id = :'c1'::uuid), 1, 'a refused request is not stored');

select throws_ok(format($$select public.create_withdrawal(%L, 0, null, 'kz')$$, :'c1'), '22023', null, 'amount 0 rejected');
select throws_ok(format($$select public.create_withdrawal(%L, 100000000001, null, 'kz')$$, :'c1'), '22023', null, 'amount over the max rejected');
select throws_ok(format($$select public.create_withdrawal(%L, 100, null, '  ')$$, :'c1'), '22023', null, 'blank key rejected');
select throws_ok(format($$select public.create_withdrawal(%L, 100, %L, 'kz')$$, :'c1', repeat('x', 141)), '22023', null, 'reason over 140 rejected');
select throws_ok(format($$select public.create_withdrawal(%L, 100, null, 'kz')$$, :'c2'), 'JA403', null, 'a sibling cannot ask for another child');
select tests.authenticate_as(:'pa'::uuid);
select throws_ok(format($$select public.create_withdrawal(%L, 100, null, 'kz')$$, :'c1'), 'JA403', null, 'a parent cannot create a withdrawal');

-- Authz on decide / complete / cancel
select tests.authenticate_as(:'c1'::uuid);
select throws_ok(format($$select public.decide_withdrawal(%L, true, null)$$, :'w1'), 'JA403', null, 'child cannot decide');
select throws_ok(format($$select public.complete_request(%L, 'x1')$$, :'w1'), 'JA403', null, 'child cannot complete');
select tests.authenticate_as(:'pb'::uuid);
select throws_ok(format($$select public.decide_withdrawal(%L, true, null)$$, :'w1'), 'JA403', null, 'another family parent cannot decide');
select throws_ok(format($$select public.complete_request(%L, 'x1')$$, :'w1'), 'JA403', null, 'another family parent cannot complete');
select throws_ok(format($$select public.cancel_request(%L)$$, :'w1'), 'JA403', null, 'another family parent cannot cancel');

-- Decide and complete
select tests.authenticate_as(:'pa'::uuid);
select is(public.complete_request(:'w1'::uuid, 'x1'), 'not_approved', 'completing a pending request is refused');
select is(public.decide_withdrawal(:'w1'::uuid, true, '  ok  '), 'approved', 'parent approves');
select is(public.decide_withdrawal(:'w1'::uuid, true, null), 'already_decided', 'deciding twice returns already_decided');
select is((select decision_note from public.requests where id = :'w1'::uuid), 'ok', 'decision note trimmed');
select is((select decided_by from public.requests where id = :'w1'::uuid), :'pa'::uuid, 'decided_by set');
select tests.clear_auth();
select is(
  (select payload from public.notifications where child_id = :'c1'::uuid and kind = 'withdrawal_decided' and recipient_id = :'c1'::uuid),
  '{"amount_minor": 500, "approved": true}'::jsonb, 'child gets the decision notice');
select tests.authenticate_as(:'pa'::uuid);

select is(public.complete_request(:'w1'::uuid, 'x1'), 'completed', 'parent completes the handover');
select is(public.complete_request(:'w1'::uuid, 'x1'), 'already_completed', 'completing again is already_completed');
select is((select status from public.requests where id = :'w1'::uuid), 'handed_over', 'status handed_over');
select is(public.balance(:'c1'::uuid, 'save', 'recorded'), 1500::bigint, 'Save down 500');
select is(public.balance(:'c1'::uuid, 'spend', 'recorded'), 500::bigint, 'Spend up 500');
select is(
  (select count(*)::int from public.ledger_entries where source_type = 'request' and source_id = :'w1'::uuid), 2,
  'exactly two ledger rows after two completes');
select is(
  (select string_agg(kind || ':' || jar || ':' || label || ':' || idempotency_key, ',' order by kind)
   from public.ledger_entries where source_id = :'w1'::uuid),
  'withdrawal_in:spend:Taken out of Save:request:' || :'w1' || ':in,withdrawal_out:save:Taken out of Save:request:' || :'w1' || ':out',
  'ledger rows, label and keys');
select is(public.reserved_save(:'c1'::uuid), 0::bigint, 'reservation released after hand-over');
select is((select completed_by from public.requests where id = :'w1'::uuid), :'pa'::uuid, 'completed_by set');

-- Reject
select tests.authenticate_as(:'c1'::uuid);
select public.create_withdrawal(:'c1'::uuid, 300, '  new game  ', 'k3')::text as r3 \gset
select ((:'r3'::jsonb)->>'request_id')::uuid as w3 \gset
select is((select reason from public.requests where id = :'w3'::uuid), 'new game', 'reason trimmed');
select tests.authenticate_as(:'pa'::uuid);
select is(public.decide_withdrawal(:'w3'::uuid, false, 'Not now'), 'rejected', 'parent rejects');
select is((select count(*)::int from public.ledger_entries where source_id = :'w3'::uuid), 0, 'rejection posts nothing');
select is(public.complete_request(:'w3'::uuid, 'x3'), 'not_approved', 'a rejected request cannot be completed');
select tests.clear_auth();
select is(
  (select payload from public.notifications where kind = 'withdrawal_decided' and source_id = :'w3'::uuid),
  '{"amount_minor": 300, "approved": false}'::jsonb, 'child gets the rejection notice');

-- ---------------------------------------------------------------------------
-- Caps (C2)
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'pa'::uuid);
select public.set_money_rule(:'c2'::uuid, 'withdrawal_cap', 'week', 800);
select tests.authenticate_as(:'c2'::uuid);
select public.create_withdrawal(:'c2'::uuid, 500, null, 'c-1')::text as rc1 \gset
select ((:'rc1'::jsonb)->>'request_id')::uuid as wc1 \gset
select is(public.create_withdrawal(:'c2'::uuid, 400, null, 'c-2'),
  '{"status": "over_cap", "period": "week", "cap_minor": 800, "used_minor": 500}'::jsonb, 'weekly cap counts pending');
select tests.authenticate_as(:'pa'::uuid);
select public.decide_withdrawal(:'wc1'::uuid, false, null);
select tests.authenticate_as(:'c2'::uuid);
select is(public.create_withdrawal(:'c2'::uuid, 400, null, 'c-2')->>'status', 'pending', 'after the rejection the same ask fits');
select tests.authenticate_as(:'pa'::uuid);
select public.set_money_rule(:'c2'::uuid, 'withdrawal_cap', 'item', 300);
select tests.authenticate_as(:'c2'::uuid);
select is(public.create_withdrawal(:'c2'::uuid, 301, null, 'c-3')->>'period', 'item', 'item cap broken first');
select is(public.create_withdrawal(:'c2'::uuid, 301, null, 'c-3')->>'cap_minor', '300', 'item cap_minor');

-- ---------------------------------------------------------------------------
-- Auto-approve (C4)
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'pa'::uuid);
select public.set_money_rule(:'c4'::uuid, 'withdrawal_auto_approve', 'item', 500);
select tests.authenticate_as(:'c4'::uuid);
select public.create_withdrawal(:'c4'::uuid, 400, null, 'a-1')::text as ra1 \gset
select is((:'ra1'::jsonb)->>'status', 'approved', 'within the auto-approve limit is approved');
select is((select auto from public.requests where id = ((:'ra1'::jsonb)->>'request_id')::uuid), true, 'auto flag set');
select ok((select decided_at is not null and decided_by is null from public.requests where id = ((:'ra1'::jsonb)->>'request_id')::uuid), 'auto-approved: decided_at set, decided_by null');
select is(public.reserved_save(:'c4'::uuid), 400::bigint, 'an auto-approved request is reserved');
select tests.clear_auth();
select is((select count(*)::int from public.notifications where child_id = :'c4'::uuid), 0, 'no notice for an auto-approved request');
select tests.authenticate_as(:'pa'::uuid);
select public.set_money_rule(:'c4'::uuid, 'withdrawal_auto_approve', 'week', 600);
select tests.authenticate_as(:'c4'::uuid);
select is(public.create_withdrawal(:'c4'::uuid, 300, null, 'a-2')->>'status', 'pending', 'week auto limit exceeded stays pending');
select tests.clear_auth();
select is((select count(*)::int from public.notifications where child_id = :'c4'::uuid and kind = 'withdrawal_requested'), 1, 'pending request notifies the parent');

-- ---------------------------------------------------------------------------
-- Rules changed mid-flight (C5)
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c5'::uuid);
select public.create_withdrawal(:'c5'::uuid, 500, 'Bike', 'm-1')::text as rm1 \gset
select ((:'rm1'::jsonb)->>'request_id')::uuid as wm1 \gset
select tests.authenticate_as(:'pa'::uuid);
select public.decide_withdrawal(:'wm1'::uuid, true, null);
select public.set_money_rule(:'c5'::uuid, 'withdrawal_cap', 'item', 100);
select is(public.complete_request(:'wm1'::uuid, 'xm1'), 'completed', 'an approved request still hands over after the cap is lowered');
select is((select label from public.ledger_entries where idempotency_key = 'request:' || :'wm1' || ':out'), 'Bike', 'ledger label is the reason');

-- ---------------------------------------------------------------------------
-- Cancel (C6)
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c6'::uuid);
select public.create_withdrawal(:'c6'::uuid, 400, null, 'x-1')::text as rx1 \gset
select ((:'rx1'::jsonb)->>'request_id')::uuid as wx1 \gset
select tests.authenticate_as(:'c3'::uuid);
select throws_ok(format($$select public.cancel_request(%L)$$, :'wx1'), 'JA403', null, 'a sibling cannot cancel');
select tests.authenticate_as(:'c6'::uuid);
select is(public.cancel_request(:'wx1'::uuid), 'cancelled', 'child cancels their pending request');
select is(public.reserved_save(:'c6'::uuid), 0::bigint, 'cancelling releases the reservation');
select is(public.cancel_request(:'wx1'::uuid), 'already_closed', 'cancelling twice is already_closed');
select public.create_withdrawal(:'c6'::uuid, 400, null, 'x-2')::text as rx2 \gset
select ((:'rx2'::jsonb)->>'request_id')::uuid as wx2 \gset
select tests.authenticate_as(:'pa'::uuid);
select public.decide_withdrawal(:'wx2'::uuid, true, null);
select tests.authenticate_as(:'c6'::uuid);
select is(public.cancel_request(:'wx2'::uuid), 'already_closed', 'a child cannot cancel an approved request');
select tests.authenticate_as(:'pa'::uuid);
select is(public.cancel_request(:'wx2'::uuid), 'cancelled', 'a parent cancels an approved withdrawal');
select is((select count(*)::int from public.ledger_entries where child_id = :'c6'::uuid and source_type = 'request'), 0, 'cancel posts nothing');

-- ---------------------------------------------------------------------------
-- Balance dropped after the ask (C7)
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c7'::uuid);
select public.create_withdrawal(:'c7'::uuid, 1500, null, 'o-1')::text as ro1 \gset
select ((:'ro1'::jsonb)->>'request_id')::uuid as wo1 \gset
select tests.clear_auth();
insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, source_type, idempotency_key, created_by, occurred_at)
values (:'fa'::uuid, :'c7'::uuid, 'save', 'withdrawal_out', 'out', 1000, 'Other', 'diary', 'seed:c7:out', :'pa'::uuid, '2025-01-02');
select tests.authenticate_as(:'pa'::uuid);
select is(public.decide_withdrawal(:'wo1'::uuid, true, null), 'over_available', 'approve re-checks the Save balance');
select is((select status from public.requests where id = :'wo1'::uuid), 'pending', 'a refused approval stays pending');
select tests.clear_auth();
insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, source_type, idempotency_key, created_by, occurred_at)
values (:'fa'::uuid, :'c7'::uuid, 'save', 'allowance_in', 'in', 1000, 'Allowance', 'occurrence', 'seed:c7:in', :'pa'::uuid, '2025-01-03');
select tests.authenticate_as(:'pa'::uuid);
select is(public.decide_withdrawal(:'wo1'::uuid, true, null), 'approved', 'approves once Save covers it');
select tests.clear_auth();
insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, source_type, idempotency_key, created_by, occurred_at)
values (:'fa'::uuid, :'c7'::uuid, 'save', 'withdrawal_out', 'out', 1000, 'Other', 'diary', 'seed:c7:out2', :'pa'::uuid, '2025-01-04');
select tests.authenticate_as(:'pa'::uuid);
select is(public.complete_request(:'wo1'::uuid, 'xo1'), 'over_available', 'complete re-checks the Save balance');
select is((select status from public.requests where id = :'wo1'::uuid), 'approved', 'a refused hand-over stays approved');

select * from finish();
rollback;
