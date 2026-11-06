begin;
\ir _helpers.psql
select plan(9);

-- profiles.child_facing_name (2026-11-06): a parent sets what their child calls them; the
-- family can read it; nobody else can write it; the check keeps it short and trimmed.

select tests.create_user('cfn-pa@example.com') as pa \gset
select tests.create_user('cfn-pb@example.com') as pb \gset
select tests.create_user('cfn-c1@example.com', 'child') as c1 \gset
select tests.authenticate_as(:'pa'::uuid);
select public.create_family('USD', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);

-- A parent sets their own name
select lives_ok(
  $$ update public.profiles set child_facing_name = 'Mum' where id = auth.uid() $$,
  'a parent sets their own child-facing name'
);
select is(
  (select child_facing_name from public.profiles where id = :'pa'::uuid),
  'Mum', 'the name is saved'
);

-- Check constraint: empty, too long, untrimmed
select throws_ok(
  $$ update public.profiles set child_facing_name = '' where id = auth.uid() $$,
  '23514', null, 'an empty name is refused'
);
select throws_ok(
  $$ update public.profiles set child_facing_name = repeat('a', 21) where id = auth.uid() $$,
  '23514', null, 'a 21-character name is refused'
);
select throws_ok(
  $$ update public.profiles set child_facing_name = ' Mum' where id = auth.uid() $$,
  '23514', null, 'an untrimmed name is refused'
);

-- Another parent's row is out of reach (policy filters it: 0 rows)
select is(
  (with u as (
    update public.profiles set child_facing_name = 'Hacked' where id = :'pb'::uuid returning 1
  ) select count(*)::int from u),
  0, 'a parent cannot update another parent''s name'
);

-- A child can't write it, and reads their parent's
select tests.authenticate_as(:'c1'::uuid);
select is(
  (with u as (
    update public.profiles set child_facing_name = 'Boss' where id = :'pa'::uuid returning 1
  ) select count(*)::int from u),
  0, 'a child cannot update it'
);
select is(
  (select child_facing_name from public.profiles where id = :'pa'::uuid),
  'Mum', 'a child reads their parent''s name'
);
select is(
  (select child_facing_name from public.profiles where id = :'pb'::uuid),
  null, 'an unrelated parent''s row is not visible to the child'
);

select * from finish();
rollback;
