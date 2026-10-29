begin;
\ir _helpers.psql
select plan(20);

select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('pr@example.com') as pr \gset
select tests.create_user('pz@example.com') as pz \gset
select tests.create_user('c1@example.com', 'child') as c1 \gset

select tests.authenticate_as(:'pz'::uuid);
select public.create_family('INR', 'Asia/Kolkata') as fz \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select tests.clear_auth();

-- A second approved parent and a removed one in family A.
insert into public.family_members (family_id, profile_id, role, status)
values (:'fa'::uuid, :'pb'::uuid, 'parent', 'approved'), (:'fa'::uuid, :'pr'::uuid, 'parent', 'removed');

select gen_random_uuid() as src \gset

-- Fan-out
select is(public.notify_parents(:'c1'::uuid, 'limit_exceeded', 'ledger_entry', :'src'::uuid, 'w1', '{"x":1}'::jsonb), 2, 'notify_parents returns rows inserted');
select is((select count(*)::int from public.notifications), 2, 'one row per approved parent; removed parent skipped');
select is(public.notify_parents(:'c1'::uuid, 'limit_exceeded', 'ledger_entry', :'src'::uuid, 'w1', '{"x":2}'::jsonb), 0, 'a deduplicated repeat returns 0');
select is((select count(*)::int from public.notifications), 2, 'same window_key does not duplicate');
select public.notify_parents(:'c1'::uuid, 'limit_exceeded', 'ledger_entry', :'src'::uuid, 'w2', '{}'::jsonb);
select is((select count(*)::int from public.notifications), 4, 'a new window_key notifies again');
select public.notify_parents(:'c1'::uuid, 'withdrawal_requested', 'request', :'src'::uuid, null, '{}'::jsonb);
select public.notify_parents(:'c1'::uuid, 'withdrawal_requested', 'request', :'src'::uuid, null, '{}'::jsonb);
select is((select count(*)::int from public.notifications where kind = 'withdrawal_requested'), 4, 'null window_key is never deduplicated');
select is((select count(*)::int from public.notifications where family_id = :'fa'::uuid and child_id = :'c1'::uuid), 8, 'rows carry family and child');

-- notify_child
select is(public.notify_child(:'c1'::uuid, 'withdrawal_decided', 'request', :'src'::uuid, null, '{}'::jsonb), 1, 'notify_child returns rows inserted');
select is((select recipient_id from public.notifications where kind = 'withdrawal_decided'), :'c1'::uuid, 'notify_child targets the child');

-- Validation
select throws_ok(
  format($$select public.notify_parents(%L, 'nope', 'request', %L, null, '{}'::jsonb)$$, :'c1', :'src'),
  '23514', null, 'unknown kind rejected');

-- Reads
select tests.authenticate_as(:'pa'::uuid);
select is((select count(*)::int from public.notifications), 4, 'parent sees only their own rows');
select is((select count(*)::int from public.notifications where recipient_id = :'pa'::uuid), 4, 'and they are addressed to the parent');
select tests.authenticate_as(:'pb'::uuid);
select is((select count(*)::int from public.notifications where recipient_id <> :'pb'::uuid), 0, 'other parent sees none of the first parent''s rows');
select tests.authenticate_as(:'c1'::uuid);
select is((select count(*)::int from public.notifications), 1, 'child sees only the notice addressed to them');
select tests.authenticate_as(:'pz'::uuid);
select is((select count(*)::int from public.notifications), 0, 'another family''s parent sees none');

-- Writes and internal functions
select tests.authenticate_as(:'pa'::uuid);
select throws_ok(
  format($$insert into public.notifications (family_id, recipient_id, child_id, kind, source_type, source_id) values (%L, %L, %L, 'limit_exceeded', 'request', %L)$$, :'fa', :'pa', :'c1', :'src'),
  '42501', null, 'authenticated cannot insert');
select throws_ok($$update public.notifications set read_at = now()$$, '42501', null, 'authenticated cannot update');
select throws_ok($$delete from public.notifications$$, '42501', null, 'authenticated cannot delete');
select throws_ok(
  format($$select public.notify_parents(%L, 'limit_exceeded', 'request', %L, null, '{}'::jsonb)$$, :'c1', :'src'),
  '42501', null, 'authenticated cannot execute notify_parents');
select throws_ok(
  format($$select public.notify_child(%L, 'limit_exceeded', 'request', %L, null, '{}'::jsonb)$$, :'c1', :'src'),
  '42501', null, 'authenticated cannot execute notify_child');

select * from finish();
rollback;
