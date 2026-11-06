begin;
\ir _helpers.psql
select plan(14);

-- The forgiving streak (mobile kid rework, plan 2): family-local days, ISO weeks from Monday,
-- one automatic rest day per week that covers a single miss when the day before was active,
-- and today not done yet is never a miss. Days are seeded as postgres.
-- Calendar: 2026-11-02 is a Monday, 2026-11-06 a Friday, 2026-11-08 a Sunday.

select tests.create_user('streak-pa@example.com') as pa \gset
select tests.create_user('streak-c1@example.com', 'child') as c1 \gset
select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select tests.clear_auth();

-- Nothing yet
select results_eq(
  format($$ select streak, rest_used_this_week from public.progress_streak(%L, '2026-11-06') $$, :'c1'),
  $$ values (0, false) $$,
  'no activity: no streak'
);

-- What counts as active: a check-in (even "nope"), a log or a step; a save alone does not
insert into public.child_activity_days (child_id, family_id, day, checkin) values (:'c1'::uuid, :'fa'::uuid, '2026-10-01', 'nope');
insert into public.child_activity_days (child_id, family_id, day, saves) values (:'c1'::uuid, :'fa'::uuid, '2026-10-02', 1);
select is(
  (select active from public.child_activity_days where child_id = :'c1'::uuid and day = '2026-10-01'),
  true, 'a "nope" check-in makes the day active'
);
select is(
  (select active from public.child_activity_days where child_id = :'c1'::uuid and day = '2026-10-02'),
  false, 'a save alone does not make the day active'
);
delete from public.child_activity_days where child_id = :'c1'::uuid;

-- 3 days in a row
insert into public.child_activity_days (child_id, family_id, day, logs)
select :'c1'::uuid, :'fa'::uuid, d::date, 1 from unnest(array['2026-11-04', '2026-11-05', '2026-11-06']) d;
select results_eq(
  format($$ select streak, rest_used_this_week from public.progress_streak(%L, '2026-11-06') $$, :'c1'),
  $$ values (3, false) $$,
  '3 active days in a row give a streak of 3'
);
delete from public.child_activity_days where child_id = :'c1'::uuid;

-- Today not done yet is not a miss
insert into public.child_activity_days (child_id, family_id, day, logs)
select :'c1'::uuid, :'fa'::uuid, d::date, 1 from unnest(array['2026-11-04', '2026-11-05']) d;
select results_eq(
  format($$ select streak, rest_used_this_week from public.progress_streak(%L, '2026-11-06') $$, :'c1'),
  $$ values (2, false) $$,
  'today inactive with yesterday active still counts up to yesterday'
);
delete from public.child_activity_days where child_id = :'c1'::uuid;

-- One miss in the week, the day before active: the rest day covers it
insert into public.child_activity_days (child_id, family_id, day, logs)
select :'c1'::uuid, :'fa'::uuid, d::date, 1 from unnest(array['2026-11-03', '2026-11-05', '2026-11-06']) d;
select results_eq(
  format($$ select streak, rest_used_this_week from public.progress_streak(%L, '2026-11-06') $$, :'c1'),
  $$ values (3, true) $$,
  'one miss in the week is covered by the rest day'
);
delete from public.child_activity_days where child_id = :'c1'::uuid;

-- Yesterday missed and today not done yet: the rest day covers yesterday
insert into public.child_activity_days (child_id, family_id, day, logs)
select :'c1'::uuid, :'fa'::uuid, d::date, 1 from unnest(array['2026-11-03', '2026-11-04']) d;
select results_eq(
  format($$ select streak, rest_used_this_week from public.progress_streak(%L, '2026-11-06') $$, :'c1'),
  $$ values (2, true) $$,
  'a missed yesterday with today still open uses the rest day'
);
delete from public.child_activity_days where child_id = :'c1'::uuid;

-- A second miss in the same week ends the run
insert into public.child_activity_days (child_id, family_id, day, logs)
select :'c1'::uuid, :'fa'::uuid, d::date, 1 from unnest(array['2026-11-02', '2026-11-04', '2026-11-06']) d;
select results_eq(
  format($$ select streak, rest_used_this_week from public.progress_streak(%L, '2026-11-06') $$, :'c1'),
  $$ values (2, true) $$,
  'a second miss in the same week ends the streak'
);
delete from public.child_activity_days where child_id = :'c1'::uuid;

-- Two misses in a row end the run
insert into public.child_activity_days (child_id, family_id, day, logs)
select :'c1'::uuid, :'fa'::uuid, d::date, 1 from unnest(array['2026-11-01', '2026-11-02', '2026-11-05', '2026-11-06']) d;
select results_eq(
  format($$ select streak, rest_used_this_week from public.progress_streak(%L, '2026-11-06') $$, :'c1'),
  $$ values (2, false) $$,
  'two misses in a row end the streak'
);
delete from public.child_activity_days where child_id = :'c1'::uuid;

-- A miss on Sunday belongs to the week before Monday: that week's rest day covers it,
-- so a second miss earlier that week ends the run, and this week's rest day stays unused.
insert into public.child_activity_days (child_id, family_id, day, logs)
select :'c1'::uuid, :'fa'::uuid, d::date, 1 from unnest(array['2026-11-04', '2026-11-06', '2026-11-07', '2026-11-09']) d;
select results_eq(
  format($$ select streak, rest_used_this_week from public.progress_streak(%L, '2026-11-09') $$, :'c1'),
  $$ values (3, false) $$,
  'a Sunday miss uses the previous week''s rest day'
);
delete from public.child_activity_days where child_id = :'c1'::uuid;

-- Each week has its own rest day: a miss this week and a Sunday miss last week are both covered
insert into public.child_activity_days (child_id, family_id, day, logs)
select :'c1'::uuid, :'fa'::uuid, d::date, 1 from unnest(array['2026-11-06', '2026-11-07', '2026-11-09', '2026-11-11']) d;
select results_eq(
  format($$ select streak, rest_used_this_week from public.progress_streak(%L, '2026-11-11') $$, :'c1'),
  $$ values (4, true) $$,
  'each ISO week has its own rest day'
);
delete from public.child_activity_days where child_id = :'c1'::uuid;

-- After a break a new active day starts again at 1
insert into public.child_activity_days (child_id, family_id, day, logs)
select :'c1'::uuid, :'fa'::uuid, d::date, 1 from unnest(array['2026-11-01', '2026-11-02', '2026-11-05']) d;
select results_eq(
  format($$ select streak, rest_used_this_week from public.progress_streak(%L, '2026-11-05') $$, :'c1'),
  $$ values (1, false) $$,
  'after a break a new active day gives 1'
);
delete from public.child_activity_days where child_id = :'c1'::uuid;

-- An award refreshes the stored streak and grants the streak and diary-week badges
insert into public.child_activity_days (child_id, family_id, day, logs)
select :'c1'::uuid, :'fa'::uuid, d::date, 1
from unnest(array['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']) d;
select public.progress_award(:'c1'::uuid, 'log', 'log:streak', 10, '2026-11-06 12:00:00+00');
select results_eq(
  format($$ select streak, best_streak, last_active_day from public.child_progress where child_id = %L $$, :'c1'),
  $$ values (7, 7, '2026-11-06'::date) $$,
  'an award stores the streak, the best streak and the last active day'
);
select is(
  (select count(*)::int from public.child_badges
   where child_id = :'c1'::uuid and badge_key in ('streak_3', 'streak_7', 'diary_week')),
  3, '7 days of logs grant streak_3, streak_7 and diary_week'
);

select * from finish();
rollback;
