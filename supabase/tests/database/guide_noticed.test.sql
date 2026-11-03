begin;
\ir _helpers.psql
select plan(33);

-- Jarso noticed (demo 3). PA owns family A with C1 (Jarso on) and C2 (Jarso off).
select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('c1@example.com', 'child') as c1 \gset
select tests.create_user('c2@example.com', 'child') as c2 \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select public.register_child(:'c2'::uuid, :'fa'::uuid, 'Max', '1234', true);
select public.set_guide_access(:'c2'::uuid, false);
select tests.clear_auth();
insert into public.family_members (family_id, profile_id, role, status)
values (:'fa'::uuid, :'pb'::uuid, 'parent', 'approved');

-- Privileges and RLS
select ok((select relrowsecurity from pg_class where oid = 'public.guide_noticed_runs'::regclass), 'RLS is on');
select table_privs_are('public', 'guide_noticed_runs', 'authenticated', array[]::text[], 'authenticated has no access');
select table_privs_are('public', 'guide_noticed_runs', 'anon', array[]::text[], 'anon has no access');
select function_privs_are('public', 'guide_noticed_inputs', array['timestamp with time zone'],
  'authenticated', array[]::text[], 'only the server reads the inputs');
select function_privs_are('public', 'guide_noticed_inputs', array['timestamp with time zone'],
  'service_role', array['EXECUTE'], 'the server reads the inputs');
select function_privs_are('public', 'guide_noticed_record', array['uuid', 'text', 'jsonb', 'jsonb'],
  'authenticated', array[]::text[], 'only the server records a nudge');
select function_privs_are('public', 'guide_noticed_record', array['uuid', 'text', 'jsonb', 'jsonb'],
  'service_role', array['EXECUTE'], 'the server records a nudge');

-- C1: three handed-over allowances with something saved, the newest first in the inputs.
insert into public.allowance_schedules (family_id, child_id, amount_minor, frequency, anchor_on)
values (:'fa'::uuid, :'c1'::uuid, 500, 'weekly', date '2030-01-01')
returning id as s1 \gset
insert into public.allowance_occurrences
  (schedule_id, family_id, child_id, period_key, due_on, amount_minor, status, cash_minor, saved_minor, confirmed_at)
values
  (:'s1'::uuid, :'fa'::uuid, :'c1'::uuid, 'p1', date '2026-10-16', 500, 'confirmed', 500, 0, now()),
  (:'s1'::uuid, :'fa'::uuid, :'c1'::uuid, 'p2', date '2026-10-23', 500, 'confirmed', 300, 200, now()),
  (:'s1'::uuid, :'fa'::uuid, :'c1'::uuid, 'p3', date '2026-10-30', 500, 'confirmed', 300, 200, now());

-- Save of 3000 with 500 waiting to come out, and a goal of 10000: 2500 counts.
insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, source_type, idempotency_key, created_by, occurred_at)
values (:'fa'::uuid, :'c1'::uuid, 'save', 'allowance_in', 'in', 3000, 'Allowance', 'occurrence', 'seed:c1:save', :'pa'::uuid, now() - interval '20 days');
insert into public.requests (family_id, child_id, kind, status, amount_minor, idempotency_key)
values (:'fa'::uuid, :'c1'::uuid, 'withdrawal', 'pending', 500, 'w1');
insert into public.goals (family_id, child_id, name, emoji, target_minor)
values (:'fa'::uuid, :'c1'::uuid, 'Bike', '🚲', 10000)
returning id as g1 \gset

-- Purchases: 500 in the last 7 days, 200 the 7 before, and a reversed 999 that never counts.
insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, source_type, idempotency_key, created_by, occurred_at)
values
  (:'fa'::uuid, :'c1'::uuid, 'spend', 'purchase', 'out', 500, 'Snack', 'diary', 'seed:c1:p1', :'c1'::uuid, now() - interval '1 day'),
  (:'fa'::uuid, :'c1'::uuid, 'spend', 'purchase', 'out', 200, 'Comic', 'diary', 'seed:c1:p2', :'c1'::uuid, now() - interval '10 days');
insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, source_type, idempotency_key, created_by, occurred_at)
values (:'fa'::uuid, :'c1'::uuid, 'spend', 'purchase', 'out', 999, 'Oops', 'diary', 'seed:c1:p3', :'c1'::uuid, now() - interval '2 days')
returning id as p3 \gset
insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, source_type, idempotency_key, created_by, occurred_at, reverses_entry_id)
values (:'fa'::uuid, :'c1'::uuid, 'spend', 'reversal', 'in', 999, 'Oops', 'diary', 'seed:c1:p3:undo', :'c1'::uuid, now() - interval '2 days', :'p3'::uuid);

-- Inputs
set local role service_role;
create temp table inputs on commit drop as
  select * from public.guide_noticed_inputs() where family_id = :'fa'::uuid;
select is((select count(*)::int from inputs), 2, 'one row per approved child');
select is((select guide_on from inputs where child_id = :'c1'::uuid), true, 'no switch row means Jarso is on');
select is((select guide_on from inputs where child_id = :'c2'::uuid), false, 'a parent''s off is passed on');
select is((select nickname from inputs where child_id = :'c1'::uuid), 'Sam', 'nickname');
select is((select currency || ' ' || timezone from inputs where child_id = :'c1'::uuid), 'GBP UTC', 'currency and timezone');
select is((select allowance_days -> 0 ->> 'on' from inputs where child_id = :'c1'::uuid), '2026-10-30',
  'allowances come newest first');
select is((select pg_catalog.jsonb_path_query_array(allowance_days, '$[*].saved') from inputs where child_id = :'c1'::uuid),
  '[true, true, false]'::jsonb, 'with whether something was saved');
select is((select (goal ->> 'counted_minor')::bigint from inputs where child_id = :'c1'::uuid), 2500::bigint,
  'the goal counts Save less money waiting to come out');
select is((select goal ->> 'id' from inputs where child_id = :'c1'::uuid), :'g1', 'the active goal');
select is((select spent_last_7_days_minor from inputs where child_id = :'c1'::uuid), 500::bigint,
  'live purchases in the last 7 days; a reversed one never counts');
select is((select spent_7_days_before_minor from inputs where child_id = :'c1'::uuid), 200::bigint,
  'and in the 7 days before');
select is((select last_move_on from inputs where child_id = :'c1'::uuid), (now() - interval '1 day')::date,
  'the family-local day of the last money movement');
select is((select goal from inputs where child_id = :'c2'::uuid), null::jsonb, 'no goal, no goal object');

-- Recording
select is(public.guide_noticed_record(:'c1'::uuid, 'goal_quarter:' || :'g1' || ':1',
  '{"title":"A quarter of the way to Bike"}'::jsonb, '{"title":"Sam is a quarter of the way to Bike"}'::jsonb), 3,
  'one notice to the child and one to each parent');
select is((select count(*)::int from public.notifications
  where child_id = :'c1'::uuid and kind = 'guide_noticed' and source_type = 'guide_noticed'
    and window_key = 'goal_quarter:' || :'g1' || ':1'), 3, 'kind, source and key on every notice');
select is((select payload ->> 'title' from public.notifications where recipient_id = :'c1'::uuid and kind = 'guide_noticed'),
  'A quarter of the way to Bike', 'the child gets the child''s line');
select is(public.guide_noticed_record(:'c1'::uuid, 'saving_streak:2026-10-23:3', '{"title":"x"}'::jsonb, null), 0,
  'at most one nudge a week');
select is((select signal_keys from public.guide_noticed_inputs() where child_id = :'c1'::uuid),
  array['goal_quarter:' || :'g1' || ':1'], 'sent keys come back in the inputs');

-- A week later: a new signal goes out, an old one never does again.
update public.guide_noticed_runs set noticed_at = now() - interval '8 days' where child_id = :'c1'::uuid;
select is(public.guide_noticed_record(:'c1'::uuid, 'goal_quarter:' || :'g1' || ':1', '{"title":"x"}'::jsonb, null), 0,
  'a signal is sent once');
select is(public.guide_noticed_record(:'c1'::uuid, 'spending_jump:2026-11-02', null, '{"title":"y"}'::jsonb), 2,
  'a parent-only signal goes to the parents only');
select is((select count(*)::int from public.notifications where recipient_id = :'c1'::uuid and kind = 'guide_noticed'), 1,
  'and not to the child');

-- Jarso off: the fixed line still goes out (nothing reaches Anthropic).
select is(public.guide_noticed_record(:'c2'::uuid, 'quiet:2026-10-01', '{"title":"z"}'::jsonb, null), 1,
  'a child with Jarso off still gets the fixed line');

-- Refusals
select throws_ok(format($$select public.guide_noticed_record(%L, '  ', '{}'::jsonb, null)$$, :'c1'), '22023', null,
  'a blank key is refused');
select throws_ok(format($$select public.guide_noticed_record(%L, 'k', null, null)$$, :'c1'), '22023', null,
  'nothing to send is refused');
select throws_ok(format($$select public.guide_noticed_record(%L, 'k', '{}'::jsonb, null)$$, :'pa'), 'JA403', null,
  'a parent is never nudged as a child');
reset role;

select tests.authenticate_as(:'c1'::uuid);
select throws_ok($$select * from public.guide_noticed_inputs()$$, '42501', null, 'a child cannot read the inputs');

select * from finish();
rollback;
