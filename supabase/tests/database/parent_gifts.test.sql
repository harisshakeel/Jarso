begin;
\ir _helpers.psql
select plan(74);

select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('c1@example.com', 'child') as c1 \gset

select tests.authenticate_as(:'pb'::uuid);
select public.create_family('INR', 'Asia/Kolkata') as fb \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select tests.clear_auth();

select (now() at time zone 'UTC')::date as today \gset
select ((now() at time zone 'UTC')::date + 7) as next_week \gset
select ((now() at time zone 'UTC')::date - 3) as three_days_ago \gset

-- One due allowance, older than any gift, for list_due_for_parent ordering.
insert into public.allowance_schedules (family_id, child_id, amount_minor, frequency, anchor_on)
values (:'fa'::uuid, :'c1'::uuid, 500, 'weekly', :'three_days_ago'::date)
returning id as s1 \gset
insert into public.allowance_occurrences (schedule_id, family_id, child_id, period_key, due_on, amount_minor)
values (:'s1'::uuid, :'fa'::uuid, :'c1'::uuid, :'three_days_ago', :'three_days_ago'::date, 500)
returning id as o1 \gset

-- ---------------------------------------------------------------------------
-- Parent creates gifts
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'pa'::uuid);

select public.create_gift(:'c1'::uuid, 1000, :'today'::date, '  Great report card!  ') as g1 \gset
select public.create_gift(:'c1'::uuid, 2000, :'next_week'::date, null) as g2 \gset
select public.create_gift(:'c1'::uuid, 700, :'today'::date, '   ') as g3 \gset
select public.create_gift(:'c1'::uuid, 300, :'today'::date, 'Cancelled surprise') as g4 \gset
select public.create_gift(:'c1'::uuid, 1000, :'today'::date, null) as g5 \gset

select is(
  (select family_id::text || ':' || status || ':' || note from public.parent_gifts where id = :'g1'::uuid),
  :'fa' || ':pending:Great report card!', 'create stores family from membership, pending, trimmed note');
select is((select note from public.parent_gifts where id = :'g3'::uuid), null, 'blank note is stored as null');
select is(
  (select count(*)::int from public.audit_log where action = 'gift.created' and subject_id = :'g1'::uuid),
  1, 'create writes gift.created');

select throws_ok(
  format($$select public.create_gift(%L, 1000, %L, null)$$, :'c1', :'three_days_ago'),
  '22023', null, 'give_on before family today rejected');
select throws_ok(format($$select public.create_gift(%L, 0, %L, null)$$, :'c1', :'today'), '22023', null, 'zero amount rejected');
select throws_ok(format($$select public.create_gift(%L, -5, %L, null)$$, :'c1', :'today'), '22023', null, 'negative amount rejected');
select throws_ok(format($$select public.create_gift(%L, 100, null, null)$$, :'c1'), '22023', null, 'null give_on rejected');
select throws_ok(
  format($$select public.create_gift(%L, 100, %L, null)$$, :'c1', (:'today'::date + 367)),
  '22023', null, 'give_on more than 366 days ahead rejected');
select throws_ok(
  format($$select public.create_gift(%L, 100000000001, %L, null)$$, :'c1', :'today'),
  '22023', null, 'amount above the maximum rejected');
select throws_ok(
  format($$select public.create_gift(%L, 100, %L, %L)$$, :'c1', :'today', repeat('x', 141)),
  '22023', null, 'note over 140 rejected');
select lives_ok(
  format($$select public.create_gift(%L, 100, %L, %L)$$, :'c1', :'next_week', ' ' || repeat('x', 140) || ' '),
  'note of 140 after trim accepted');

-- Parent view
select is((select count(*)::int from public.parent_gifts where child_id = :'c1'::uuid), 6, 'parent sees all gifts');
select results_eq(
  format($$select kind, due_on from public.list_due_for_parent(%L)$$, :'c1'),
  format(
    $$values ('allowance'::text, %L::date), ('gift', %L), ('gift', %L), ('gift', %L), ('gift', %L)$$,
    :'three_days_ago', :'today', :'today', :'today', :'today'),
  'due list: the allowance first, then gifts due today, oldest first');
select set_eq(
  format($$select id from public.list_due_for_parent(%L) where kind = 'gift'$$, :'c1'),
  format($$values (%L::uuid), (%L::uuid), (%L::uuid), (%L::uuid)$$, :'g1', :'g3', :'g4', :'g5'),
  'due list has pending gifts due today, not future ones');
select is(
  (select note from public.list_due_for_parent(:'c1'::uuid) where id = :'g1'::uuid),
  'Great report card!', 'due list carries the gift note');

-- ---------------------------------------------------------------------------
-- Secrecy: the child sees nothing about pending gifts
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'c1'::uuid);
select is((select count(*)::int from public.parent_gifts), 0, 'child sees no pending gift rows');
select throws_ok(format($$select * from public.list_due_for_parent(%L)$$, :'c1'), 'JA403', null, 'child cannot list due items');
select is(public.balance(:'c1'::uuid, 'spend'), 0::bigint, 'child spend balance unchanged by pending gift');
select is(public.balance(:'c1'::uuid, 'save'), 0::bigint, 'child save balance unchanged by pending gift');
select is((select count(*)::int from public.list_ledger_history(:'c1'::uuid)), 0, 'child history empty before handover');
select throws_ok(format($$select public.create_gift(%L, 100, %L, null)$$, :'c1', :'today'), 'JA403', null, 'child cannot create a gift');
select throws_ok(format($$select public.update_gift(%L, 100, %L, null)$$, :'g1', :'today'), 'JA403', null, 'child cannot edit a gift');
select throws_ok(format($$select public.cancel_gift(%L)$$, :'g1'), 'JA403', null, 'child cannot cancel a gift');
select throws_ok(format($$select public.confirm_gift_handover(%L, 100, 0, 'k-child')$$, :'g1'), 'JA403', null, 'child cannot confirm a gift');
select throws_ok(format($$select public.lock_gift_for_parent(%L)$$, :'g1'), '42501', null, 'child cannot call the lock helper');
select throws_ok(
  format($$update public.parent_gifts set status = 'given' where id = %L$$, :'g1'),
  '42501', null, 'child cannot update gifts directly');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- Edit and cancel while pending
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'pa'::uuid);

select is(public.update_gift(:'g2'::uuid, 2500, :'next_week'::date, ' New bike fund '), :'g2'::uuid, 'update returns the gift id');
select is(
  (select amount_minor || ':' || note from public.parent_gifts where id = :'g2'::uuid),
  '2500:New bike fund', 'update changes amount and note');
select is(
  (select count(*)::int from public.audit_log where action = 'gift.updated' and subject_id = :'g2'::uuid),
  1, 'update writes gift.updated');
select throws_ok(
  format($$select public.update_gift(%L, 2500, %L, null)$$, :'g2', :'three_days_ago'),
  '22023', null, 'update to a past date rejected');
select throws_ok(format($$select public.update_gift(%L, 0, %L, null)$$, :'g2', :'next_week'), '22023', null, 'update to zero rejected');
select throws_ok(
  format($$select public.update_gift(%L, 2500, %L, null)$$, :'g2', (:'today'::date + 367)),
  '22023', null, 'update to more than 366 days ahead rejected');
select throws_ok(
  format($$select public.update_gift(%L, 100000000001, %L, null)$$, :'g2', :'next_week'),
  '22023', null, 'update to an amount above the maximum rejected');
select throws_ok(
  format($$select public.update_gift(%L, 2500, %L, %L)$$, :'g2', :'next_week', repeat('y', 141)),
  '22023', null, 'update with long note rejected');

select is(public.cancel_gift(:'g4'::uuid), :'g4'::uuid, 'cancel returns the gift id');
select is((select status from public.parent_gifts where id = :'g4'::uuid), 'cancelled', 'cancel sets cancelled');
select is(
  (select count(*)::int from public.audit_log where action = 'gift.cancelled' and subject_id = :'g4'::uuid),
  1, 'cancel writes gift.cancelled');
select throws_ok(format($$select public.cancel_gift(%L)$$, :'g4'), 'JA409', null, 'cancel twice is JA409');
select throws_ok(format($$select public.update_gift(%L, 100, %L, null)$$, :'g4', :'today'), 'JA409', null, 'edit a cancelled gift is JA409');
select is(public.confirm_gift_handover(:'g4'::uuid, 300, 0, 'k4'), 'already_confirmed', 'confirm on a cancelled gift is already_confirmed');
select is((select count(*)::int from public.ledger_entries where source_id = :'g4'::uuid), 0, 'cancelled gift posts nothing');

-- ---------------------------------------------------------------------------
-- Handover
-- ---------------------------------------------------------------------------
select throws_ok(format($$select public.confirm_gift_handover(%L, 1000, 0, 'k2')$$, :'g2'), 'JA409', null, 'future gift cannot be confirmed');
select throws_ok(format($$select public.confirm_gift_handover(%L, 0, 0, 'k5a')$$, :'g5'), '22023', null, '0 + 0 rejected');
select throws_ok(format($$select public.confirm_gift_handover(%L, 100001, 0, 'k5b')$$, :'g5'), '22023', null, 'over 100x planned rejected');
select throws_ok(format($$select public.confirm_gift_handover(%L, -1, 500, 'k5c')$$, :'g5'), '22023', null, 'negative rejected');
select throws_ok(format($$select public.confirm_gift_handover(%L, 100, 0, '  ')$$, :'g5'), '22023', null, 'blank key rejected');
select throws_ok(format($$select public.confirm_gift_handover(%L, 100, 0, null)$$, :'g5'), '22023', null, 'null key rejected');
select public.create_gift(:'c1'::uuid, 100000000000, :'today'::date, null) as g6 \gset
select throws_ok(
  format($$select public.confirm_gift_handover(%L, 100000000001, 0, 'k6a')$$, :'g6'),
  '22023', null, 'gift cash above the maximum rejected');
select throws_ok(
  format($$select public.confirm_gift_handover(%L, 0, 100000000001, 'k6b')$$, :'g6'),
  '22023', null, 'gift saved above the maximum rejected');
select is(public.cancel_gift(:'g6'::uuid), :'g6'::uuid, 'the oversize test gift is cancelled');
select is(public.confirm_gift_handover(:'g5'::uuid, 60000, 40000, 'k5'), 'confirmed', 'exactly 100x planned accepted');
select is(tests.holds_ledger_lock(:'c1'::uuid), true, 'gift confirm takes the child''s ledger advisory lock');
select is(
  (select string_agg(jar || ':' || amount_minor || ':' || label, ',' order by jar)
   from public.ledger_entries where source_id = :'g5'::uuid),
  'save:40000:Gift,spend:60000:Gift', 'gift with no note is labelled Gift');

select is(public.confirm_gift_handover(:'g1'::uuid, 1500, 0, 'k1'), 'confirmed', 'confirm 1500 against planned 1000');
select is(
  (select status || ':' || cash_minor || ':' || saved_minor || ':' || (given_by = :'pa'::uuid) || ':' || (given_at is not null)
   from public.parent_gifts where id = :'g1'::uuid),
  'given:1500:0:true:true', 'gift is given with who and when');
select is(
  (select kind || ':' || source_type || ':' || jar || ':' || amount_minor || ':' || idempotency_key
   from public.ledger_entries where source_id = :'g1'::uuid),
  'parent_gift_in:parent_gift:spend:1500:parent_gift:' || :'g1' || ':spend', 'one spend entry keyed by the gift');
select is(public.confirm_gift_handover(:'g1'::uuid, 1500, 0, 'k1'), 'already_confirmed', 'same key again is already_confirmed');
select is(public.confirm_gift_handover(:'g1'::uuid, 200, 200, 'k1-other'), 'already_confirmed', 'different key is already_confirmed');
select is((select count(*)::int from public.ledger_entries where source_id = :'g1'::uuid), 1, 'still one ledger row');

select throws_ok(format($$select public.update_gift(%L, 100, %L, null)$$, :'g1', :'today'), 'JA409', null, 'edit a given gift is JA409');
select throws_ok(format($$select public.cancel_gift(%L)$$, :'g1'), 'JA409', null, 'cancel a given gift is JA409');
select set_eq(
  format($$select id from public.list_due_for_parent(%L)$$, :'c1'),
  format($$values (%L::uuid), (%L::uuid)$$, :'o1', :'g3'),
  'given and cancelled gifts leave the due list');

-- ---------------------------------------------------------------------------
-- The child after handover
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'c1'::uuid);
select is((select count(*)::int from public.parent_gifts), 0, 'child sees no gift rows, even given ones');
select is(
  (select count(*)::int from public.ledger_entries where source_id = :'g1'::uuid and label = 'Great report card!'),
  1, 'child sees the given gift as a ledger row with its note');
select is(
  (select count(*)::int from public.list_ledger_history(:'c1'::uuid)
   where kind = 'parent_gift_in' and label = 'Great report card!' and amount_minor = 1500),
  1, 'child history shows the gift with its note');
select is(public.balance(:'c1'::uuid, 'spend'), 61500::bigint, 'child spend balance includes given gifts');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- Another family
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'pb'::uuid);
select is((select count(*)::int from public.parent_gifts), 0, 'other family sees no gifts');
select throws_ok(format($$select public.create_gift(%L, 100, %L, null)$$, :'c1', :'today'), 'JA403', null, 'other family cannot create');
select throws_ok(format($$select public.update_gift(%L, 100, %L, null)$$, :'g2', :'next_week'), 'JA403', null, 'other family cannot edit');
select throws_ok(format($$select public.cancel_gift(%L)$$, :'g2'), 'JA403', null, 'other family cannot cancel');
select throws_ok(format($$select public.confirm_gift_handover(%L, 100, 0, 'k-b')$$, :'g3'), 'JA403', null, 'other family cannot confirm');
select throws_ok(format($$select * from public.list_due_for_parent(%L)$$, :'c1'), 'JA403', null, 'other family cannot list due');
select throws_ok(format($$select public.cancel_gift(%L)$$, gen_random_uuid()), 'JA403', null, 'missing gift is JA403 too');
select tests.clear_auth();

set local role anon;
select throws_ok(format($$select public.create_gift(%L, 100, %L, null)$$, :'c1', :'today'), '42501', null, 'anon cannot create');
reset role;

select * from finish();
rollback;
