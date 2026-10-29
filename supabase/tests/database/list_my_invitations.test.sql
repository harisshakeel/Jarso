begin;
\ir _helpers.psql
select plan(10);

-- Fixtures: PA and PB are confirmed parents, PU an unconfirmed parent, K a confirmed child.
select tests.create_user('Pa@Example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('pu@example.com') as pu \gset
select tests.create_user('kid@example.com', 'child') as k \gset
update auth.users set email_confirmed_at = now() where id in (:'pa', :'pb', :'k');

create function pg_temp.invite(nickname text, email text, age interval, status text default 'pending', ttl interval default '7 days')
returns uuid language sql as $$
  insert into public.invitations (nickname, parent_email, token_hash, code_hash, status, created_at, expires_at)
  values (nickname, email, gen_random_uuid()::text, gen_random_uuid()::text, status, now() - age, now() - age + ttl)
  returning id;
$$;

select pg_temp.invite('Mia', 'pa@EXAMPLE.com', '2 hours') as mia \gset
select pg_temp.invite('Zoe', 'PA@example.com', '10 minutes') as zoe \gset
select pg_temp.invite('Old', 'pa@example.com', '8 days') as expired \gset
select pg_temp.invite('Done', 'pa@example.com', '1 day', 'accepted') as accepted \gset
select pg_temp.invite('Ben', 'pb@example.com', '1 hour') as ben \gset
select pg_temp.invite('Unc', 'pu@example.com', '1 hour') as unc \gset
select pg_temp.invite('Kid', 'kid@example.com', '1 hour') as kid \gset

-- anon cannot call it at all.
set local role anon;
select throws_ok(
  $$ select * from public.list_my_invitations() $$,
  '42501', null, 'anon cannot execute list_my_invitations');
reset role;

-- Confirmed parent: own pending, unexpired invitations, any email case, newest first.
select tests.authenticate_as(:'pa'::uuid);
select results_eq(
  $$ select id from public.list_my_invitations() $$,
  format('values (%L::uuid), (%L::uuid)', :'zoe', :'mia'),
  'confirmed parent sees own pending invitations, case-insensitive, newest first');
select is_empty(
  format('select 1 from public.list_my_invitations() where id in (%L, %L, %L)', :'expired', :'accepted', :'ben'),
  'expired, accepted and other parents'' invitations are excluded');
select is(
  (select nickname || '/' || (expires_at > now())::text from public.list_my_invitations() where id = :'mia'::uuid),
  'Mia/true', 'returns nickname and expiry');
select is((select count(*)::int from public.invitations), 0, 'parent still cannot read the invitations table');
select tests.clear_auth();

-- Another confirmed parent sees only theirs.
select tests.authenticate_as(:'pb'::uuid);
select results_eq(
  $$ select id from public.list_my_invitations() $$,
  format('values (%L::uuid)', :'ben'),
  'other parent sees only invitations to their own email');
select tests.clear_auth();

-- Unconfirmed email sees none.
select tests.authenticate_as(:'pu'::uuid);
select is_empty($$ select * from public.list_my_invitations() $$, 'unconfirmed email sees no invitations');
select tests.clear_auth();

-- Child role sees none, even with a confirmed matching email.
select tests.authenticate_as(:'k'::uuid);
select is_empty($$ select * from public.list_my_invitations() $$, 'child role sees no invitations');
select tests.clear_auth();

-- No session (authenticated role without a sub) sees none.
set local role authenticated;
select is_empty($$ select * from public.list_my_invitations() $$, 'no auth.uid() sees no invitations');
reset role;

-- At most 50 rows.
select count(pg_temp.invite('N' || g, 'pb@example.com', make_interval(mins => g))) from generate_series(1, 60) g;
select tests.authenticate_as(:'pb'::uuid);
select is((select count(*)::int from public.list_my_invitations()), 50, 'capped at 50 rows');
select tests.clear_auth();

select * from finish();
rollback;
