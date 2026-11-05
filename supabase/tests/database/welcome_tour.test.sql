begin;
\ir _helpers.psql
select plan(9);

-- The welcome tour (2026-11-06): a child saves their own buddy and that they finished, through
-- save_welcome_tour only; their parent can read it; nobody else can write it.

select tests.create_user('tour-pa@example.com') as pa \gset
select tests.create_user('tour-c1@example.com', 'child') as c1 \gset
select tests.create_user('tour-c2@example.com', 'child') as c2 \gset
select tests.authenticate_as(:'pa'::uuid);
select public.create_family('USD', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select public.register_child(:'c2'::uuid, :'fa'::uuid, 'Ola', '1234', true);

-- A parent can't save a tour
select throws_ok(
  $$ select public.save_welcome_tour('bo', true) $$,
  'JA403', 'Not allowed', 'a parent cannot save a welcome tour'
);

-- The child picks a buddy: a row appears, not finished yet
select tests.authenticate_as(:'c1'::uuid);
select lives_ok($$ select public.save_welcome_tour('zuzu', false) $$, 'a child saves their buddy');
select results_eq(
  format($$ select buddy, finished_at is null from public.child_tours where child_id = %L $$, :'c1'),
  $$ values ('zuzu'::text, true) $$,
  'the buddy is saved and the tour is not finished'
);

-- Finishing keeps the buddy when none is passed
select public.save_welcome_tour(null, true);
select results_eq(
  format($$ select buddy, finished_at is not null from public.child_tours where child_id = %L $$, :'c1'),
  $$ values ('zuzu'::text, true) $$,
  'finishing keeps the buddy and records the time'
);

-- An unknown buddy is refused
select throws_ok(
  $$ select public.save_welcome_tour('rex', false) $$,
  '22023', 'Unknown buddy', 'an unknown buddy is refused'
);

-- Writes outside the function are refused
select throws_ok(
  format($$ update public.child_tours set buddy = 'bo' where child_id = %L $$, :'c1'),
  '42501', null, 'a child cannot update the table directly'
);

-- A sibling can't see it; the parent can
select tests.authenticate_as(:'c2'::uuid);
select is(
  (select count(*)::int from public.child_tours where child_id = :'c1'::uuid),
  0, 'a sibling cannot see another child''s tour'
);
select tests.authenticate_as(:'pa'::uuid);
select is(
  (select buddy from public.child_tours where child_id = :'c1'::uuid),
  'zuzu', 'the parent can see their child''s buddy'
);

-- Signed out: nothing
select tests.clear_auth();
set local role anon;
select throws_ok(
  $$ select public.save_welcome_tour('bo', true) $$,
  '42501', null, 'anon cannot call save_welcome_tour'
);
reset role;

select * from finish();
rollback;
