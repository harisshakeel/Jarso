begin;
\ir _helpers.psql
select plan(101);

-- Progress awards (mobile kid rework, plan 2): the triggers on the ledger, learning and goal
-- tables, the daily check-in, set_jarso_look and get_progress. Everything is driven through the
-- real recording functions as the child (or the parent), the way the diary and request tests do.
-- In one transaction now() is fixed, so every award lands on the same family-local day.

-- Fixtures: PA owns family A (UTC) with C1..C6; PB owns family B (Asia/Kolkata) with C7.
select tests.create_user('pa-pa@example.com') as pa \gset
select tests.create_user('pa-pb@example.com') as pb \gset
select tests.create_user('pa-c1@example.com', 'child') as c1 \gset
select tests.create_user('pa-c2@example.com', 'child') as c2 \gset
select tests.create_user('pa-c3@example.com', 'child') as c3 \gset
select tests.create_user('pa-c4@example.com', 'child') as c4 \gset
select tests.create_user('pa-c5@example.com', 'child') as c5 \gset
select tests.create_user('pa-c6@example.com', 'child') as c6 \gset
select tests.create_user('pa-c7@example.com', 'child') as c7 \gset

select tests.authenticate_as(:'pb'::uuid);
select public.create_family('INR', 'Asia/Kolkata') as fb \gset
select public.register_child(:'c7'::uuid, :'fb'::uuid, 'Ria', '1234', true);

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select public.register_child(:'c2'::uuid, :'fa'::uuid, 'Max', '1234', true);
select public.register_child(:'c3'::uuid, :'fa'::uuid, 'Kit', '1234', true);
select public.register_child(:'c4'::uuid, :'fa'::uuid, 'Zed', '1234', true);
select public.register_child(:'c5'::uuid, :'fa'::uuid, 'Eve', '1234', true);
select public.register_child(:'c6'::uuid, :'fa'::uuid, 'Ada', '1234', true);
select tests.clear_auth();

-- Spend seeds (as postgres, an allowance line: no award): C1, C2 and C3 get 1000 each.
insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, source_type, idempotency_key, created_by, occurred_at)
select :'fa'::uuid, s.c, 'spend', 'allowance_in', 'in', 1000, 'Allowance', 'occurrence', 'seed:' || s.c::text, :'pa'::uuid, '2025-01-01'
from (values (:'c1'::uuid), (:'c2'::uuid), (:'c3'::uuid)) s(c);

-- ---------------------------------------------------------------------------
-- Wiring and grants
-- ---------------------------------------------------------------------------

select has_trigger('public', 'ledger_entries', 'progress_on_ledger_entry', 'ledger_entries has the award trigger');
select has_trigger('public', 'step_results', 'progress_on_step_result', 'step_results has the award trigger');
select has_trigger('public', 'mission_attempts', 'progress_on_mission_completed', 'mission_attempts has the award trigger');
select has_trigger('public', 'goals', 'progress_on_goal_insert', 'goals has the insert trigger');
select has_trigger('public', 'goals', 'progress_on_goal_target', 'goals has the target trigger');
select is(
  (select count(*)::int from public.child_progress where child_id = :'c1'::uuid),
  0, 'an allowance line on Spend awards nothing (no progress row yet)'
);

select tests.authenticate_as(:'c1'::uuid);
select throws_ok(
  $$ select public.daily_checkin_at('yes', now()) $$,
  '42501', null, 'daily_checkin_at is not granted'
);
select tests.clear_auth();
set local role anon;
select throws_ok($$ select public.daily_checkin('yes') $$, '42501', null, 'anon cannot check in');
select throws_ok(format($$ select public.get_progress(%L) $$, :'c1'), '42501', null, 'anon cannot read progress');
reset role;

-- ---------------------------------------------------------------------------
-- Logs (C1): 10 each, 3 a day
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c1'::uuid);
select (public.record_purchase(:'c1'::uuid, 10, null, 'p1'))->>'entry_id' as p1 \gset
select is(
  (select sparks from public.child_progress where child_id = :'c1'::uuid),
  10::bigint, 'a purchase gives 10'
);
select is(
  (select amount from public.spark_events where child_id = :'c1'::uuid and source_key = 'log:' || :'p1'),
  10, 'the purchase is keyed log:<entry id>'
);
select public.record_purchase(:'c1'::uuid, 10, null, 'p2');
select public.record_purchase(:'c1'::uuid, 10, null, 'p3');
select is(
  (select sparks from public.child_progress where child_id = :'c1'::uuid),
  30::bigint, 'the 2nd and 3rd purchases give 10 each'
);
select is((public.record_purchase(:'c1'::uuid, 10, null, 'p4'))->>'status', 'recorded', 'a 4th purchase is recorded');
select is(
  (select sparks from public.child_progress where child_id = :'c1'::uuid),
  30::bigint, 'the 4th purchase that day gives 0'
);
select is(
  (select count(*)::int from public.spark_events where child_id = :'c1'::uuid and kind = 'log'),
  3, 'three log events'
);
select is(
  (public.record_purchase(:'c1'::uuid, 10, null, 'p1'))->>'entry_id',
  :'p1', 'retrying the same purchase key returns the first entry'
);
select is(
  (select sparks::int || ':' || logs_count from public.child_progress where child_id = :'c1'::uuid),
  '30:3', 'the retried key awards nothing'
);
select is(
  (select active from public.child_activity_days where child_id = :'c1'::uuid),
  true, 'logging makes the day active'
);

-- ---------------------------------------------------------------------------
-- Undo, fix, money got, practice (C2)
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c2'::uuid);
select (public.record_purchase(:'c2'::uuid, 50, null, 'q1'))->>'entry_id' as q1 \gset
select is(
  (select sparks from public.child_progress where child_id = :'c2'::uuid),
  10::bigint, 'C2: a purchase gives 10'
);
select (public.correct_diary_entry(:'q1'::uuid, 40, 'other', null, 'f1'))->>'entry_id' as q1f \gset
select isnt(:'q1f'::uuid, :'q1'::uuid, 'the fix writes a new line');
select is(
  (select sparks from public.child_progress where child_id = :'c2'::uuid),
  10::bigint, 'fixing an entry adds 0'
);
select is(
  (select count(*)::int from public.spark_events where child_id = :'c2'::uuid and source_key = 'log:' || :'q1f'),
  0, 'the fixed line has no event'
);
select is(
  (select logs from public.child_activity_days where child_id = :'c2'::uuid),
  1::smallint, 'the fix does not use up a log slot'
);
select is(public.undo_diary_entry(:'q1f'::uuid), 'undone', 'the fixed line is undone');
select is(
  (select sparks from public.child_progress where child_id = :'c2'::uuid),
  10::bigint, 'undo keeps the Sparks'
);
select is(
  (public.record_money_received(:'c2'::uuid, 50, 'spend', 'job', null, 'm1'))->>'status',
  'recorded', 'money got is recorded'
);
select is(
  (select sparks from public.child_progress where child_id = :'c2'::uuid),
  20::bigint, 'money got gives 10'
);
-- The undo keeps the slot: a third paid log, undone, then more purchases still cap at 3.
select (public.record_purchase(:'c2'::uuid, 10, null, 'q2'))->>'entry_id' as q2 \gset
select is(
  (select sparks from public.child_progress where child_id = :'c2'::uuid),
  30::bigint, 'C2: a third log that day gives 10'
);
select is(public.undo_diary_entry(:'q2'::uuid), 'undone', 'the third purchase is undone');
select is((public.record_purchase(:'c2'::uuid, 10, null, 'q3'))->>'status', 'recorded', 'a purchase after the undo is recorded');
select public.record_purchase(:'c2'::uuid, 10, null, 'q4');
select is(
  (select sparks::int || ':' || logs_count from public.child_progress where child_id = :'c2'::uuid),
  '30:3', 'the undo does not free a log slot: purchases after it give 0'
);
select tests.clear_auth();
insert into public.ledger_entries (family_id, child_id, mode, jar, kind, direction, amount_minor, source_type, idempotency_key)
values (:'fa'::uuid, :'c2'::uuid, 'practice', 'spend', 'purchase', 'out', 5, 'diary', 'practice:c2');
select is(
  (select sparks from public.child_progress where child_id = :'c2'::uuid),
  30::bigint, 'a practice-mode row gives 0'
);

-- ---------------------------------------------------------------------------
-- Saves (C3): 20 each, 2 a day
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c3'::uuid);
select (public.create_deposit(:'c3'::uuid, 100, 'd1'))->>'request_id' as d1 \gset
select tests.authenticate_as(:'pa'::uuid);
select is(public.complete_request(:'d1'::uuid, 'x1'), 'completed', 'the parent confirms the deposit');
select is(
  (select sparks from public.child_progress where child_id = :'c3'::uuid),
  20::bigint, 'a deposit the parent confirms gives the child 20'
);
select is(
  (select count(*)::int from public.spark_events where child_id = :'c3'::uuid and source_key = 'save:' || :'d1'),
  1, 'the save is keyed save:<request id>'
);
select public.set_jar_moves_approval(:'c3'::uuid, 'notify');

select tests.authenticate_as(:'c3'::uuid);
select is((public.create_deposit(:'c3'::uuid, 100, 'd2'))->>'status', 'confirmed', 'a deposit is confirmed at once');
select is(
  (select sparks from public.child_progress where child_id = :'c3'::uuid),
  40::bigint, 'an auto-confirmed deposit gives 20'
);
select is((public.create_deposit(:'c3'::uuid, 100, 'd3'))->>'status', 'confirmed', 'a 3rd deposit is confirmed');
select is(
  (select sparks::int || ':' || saves_count from public.child_progress where child_id = :'c3'::uuid),
  '40:2', 'the 3rd save in a day gives 0'
);
select ok(
  exists (select 1 from public.child_badges where child_id = :'c3'::uuid and badge_key = 'first_save'),
  'the first_save badge is granted'
);

-- ---------------------------------------------------------------------------
-- Steps and missions (C4)
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c4'::uuid);
select public.start_mission('whats-in-spend', 1) as a1 \gset
select ok(
  public.record_step_result(:'a1'::uuid, 'warm-up', 'replay', 'choice', 'balance.afford', true, 0, 1),
  'a replay-phase step is recorded'
);
select is(
  (select count(*)::int from public.spark_events where child_id = :'c4'::uuid),
  0, 'a replay phase gives 0'
);
select is(
  (select active from public.child_activity_days where child_id = :'c4'::uuid),
  true, 'a replay phase still makes the day active'
);
select ok(
  public.record_step_result(:'a1'::uuid, 'which-can-you-buy', 'main', 'choice', 'balance.afford', true, 0, 1),
  'a main-phase step is recorded'
);
select is(
  (select sparks from public.child_progress where child_id = :'c4'::uuid),
  15::bigint, 'a main-phase step gives 15'
);
select is(
  (select count(*)::int from public.spark_events where child_id = :'c4'::uuid and source_key = 'step:whats-in-spend:which-can-you-buy'),
  1, 'the step is keyed step:<mission>:<step>'
);
select public.record_step_result(:'a1'::uuid, 'which-can-you-buy', 'replay', 'choice', 'balance.afford', true, 0, 1);
select is(
  (select sparks from public.child_progress where child_id = :'c4'::uuid),
  15::bigint, 'replaying the step gives 0'
);
select ok(public.complete_mission(:'a1'::uuid), 'the mission is completed');
select is(
  (select missions_count from public.child_progress where child_id = :'c4'::uuid),
  1, 'completing a mission counts it'
);
select ok(
  exists (select 1 from public.child_badges where child_id = :'c4'::uuid and badge_key = 'first_mission'),
  'the first_mission badge is granted'
);
select public.start_mission('whats-in-spend', 1) as a2 \gset
select isnt(:'a2'::uuid, :'a1'::uuid, 'starting again opens a new attempt');
select ok(
  public.record_step_result(:'a2'::uuid, 'which-can-you-buy', 'main', 'choice', 'balance.afford', true, 0, 1),
  'the same step in a new attempt is recorded'
);
select is(
  (select sparks::int || ':' || steps_count from public.child_progress where child_id = :'c4'::uuid),
  '15:1', 'the same step again gives 0'
);
select is(
  (select active from public.child_activity_days where child_id = :'c4'::uuid),
  true, 'the day is still active'
);
select ok(public.complete_mission(:'a2'::uuid), 'the same mission is completed a second time');
select is(
  (select missions_count from public.child_progress where child_id = :'c4'::uuid),
  1, 'completing the same mission twice counts it once'
);

-- ---------------------------------------------------------------------------
-- Goal milestones (C5): 25 at each of 25/50/75/100%, once; reached gives 100
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c5'::uuid);
select public.save_goal('Bike', '⚽', 400, null) as g5 \gset
select tests.clear_auth();
select is(
  (select count(*)::int from public.spark_events where child_id = :'c5'::uuid),
  0, 'a goal at 0% pays nothing'
);
insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, source_type, idempotency_key, created_by)
values (:'fa'::uuid, :'c5'::uuid, 'save', 'allowance_in', 'in', 100, 'Allowance', 'occurrence', 'g5:1', :'pa'::uuid);
select is(
  (select sparks from public.child_progress where child_id = :'c5'::uuid),
  25::bigint, 'crossing 25% pays 25'
);
insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, source_type, idempotency_key, created_by)
values (:'fa'::uuid, :'c5'::uuid, 'save', 'allowance_in', 'in', 100, 'Allowance', 'occurrence', 'g5:2', :'pa'::uuid);
select is(
  (select sparks from public.child_progress where child_id = :'c5'::uuid),
  50::bigint, 'crossing 50% pays 25'
);
insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, source_type, idempotency_key, created_by)
values (:'fa'::uuid, :'c5'::uuid, 'save', 'allowance_in', 'in', 200, 'Allowance', 'occurrence', 'g5:3', :'pa'::uuid);
select is(
  (select amount from public.spark_events where child_id = :'c5'::uuid and source_key = 'goal_reached:' || :'g5'),
  100, 'reaching 100% pays 100'
);
select is(
  (select sparks from public.child_progress where child_id = :'c5'::uuid),
  200::bigint, '75% and 100% pay 25 each, plus 100 for reaching it'
);
insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, source_type, idempotency_key, created_by)
values (:'fa'::uuid, :'c5'::uuid, 'save', 'allowance_in', 'in', 50, 'Allowance', 'occurrence', 'g5:4', :'pa'::uuid);
select is(
  (select sparks::int || ':' || goals_reached_count from public.child_progress where child_id = :'c5'::uuid),
  '200:1', 'more money in Save pays each milestone only once'
);
select is(
  (select count(*)::int from public.spark_events where child_id = :'c5'::uuid and kind = 'goal_milestone' and amount = 25),
  4, 'four paid milestones'
);
select is(
  (select array_agg(badge_key order by badge_key) from public.child_badges where child_id = :'c5'::uuid and badge_key like 'goal%'),
  array['goal_half', 'goal_reached', 'goal_set'], 'the goal badges are granted'
);

-- ---------------------------------------------------------------------------
-- A goal created past 50%, then the target lowered (C6)
-- ---------------------------------------------------------------------------

insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, source_type, idempotency_key, created_by)
values (:'fa'::uuid, :'c6'::uuid, 'save', 'allowance_in', 'in', 240, 'Allowance', 'occurrence', 'g6:1', :'pa'::uuid);
select tests.authenticate_as(:'c6'::uuid);
select public.save_goal('Bike', '⚽', 400, null) as g6 \gset
select tests.clear_auth();
select results_eq(
  format($$ select source_key, amount from public.spark_events where child_id = %L order by source_key $$, :'c6'),
  format($$ values (%L::text, 0), (%L::text, 0) $$, 'goal:' || :'g6' || ':25', 'goal:' || :'g6' || ':50'),
  'a goal created at 60% writes 0-Sparks events for 25% and 50%'
);
select is(
  (select coalesce(sparks, -1) from public.child_progress where child_id = :'c6'::uuid),
  0::bigint, 'and pays nothing'
);
insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, source_type, idempotency_key, created_by)
values (:'fa'::uuid, :'c6'::uuid, 'save', 'allowance_in', 'in', 60, 'Allowance', 'occurrence', 'g6:2', :'pa'::uuid);
select is(
  (select sparks from public.child_progress where child_id = :'c6'::uuid),
  25::bigint, 'a later deposit pays only the new 75% milestone'
);
select is(
  (select sum(amount)::int from public.spark_events where child_id = :'c6'::uuid and source_key in ('goal:' || :'g6' || ':25', 'goal:' || :'g6' || ':50')),
  0, 'the milestones already passed are never paid'
);
select tests.authenticate_as(:'c6'::uuid);
select is(public.save_goal('Bike', '⚽', 300, null), :'g6'::uuid, 'the target is lowered on the same goal');
select tests.clear_auth();
select is(
  (select sparks from public.child_progress where child_id = :'c6'::uuid),
  25::bigint, 'lowering the target pays nothing'
);
select is(
  (select count(*)::int from public.spark_events
   where child_id = :'c6'::uuid and amount = 0
     and source_key in ('goal:' || :'g6' || ':100', 'goal_reached:' || :'g6')),
  2, 'the 100% milestone and goal reached are recorded at 0'
);

-- ---------------------------------------------------------------------------
-- Daily check-in (C7, Asia/Kolkata)
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c7'::uuid);
select is(public.daily_checkin('nope'), '{"status": "recorded", "sparks": 5}'::jsonb, 'the first check-in gives 5');
select is(public.daily_checkin('yes'), '{"status": "already", "sparks": 0}'::jsonb, 'a second check-in that day is already');
select throws_ok($$ select public.daily_checkin('maybe') $$, '22023', null, 'an unknown answer is refused');
select throws_ok($$ select public.daily_checkin(null) $$, '22023', null, 'no answer is refused');
select tests.clear_auth();
select is(
  (select count(*)::int from public.ledger_entries where child_id = :'c7'::uuid),
  0, 'a check-in never writes a ledger row'
);
select results_eq(
  format($$ select checkin, active from public.child_activity_days where child_id = %L and day = public.family_today(%L) $$, :'c7', :'fb'),
  $$ values ('nope'::text, true) $$,
  'the first answer of the day is kept and the day is active'
);
select is(
  (select sparks::int || ':' || checkins_count from public.child_progress where child_id = :'c7'::uuid),
  '5:1', 'one check-in is paid and counted'
);
select tests.authenticate_as(:'pa'::uuid);
select throws_ok($$ select public.daily_checkin('yes') $$, 'JA403', null, 'a parent cannot check in');

-- Near midnight in Asia/Kolkata (UTC+5:30): 18:00 UTC is 23:30 local, 19:00 UTC is 00:30 next day.
select tests.clear_auth();
select set_config('request.jwt.claims', jsonb_build_object('sub', :'c7', 'role', 'authenticated')::text, true);
select is(
  public.daily_checkin_at('yes', '2030-01-10 18:00:00+00')->>'status',
  'recorded', 'a check-in at 23:30 local is recorded'
);
select is(
  public.daily_checkin_at('yes', '2030-01-10 19:00:00+00')->>'status',
  'recorded', 'a check-in at 00:30 local the next day is recorded too'
);
select tests.clear_auth();
select is(
  (select array_agg(day order by day) from public.spark_events where child_id = :'c7'::uuid and kind = 'checkin' and day >= '2030-01-01'),
  array['2030-01-10', '2030-01-11']::date[], 'they land on two different family-local days'
);

-- ---------------------------------------------------------------------------
-- Jarso look (C1 is level 1)
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c1'::uuid);
select throws_ok($$ select public.set_jarso_look('grape', 'crown') $$, 'JA409', null, 'the crown is locked at level 1');
select lives_ok($$ select public.set_jarso_look('grape', 'cap') $$, 'the cap is open at level 1');
select results_eq(
  format($$ select lid, wear from public.child_progress where child_id = %L $$, :'c1'),
  $$ values ('grape'::text, 'cap'::text) $$,
  'the look is saved'
);
select throws_ok($$ select public.set_jarso_look('purple', 'cap') $$, '22023', null, 'an unknown lid is refused');
select throws_ok($$ select public.set_jarso_look('grape', 'hat') $$, '22023', null, 'an unknown outfit is refused');
select tests.authenticate_as(:'pa'::uuid);
select throws_ok($$ select public.set_jarso_look('grape', 'cap') $$, 'JA403', null, 'a parent cannot set a look');

-- ---------------------------------------------------------------------------
-- get_progress
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c1'::uuid);
select public.get_progress(:'c1'::uuid) as gp \gset
select is(
  (select array_agg(k order by k collate "C") from jsonb_object_keys(:'gp'::jsonb) k),
  array['badges', 'bestStreak', 'checkedInToday', 'level', 'look', 'nextLevelAt', 'recent', 'restUsedThisWeek', 'sparks', 'streak'],
  'get_progress has every key'
);
select is(
  :'gp'::jsonb - 'badges' - 'recent',
  '{"sparks": 30, "level": 1, "nextLevelAt": 100, "streak": 1, "bestStreak": 1, "restUsedThisWeek": false, "checkedInToday": false, "look": {"lid": "grape", "wear": "cap"}}'::jsonb,
  'the scalar values and the look are right'
);
select is(
  (select array_agg(k order by k collate "C") from jsonb_object_keys((:'gp'::jsonb)->'badges'->0) k),
  array['earnedAt', 'key'], 'a badge is {key, earnedAt}'
);
select ok((:'gp'::jsonb)->'badges' @> '[{"key": "first_log"}]'::jsonb, 'the badges include first_log');
select is(jsonb_array_length((:'gp'::jsonb)->'recent'), 3, 'recent lists the paid events');
select is(
  (select array_agg(k order by k collate "C") from jsonb_object_keys((:'gp'::jsonb)->'recent'->0) k),
  array['amount', 'createdAt', 'kind'], 'a recent event is {kind, amount, createdAt}'
);

select tests.authenticate_as(:'pa'::uuid);
select is((public.get_progress(:'c1'::uuid))->>'sparks', '30', 'the child''s parent can read it');
select tests.authenticate_as(:'pb'::uuid);
select throws_ok(format($$ select public.get_progress(%L) $$, :'c1'), 'JA403', null, 'another family cannot read it');
select tests.authenticate_as(:'c2'::uuid);
select throws_ok(format($$ select public.get_progress(%L) $$, :'c1'), 'JA403', null, 'a sibling cannot read it');
select tests.authenticate_as(:'c7'::uuid);
select is((public.get_progress(:'c7'::uuid))->>'checkedInToday', 'true', 'checkedInToday after a check-in');

-- ---------------------------------------------------------------------------
-- Guard: an award failure never blocks the money write
-- ---------------------------------------------------------------------------

-- A purchase line for a non-child (the parent) makes progress_award raise JA404 inside the trigger.
select tests.clear_auth();
select lives_ok(
  format($$
    insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, source_type, idempotency_key)
    values (%L, %L, 'spend', 'purchase', 'out', 10, 'diary', 'guard:1')
  $$, :'fa', :'pa'),
  'a failing award does not raise'
);
select is(
  (select count(*)::int from public.ledger_entries where idempotency_key = 'guard:1'),
  1, 'the purchase is kept'
);
select is(
  (select count(*)::int from public.spark_events where child_id = :'pa'::uuid),
  0, 'and nothing is awarded'
);

select * from finish();
rollback;
