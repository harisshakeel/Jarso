begin;
\ir _helpers.psql
select plan(72);

-- Progress (mobile kid rework, plan 2): the four tables, their RLS, the level and wear mirrors,
-- the backfill and the award engine (caps, replays, badges). Awards are called as postgres, the
-- way the triggers in progress_awards call them.

-- Fixtures: PA owns family A (UTC) with C1 and C2; PB owns family B (Asia/Kolkata) with C3.
select tests.create_user('prog-pa@example.com') as pa \gset
select tests.create_user('prog-pb@example.com') as pb \gset
select tests.create_user('prog-c1@example.com', 'child') as c1 \gset
select tests.create_user('prog-c2@example.com', 'child') as c2 \gset
select tests.create_user('prog-c3@example.com', 'child') as c3 \gset

select tests.authenticate_as(:'pb'::uuid);
select public.create_family('INR', 'Asia/Kolkata') as fb \gset
select public.register_child(:'c3'::uuid, :'fb'::uuid, 'Ria', '1234', true);

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select public.register_child(:'c2'::uuid, :'fa'::uuid, 'Max', '1234', true);
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- Tables and RLS
-- ---------------------------------------------------------------------------

select has_table('public', 'child_progress', 'child_progress exists');
select has_table('public', 'child_activity_days', 'child_activity_days exists');
select has_table('public', 'spark_events', 'spark_events exists');
select has_table('public', 'child_badges', 'child_badges exists');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.child_progress'::regclass), 'RLS is on for child_progress');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.child_activity_days'::regclass), 'RLS is on for child_activity_days');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.spark_events'::regclass), 'RLS is on for spark_events');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.child_badges'::regclass), 'RLS is on for child_badges');

-- ---------------------------------------------------------------------------
-- Backfill (the migration runs it once; the children here are created after it, so run it again)
-- ---------------------------------------------------------------------------

select ok(public.progress_backfill() >= 3, 'the backfill adds a row for each approved child');
select is(
  (select count(*)::int from public.child_progress where child_id in (:'c1'::uuid, :'c2'::uuid, :'c3'::uuid)),
  3, 'the backfill created a row for each seeded child'
);
select is(
  (select count(*)::int from public.child_progress where child_id = :'pa'::uuid),
  0, 'a parent gets no progress row'
);
select is(public.progress_backfill(), 0, 'running the backfill again adds nothing');
select results_eq(
  format($$ select sparks, level, streak, best_streak, lid, wear from public.child_progress where child_id = %L $$, :'c1'),
  $$ values (0::bigint, 1::smallint, 0, 0, 'cyan'::text, 'none'::text) $$,
  'a new row starts at zero, level 1, cyan with nothing on'
);

-- ---------------------------------------------------------------------------
-- Level and wear mirrors
-- ---------------------------------------------------------------------------

select is(public.progress_level(0), 1::smallint, '0 Sparks is level 1');
select is(public.progress_level(99), 1::smallint, '99 Sparks is still level 1');
select is(public.progress_level(100), 2::smallint, '100 Sparks is level 2');
select is(public.progress_level(3200), 10::smallint, '3200 Sparks is level 10');
select is(public.progress_level(99999), 10::smallint, 'level stops at 10');
select is(public.progress_wear_level('crown'), 5::smallint, 'the crown unlocks at level 5');
select is(public.progress_wear_level('shades'), 3::smallint, 'shades unlock at level 3');
select throws_ok(
  format($$ update public.child_progress set level = 4, wear = 'crown' where child_id = %L $$, :'c1'),
  '23514', null, 'the crown is refused at level 4'
);

-- ---------------------------------------------------------------------------
-- Awards (as postgres, fixed clock)
-- ---------------------------------------------------------------------------

select is(
  public.progress_award(:'c1'::uuid, 'log', 'log:a', 10, '2026-11-06 12:00:00+00'),
  10, 'the first log gives 10'
);
select is(
  public.progress_award(:'c1'::uuid, 'log', 'log:b', 10, '2026-11-06 12:01:00+00')
    + public.progress_award(:'c1'::uuid, 'log', 'log:c', 10, '2026-11-06 12:02:00+00'),
  20, 'the 2nd and 3rd logs give 10 each'
);
select is(
  public.progress_award(:'c1'::uuid, 'log', 'log:d', 10, '2026-11-06 12:03:00+00'),
  0, 'the 4th log that day gives 0'
);
select is(
  (select count(*)::int from public.spark_events where child_id = :'c1'::uuid and source_key = 'log:d'),
  0, 'the 4th log writes no event'
);
select is(
  public.progress_award(:'c1'::uuid, 'log', 'log:a', 10, '2026-11-06 12:04:00+00'),
  0, 'a repeated source key gives 0'
);
select results_eq(
  format($$ select sparks, level, logs_count from public.child_progress where child_id = %L $$, :'c1'),
  $$ values (30::bigint, 1::smallint, 3) $$,
  'three logs are paid and counted'
);
select is(
  (select logs from public.child_activity_days where child_id = :'c1'::uuid and day = '2026-11-06'),
  4::smallint, 'the 4th log still counts toward the day (the replay does not)'
);
select ok(
  exists (select 1 from public.child_badges where child_id = :'c1'::uuid and badge_key = 'first_log'),
  'the first_log badge is granted'
);
select is(
  public.progress_award(:'c1'::uuid, 'log', 'log:e', 10, '2026-11-07 12:00:00+00'),
  10, 'the log cap resets the next day'
);
select throws_ok(
  format($$ select public.progress_award(%L, 'log', 'log:z', 10) $$, :'pa'),
  'JA404', null, 'a parent is not a child: the award raises'
);
select throws_ok(
  format($$ select public.progress_award(%L, 'bogus', 'bogus:1', 10) $$, :'c1'),
  '22023', null, 'an unknown kind raises'
);

-- Goal reached: 100, at most once per rolling 7 days (a second one inside the window pays 0)
select public.progress_award(:'c2'::uuid, 'log', 'log:c2', 10, '2026-11-06 12:00:00+00');
select is(
  public.progress_award(:'c2'::uuid, 'goal_reached', 'goal_reached:g1', 100, '2026-11-06 12:05:00+00'),
  100, 'reaching a goal gives 100'
);
select is(
  public.progress_award(:'c2'::uuid, 'goal_reached', 'goal_reached:g2', 100, '2026-11-09 12:00:00+00'),
  0, 'a second goal reached inside 7 days gives 0'
);
select results_eq(
  format($$ select sparks, level, goals_reached_count from public.child_progress where child_id = %L $$, :'c2'),
  $$ values (110::bigint, 2::smallint, 1) $$,
  '110 Sparks is level 2; only the paid goal counts as reached'
);

-- Mark active: no Sparks, but the family-local day is active
select public.progress_award(:'c3'::uuid, 'log', 'log:c3', 10, '2026-11-06 12:00:00+00');
select public.progress_mark_active(:'c3'::uuid, 'step', '2026-11-07 12:00:00+00');
select is(
  (select active from public.child_activity_days where child_id = :'c3'::uuid and day = '2026-11-07'),
  true, 'mark_active makes the family-local day active'
);
select is(
  (select count(*)::int from public.spark_events where child_id = :'c3'::uuid),
  1, 'mark_active writes no event'
);

-- A step redone on a later day pays nothing but still makes that day active
select is(
  public.progress_award(:'c2'::uuid, 'step', 'step:m:s', 15, '2026-11-10 12:00:00+00'),
  15, 'a main step gives 15'
);
select is(
  public.progress_award(:'c2'::uuid, 'step', 'step:m:s', 15, '2026-11-11 12:00:00+00'),
  0, 'the same step on a later day gives 0'
);
select is(
  (select active from public.child_activity_days where child_id = :'c2'::uuid and day = '2026-11-11'),
  true, 'the replayed step still makes its day active'
);

-- Check-in: the answer is written with the award; the first answer of the day wins
select is(
  public.progress_award(:'c2'::uuid, 'checkin', 'checkin:2026-11-12', 5, '2026-11-12 12:00:00+00', 'nope'),
  5, 'a check-in gives 5'
);
select results_eq(
  format($$ select checkin, active from public.child_activity_days where child_id = %L and day = '2026-11-12' $$, :'c2'),
  $$ values ('nope'::text, true) $$,
  'a "nope" check-in is stored and makes the day active'
);
select is(
  public.progress_award(:'c2'::uuid, 'checkin', 'checkin:2026-11-12', 5, '2026-11-12 13:00:00+00', 'yes'),
  0, 'a second check-in the same day gives 0'
);
select is(
  public.progress_award(:'c2'::uuid, 'checkin', 'checkin:again', 5, '2026-11-12 14:00:00+00', 'yes'),
  0, 'a same-day check-in under another key gives 0 (one per day)'
);
select is(
  (select checkin from public.child_activity_days where child_id = :'c2'::uuid and day = '2026-11-12'),
  'nope', 'the first answer of the day is kept'
);
select throws_ok(
  format($$ select public.progress_award(%L, 'checkin', 'checkin:x', 5, now(), null) $$, :'c2'),
  '22023', null, 'a check-in award needs an answer'
);
select throws_ok(
  format($$ select public.progress_award(%L, 'log', 'log:x', 10, now(), 'yes') $$, :'c2'),
  '22023', null, 'only a check-in award takes an answer'
);

-- Save cap: 2 a day
select is(
  public.progress_award(:'c2'::uuid, 'save', 'save:1', 20, '2026-11-13 12:00:00+00')
    + public.progress_award(:'c2'::uuid, 'save', 'save:2', 20, '2026-11-13 12:01:00+00'),
  40, 'the first two saves give 20 each'
);
select is(
  public.progress_award(:'c2'::uuid, 'save', 'save:3', 20, '2026-11-13 12:02:00+00'),
  0, 'the 3rd save that day gives 0'
);

-- A goal set when already covered: milestones and reached are recorded at 0 and never pay later
insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, source_type, idempotency_key, created_by, occurred_at)
values (:'fb'::uuid, :'c3'::uuid, 'save', 'allowance_in', 'in', 1000, 'Allowance', 'occurrence', 'prog:c3:save', :'pb'::uuid, '2026-11-01');
insert into public.goals (family_id, child_id, name, emoji, target_minor)
values (:'fb'::uuid, :'c3'::uuid, 'Bike', '🚲', 800);
select public.progress_check_goal(:'c3'::uuid, false);
select results_eq(
  format($$ select goals_reached_count, sparks from public.child_progress where child_id = %L $$, :'c3'),
  $$ values (0, 10::bigint) $$,
  'a goal already covered when set pays nothing and does not count as reached'
);
select is(
  (select count(*)::int from public.spark_events
   where child_id = :'c3'::uuid and kind in ('goal_milestone', 'goal_reached') and amount = 0),
  5, 'the four milestones and the reach are recorded at 0'
);
select public.progress_check_goal(:'c3'::uuid, true);
select is(
  (select sparks from public.child_progress where child_id = :'c3'::uuid),
  10::bigint, 'silenced milestones never pay later'
);
select is(
  (select count(*)::int from public.child_badges where child_id = :'c3'::uuid and badge_key in ('goal_set', 'goal_half')),
  2, 'goal_set and goal_half are granted'
);
select is(
  exists (select 1 from public.child_badges where child_id = :'c3'::uuid and badge_key = 'goal_reached'),
  false, 'goal_reached needs a paid goal'
);

-- ---------------------------------------------------------------------------
-- Who sees what
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c1'::uuid);
select is((select count(*)::int from public.child_progress), 1, 'a child sees only their own progress row');
select is((select count(*)::int from public.spark_events), 4, 'a child sees their own Spark events');
select is(
  (select count(*)::int from public.spark_events where child_id <> :'c1'::uuid),
  0, 'a child sees no one else''s Spark events'
);
select is(
  (select count(*)::int from public.child_badges where child_id <> :'c1'::uuid),
  0, 'a child sees no one else''s badges'
);
select is((select count(*)::int from public.child_activity_days), 2, 'a child sees their own activity days');

select tests.authenticate_as(:'c2'::uuid);
select is(
  (select count(*)::int from public.child_progress where child_id = :'c1'::uuid),
  0, 'a sibling cannot see another child''s progress'
);

select tests.authenticate_as(:'pa'::uuid);
select is((select count(*)::int from public.child_progress), 2, 'a parent sees both of their children''s rows');
select is(
  (select count(*)::int from public.spark_events where child_id = :'c1'::uuid),
  4, 'a parent sees their child''s Spark events'
);
select is(
  (select count(*)::int from public.child_badges where child_id = :'c1'::uuid and badge_key = 'first_log'),
  1, 'a parent sees their child''s badges'
);
select is((select count(*)::int from public.child_activity_days), 0, 'a parent sees no activity days');

select tests.authenticate_as(:'pb'::uuid);
select is(
  (select count(*)::int from public.child_progress where child_id in (:'c1'::uuid, :'c2'::uuid)),
  0, 'another family''s parent sees nothing'
);

-- ---------------------------------------------------------------------------
-- Nobody writes directly
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c1'::uuid);
select throws_ok(
  format($$ insert into public.child_progress (child_id, family_id) values (%L, %L) $$, :'c1', :'fa'),
  '42501', null, 'a child cannot insert a progress row'
);
select throws_ok(
  format($$ update public.child_progress set sparks = 9999 where child_id = %L $$, :'c1'),
  '42501', null, 'a child cannot update their Sparks'
);
select throws_ok(
  format($$ insert into public.spark_events (child_id, family_id, kind, amount, source_key, day) values (%L, %L, 'log', 10, 'log:x', '2026-11-06') $$, :'c1', :'fa'),
  '42501', null, 'a child cannot insert a Spark event'
);
select throws_ok(
  format($$ delete from public.child_badges where child_id = %L $$, :'c1'),
  '42501', null, 'a child cannot delete badges'
);
select throws_ok(
  format($$ insert into public.child_activity_days (child_id, family_id, day, logs) values (%L, %L, '2026-11-08', 1) $$, :'c1', :'fa'),
  '42501', null, 'a child cannot insert an activity day'
);
select throws_ok(
  format($$ select public.progress_award(%L, 'log', 'log:self', 10) $$, :'c1'),
  '42501', null, 'a child cannot call progress_award'
);

select tests.clear_auth();
set local role anon;
select throws_ok(
  $$ select count(*) from public.child_progress $$,
  '42501', null, 'anon cannot read progress'
);
reset role;

select * from finish();
rollback;
