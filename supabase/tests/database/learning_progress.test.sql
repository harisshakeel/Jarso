begin;
\ir _helpers.psql
select plan(92);

-- Fixtures: family A with parent PA and children C and C2; family B with parent PB and child CB.
-- LONE is a child account in no family.
select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('c@example.com', 'child') as c \gset
select tests.create_user('c2@example.com', 'child') as c2 \gset
select tests.create_user('cb@example.com', 'child') as cb \gset
select tests.create_user('lone@example.com', 'child') as lone \gset

-- Test helpers (security invoker: they run with the caller's rights).
create function pg_temp.make_due(p_child uuid, p_family uuid) returns void language sql as $$
  update public.review_items set due_on = public.family_today(p_family) where child_id = p_child;
$$;
create function pg_temp.review(p_child uuid, p_family uuid) returns text language sql as $$
  select box::int || '/' || (due_on - public.family_today(p_family)) || '/' || coalesce(last_result, '-')
  from public.review_items where child_id = p_child and skill_key = 'balance.afford';
$$;
create function pg_temp.visible_for(p_child uuid) returns int language sql as $$
  select (select count(*) from public.mission_attempts where child_id = p_child)::int
       + (select count(*) from public.step_results where child_id = p_child)::int
       + (select count(*) from public.skill_progress where child_id = p_child)::int
       + (select count(*) from public.review_items where child_id = p_child)::int
       + (select count(*) from public.practice_results where child_id = p_child)::int
       + (select count(*) from public.learning_checkins where child_id = p_child)::int;
$$;

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'Europe/London') as fa \gset
select public.register_child(:'c'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select public.register_child(:'c2'::uuid, :'fa'::uuid, 'Alex', '2345', true);

select tests.authenticate_as(:'pb'::uuid);
select public.create_family('EUR', 'UTC') as fb \gset
select public.register_child(:'cb'::uuid, :'fb'::uuid, 'Jo', '3456', true);

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

select tests.clear_auth();
select table_privs_are('public', 'step_results', 'anon', array[]::text[], 'anon has no table privileges');
select table_privs_are('public', 'skill_progress', 'authenticated', array['SELECT'], 'authenticated may only select');
select table_privs_are('public', 'learning_checkins', 'authenticated', array['SELECT'], 'check-ins: select only');
select function_privs_are('public', 'start_mission', array['text', 'integer'], 'anon', array[]::text[], 'anon cannot start missions');
select function_privs_are('public', 'learning_child_family', array[]::text[], 'service_role', array[]::text[], 'the internal helper has no grants');

-- ---------------------------------------------------------------------------
-- start_mission
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c'::uuid);
select public.start_mission('whats-in-spend', 1) as attempt \gset
select ok(:'attempt' is not null, 'a child starts a mission');
select is(public.start_mission('whats-in-spend', 1), :'attempt'::uuid, 'starting again resumes the open attempt');
select is(
  (select count(*)::int from public.mission_attempts where child_id = :'c'::uuid and status = 'started'),
  1, 'only one open attempt per mission');

select throws_ok($$ select public.start_mission('Bad Key', 1) $$, '22023', null, 'a malformed mission key is refused');
select throws_ok($$ select public.start_mission('whats-in-spend', 0) $$, '22023', null, 'a bad version is refused');

-- A new content version abandons the open attempt and starts again; an older one is refused.
select public.start_mission('small-buys-add-up', 1) as old_attempt \gset
select public.start_mission('small-buys-add-up', 2) as new_attempt \gset
select isnt(:'new_attempt'::uuid, :'old_attempt'::uuid, 'a new content version starts a new attempt');
select is(
  (select status from public.mission_attempts where id = :'old_attempt'::uuid),
  'abandoned', 'the old version is abandoned');
select throws_ok($$ select public.start_mission('small-buys-add-up', 1) $$, 'JA409', null,
  'an old page cannot abandon an attempt on newer content');
select is(
  (select status from public.mission_attempts where id = :'new_attempt'::uuid),
  'started', 'the newer attempt is untouched');

select tests.authenticate_as(:'pa'::uuid);
select throws_ok($$ select public.start_mission('whats-in-spend', 1) $$, 'JA403', null, 'a parent cannot start a mission');
select tests.authenticate_as(:'lone'::uuid);
select throws_ok($$ select public.start_mission('whats-in-spend', 1) $$, 'JA403', null, 'a child in no family cannot start a mission');
select tests.clear_auth();
select throws_ok($$ select public.start_mission('whats-in-spend', 1) $$, 'JA401', null, 'signed-out callers are refused');

-- ---------------------------------------------------------------------------
-- record_step_result and skill progress
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c'::uuid);
select ok(
  public.record_step_result(:'attempt'::uuid, 'which-can-you-buy', 'main', 'choice', 'balance.afford', true, 0, 1),
  'a child records a step');
select ok(
  not public.record_step_result(:'attempt'::uuid, 'which-can-you-buy', 'main', 'choice', 'balance.afford', true, 0, 1),
  'recording the same step again is a no-op');
select is(
  (select level::int || '/' || first_try_correct || '/' || correct_with_hints
     from public.skill_progress where child_id = :'c'::uuid and skill_key = 'balance.afford'),
  '2/1/0', 'a first-try right answer makes the skill Practised and counts once');

select public.record_step_result(:'attempt'::uuid, 'whats-left', 'main', 'amount', 'balance.afford', false, 1, 2);
select is(
  (select level::int from public.skill_progress where child_id = :'c'::uuid and skill_key = 'balance.afford'),
  2, 'a wrong answer never lowers a skill');
select public.record_step_result(:'attempt'::uuid, 'whats-left', 'replay', 'amount', 'balance.afford', true, 0, 1);
select is(
  (select count(*)::int from public.step_results where attempt_id = :'attempt'::uuid),
  3, 'a main result and its replay are separate rows');
select is(
  (select first_try_correct || '/' || correct_with_hints
     from public.skill_progress where child_id = :'c'::uuid and skill_key = 'balance.afford'),
  '1/0', 'a replay never counts as a first try');

select public.record_step_result(:'attempt'::uuid, 'why-check-first', 'main', 'reason', 'balance.afford', true, 1, 1);
select is(
  (select reasons_correct || '/' || correct_with_hints
     from public.skill_progress where child_id = :'c'::uuid and skill_key = 'balance.afford'),
  '1/1', 'a right reason counts as a sound explanation; a hint counts as help');

select throws_ok(
  format($$ select public.record_step_result(%L, 'x', 'sideways', 'choice', 'balance.afford', true, 0, 1) $$, :'attempt'),
  '22023', null, 'an unknown phase is refused');
select throws_ok(
  format($$ select public.record_step_result(%L, 'x', 'main', 'choice', 'balance.afford', true, 3, 1) $$, :'attempt'),
  '22023', null, 'more than two hints is refused');
select throws_ok(
  format($$ select public.record_step_result(%L, 'x', 'main', 'choice', 'Not A Skill', true, 0, 1) $$, :'attempt'),
  '22023', null, 'a malformed skill key is refused');
select ok(
  not public.record_step_result(:'old_attempt'::uuid, 'x', 'main', 'choice', 'balance.afford', true, 0, 1),
  'a result on an abandoned attempt changes nothing');

-- Nobody else can write to C's attempt.
select tests.authenticate_as(:'c2'::uuid);
select throws_ok(
  format($$ select public.record_step_result(%L, 'x', 'main', 'choice', 'balance.afford', true, 0, 1) $$, :'attempt'),
  'JA403', null, 'a brother or sister cannot write to another child''s attempt');
select throws_ok(format($$ select public.complete_mission(%L) $$, :'attempt'), 'JA403', null,
  'or finish it');
select tests.authenticate_as(:'cb'::uuid);
select throws_ok(
  format($$ select public.record_step_result(%L, 'x', 'main', 'choice', 'balance.afford', true, 0, 1) $$, :'attempt'),
  'JA403', null, 'another family''s child cannot write to it');
select tests.authenticate_as(:'pa'::uuid);
select throws_ok(
  format($$ select public.record_step_result(%L, 'x', 'main', 'choice', 'balance.afford', true, 0, 1) $$, :'attempt'),
  'JA403', null, 'a parent cannot answer for their child');
select throws_ok(format($$ select public.complete_mission(%L) $$, :'attempt'), 'JA403', null,
  'or finish their mission');
select tests.authenticate_as(:'lone'::uuid);
select throws_ok(
  format($$ select public.record_step_result(%L, 'x', 'main', 'choice', 'balance.afford', true, 0, 1) $$, :'attempt'),
  'JA403', null, 'a child in no family cannot write');

-- The schema ties a result's child to its attempt's child, whatever writes it.
select tests.clear_auth();
select throws_ok(
  format($$ insert into public.step_results (attempt_id, child_id, step_key, phase, step_type, skill_key, correct, hints_used, tries)
            values (%L, %L, 'x', 'main', 'choice', 'balance.afford', true, 0, 1) $$, :'attempt', :'c2'),
  '23503', null, 'a result cannot claim a different child than its attempt');

-- ---------------------------------------------------------------------------
-- complete_mission
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c'::uuid);
select public.start_mission('spend-and-save', 1) as empty_attempt \gset
select throws_ok(
  format($$ select public.complete_mission(%L) $$, :'empty_attempt'),
  '22023', null, 'a mission with no answers cannot be completed');

select ok(public.complete_mission(:'attempt'::uuid), 'a child completes their mission');
select ok(not public.complete_mission(:'attempt'::uuid), 'completing again is a no-op');
select is(
  (select status from public.mission_attempts where id = :'attempt'::uuid), 'completed', 'the attempt is completed');
select is(
  (select box::int || '/' || (due_on - public.family_today(:'fa'::uuid))
     from public.review_items where child_id = :'c'::uuid and skill_key = 'balance.afford'),
  '1/1', 'each skill gets a first review tomorrow');
select ok(
  not public.record_step_result(:'attempt'::uuid, 'how-many-packs', 'main', 'amount', 'balance.afford', true, 0, 1),
  'a result after completion changes nothing');
select throws_ok(
  format($$ select public.complete_mission(%L) $$, :'old_attempt'),
  'JA409', null, 'an abandoned attempt cannot be completed');

-- Replaying a finished mission opens a new attempt and leaves the finished one alone.
select public.start_mission('whats-in-spend', 1) as replay_attempt \gset
select isnt(:'replay_attempt'::uuid, :'attempt'::uuid, 'a finished mission can be played again');
select is((select status from public.mission_attempts where id = :'attempt'::uuid), 'completed', 'the finished attempt stays finished');

-- ---------------------------------------------------------------------------
-- record_practice_result: the spaced review ladder
-- ---------------------------------------------------------------------------

select ok(
  public.record_practice_result('afford-r1', 'balance.afford', true, 0, 1),
  'practice before the review is due is recorded');
select is(
  (select box::int from public.review_items where child_id = :'c'::uuid and skill_key = 'balance.afford'),
  1, 'but a review that is not due keeps its box');


select tests.clear_auth();
select pg_temp.make_due(:'c'::uuid, :'fa'::uuid);
select tests.authenticate_as(:'c'::uuid);
select ok(public.record_practice_result('afford-r2', 'balance.afford', true, 0, 1), 'a due review answered right');
select is(pg_temp.review(:'c'::uuid, :'fa'::uuid), '3/3/correct', 'right without help: box 1 to the 3-day box');
select is(
  (select level::int || '/' || reviews_passed
     from public.skill_progress where child_id = :'c'::uuid and skill_key = 'balance.afford'),
  '3/1', 'a review passed without help makes the skill Got it');
select ok(
  not public.record_practice_result('afford-r2', 'balance.afford', true, 0, 1),
  'the same item twice in a day is a no-op');

select tests.clear_auth();
select pg_temp.make_due(:'c'::uuid, :'fa'::uuid);
select tests.authenticate_as(:'c'::uuid);
select public.record_practice_result('afford-r3', 'balance.afford', true, 0, 1);
select is(pg_temp.review(:'c'::uuid, :'fa'::uuid), '7/7/correct', 'box 3 to box 7');

select tests.clear_auth();
select pg_temp.make_due(:'c'::uuid, :'fa'::uuid);
select tests.authenticate_as(:'c'::uuid);
select public.record_practice_result('afford-r4', 'balance.afford', true, 0, 1);
select is(pg_temp.review(:'c'::uuid, :'fa'::uuid), '14/14/correct', 'box 7 to box 14');

select tests.clear_auth();
select pg_temp.make_due(:'c'::uuid, :'fa'::uuid);
select tests.authenticate_as(:'c'::uuid);
select public.record_practice_result('afford-r5', 'balance.afford', true, 1, 1);
select is(pg_temp.review(:'c'::uuid, :'fa'::uuid), '14/14/correct_with_help', 'right with a hint keeps the box');

select tests.clear_auth();
select pg_temp.make_due(:'c'::uuid, :'fa'::uuid);
select tests.authenticate_as(:'c'::uuid);
select public.record_practice_result('afford-r6', 'balance.afford', true, 0, 2);
select is(pg_temp.review(:'c'::uuid, :'fa'::uuid), '14/14/correct_with_help', 'right on the second try keeps the box');

select tests.clear_auth();
select pg_temp.make_due(:'c'::uuid, :'fa'::uuid);
select tests.authenticate_as(:'c'::uuid);
select public.record_practice_result('afford-r7', 'balance.afford', true, 0, 1);
select is(pg_temp.review(:'c'::uuid, :'fa'::uuid), '14/14/correct', 'box 14 stays at 14');

select tests.clear_auth();
select pg_temp.make_due(:'c'::uuid, :'fa'::uuid);
select tests.authenticate_as(:'c'::uuid);
select public.record_practice_result('afford-r8', 'balance.afford', false, 1, 2);
select is(pg_temp.review(:'c'::uuid, :'fa'::uuid), '1/1/wrong', 'a wrong answer goes back to box 1');
select is(
  (select level::int from public.skill_progress where child_id = :'c'::uuid and skill_key = 'balance.afford'),
  3, 'and the skill keeps Got it');

-- Finishing another mission that touches a skill already in review keeps its schedule.
select tests.clear_auth();
update public.review_items set box = 3, due_on = public.family_today(:'fa'::uuid) + 2
  where child_id = :'c'::uuid and skill_key = 'balance.afford';
select tests.authenticate_as(:'c'::uuid);
select public.record_step_result(:'replay_attempt'::uuid, 'which-can-you-buy', 'main', 'choice', 'balance.afford', true, 0, 1);
select public.complete_mission(:'replay_attempt'::uuid);
select is(pg_temp.review(:'c'::uuid, :'fa'::uuid), '3/2/wrong', 'a skill already in review keeps its box and date');

select throws_ok(
  $$ select public.record_practice_result('afford-r9', 'balance.afford', true, 0, 3) $$,
  '22023', null, 'a bad try count is refused');

select tests.authenticate_as(:'pa'::uuid);
select throws_ok($$ select public.record_practice_result('afford-r1', 'balance.afford', true, 0, 1) $$, 'JA403', null,
  'a parent cannot practise for their child');
select throws_ok($$ select public.complete_checkin(1, 5, 3) $$, 'JA403', null, 'or do the check-in');
select tests.authenticate_as(:'lone'::uuid);
select throws_ok($$ select public.record_practice_result('afford-r1', 'balance.afford', true, 0, 1) $$, 'JA403', null,
  'a child in no family cannot practise');
select throws_ok($$ select public.complete_checkin(1, 5, 3) $$, 'JA403', null, 'or do the check-in');

-- ---------------------------------------------------------------------------
-- Caps on direct writes (JA429)
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c2'::uuid);
select public.start_mission('whats-in-spend', 1) as c2_attempt \gset
select ok(
  (select bool_and(public.record_step_result(:'c2_attempt'::uuid, 'step-' || n, 'main', 'choice', 'balance.afford', true, 0, 1))
     from generate_series(1, 20) n),
  '20 results fit in one attempt');
select throws_ok(
  format($$ select public.record_step_result(%L, 'step-21', 'main', 'choice', 'balance.afford', true, 0, 1) $$, :'c2_attempt'),
  'JA429', null, 'at most 20 results per attempt');

select ok(
  (select bool_and(public.record_practice_result('item-' || n, 'balance.afford', true, 0, 1)) from generate_series(1, 60) n),
  '60 practice answers fit in a day');
select throws_ok(
  $$ select public.record_practice_result('item-61', 'balance.afford', true, 0, 1) $$,
  'JA429', null, 'at most 60 practice answers a day');

select is((select count(distinct public.start_mission('m-' || n, 1))::int from generate_series(1, 39) n), 39,
  '40 starts fit in 24 hours');
select throws_ok($$ select public.start_mission('one-too-many', 1) $$, 'JA429', null, 'at most 40 starts in 24 hours');
select is(public.start_mission('m-1', 1),
  (select id from public.mission_attempts where child_id = :'c2'::uuid and mission_key = 'm-1'),
  'resuming an open attempt is never capped');

-- ---------------------------------------------------------------------------
-- complete_checkin
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c'::uuid);
select ok(public.complete_checkin(1, 5, 3), 'a child completes the check-in');
select ok(not public.complete_checkin(1, 5, 5), 'the check-in happens once');
select tests.authenticate_as(:'cb'::uuid);
select throws_ok($$ select public.complete_checkin(1, 5, 6) $$, '22023', null, 'more right than questions is refused');

-- ---------------------------------------------------------------------------
-- Device action time (p_occurred_at): queued learning results keep their day (CB, UTC)
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'cb'::uuid);
select ok(public.record_practice_result('late-1', 'balance.afford', true, 0, 1, now() - interval '1 day'),
  'a queued practice answer from yesterday is recorded');
select is(
  (select string_agg(answered_on::text, ',') from public.practice_results where child_id = :'cb'::uuid and item_key = 'late-1'),
  (public.family_today(:'fb'::uuid, now() - interval '1 day'))::text,
  'record_practice_result yesterday counts toward yesterday, not today');
select ok(public.record_practice_result('late-1', 'balance.afford', true, 0, 1),
  'the same item can still be answered today');
select public.start_mission('whats-in-spend', 1) as cb_attempt \gset
select public.record_step_result(:'cb_attempt'::uuid, 'how-many-packs', 'main', 'amount', 'balance.afford', true, 0, 1);
select tests.clear_auth();
update public.mission_attempts set started_at = now() - interval '2 days' where id = :'cb_attempt'::uuid;
select tests.authenticate_as(:'cb'::uuid);
select ok(public.complete_mission(:'cb_attempt'::uuid, now() - interval '1 day'),
  'a queued mission completion is accepted');
select is((select completed_at from public.mission_attempts where id = :'cb_attempt'::uuid), now() - interval '1 day',
  'complete_mission with p_occurred_at sets completed_at');
select is(
  (select due_on from public.review_items where child_id = :'cb'::uuid and skill_key = 'balance.afford'),
  public.family_today(:'fb'::uuid),
  'its first review is the day after the action day');

-- ---------------------------------------------------------------------------
-- Who can read
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'pa'::uuid);
select ok(
  (select count(*) from public.step_results where child_id = :'c'::uuid) > 0
  and (select count(*) from public.skill_progress where child_id = :'c'::uuid) > 0
  and (select count(*) from public.review_items where child_id = :'c'::uuid) > 0
  and (select count(*) from public.practice_results where child_id = :'c'::uuid) > 0
  and (select count(*) from public.learning_checkins where child_id = :'c'::uuid) = 1,
  'a parent reads their child''s progress');

select tests.authenticate_as(:'c2'::uuid);
select is(pg_temp.visible_for(:'c'::uuid), 0, 'a brother or sister sees none of another child''s learning');
select tests.authenticate_as(:'pb'::uuid);
select is(pg_temp.visible_for(:'c'::uuid), 0, 'another family''s parent sees nothing');
select tests.authenticate_as(:'cb'::uuid);
select is(pg_temp.visible_for(:'c'::uuid), 0, 'another family''s child sees nothing');

select tests.authenticate_as(:'c'::uuid);
select throws_ok(
  format($$ insert into public.skill_progress (child_id, skill_key, level) values (%L, 'plan.adjust', 3) $$, :'c'),
  '42501', null, 'a child cannot write progress directly');
select throws_ok($$ update public.review_items set box = 14 $$, '42501', null, 'or move a review box directly');
select throws_ok($$ select public.learning_child_family() $$, '42501', null, 'the internal helper is not callable');

set local role anon;
select throws_ok($$ select public.start_mission('whats-in-spend', 1) $$, '42501', null, 'anon cannot execute the functions');
reset role;

-- ---------------------------------------------------------------------------
-- Removing a child (ADR 0007): learning progress goes with them
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'pa'::uuid);
select ok(public.remove_child(:'c'::uuid), 'a parent removes a child with no money history');
select tests.clear_auth();
select is(pg_temp.visible_for(:'c'::uuid), 0, 'every learning row of the removed child is deleted');
select tests.authenticate_as(:'c'::uuid);
select throws_ok($$ select public.start_mission('whats-in-spend', 1) $$, 'JA403', null, 'a removed child can''t write');

-- Deleting the identity is never blocked by learning rows (they cascade).
select tests.clear_auth();
select lives_ok(format($$ delete from auth.users where id = %L $$, :'c2'), 'a child with learning rows can be deleted');
select is(pg_temp.visible_for(:'c2'::uuid), 0, 'and their learning rows go with them');

select * from finish();
rollback;
