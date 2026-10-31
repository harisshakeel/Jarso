begin;
\ir _helpers.psql
select plan(29);

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

-- C1: Spend 1000, Save 5000.
insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, source_type, idempotency_key, created_by, occurred_at)
values
  (:'fa'::uuid, :'c1'::uuid, 'spend', 'allowance_in', 'in', 1000, 'Allowance', 'occurrence', 'seed:c1:spend', :'pa'::uuid, '2025-01-01'),
  (:'fa'::uuid, :'c1'::uuid, 'save', 'allowance_in', 'in', 5000, 'Allowance', 'occurrence', 'seed:c1:save', :'pa'::uuid, '2025-01-01');

-- Requests as postgres (no write policies for users).
insert into public.requests (family_id, child_id, kind, status, amount_minor, idempotency_key, occurred_at) values
  (:'fa'::uuid, :'c1'::uuid, 'withdrawal', 'pending',   1000, 'w1', now()),
  (:'fa'::uuid, :'c1'::uuid, 'withdrawal', 'approved',   500, 'w2', now()),
  (:'fa'::uuid, :'c1'::uuid, 'withdrawal', 'handed_over', 700, 'w3', now()),
  (:'fa'::uuid, :'c1'::uuid, 'withdrawal', 'rejected',   300, 'w4', now()),
  (:'fa'::uuid, :'c1'::uuid, 'withdrawal', 'cancelled',  200, 'w5', now()),
  (:'fa'::uuid, :'c1'::uuid, 'deposit',    'pending',    400, 'd1', now()),
  (:'fa'::uuid, :'c1'::uuid, 'deposit',    'confirmed',  250, 'd2', now()),
  (:'fa'::uuid, :'c1'::uuid, 'deposit',    'rejected',   150, 'd3', now()),
  (:'fa'::uuid, :'c1'::uuid, 'withdrawal', 'pending',    900, 'w6', '2025-01-06 10:00:00+00');

-- Checks
select throws_ok(
  format($$insert into public.requests (family_id, child_id, kind, status, amount_minor, idempotency_key) values (%L, %L, 'deposit', 'approved', 100, 'bad1')$$, :'fa', :'c1'),
  '23514', null, 'a deposit cannot be approved');
select throws_ok(
  format($$insert into public.requests (family_id, child_id, kind, status, amount_minor, idempotency_key) values (%L, %L, 'deposit', 'handed_over', 100, 'bad2')$$, :'fa', :'c1'),
  '23514', null, 'a deposit cannot be handed over');
select throws_ok(
  format($$insert into public.requests (family_id, child_id, kind, status, amount_minor, idempotency_key) values (%L, %L, 'withdrawal', 'confirmed', 100, 'bad3')$$, :'fa', :'c1'),
  '23514', null, 'a withdrawal cannot be confirmed');
select throws_ok(
  format($$insert into public.requests (family_id, child_id, kind, status, amount_minor, idempotency_key) values (%L, %L, 'withdrawal', 'pending', 0, 'bad4')$$, :'fa', :'c1'),
  '23514', null, 'amount must be positive');
select throws_ok(
  format($$insert into public.requests (family_id, child_id, kind, status, amount_minor, idempotency_key) values (%L, %L, 'withdrawal', 'pending', 100, 'w1')$$, :'fa', :'c1'),
  '23505', null, 'idempotency key is unique per child');

-- Functions (child)
select tests.authenticate_as(:'c1'::uuid);
select is(public.reserved_save(:'c1'::uuid), 2400::bigint, 'reserved_save counts pending and approved withdrawals only');
select is(public.held_spend(:'c1'::uuid), 400::bigint, 'held_spend counts pending deposits only');
select is(public.available_save(:'c1'::uuid), 2600::bigint, 'available_save = Save - reserved');
select is(public.available_spend(:'c1'::uuid), 600::bigint, 'available_spend = Spend - held');
select is((select count(*) from public.requests), 9::bigint, 'child sees own requests');

-- Parent
select tests.authenticate_as(:'pa'::uuid);
select is((select count(*) from public.requests), 9::bigint, 'parent sees the child''s requests');
select is(public.reserved_save(:'c1'::uuid), 2400::bigint, 'parent reads reserved_save');

-- Sibling and other family
select tests.authenticate_as(:'c2'::uuid);
select is((select count(*) from public.requests), 0::bigint, 'sibling sees no requests');
select throws_ok(format($$select public.reserved_save(%L)$$, :'c1'), 'JA403', null, 'sibling denied reserved_save');
select tests.authenticate_as(:'pb'::uuid);
select is((select count(*) from public.requests), 0::bigint, 'other family sees no requests');
select throws_ok(format($$select public.reserved_save(%L)$$, :'c1'), 'JA403', null, 'other family denied reserved_save');
select throws_ok(format($$select public.held_spend(%L)$$, :'c1'), 'JA403', null, 'other family denied held_spend');
select throws_ok(format($$select public.available_save(%L)$$, :'c1'), 'JA403', null, 'other family denied available_save');
select throws_ok(format($$select public.available_spend(%L)$$, :'c1'), 'JA403', null, 'other family denied available_spend');

-- Writes denied
select tests.authenticate_as(:'c1'::uuid);
select throws_ok(
  format($$insert into public.requests (family_id, child_id, kind, status, amount_minor, idempotency_key) values (%L, %L, 'withdrawal', 'pending', 100, 'x1')$$, :'fa', :'c1'),
  '42501', null, 'authenticated cannot insert requests');
select throws_ok(
  format($$select public.request_window_total(%L, 'withdrawal', array['pending'], null)$$, :'c1'),
  '42501', null, 'request_window_total is not granted');

-- request_window_total (as postgres)
select tests.clear_auth();
select is(public.request_window_total(:'c1'::uuid, 'withdrawal', array['pending','approved'], '2025-01-13 00:00:00+00'),
  1500::bigint, 'window total excludes the older row');
select is(public.request_window_total(:'c1'::uuid, 'withdrawal', array['pending','approved'], null),
  2400::bigint, 'null window start counts all time');

-- withdrawal_cap_remaining
select tests.clear_auth();
select tests.authenticate_as(:'c1'::uuid);
select is(public.withdrawal_cap_remaining(:'c1'::uuid), null::bigint, 'no cap rules gives null');
select tests.clear_auth();
insert into public.money_rules (family_id, child_id, kind, period, amount_minor)
values (:'fa'::uuid, :'c1'::uuid, 'withdrawal_cap', 'week', 3000);
select tests.authenticate_as(:'c1'::uuid);
select is(public.withdrawal_cap_remaining(:'c1'::uuid), 800::bigint, 'week cap minus pending, approved and handed-over this week');
select tests.clear_auth();
insert into public.money_rules (family_id, child_id, kind, period, amount_minor)
values (:'fa'::uuid, :'c1'::uuid, 'withdrawal_cap', 'item', 400);
select tests.authenticate_as(:'pa'::uuid);
select is(public.withdrawal_cap_remaining(:'c1'::uuid), 400::bigint, 'parent reads it; an item cap counts as unused and the smallest wins');
select tests.clear_auth();
update public.money_rules set amount_minor = 2000 where child_id = :'c1'::uuid and period = 'week';
select tests.authenticate_as(:'c1'::uuid);
select is(public.withdrawal_cap_remaining(:'c1'::uuid), 0::bigint, 'floored at zero when the window is over the cap');
select tests.authenticate_as(:'c2'::uuid);
select throws_ok(format($$select public.withdrawal_cap_remaining(%L)$$, :'c1'), 'JA403', null, 'sibling denied withdrawal_cap_remaining');
select tests.authenticate_as(:'pb'::uuid);
select throws_ok(format($$select public.withdrawal_cap_remaining(%L)$$, :'c1'), 'JA403', null, 'other family denied withdrawal_cap_remaining');

select * from finish();
rollback;
