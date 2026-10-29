begin;
\ir _helpers.psql
select plan(46);

-- Fixtures: family A with parent PA and children C and C2; family B with parent PB and child CB.
-- LONE is a child account in no family.
select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('c@example.com', 'child') as c \gset
select tests.create_user('c2@example.com', 'child') as c2 \gset
select tests.create_user('cb@example.com', 'child') as cb \gset
select tests.create_user('lone@example.com', 'child') as lone \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'Europe/London') as fa \gset
select public.register_child(:'c'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select public.register_child(:'c2'::uuid, :'fa'::uuid, 'Alex', '2345', true);

select tests.authenticate_as(:'pb'::uuid);
select public.create_family('EUR', 'UTC') as fb \gset
select public.register_child(:'cb'::uuid, :'fb'::uuid, 'Jo', '3456', true);

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

-- A new content version abandons the open attempt and starts again.
select public.start_mission('small-buys-add-up', 1) as old_attempt \gset
select public.start_mission('small-buys-add-up', 2) as new_attempt \gset
select isnt(:'new_attempt'::uuid, :'old_attempt'::uuid, 'a new content version starts a new attempt');
select is(
  (select status from public.mission_attempts where id = :'old_attempt'::uuid),
  'abandoned', 'the old version is abandoned');

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
  public.record_step_result(:'attempt'::uuid, 'which-can-you-buy', 'main', 'choice', 'balance.afford',
    '{"kind":"option","optionId":"comic"}'::jsonb, true, 0, 1),
  'a child records a step');
select ok(
  not public.record_step_result(:'attempt'::uuid, 'which-can-you-buy', 'main', 'choice', 'balance.afford',
    '{"kind":"option","optionId":"comic"}'::jsonb, true, 0, 1),
  'recording the same step again is a no-op');
select is(
  (select level::int || '/' || first_try_correct || '/' || correct_with_hints
     from public.skill_progress where child_id = :'c'::uuid and skill_key = 'balance.afford'),
  '2/1/0', 'a first-try right answer makes the skill Practised and counts once');

select public.record_step_result(:'attempt'::uuid, 'whats-left', 'main', 'amount', 'balance.afford',
  '{"kind":"number","value":2400}'::jsonb, false, 1, 2);
select public.record_step_result(:'attempt'::uuid, 'whats-left', 'replay', 'amount', 'balance.afford',
  '{"kind":"number","value":1550}'::jsonb, true, 0, 1);
select is(
  (select count(*)::int from public.step_results where attempt_id = :'attempt'::uuid),
  3, 'a main result and its replay are separate rows');
select is(
  (select first_try_correct || '/' || correct_with_hints
     from public.skill_progress where child_id = :'c'::uuid and skill_key = 'balance.afford'),
  '1/0', 'a replay never counts as a first try');

select public.record_step_result(:'attempt'::uuid, 'why-check-first', 'main', 'reason', 'balance.afford',
  '{"kind":"option","optionId":"know"}'::jsonb, true, 1, 1);
select is(
  (select reasons_correct || '/' || correct_with_hints
     from public.skill_progress where child_id = :'c'::uuid and skill_key = 'balance.afford'),
  '1/1', 'a right reason counts as a sound explanation; a hint counts as help');

select throws_ok(
  format($$ select public.record_step_result(%L, 'x', 'sideways', 'choice', 'balance.afford', '{}'::jsonb, true, 0, 1) $$, :'attempt'),
  '22023', null, 'an unknown phase is refused');
select throws_ok(
  format($$ select public.record_step_result(%L, 'x', 'main', 'choice', 'balance.afford', '{}'::jsonb, true, 3, 1) $$, :'attempt'),
  '22023', null, 'more than two hints is refused');
select throws_ok(
  format($$ select public.record_step_result(%L, 'x', 'main', 'choice', 'balance.afford', '[1]'::jsonb, true, 0, 1) $$, :'attempt'),
  '22023', null, 'an answer must be an object');

select tests.authenticate_as(:'c2'::uuid);
select throws_ok(
  format($$ select public.record_step_result(%L, 'x', 'main', 'choice', 'balance.afford', '{}'::jsonb, true, 0, 1) $$, :'attempt'),
  'JA403', null, 'a brother or sister cannot write to another child''s attempt');

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
  not public.record_step_result(:'attempt'::uuid, 'how-many-packs', 'main', 'amount', 'balance.afford',
    '{"kind":"number","value":4}'::jsonb, true, 0, 1),
  'a result after completion changes nothing');
select throws_ok(
  format($$ select public.complete_mission(%L) $$, :'old_attempt'),
  'JA409', null, 'an abandoned attempt cannot be completed');

-- ---------------------------------------------------------------------------
-- record_practice_result: spaced review boxes
-- ---------------------------------------------------------------------------

select ok(
  public.record_practice_result('afford-r1', 'balance.afford', '{"kind":"option","optionId":"a"}'::jsonb, true, 0, 1),
  'practice before the review is due is recorded');
select is(
  (select box::int from public.review_items where child_id = :'c'::uuid and skill_key = 'balance.afford'),
  1, 'but a review that is not due keeps its box');

-- Make the review due today.
select tests.clear_auth();
update public.review_items set due_on = public.family_today(:'fa'::uuid)
  where child_id = :'c'::uuid and skill_key = 'balance.afford';
select tests.authenticate_as(:'c'::uuid);

select ok(
  public.record_practice_result('afford-r2', 'balance.afford', '{"kind":"option","optionId":"a"}'::jsonb, true, 0, 1),
  'a due review answered right');
select is(
  (select box::int || '/' || (due_on - public.family_today(:'fa'::uuid)) || '/' || last_result
     from public.review_items where child_id = :'c'::uuid and skill_key = 'balance.afford'),
  '3/3/correct', 'right without hints moves up to the 3-day box');
select is(
  (select level::int || '/' || reviews_passed
     from public.skill_progress where child_id = :'c'::uuid and skill_key = 'balance.afford'),
  '3/1', 'a review passed without hints makes the skill Got it');
select ok(
  not public.record_practice_result('afford-r2', 'balance.afford', '{"kind":"option","optionId":"a"}'::jsonb, true, 0, 1),
  'the same item twice in a day is a no-op');

select tests.clear_auth();
update public.review_items set due_on = public.family_today(:'fa'::uuid)
  where child_id = :'c'::uuid and skill_key = 'balance.afford';
select tests.authenticate_as(:'c'::uuid);
select public.record_practice_result('afford-r3', 'balance.afford', '{"kind":"option","optionId":"b"}'::jsonb, false, 1, 2);
select is(
  (select box::int || '/' || (due_on - public.family_today(:'fa'::uuid)) || '/' || last_result
     from public.review_items where child_id = :'c'::uuid and skill_key = 'balance.afford'),
  '1/1/wrong', 'a wrong answer goes back to box 1');

select throws_ok(
  $$ select public.record_practice_result('afford-r4', 'balance.afford', '{}'::jsonb, true, 0, 3) $$,
  '22023', null, 'a bad try count is refused');

-- ---------------------------------------------------------------------------
-- complete_checkin
-- ---------------------------------------------------------------------------

select ok(public.complete_checkin(1, '[{"stepKey":"a"}]'::jsonb, 3), 'a child completes the check-in');
select ok(not public.complete_checkin(1, '[]'::jsonb, 5), 'the check-in happens once');
select throws_ok($$ select public.complete_checkin(1, '[]'::jsonb, 6) $$, '22023', null, 'more than five right is refused');

-- ---------------------------------------------------------------------------
-- Who can read
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'pa'::uuid);
select ok(
  (select count(*) from public.step_results where child_id = :'c'::uuid) > 0
  and (select count(*) from public.skill_progress where child_id = :'c'::uuid) > 0
  and (select count(*) from public.learning_checkins where child_id = :'c'::uuid) = 1,
  'a parent reads their child''s progress');

select tests.authenticate_as(:'c2'::uuid);
select is((select count(*)::int from public.mission_attempts), 0, 'a brother or sister sees no other child''s attempts');
select is((select count(*)::int from public.skill_progress), 0, 'or their skills');

select tests.authenticate_as(:'pb'::uuid);
select is(
  (select count(*)::int from public.mission_attempts)
  + (select count(*)::int from public.step_results)
  + (select count(*)::int from public.review_items)
  + (select count(*)::int from public.practice_results)
  + (select count(*)::int from public.learning_checkins),
  0, 'another family sees nothing');

select tests.authenticate_as(:'c'::uuid);
select throws_ok(
  format($$ insert into public.skill_progress (child_id, skill_key, level) values (%L, 'plan.adjust', 3) $$, :'c'),
  '42501', null, 'a child cannot write progress directly');
select throws_ok(
  $$ update public.review_items set box = 14 $$,
  '42501', null, 'or move a review box directly');
select throws_ok(
  $$ select public.learning_child_family() $$,
  '42501', null, 'the internal helper is not callable');

set local role anon;
select throws_ok($$ select public.start_mission('whats-in-spend', 1) $$, '42501', null, 'anon cannot execute the functions');
reset role;

select * from finish();
rollback;
