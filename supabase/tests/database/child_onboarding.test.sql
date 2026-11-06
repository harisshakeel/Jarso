begin;
\ir _helpers.psql
select plan(10);

-- The phone intro (mobile kid rework, plan 8): complete_child_onboarding marks the tour done and
-- pays 50 Sparks and the jar_starter badge once for life. Only an approved child may call it.

select tests.create_user('onb-pa@example.com') as pa \gset
select tests.create_user('onb-c1@example.com', 'child') as c1 \gset
select tests.create_user('onb-c2@example.com', 'child') as c2 \gset
select tests.authenticate_as(:'pa'::uuid);
select public.create_family('INR', 'Asia/Kolkata') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select public.register_child(:'c2'::uuid, :'fa'::uuid, 'Ola', '1234', true);

-- A parent can't finish an intro
select throws_ok(
  $$ select public.complete_child_onboarding() $$,
  'JA403', 'Not allowed', 'a parent cannot complete the intro'
);

-- The child picked a buddy on the web first; the intro keeps it
select tests.authenticate_as(:'c1'::uuid);
select public.save_welcome_tour('bo', false);

select is(
  public.complete_child_onboarding(),
  '{"sparks": 50, "badge": "jar_starter"}'::jsonb,
  'the first finish pays 50 Sparks and the first badge'
);
select is(
  (select sparks from public.child_progress where child_id = :'c1'::uuid),
  50::bigint, 'the child has 50 Sparks'
);
select results_eq(
  format($$ select buddy, finished_at is not null from public.child_tours where child_id = %L $$, :'c1'),
  $$ values ('bo'::text, true) $$,
  'the tour is finished and the buddy kept'
);
select is(
  (select count(*)::int from public.child_badges where child_id = :'c1'::uuid and badge_key = 'jar_starter'),
  1, 'the jar_starter badge is granted'
);

-- A replay pays nothing
select is(
  public.complete_child_onboarding(),
  '{"sparks": 0, "badge": null}'::jsonb,
  'a replay pays nothing'
);
select is(
  (select sparks from public.child_progress where child_id = :'c1'::uuid),
  50::bigint, 'the Sparks stay at 50 after a replay'
);

-- Sparks are never money
select is(
  (select count(*)::int from public.ledger_entries where child_id = :'c1'::uuid),
  0, 'the intro writes nothing to the ledger'
);

select tests.clear_auth();

-- A sibling is untouched (read as the owner, past RLS)
select is(
  (select count(*)::int from public.spark_events where child_id = :'c2'::uuid),
  0, 'a sibling gets nothing'
);

-- Signed out: nothing
set local role anon;
select throws_ok(
  $$ select public.complete_child_onboarding() $$,
  '42501', null, 'anon cannot call complete_child_onboarding'
);
reset role;

select * from finish();
rollback;
