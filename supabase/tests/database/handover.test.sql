begin;
\ir _helpers.psql
select plan(36);

select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('c1@example.com', 'child') as c1 \gset

select tests.authenticate_as(:'pb'::uuid);
select public.create_family('INR', 'Asia/Kolkata') as fb \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select tests.clear_auth();

insert into public.allowance_schedules (family_id, child_id, amount_minor, frequency, anchor_on)
values (:'fa'::uuid, :'c1'::uuid, 500, 'weekly', '2026-01-05')
returning id as s1 \gset

insert into public.allowance_occurrences (schedule_id, family_id, child_id, period_key, due_on, amount_minor)
values
  (:'s1'::uuid, :'fa'::uuid, :'c1'::uuid, '2026-01-05', '2026-01-05', 500),
  (:'s1'::uuid, :'fa'::uuid, :'c1'::uuid, '2026-01-12', '2026-01-12', 500),
  (:'s1'::uuid, :'fa'::uuid, :'c1'::uuid, '2026-01-19', '2026-01-19', 500),
  (:'s1'::uuid, :'fa'::uuid, :'c1'::uuid, '2026-01-26', '2026-01-26', 500),
  (:'s1'::uuid, :'fa'::uuid, :'c1'::uuid, '2026-02-02', '2026-02-02', 500),
  (:'s1'::uuid, :'fa'::uuid, :'c1'::uuid, '2026-02-09', '2026-02-09', 500);
select id as o1 from public.allowance_occurrences where period_key = '2026-01-05' \gset
select id as o2 from public.allowance_occurrences where period_key = '2026-01-12' \gset
select id as o3 from public.allowance_occurrences where period_key = '2026-01-19' \gset
select id as o4 from public.allowance_occurrences where period_key = '2026-01-26' \gset
select id as o5 from public.allowance_occurrences where period_key = '2026-02-02' \gset
select id as o6 from public.allowance_occurrences where period_key = '2026-02-09' \gset

-- Access
select tests.authenticate_as(:'c1'::uuid);
select throws_ok(format($$select public.confirm_handover(%L, 300, 200, 'k-child')$$, :'o1'), 'JA403', null, 'child cannot confirm');
select throws_ok(format($$select public.mark_not_given(%L)$$, :'o1'), 'JA403', null, 'child cannot mark not given');
select tests.authenticate_as(:'pb'::uuid);
select throws_ok(format($$select public.confirm_handover(%L, 300, 200, 'k-other')$$, :'o1'), 'JA403', null, 'other family parent cannot confirm');
select throws_ok(format($$select public.mark_not_given(%L)$$, :'o1'), 'JA403', null, 'other family parent cannot mark not given');
select tests.clear_auth();
set local role anon;
select throws_ok(format($$select public.confirm_handover(%L, 300, 200, 'k-anon')$$, :'o1'), '42501', null, 'anon cannot confirm');
reset role;

-- Due money is not in the balance
select tests.authenticate_as(:'pa'::uuid);
select is(public.balance(:'c1'::uuid, 'spend'), 0::bigint, 'due money is not in balance before confirmation');

-- Confirm 300 + 200
select is(tests.holds_ledger_lock(:'c1'::uuid), false, 'no ledger lock before a handover');
select is(public.confirm_handover(:'o1'::uuid, 300, 200, 'k1'), 'confirmed', 'confirm returns confirmed');
select is(tests.holds_ledger_lock(:'c1'::uuid), true, 'confirm takes the child''s ledger advisory lock');
select is(public.balance(:'c1'::uuid, 'spend'), 300::bigint, 'spend balance 300');
select is(public.balance(:'c1'::uuid, 'save'), 200::bigint, 'save balance 200');
select is(
  (select status || ':' || shortfall_minor from public.allowance_occurrences where id = :'o1'::uuid),
  'confirmed:0', 'confirmed with no shortfall');
select is(public.confirm_handover(:'o1'::uuid, 300, 200, 'k1'), 'already_confirmed', 'same key again is already_confirmed');
select is(public.confirm_handover(:'o1'::uuid, 100, 100, 'k1-other'), 'already_confirmed', 'different key is already_confirmed');
select is((select count(*)::int from public.ledger_entries where source_id = :'o1'::uuid), 2, 'ledger still has 2 rows');

-- Shortfall
select public.confirm_handover(:'o2'::uuid, 300, 100, 'k2');
select is((select shortfall_minor from public.allowance_occurrences where id = :'o2'::uuid), 100::bigint, '300 + 100 gives shortfall 100');

-- Validation
select throws_ok(format($$select public.confirm_handover(%L, 400, 200, 'k3a')$$, :'o3'), '22023', null, 'over amount rejected');
select throws_ok(format($$select public.confirm_handover(%L, 0, 0, 'k3b')$$, :'o3'), '22023', null, 'zero total rejected');
select throws_ok(format($$select public.confirm_handover(%L, -1, 0, 'k3c')$$, :'o3'), '22023', null, 'negative rejected');
select throws_ok(
  format($$select public.confirm_handover(%L, 9223372036854775807, 1, 'k3d')$$, :'o3'),
  '22023', null, 'sum beyond bigint is 22023, not an overflow');
select throws_ok(
  format($$select public.confirm_handover(%L, 100000000001, 0, 'k3e')$$, :'o3'),
  '22023', null, 'cash above the maximum rejected');

-- Not given
select is(public.mark_not_given(:'o4'::uuid), 'closed', 'not given closes');
select is((select count(*)::int from public.ledger_entries where source_id = :'o4'::uuid), 0, 'not given posts no ledger rows');
select is(public.confirm_handover(:'o4'::uuid, 300, 200, 'k4'), 'already_confirmed', 'confirm after not given is already_confirmed');

select is((select count(*)::int from public.audit_log where action = 'allowance.not_given' and subject_id = :'o4'::uuid), 1, 'not given writes an audit row');
select is(public.mark_not_given(:'o1'::uuid), 'already_handled', 'not given on a confirmed row is already_handled');
select is(public.mark_not_given(:'o4'::uuid), 'already_handled', 'not given twice is already_handled');

select throws_ok(format($$select public.confirm_handover(%L, 100, 0, null)$$, :'o3'), '22023', null, 'null key rejected');
select throws_ok(format($$select public.confirm_handover(%L, 100, 0, '  ')$$, :'o3'), '22023', null, 'blank key rejected');

select is(public.confirm_handover(:'o5'::uuid, 300, 0, 'shared'), 'confirmed', 'cash only confirms');
select is((select count(*)::int from public.ledger_entries where source_id = :'o5'::uuid), 1, 'cash only creates one ledger row');
select is(public.confirm_handover(:'o6'::uuid, 200, 100, 'shared'), 'confirmed', 'same key on another occurrence also confirms');

-- Occurrence invariants (as postgres, so only constraints stop the row).
select tests.clear_auth();
select throws_like(
  format($$update public.allowance_occurrences set status = 'confirmed' where id = %L$$, :'o3'),
  '%allowance_occurrences_confirmed_split%', 'confirmed needs the split and a time');
select throws_like(
  format($$update public.allowance_occurrences set status = 'confirmed', cash_minor = 100, saved_minor = 100, confirmed_at = now() where id = %L$$, :'o3'),
  '%allowance_occurrences_confirmed_split%', 'confirmed split must add up with the shortfall');
select lives_ok(
  format($$update public.allowance_occurrences set status = 'confirmed', cash_minor = 300, saved_minor = 100, shortfall_minor = 100, confirmed_at = now() where id = %L$$, :'o3'),
  'a confirmed split that adds up is accepted');
select is(
  (select indexdef like '%WHERE (status = ''due''::text)%' from pg_indexes where indexname = 'allowance_occurrences_child_due_idx'),
  true, 'due occurrences have a partial index');

select * from finish();
rollback;
