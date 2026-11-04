begin;
\ir _helpers.psql
select plan(30);

-- Phone push (mobile wave 3): Expo push tokens are the signed-in member's, one row per token,
-- at most 10 per member, and a token moves to whichever account registers it. Tickets are
-- server-only bookkeeping for the receipt check.

select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('nobody@example.com') as nobody \gset
select tests.create_user('c1@example.com', 'child') as c1 \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select tests.clear_auth();
insert into public.family_members (family_id, profile_id, role, status)
values (:'fa'::uuid, :'pb'::uuid, 'parent', 'approved');

-- Table shape
select has_table('public', 'device_push_tokens', 'device_push_tokens exists');
select has_table('public', 'device_push_tickets', 'device_push_tickets exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.device_push_tokens'::regclass),
  'RLS is on for device_push_tokens'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.device_push_tickets'::regclass),
  'RLS is on for device_push_tickets'
);
select policies_are('public', 'device_push_tokens', array['Device push tokens are the owner''s'],
  'only a select policy: writes go through functions');
select policies_are('public', 'device_push_tickets', array[]::text[],
  'tickets have no policies: admin client only');

-- Not a member
select tests.authenticate_as(:'nobody'::uuid);
select throws_ok(
  $$ select public.register_device_push_token('ExponentPushToken[nobody]', 'android') $$,
  '42501', null, 'an outsider cannot register a token'
);
select tests.clear_auth();

-- Register as a member
select tests.authenticate_as(:'pa'::uuid);
select lives_ok(
  $$ select public.register_device_push_token('ExponentPushToken[aaa]', 'android') $$,
  'an approved parent registers a token'
);
select is((select count(*)::int from public.device_push_tokens), 1, 'the owner sees their row');
select last_seen_at as seen_first from public.device_push_tokens \gset
select public.register_device_push_token('ExponentPushToken[aaa]', 'android');
select is((select count(*)::int from public.device_push_tokens), 1, 'registering again keeps one row');
select ok(
  (select last_seen_at from public.device_push_tokens) > :'seen_first'::timestamptz,
  'registering again refreshes last_seen_at'
);
select throws_ok(
  $$ select public.register_device_push_token('not-a-token', 'android') $$,
  '23514', null, 'a value that is not an Expo push token is refused'
);
select throws_ok(
  $$ select public.register_device_push_token('ExponentPushToken[ios]', 'ios') $$,
  '23514', null, 'a platform other than android is refused'
);
select lives_ok(
  $$ select public.register_device_push_token('ExpoPushToken[short-form_1]', 'android') $$,
  'the ExpoPushToken form is accepted'
);
select public.unregister_device_push_token('ExpoPushToken[short-form_1]');

-- Many phones: only the newest 10 are kept
select public.register_device_push_token('ExponentPushToken[many-' || i || ']', 'android')
from generate_series(1, 12) as i;
select is((select count(*)::int from public.device_push_tokens), 10, 'a member keeps at most 10 tokens');
select is((select count(*)::int from public.device_push_tokens where token = 'ExponentPushToken[aaa]'), 0,
  'the oldest token is the one dropped');
select tests.clear_auth();

set local role service_role;
select results_eq(
  format(
    $$ select token from public.device_push_tokens_for(array[%L::uuid, %L::uuid]) order by token $$,
    :'pa', :'pb'
  ),
  $$ select 'ExponentPushToken[many-' || i || ']' from generate_series(3, 12) as i order by 1 $$,
  'device_push_tokens_for returns exactly the recipients'' 10 tokens'
);
reset role;

-- Another account on the same phone takes the token over
select tests.authenticate_as(:'c1'::uuid);
select is((select count(*)::int from public.device_push_tokens), 0, 'the child cannot see the parent''s tokens');
select public.register_device_push_token('ExponentPushToken[many-12]', 'android');
select is((select count(*)::int from public.device_push_tokens where token = 'ExponentPushToken[many-12]'), 1,
  'the child now owns the token');
select tests.authenticate_as(:'pa'::uuid);
select is((select count(*)::int from public.device_push_tokens where token = 'ExponentPushToken[many-12]'), 0,
  'a token moves to the account that registers it');
select is((select count(*)::int from public.device_push_tokens where profile_id = :'c1'::uuid), 0,
  'a parent cannot read the child''s tokens');
select throws_ok(
  $$ insert into public.device_push_tokens (profile_id, token, platform)
     values (auth.uid(), 'ExponentPushToken[direct]', 'android') $$,
  '42501', null, 'no direct writes to device_push_tokens'
);

-- Unregister only your own
select is(public.unregister_device_push_token('ExponentPushToken[many-12]'), false,
  'unregistering someone else''s token does nothing');
select tests.clear_auth();
select is((select profile_id from public.device_push_tokens where token = 'ExponentPushToken[many-12]'), :'c1'::uuid,
  'the child''s token is still there');
select tests.authenticate_as(:'c1'::uuid);
select is(public.unregister_device_push_token('ExponentPushToken[many-12]'), true, 'the owner unregisters');
select tests.clear_auth();

-- Grants
select ok(not has_function_privilege('anon', 'public.register_device_push_token(text, text)', 'execute'),
  'anon cannot register a token');
select ok(not has_function_privilege('authenticated', 'public.device_push_tokens_for(uuid[])', 'execute'),
  'a signed-in user cannot list tokens for recipients');
select ok(not has_table_privilege('authenticated', 'public.device_push_tickets', 'select'),
  'a signed-in user cannot read tickets');

-- Tickets go with their token
select id as tok from public.device_push_tokens where token = 'ExponentPushToken[many-11]' \gset
insert into public.device_push_tickets (id, token_id) values ('ticket-1', :'tok'::uuid);
select is((select count(*)::int from public.device_push_tickets), 1, 'a ticket is stored for its token');
delete from public.device_push_tokens where id = :'tok'::uuid;
select is((select count(*)::int from public.device_push_tickets), 0, 'deleting a token deletes its tickets');

select * from finish();
rollback;
