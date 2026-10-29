begin;
\ir _helpers.psql
select plan(58);

-- Fixtures: PA owns family A (UTC) with children C1 and C2; PB owns family B (Asia/Kolkata) with C3.
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

-- Seed Spend as postgres: C1 1000, C2 and C3 10000.
insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, source_type, idempotency_key, created_by, occurred_at)
values
  (:'fa'::uuid, :'c1'::uuid, 'spend', 'allowance_in', 'in', 1000, 'Allowance', 'occurrence', 'seed:c1', :'pa'::uuid, '2025-01-01'),
  (:'fa'::uuid, :'c2'::uuid, 'spend', 'allowance_in', 'in', 10000, 'Allowance', 'occurrence', 'seed:c2', :'pa'::uuid, '2025-01-01'),
  (:'fb'::uuid, :'c3'::uuid, 'spend', 'allowance_in', 'in', 10000, 'Allowance', 'occurrence', 'seed:c3', :'pb'::uuid, '2025-01-01');
select id as seed1 from public.ledger_entries where idempotency_key = 'seed:c1' \gset

-- ---------------------------------------------------------------------------
-- Access and grants
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'pa'::uuid);
select throws_ok(format($$select public.record_purchase(%L, 100, null, 'kp')$$, :'c1'), 'JA403', null, 'parent cannot record a purchase');
select is(public.held_spend(:'c1'::uuid), 0::bigint, 'parent reads held_spend (0 until deposits)');
select tests.authenticate_as(:'pb'::uuid);
select throws_ok(format($$select public.held_spend(%L)$$, :'c1'), 'JA403', null, 'held_spend denied across families');
select tests.authenticate_as(:'c2'::uuid);
select throws_ok(format($$select public.record_purchase(%L, 100, null, 'ks')$$, :'c1'), 'JA403', null, 'a sibling cannot record for another child');
select throws_ok(
  format($$select public.record_purchase_at(%L, 100, null, 'kt', now() - interval '1 day')$$, :'c2'),
  '42501', null, 'record_purchase_at is not granted');
select throws_ok(format($$select public.evaluate_spend_limits(%L)$$, :'seed1'), '42501', null, 'evaluate_spend_limits is not granted');
select throws_ok(format($$select public.undo_purchase_at(%L, now())$$, :'seed1'), '42501', null, 'undo_purchase_at is not granted');
select tests.clear_auth();
set local role anon;
select throws_ok(format($$select public.record_purchase(%L, 100, null, 'ka')$$, :'c1'), '42501', null, 'anon cannot record a purchase');
reset role;

-- ---------------------------------------------------------------------------
-- Record (C1, Spend 1000)
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c1'::uuid);
select is(public.held_spend(:'c1'::uuid), 0::bigint, 'child reads held_spend');

select throws_ok(format($$select public.record_purchase(%L, 0, null, 'kv1')$$, :'c1'), '22023', null, 'zero amount rejected');
select throws_ok(format($$select public.record_purchase(%L, 100000000001, null, 'kv2')$$, :'c1'), '22023', null, 'amount above maximum rejected');
select throws_ok(format($$select public.record_purchase(%L, 100, %L, 'kv3')$$, :'c1', repeat('x', 61)), '22023', null, 'label over 60 chars rejected');
select throws_ok(format($$select public.record_purchase(%L, 100, null, '  ')$$, :'c1'), '22023', null, 'blank key rejected');
select throws_ok(format($$select public.record_purchase(%L, 100, null, null)$$, :'c1'), '22023', null, 'null key rejected');

select is(tests.holds_ledger_lock(:'c1'::uuid), false, 'no ledger lock before a purchase');
select public.record_purchase(:'c1'::uuid, 300, '  Snack  ', 'p1') as r1 \gset
select is(tests.holds_ledger_lock(:'c1'::uuid), true, 'purchase takes the child''s ledger advisory lock');
select is((:'r1'::jsonb)->>'status', 'recorded', 'purchase 300 is recorded');
select is(((:'r1'::jsonb)->>'notices')::int, 0, 'no rules, no notices');
select is(public.balance(:'c1'::uuid, 'spend'), 700::bigint, 'Spend 700 after purchase');
select (:'r1'::jsonb)->>'entry_id' as e1 \gset
select is(
  (select kind || ':' || jar || ':' || direction || ':' || source_type || ':' || label || ':' || idempotency_key || ':' || (created_by = :'c1'::uuid)
   from public.ledger_entries where id = :'e1'::uuid),
  'purchase:spend:out:diary:Snack:purchase:' || :'c1' || ':p1:true',
  'purchase row shape, trimmed label and key');

select is((public.record_purchase(:'c1'::uuid, 300, 'Snack', 'p1'))->>'entry_id', :'e1', 'same key returns the same entry');
select is((select count(*)::int from public.ledger_entries where idempotency_key = 'purchase:' || :'c1' || ':p1'), 1, 'same key writes one row');

select public.record_purchase(:'c1'::uuid, 800, '   ', 'p2') as r2 \gset
select is((:'r2'::jsonb)->>'status', 'not_enough_spend', 'overspend off: 800 over 700 refused');
select is(((:'r2'::jsonb)->>'free_minor')::bigint, 700::bigint, 'refusal reports free Spend');
select is((select count(*)::int from public.ledger_entries where idempotency_key = 'purchase:' || :'c1' || ':p2'), 0, 'refusal posts nothing');

select tests.authenticate_as(:'pa'::uuid);
select public.set_allow_negative_spend(:'c1'::uuid, true);
select tests.authenticate_as(:'c1'::uuid);
select public.record_purchase(:'c1'::uuid, 800, '   ', 'p3') as r3 \gset
select is((:'r3'::jsonb)->>'status', 'recorded', 'overspend on: 800 recorded');
select is(public.balance(:'c1'::uuid, 'spend'), -100::bigint, 'Spend goes to -100');
select is(
  (select label from public.ledger_entries where id = ((:'r3'::jsonb)->>'entry_id')::uuid),
  null, 'blank label stored as null');

-- ---------------------------------------------------------------------------
-- Undo (C1)
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'pa'::uuid);
select throws_ok(format($$select public.undo_purchase(%L)$$, :'e1'), 'JA403', null, 'parent cannot undo');
select tests.authenticate_as(:'c2'::uuid);
select throws_ok(format($$select public.undo_purchase(%L)$$, :'e1'), 'JA403', null, 'another child cannot undo');
select throws_ok($$select public.undo_purchase(gen_random_uuid())$$, 'JA403', null, 'missing entry is JA403');

select tests.authenticate_as(:'c1'::uuid);
select throws_ok(format($$select public.undo_purchase(%L)$$, :'seed1'), '22023', null, 'non-purchase entry rejected');
select is(public.undo_purchase(:'e1'::uuid), 'undone', 'undo returns undone');
select is(public.balance(:'c1'::uuid, 'spend'), 200::bigint, 'Spend restored by 300');
select is(
  (select reversed from public.list_ledger_history(:'c1'::uuid) h where h.id = :'e1'::uuid),
  true, 'history marks the purchase reversed');
select is(
  (select kind || ':' || direction || ':' || jar from public.list_ledger_history(:'c1'::uuid) h where h.reverses_entry_id = :'e1'::uuid),
  'reversal:in:spend', 'history shows the reversal linked to the purchase');
select is(
  (select idempotency_key from public.ledger_entries where reverses_entry_id = :'e1'::uuid),
  'reversal:' || :'e1', 'reversal key');
select is(public.undo_purchase(:'e1'::uuid), 'already_undone', 'second undo is already_undone');
select is((select count(*)::int from public.ledger_entries where reverses_entry_id = :'e1'::uuid), 1, 'one reversal row');
select is(
  (select reversed from public.list_ledger_history(:'c1'::uuid) h where h.id = ((:'r3'::jsonb)->>'entry_id')::uuid),
  false, 'a live purchase is not reversed');

-- 25 hours old: too late. Called as postgres with the child's claims.
select tests.clear_auth();
select set_config('request.jwt.claims', jsonb_build_object('sub', :'c1', 'role', 'authenticated')::text, true);
select (public.record_purchase_at(:'c1'::uuid, 50, null, 'old', now() - interval '25 hours'))->>'entry_id' as eold \gset
select tests.authenticate_as(:'c1'::uuid);
select is(public.undo_purchase(:'eold'::uuid), 'too_late', 'undo after 24 hours is too_late');
select is((select count(*)::int from public.ledger_entries where reverses_entry_id = :'eold'::uuid), 0, 'too_late posts nothing');

-- ---------------------------------------------------------------------------
-- Spending limits (C2, family A in UTC)
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'pa'::uuid);
select public.set_money_rule(:'c2'::uuid, 'spend_limit', 'week', 500);
select tests.authenticate_as(:'c2'::uuid);
select is((public.record_purchase(:'c2'::uuid, 300, null, 'l1'))->>'notices', '0', 'first 300 stays under the week limit');
select public.record_purchase(:'c2'::uuid, 300, null, 'l2') as rl2 \gset
select is((:'rl2'::jsonb)->>'notices', '1', 'second 300 crosses the week limit');
select public.record_purchase(:'c2'::uuid, 100, null, 'l3') as rl3 \gset
select is((:'rl3'::jsonb)->>'notices', '0', 'third purchase in the same week: no new notice');

select tests.clear_auth();
select is(
  (select count(*)::int from public.notifications where child_id = :'c2'::uuid and kind = 'limit_exceeded'),
  1, 'one limit notice for the week');
select is(
  (select recipient_id::text || '|' || source_type || '|' || source_id::text || '|' || window_key || '|' || payload::text
   from public.notifications where child_id = :'c2'::uuid and kind = 'limit_exceeded'),
  :'pa' || '|ledger_entry|' || ((:'rl2'::jsonb)->>'entry_id') || '|spend_limit:week:'
    || public.rule_window_start(:'fa'::uuid, 'week', now())::date::text
    || '|{"period": "week", "limit_minor": 500, "total_minor": 600, "amount_minor": 300}',
  'notice goes to the parent with the crossing purchase, window and totals');

select tests.authenticate_as(:'pa'::uuid);
select public.set_money_rule(:'c2'::uuid, 'spend_limit', 'item', 250);
select tests.authenticate_as(:'c2'::uuid);
select public.record_purchase(:'c2'::uuid, 300, null, 'l4') as rl4 \gset
select is((:'rl4'::jsonb)->>'notices', '1', 'a 300 purchase crosses the 250 item limit');
select is((public.record_purchase(:'c2'::uuid, 200, null, 'l5'))->>'notices', '0', 'a 200 purchase does not');
select tests.clear_auth();
select is(
  (select window_key from public.notifications where source_id = ((:'rl4'::jsonb)->>'entry_id')::uuid),
  'spend_limit:item:' || ((:'rl4'::jsonb)->>'entry_id'), 'item notice keyed by the entry');
select is(
  (select count(*)::int from public.notifications where child_id = :'c2'::uuid and kind = 'limit_exceeded'),
  2, 'week notice plus one item notice');

-- ---------------------------------------------------------------------------
-- Week windows in Asia/Kolkata (C3), via the internal clock seam
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'pb'::uuid);
select public.set_money_rule(:'c3'::uuid, 'spend_limit', 'week', 500);
select tests.clear_auth();
select set_config('request.jwt.claims', jsonb_build_object('sub', :'c3', 'role', 'authenticated')::text, true);

-- Sun 2026-01-04 23:00 IST is in the week of Mon 2025-12-29; Mon 2026-01-05 00:30 IST starts a new one.
select is(
  (public.record_purchase_at(:'c3'::uuid, 600, null, 'w1', '2026-01-04 23:00+05:30'))->>'notices',
  '1', 'Sunday 23:00 IST crosses its week');
select is(
  (public.record_purchase_at(:'c3'::uuid, 600, null, 'w2', '2026-01-05 00:30+05:30'))->>'notices',
  '1', 'Monday 00:30 IST crosses the next week on its own');
select is(
  (select string_agg(window_key, ',' order by window_key) from public.notifications where child_id = :'c3'::uuid),
  'spend_limit:week:2025-12-29,spend_limit:week:2026-01-05', 'two week notices keyed by the local week start');

-- Undone purchases do not count toward the window.
select (public.record_purchase_at(:'c3'::uuid, 400, null, 'w3', '2026-02-10 12:00+05:30'))->>'entry_id' as ew3 \gset
select is(public.undo_purchase_at(:'ew3'::uuid, '2026-02-10 13:00+05:30'), 'undone', 'undo within the window');
select is(
  (public.record_purchase_at(:'c3'::uuid, 300, null, 'w4', '2026-02-10 14:00+05:30'))->>'notices',
  '0', 'an undone purchase does not count toward the limit');
select is(
  (public.record_purchase_at(:'c3'::uuid, 300, null, 'w5', '2026-02-10 15:00+05:30'))->>'notices',
  '1', 'the next purchase crosses with only live purchases counted');
select is(
  (select count(*)::int from public.notifications where child_id = :'c3'::uuid and kind = 'limit_exceeded'),
  3, 'three week notices for C3');

select * from finish();
rollback;
