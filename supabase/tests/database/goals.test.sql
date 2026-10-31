begin;
\ir _helpers.psql
select plan(24);

-- Fixtures: PA owns family A with C1 and C2; PB owns family B.
select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('c1@example.com', 'child') as c1 \gset
select tests.create_user('c2@example.com', 'child') as c2 \gset

select tests.authenticate_as(:'pb'::uuid);
select public.create_family('INR', 'Asia/Kolkata') as fb \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select public.register_child(:'c2'::uuid, :'fa'::uuid, 'Max', '1234', true);
select tests.clear_auth();

-- C1: Save 3100 and a pending withdrawal of 500. C2 has a 500 weekly allowance.
insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, source_type, idempotency_key, created_by, occurred_at)
values (:'fa'::uuid, :'c1'::uuid, 'save', 'allowance_in', 'in', 3100, 'Allowance', 'occurrence', 'seed:c1:save', :'pa'::uuid, '2025-01-01');
insert into public.requests (family_id, child_id, kind, status, amount_minor, idempotency_key)
values (:'fa'::uuid, :'c1'::uuid, 'withdrawal', 'pending', 500, 'w1');
insert into public.allowance_schedules (family_id, child_id, amount_minor, frequency, anchor_on)
values (:'fa'::uuid, :'c2'::uuid, 500, 'weekly', '2025-01-06');

-- Saving
select tests.authenticate_as(:'c1'::uuid);
select public.save_goal('  Football boots  ', '⚽', 4500, 400) as g1 \gset
select is((select name from public.goals where id = :'g1'::uuid), 'Football boots', 'name is trimmed');
select is(public.save_goal('Football boots', '⚽', 4500, 300), :'g1'::uuid, 'saving again updates the same goal');
select is((select count(*)::int from public.goals where child_id = :'c1'::uuid), 1, 'one goal row');
select is((select plan_minor from public.goals where id = :'g1'::uuid), 300::bigint, 'plan updated');
select throws_ok($$select public.save_goal('', '⚽', 4500, 300)$$, '22023', null, 'blank name refused');
select throws_ok($$select public.save_goal('Boots', '⚽', 0, null)$$, '22023', null, 'zero target refused');
select throws_ok($$select public.save_goal('Boots', '⚽', 1000001, null)$$, '22023', null, 'target over the cap refused');

-- Plan limits (Review Focus 5)
select lives_ok($$select public.save_goal('Boots', '⚽', 4500, 4000)$$, 'no schedule: a plan up to the target is fine');
select throws_ok($$select public.save_goal('Boots', '⚽', 4500, 4600)$$, '22023', null, 'no schedule: a plan over the target is refused');
select public.save_goal('Football boots', '⚽', 4500, 400);
select tests.authenticate_as(:'c2'::uuid);
select throws_ok($$select public.save_goal('Bike', '🚲', 9000, 600)$$, '22023', 'plan_over_allowance', 'with a schedule: a plan over the allowance is refused');
select lives_ok($$select public.save_goal('Bike', '🚲', 9000, 500)$$, 'with a schedule: a plan up to the allowance is fine');

-- One active goal per child
select tests.clear_auth();
select throws_ok(
  format($$insert into public.goals (family_id, child_id, name, emoji, target_minor) values (%L, %L, 'Two', '🎮', 100)$$, :'fa', :'c1'),
  '23505', null, 'a second active goal is refused');

-- Who can write and read
select tests.authenticate_as(:'pa'::uuid);
select throws_ok($$select public.save_goal('Boots', '⚽', 4500, null)$$, 'JA403', null, 'a parent cannot save a goal');
select is((select count(*)::int from public.goals where child_id = :'c1'::uuid), 1, 'a parent can read the child goal');
select throws_ok(
  format($$update public.goals set name = 'X' where id = %L$$, :'g1'),
  '42501', null, 'direct updates are denied');
select tests.authenticate_as(:'pb'::uuid);
select is((select count(*)::int from public.goals), 0, 'another family sees no goals');
select throws_ok(format($$select * from public.goal_progress(%L)$$, :'c1'), 'JA403', null, 'another family cannot read progress');

-- Progress
select tests.authenticate_as(:'c1'::uuid);
select is((select counted_minor from public.goal_progress(:'c1'::uuid)), 2600::bigint, 'counted is Save less reserved');
select is((select reached from public.goal_progress(:'c1'::uuid)), false, 'not reached yet');
select public.mark_goal_celebrated(:'g1'::uuid);
select is((select celebrated_at from public.goals where id = :'g1'::uuid), null, 'cannot celebrate before reaching');

select tests.clear_auth();
insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, source_type, idempotency_key, created_by, occurred_at)
values (:'fa'::uuid, :'c1'::uuid, 'save', 'allowance_in', 'in', 2000, 'Allowance', 'occurrence', 'seed:c1:save2', :'pa'::uuid, '2025-01-08');
select tests.authenticate_as(:'c1'::uuid);
select is((select reached from public.goal_progress(:'c1'::uuid)), true, 'reached once counted covers the target');
select (select reached_at from public.goals where id = :'g1'::uuid) as first_reached \gset
select public.goal_progress(:'c1'::uuid);
select is((select reached_at from public.goals where id = :'g1'::uuid), :'first_reached'::timestamptz, 'reached_at is set once');
select public.mark_goal_celebrated(:'g1'::uuid);
select isnt((select celebrated_at from public.goals where id = :'g1'::uuid), null, 'celebrated after reaching');

-- Archive and start a new goal
select public.archive_goal(:'g1'::uuid);
select public.save_goal('Headphones', '🎧', 6000, null) as g2 \gset
select is((select status from public.goals where id = :'g1'::uuid), 'archived', 'old goal archived');

select * from finish();
rollback;
