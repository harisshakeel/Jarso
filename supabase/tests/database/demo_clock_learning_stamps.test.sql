begin;
\ir _helpers.psql
select plan(7);

-- Demo clock (D11): learning answers are written in the family's time. Family A's clock is
-- 5 days ahead; family B's is not moved.

select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('c1@example.com', 'child') as c1 \gset
select tests.create_user('c3@example.com', 'child') as c3 \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select tests.authenticate_as(:'pb'::uuid);
select public.create_family('GBP', 'UTC') as fb \gset
select public.register_child(:'c3'::uuid, :'fb'::uuid, 'Ria', '1234', true);
select tests.clear_auth();

update public.families set clock_offset = interval '5 days' where id = :'fa'::uuid;

-- ---------------------------------------------------------------------------
-- step_results.answered_at: the attempt's family
-- ---------------------------------------------------------------------------

insert into public.mission_attempts (family_id, child_id, mission_key, content_version)
values (:'fa'::uuid, :'c1'::uuid, 'stamp-mission', 1)
returning id as m1 \gset
insert into public.step_results (attempt_id, child_id, step_key, phase, step_type, skill_key, correct, hints_used, tries, answered_at)
values (:'m1'::uuid, :'c1'::uuid, 'step-one', 'main', 'choice', 'budget.basics', true, 0, 1, '2026-11-01 10:00+00');
select is(
  (select answered_at from public.step_results where attempt_id = :'m1'::uuid and step_key = 'step-one'),
  '2026-11-06 10:00+00'::timestamptz, 'a step answer is written in family time');

insert into public.mission_attempts (family_id, child_id, mission_key, content_version)
values (:'fb'::uuid, :'c3'::uuid, 'stamp-mission', 1)
returning id as m2 \gset
insert into public.step_results (attempt_id, child_id, step_key, phase, step_type, skill_key, correct, hints_used, tries, answered_at)
values (:'m2'::uuid, :'c3'::uuid, 'step-one', 'main', 'choice', 'budget.basics', true, 0, 1, '2026-11-01 10:00+00');
select is(
  (select answered_at from public.step_results where attempt_id = :'m2'::uuid and step_key = 'step-one'),
  '2026-11-01 10:00+00'::timestamptz, 'a real family''s step answer keeps its time');

-- ---------------------------------------------------------------------------
-- practice_results.answered_at: the child's approved family
-- ---------------------------------------------------------------------------

insert into public.practice_results (child_id, item_key, skill_key, answered_on, correct, hints_used, tries, answered_at)
values (:'c1'::uuid, 'item-one', 'budget.basics', date '2026-11-06', true, 0, 1, '2026-11-01 10:00+00')
returning id as p1 \gset
select is(
  (select answered_at from public.practice_results where id = :'p1'::uuid), '2026-11-06 10:00+00'::timestamptz,
  'a practice answer is written in family time');

insert into public.practice_results (child_id, item_key, skill_key, answered_on, correct, hints_used, tries, answered_at)
values (:'c3'::uuid, 'item-one', 'budget.basics', date '2026-11-01', true, 0, 1, '2026-11-01 10:00+00')
returning id as p2 \gset
select is(
  (select answered_at from public.practice_results where id = :'p2'::uuid), '2026-11-01 10:00+00'::timestamptz,
  'a real family''s practice answer keeps its time');

-- Through the real function, as the child: the answer lands on the family's day.
select tests.authenticate_as(:'c1'::uuid);
select public.record_practice_result('item-two', 'budget.basics', true, 0, 1);
select tests.clear_auth();
select is(
  (select answered_at from public.practice_results where child_id = :'c1'::uuid and item_key = 'item-two'),
  now() + interval '5 days', 'a practice answer the child records lands on the family''s day');

select is(
  (select pg_catalog.count(*)::int from pg_trigger
   where tgname in ('step_results_family_time', 'practice_results_family_time') and not tgisinternal),
  2, 'both learning stamp triggers exist');

select ok(
  not has_function_privilege('authenticated', 'public.step_results_family_time()', 'execute')
  and not has_function_privilege('anon', 'public.practice_results_family_time()', 'execute'),
  'trigger functions are not callable by users');

select * from finish();
rollback;
