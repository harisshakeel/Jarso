begin;
\ir _helpers.psql
select plan(24);

-- Fixtures: PA owns family A with child S ('Sam'); C, C2 are child-role users awaiting registration.
select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('s@example.com', 'child') as s \gset
select tests.create_user('c@example.com', 'child') as c \gset
select tests.create_user('c2@example.com', 'child') as c2 \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'Europe/London') as fa \gset
select public.register_child(:'s'::uuid, :'fa'::uuid, 'Sam', '1111', true);

-- create_invitation is service_role only.
select throws_ok(
  $$ select public.create_invitation('Mia', 'pa@example.com', 'tok-x', 'code-x') $$,
  '42501', null, 'authenticated cannot execute create_invitation');
select is((select count(*)::int from public.invitations), 0, 'authenticated cannot read invitations');
select throws_ok(
  $$ insert into public.invitations (nickname, parent_email, token_hash, code_hash, expires_at)
     values ('Mia', 'pa@example.com', 'tok-x', 'code-x', now() + interval '1 day') $$,
  '42501', null, 'authenticated cannot insert invitations');

reset role; -- service_role cannot use schema tests
select tests.clear_auth();
set local role service_role;

select lives_ok(
  $$ select public.create_invitation('  Mia ', 'pa@example.com', 'tok-1', 'code-1') $$,
  'service_role creates an invitation');
select id as inv from public.invitations where token_hash = 'tok-1' \gset
select is(
  (select kind || '/' || status || '/' || nickname || '/' || (expires_at = now() + interval '7 days')::text
   from public.invitations where id = :'inv'::uuid),
  'child_to_parent/pending/Mia/true', 'pending child_to_parent invitation, nickname trimmed, expires in 7 days');
select throws_ok(
  $$ select public.create_invitation('   ', 'pa@example.com', 'tok-2', 'code-2') $$,
  '22023', null, 'create_invitation validates the nickname');
select throws_ok(
  $$ select public.create_invitation('Mia', 'pa@example.com', 'tok-1', 'code-3') $$,
  '23505', null, 'token_hash is unique');

select public.create_invitation('Leo', 'pa@example.com', 'tok-old', 'code-old') as inv_old \gset

reset role;
select tests.clear_auth();
update public.invitations set expires_at = now() - interval '1 second' where id = :'inv_old'::uuid;

-- find_invitation: authenticated only, pending and unexpired.
set local role anon;
select throws_ok(
  $$ select * from public.find_invitation('tok-1') $$,
  '42501', null, 'anon cannot execute find_invitation');
reset role;

select tests.authenticate_as(:'pa'::uuid);
select results_eq(
  $$ select id, nickname from public.find_invitation('tok-1') $$,
  format('values (%L::uuid, %L::text)', :'inv', 'Mia'),
  'find by token hash');
select results_eq(
  $$ select id, nickname from public.find_invitation('code-1') $$,
  format('values (%L::uuid, %L::text)', :'inv', 'Mia'),
  'find by code hash');
select is_empty($$ select * from public.find_invitation('nope') $$, 'unknown hash → no rows');
select is_empty($$ select * from public.find_invitation(null) $$, 'null hash → no rows');
select is_empty($$ select * from public.find_invitation('tok-old') $$, 'expired invitation → no rows');

-- A failed registration leaves the invitation pending.
select throws_ok(
  format('select public.register_child(%L, %L, %L, %L, true, %L)', :'c', :'fa', 'sam', '1234', :'inv'),
  'JA409', null, 'nickname clash with an invitation');
select results_eq(
  $$ select id, nickname from public.find_invitation('tok-1') $$,
  format('values (%L::uuid, %L::text)', :'inv', 'Mia'),
  'invitation still pending after the failed registration');

-- Accept.
select lives_ok(
  format('select public.register_child(%L, %L, %L, %L, true, %L)', :'c', :'fa', 'Mia', '1234', :'inv'),
  'parent registers a child from an invitation');
reset role;
select tests.clear_auth();
select is(
  (select status || '/' || child_id::text || '/' || accepted_by::text || '/' || family_id::text
   from public.invitations where id = :'inv'::uuid),
  'accepted/' || :'c' || '/' || :'pa' || '/' || :'fa',
  'invitation accepted with child, parent and family');
select is(
  (select count(*)::int from public.audit_log
   where family_id = :'fa'::uuid and action = 'invitation.accepted' and subject_id = :'inv'::uuid and actor_id = :'pa'::uuid),
  1, 'invitation.accepted audited');

-- Single use.
select tests.authenticate_as(:'pa'::uuid);
select throws_ok(
  format('select public.register_child(%L, %L, %L, %L, true, %L)', :'c2', :'fa', 'Mia2', '1234', :'inv'),
  'JA404', null, 'accepted invitation cannot be reused');
select is(
  (select count(*)::int from public.family_members where profile_id = :'c2'::uuid),
  0, 'reuse attempt adds no membership');
select is_empty($$ select * from public.find_invitation('tok-1') $$, 'accepted invitation no longer found');

-- Expired and unknown invitations.
select throws_ok(
  format('select public.register_child(%L, %L, %L, %L, true, %L)', :'c2', :'fa', 'Leo', '1234', :'inv_old'),
  'JA404', null, 'expired invitation rejected');
select throws_ok(
  format('select public.register_child(%L, %L, %L, %L, true, %L)', :'c2', :'fa', 'Leo', '1234', gen_random_uuid()),
  'JA404', null, 'unknown invitation rejected');
select is((select count(*)::int from public.invitations), 0, 'parent still cannot read invitations');

select * from finish();
rollback;
