begin;
\ir _helpers.psql
select plan(23);

-- Jarso's memory (ADR 0011, slice 8). PA owns family A with C1 and C2; PB owns family B with C3.
select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('c1@example.com', 'child') as c1 \gset
select tests.create_user('c2@example.com', 'child') as c2 \gset
select tests.create_user('c3@example.com', 'child') as c3 \gset

select tests.authenticate_as(:'pb'::uuid);
select public.create_family('INR', 'Asia/Kolkata') as fb \gset
select public.register_child(:'c3'::uuid, :'fb'::uuid, 'Ria', '1234', true);
select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select public.register_child(:'c2'::uuid, :'fa'::uuid, 'Max', '1234', true);
select tests.clear_auth();

-- Privileges and RLS
select ok((select relrowsecurity from pg_class where oid = 'public.guide_memories'::regclass), 'RLS is on');
select table_privs_are('public', 'guide_memories', 'authenticated', array['SELECT', 'DELETE'],
  'authenticated may read and forget, never write');
select table_privs_are('public', 'guide_memories', 'anon', array[]::text[], 'anon has no access');
select function_privs_are('public', 'guide_remember', array['uuid', 'text', 'text'],
  'authenticated', array[]::text[], 'only the server remembers');
select function_privs_are('public', 'guide_remember', array['uuid', 'text', 'text'],
  'service_role', array['EXECUTE'], 'the server remembers');

-- Server write
set local role service_role;
select public.guide_remember(:'c1'::uuid, 'interest', '  Likes football examples  ') as m1 \gset
select is((select text from public.guide_memories where id = :'m1'::uuid), 'Likes football examples', 'text trimmed');
select is((select kind from public.guide_memories where id = :'m1'::uuid), 'interest', 'kind kept');
select ok((select expires_at > now() + interval '89 days' from public.guide_memories where id = :'m1'::uuid),
  'a memory lasts about 90 days');
select is(public.guide_remember(:'c1'::uuid, 'interest', 'likes FOOTBALL examples'), :'m1'::uuid,
  'the same fact again (any case) refreshes the one row');
select is((select count(*)::int from public.guide_memories where child_id = :'c1'::uuid), 1, 'and adds nothing');
select throws_ok(format($$select public.guide_remember(%L, 'secret', 'x')$$, :'c1'), '22023', null, 'unknown kind refused');
select throws_ok(format($$select public.guide_remember(%L, 'interest', '   ')$$, :'c1'), '22023', null, 'blank text refused');
select throws_ok(format($$select public.guide_remember(%L, 'interest', %L)$$, :'c1', repeat('x', 141)), '22023', null,
  'text over 140 refused');
select throws_ok(format($$select public.guide_remember(%L, 'interest', 'x')$$, :'pa'), 'JA403', null,
  'no memory for a parent');

-- Newest 20 kept
select public.guide_remember(:'c1'::uuid, 'prefers', 'fact ' || g) from generate_series(1, 25) g;
select is((select count(*)::int from public.guide_memories where child_id = :'c1'::uuid), 20, 'at most 20 per child');
select is((select count(*)::int from public.guide_memories where child_id = :'c1'::uuid and text = 'fact 25'), 1,
  'the newest stays');
select is((select count(*)::int from public.guide_memories where child_id = :'c1'::uuid and text = 'Likes football examples'), 0,
  'the oldest goes');
reset role;

-- Jarso off: nothing new is kept
select tests.authenticate_as(:'pa'::uuid);
select public.set_guide_access(:'c2'::uuid, false);
set local role service_role;
select throws_ok(format($$select public.guide_remember(%L, 'interest', 'x')$$, :'c2'), 'JA403', null,
  'no memory once a parent turned Jarso off');
reset role;

-- Who reads and forgets
select tests.authenticate_as(:'c2'::uuid);
select is((select count(*)::int from public.guide_memories), 0, 'a brother or sister sees nothing');
select tests.authenticate_as(:'pb'::uuid);
select is((select count(*)::int from public.guide_memories), 0, 'another family sees nothing');
select tests.authenticate_as(:'c1'::uuid);
select is((select count(*)::int from public.guide_memories), 20, 'the child reads their own');
delete from public.guide_memories where text = 'fact 25';
select is((select count(*)::int from public.guide_memories where text = 'fact 25'), 0, 'and forgets one');
select tests.authenticate_as(:'pa'::uuid);
delete from public.guide_memories where text = 'fact 24';
select is((select count(*)::int from public.guide_memories where child_id = :'c1'::uuid and text = 'fact 24'), 0,
  'the parent forgets one too');

select * from finish();
rollback;
