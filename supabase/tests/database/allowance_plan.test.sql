begin;
\ir _helpers.psql
select plan(9);

select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('c1@example.com', 'child') as c1 \gset
select tests.create_user('c2@example.com', 'child') as c2 \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select public.register_child(:'c2'::uuid, :'fa'::uuid, 'Max', '1234', true);
select tests.clear_auth();

insert into public.allowance_schedules (family_id, child_id, amount_minor, frequency, anchor_on)
values (:'fa'::uuid, :'c1'::uuid, 500, 'weekly', '2026-01-05')
returning id as s1 \gset

insert into public.allowance_occurrences (schedule_id, family_id, child_id, period_key, due_on, amount_minor)
values
  (:'s1'::uuid, :'fa'::uuid, :'c1'::uuid, '2026-01-05', '2026-01-05', 500),
  (:'s1'::uuid, :'fa'::uuid, :'c1'::uuid, '2026-01-12', '2026-01-12', 500);
select id as o1 from public.allowance_occurrences where period_key = '2026-01-05' \gset
select id as o2 from public.allowance_occurrences where period_key = '2026-01-12' \gset

select tests.authenticate_as(:'pa'::uuid);
select public.confirm_handover(:'o1'::uuid, 300, 200, 'k1');
select tests.clear_auth();

-- Grants
select function_privs_are('public', 'decide_allowance_plan', array['uuid'], 'anon', array[]::text[], 'anon cannot decide');
select function_privs_are('public', 'decide_allowance_plan', array['uuid'], 'authenticated', array['EXECUTE'], 'authenticated can decide');

-- Access
select tests.authenticate_as(:'pa'::uuid);
select throws_ok(format($$select public.decide_allowance_plan(%L)$$, :'o1'), 'JA403', null, 'a parent cannot decide the child''s plan');
select tests.authenticate_as(:'c2'::uuid);
select throws_ok(format($$select public.decide_allowance_plan(%L)$$, :'o1'), 'JA403', null, 'another child cannot decide it');
select throws_ok($$select public.decide_allowance_plan('00000000-0000-0000-0000-000000000000')$$, 'JA403', null, 'a missing row is not allowed');

-- The child, on a confirmed allowance
select tests.authenticate_as(:'c1'::uuid);
select throws_ok(format($$select public.decide_allowance_plan(%L)$$, :'o2'), 'JA409', null, 'an allowance still due has no plan to decide');
select is((select plan_decided_at from public.allowance_occurrences where id = :'o1'::uuid), null, 'undecided before');
select public.decide_allowance_plan(:'o1'::uuid);
select isnt((select plan_decided_at from public.allowance_occurrences where id = :'o1'::uuid), null, 'decided after');
select public.decide_allowance_plan(:'o1'::uuid);
select is(
  (select count(distinct plan_decided_at)::int from public.allowance_occurrences where id = :'o1'::uuid),
  1, 'a repeat keeps the first time');

select * from finish();
rollback;
