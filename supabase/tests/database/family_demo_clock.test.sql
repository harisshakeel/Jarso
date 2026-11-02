begin;
\ir _helpers.psql
select plan(6);

-- family_demo_clock(): whether the caller's own family is a demo family. Family A is a demo
-- family (parent PA, child C1); family B is not (parent PB).

select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('c1@example.com', 'child') as c1 \gset
select tests.create_user('lone@example.com') as lone \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select tests.authenticate_as(:'pb'::uuid);
select public.create_family('GBP', 'UTC') as fb \gset
select tests.clear_auth();

update public.families set demo_clock_enabled = true where id = :'fa'::uuid;

select tests.authenticate_as(:'pa'::uuid);
select is(public.family_demo_clock(), true, 'a demo family''s parent sees it is a demo family');
select tests.authenticate_as(:'c1'::uuid);
select is(public.family_demo_clock(), true, 'so does its child');
select tests.authenticate_as(:'pb'::uuid);
select is(public.family_demo_clock(), false, 'a real family''s parent does not');
select tests.authenticate_as(:'lone'::uuid);
select is(public.family_demo_clock(), false, 'a user with no family does not');
select tests.clear_auth();

select ok(
  has_function_privilege('authenticated', 'public.family_demo_clock()', 'execute'),
  'signed-in users can call it');
select ok(
  not has_function_privilege('anon', 'public.family_demo_clock()', 'execute'),
  'signed-out users cannot');

select * from finish();
rollback;
