begin;
\ir _helpers.psql
select plan(25);

-- Fixtures: PA owns family A with child C; PB owns family B.
select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('c@example.com', 'child') as c \gset

select tests.authenticate_as(:'pb'::uuid);
select public.create_family('EUR', 'UTC') as fb \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'Europe/London') as fa \gset
select public.register_child(:'c'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select tests.clear_auth();

-- Seed as postgres.
insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, source_type, idempotency_key, created_by)
values
  (:'fa'::uuid, :'c'::uuid, 'spend', 'allowance_in', 'in', 1000, 'Allowance', 'occurrence', 'k1', :'pa'::uuid),
  (:'fa'::uuid, :'c'::uuid, 'spend', 'purchase', 'out', 250, 'Snack', 'diary', 'k2', :'c'::uuid),
  (:'fa'::uuid, :'c'::uuid, 'save', 'allowance_in', 'in', 500, 'Allowance', 'occurrence', 'k3', :'pa'::uuid),
  (:'fa'::uuid, :'c'::uuid, 'save', 'withdrawal_out', 'out', 100, 'Withdrawal', 'request', 'k4', :'pa'::uuid);
insert into public.ledger_entries (family_id, child_id, mode, jar, kind, direction, amount_minor, source_type, idempotency_key)
values (:'fa'::uuid, :'c'::uuid, 'practice', 'spend', 'purchase', 'out', 9999, 'diary', 'k5');

update public.ledger_entries set occurred_at = now() + interval '1 hour' where idempotency_key = 'k4';

-- Child.
select tests.authenticate_as(:'c'::uuid);
select is((select count(*)::int from public.ledger_entries), 5, 'child sees own rows');
select is(public.balance(:'c'::uuid, 'spend'), 750::bigint, 'spend balance = in - out (recorded only)');
select is(public.balance(:'c'::uuid, 'save'), 400::bigint, 'save balance = in - out');
select is(public.balance(:'c'::uuid, 'spend', 'practice'), -9999::bigint, 'practice balance kept separate');
select is((select count(*)::int from public.list_ledger_history(:'c'::uuid)), 4, 'history is recorded only');
select is((select amount_minor from public.list_ledger_history(:'c'::uuid, 1)), 100::bigint, 'history newest first, limit applied');
select throws_ok(
  format('insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, source_type, idempotency_key) values (%L, %L, %L, %L, %L, 1, %L, %L)',
         :'fa', :'c', 'spend', 'gift_in', 'in', 'diary', 'k6'),
  '42501', null, 'child insert denied');
select tests.clear_auth();

-- Parent of the child.
select tests.authenticate_as(:'pa'::uuid);
select is((select count(*)::int from public.ledger_entries), 5, 'parent sees child rows');
select is(public.balance(:'c'::uuid, 'spend'), 750::bigint, 'parent can read balance');
select is((select count(*)::int from public.list_ledger_history(:'c'::uuid)), 4, 'parent can read history');
select throws_ok(
  format('insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, source_type, idempotency_key) values (%L, %L, %L, %L, %L, 1, %L, %L)',
         :'fa', :'c', 'spend', 'gift_in', 'in', 'diary', 'k6'),
  '42501', null, 'parent insert denied');
select tests.clear_auth();

-- Parent in another family.
select tests.authenticate_as(:'pb'::uuid);
select is((select count(*)::int from public.ledger_entries), 0, 'other-family parent sees no rows');
select throws_ok(format('select public.balance(%L, %L)', :'c', 'spend'), 'JA403', null, 'balance denied across families');
select throws_ok(format('select * from public.list_ledger_history(%L)', :'c'), 'JA403', null, 'history denied across families');
select tests.clear_auth();

-- Constraints (as postgres).
select throws_ok(
  format('insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, source_type, idempotency_key) values (%L, %L, %L, %L, %L, 1, %L, %L)',
         :'fa', :'c', 'spend', 'gift_in', 'in', 'diary', 'k1'),
  '23505', null, 'duplicate idempotency key rejected');
select throws_ok(
  format('insert into public.ledger_entries (family_id, child_id, mode, jar, kind, direction, amount_minor, source_type, idempotency_key) values (%L, %L, %L, %L, %L, %L, 1, %L, %L)',
         :'fa', :'c', 'practice', 'spend', 'allowance_in', 'in', 'occurrence', 'k7'),
  '23514', null, 'practice row cannot use a money source');

-- Named invariants (as postgres, so only constraints stop the row).
select id as e1 from public.ledger_entries where idempotency_key = 'k1' \gset
select throws_like(
  format($$insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, source_type, idempotency_key, reverses_entry_id) values (%L, %L, 'spend', %L, %L, %s, 'diary', %L, %L)$$, :'fa', :'c', 'allowance_in', 'out', '1', 'kd1', null),
  '%ledger_kind_direction%', 'an income kind cannot go out');
select throws_like(
  format($$insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, source_type, idempotency_key, reverses_entry_id) values (%L, %L, 'spend', %L, %L, %s, 'diary', %L, %L)$$, :'fa', :'c', 'purchase', 'in', '1', 'kd2', null),
  '%ledger_kind_direction%', 'a purchase cannot come in');
select throws_like(
  format($$insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, source_type, idempotency_key, reverses_entry_id) values (%L, %L, 'spend', %L, %L, %s, 'diary', %L, %L)$$, :'fa', :'c', 'deposit_out', 'in', '1', 'kd3', null),
  '%ledger_kind_direction%', 'deposit_out must go out');
select throws_like(
  format($$insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, source_type, idempotency_key, reverses_entry_id) values (%L, %L, 'spend', %L, %L, %s, 'diary', %L, %L)$$, :'fa', :'c', 'reversal', 'out', '1', 'rl1', null),
  '%ledger_reversal_link%', 'a reversal must name the entry it reverses');
select throws_like(
  format($$insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, source_type, idempotency_key, reverses_entry_id) values (%L, %L, 'spend', %L, %L, %s, 'diary', %L, %L)$$, :'fa', :'c', 'gift_in', 'in', '1', 'rl2', :'e1'),
  '%ledger_reversal_link%', 'only a reversal may name a reversed entry');
select throws_like(
  format($$insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, source_type, idempotency_key, reverses_entry_id) values (%L, %L, 'spend', %L, %L, %s, 'diary', %L, %L)$$, :'fa', :'c', 'gift_in', 'in', '100000000001', 'mx1', null),
  '%ledger_entries_amount_minor_max%', 'amount above the maximum rejected');
select lives_ok(
  format($$insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, source_type, idempotency_key, reverses_entry_id) values (%L, %L, 'spend', %L, %L, %s, 'diary', %L, %L)$$, :'fa', :'c', 'reversal', 'out', '1000', 'rv1', :'e1'),
  'a reversal in either direction with its link is accepted');
select throws_ok(
  format($$insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, source_type, idempotency_key, reverses_entry_id) values (%L, %L, 'spend', %L, %L, %s, 'diary', %L, %L)$$, :'fa', :'c', 'reversal', 'out', '1000', 'rv2', :'e1'),
  '23505', null, 'an entry can be reversed only once');
select lives_ok(
  format($$insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, source_type, idempotency_key, reverses_entry_id) values (%L, %L, 'spend', %L, %L, %s, 'diary', %L, %L)$$, :'fa', :'c', 'gift_in', 'in', '100000000000', 'mx2', null),
  'amount at the maximum accepted');

select * from finish();
rollback;
