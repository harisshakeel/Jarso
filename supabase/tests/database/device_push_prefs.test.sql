begin;
\ir _helpers.psql
select plan(13);

-- Per-phone notification settings (mobile wave 3): each phone mutes groups of notices or pauses
-- all of them. Only the token's owner changes them; a token that moves to another account
-- starts again from the defaults. The inbox is unchanged.

select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('c1@example.com', 'child') as c1 \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select public.register_device_push_token('ExponentPushToken[pa-phone]', 'android');
select tests.authenticate_as(:'c1'::uuid);
select public.register_device_push_token('ExponentPushToken[c1-phone]', 'android');
select tests.clear_auth();

-- Defaults
select is(
  (select muted_groups from public.device_push_tokens where token = 'ExponentPushToken[pa-phone]'),
  '{}'::text[], 'a new phone mutes nothing'
);
select is(
  (select paused from public.device_push_tokens where token = 'ExponentPushToken[pa-phone]'),
  false, 'a new phone is not paused'
);

-- The owner sets their own phone
select tests.authenticate_as(:'pa'::uuid);
select is(
  public.set_device_push_prefs('ExponentPushToken[pa-phone]', array['money'], true),
  true, 'the owner sets their phone''s settings'
);
select results_eq(
  $$ select muted_groups, paused from public.device_push_tokens where token = 'ExponentPushToken[pa-phone]' $$,
  $$ values (array['money']::text[], true) $$,
  'the settings are stored'
);

-- Someone else's phone
select is(
  public.set_device_push_prefs('ExponentPushToken[c1-phone]', array['requests'], true),
  false, 'setting another member''s phone returns false'
);
select tests.clear_auth();
select results_eq(
  $$ select muted_groups, paused from public.device_push_tokens where token = 'ExponentPushToken[c1-phone]' $$,
  $$ values ('{}'::text[], false) $$,
  'and leaves it unchanged'
);

-- Only known groups
select tests.authenticate_as(:'pa'::uuid);
select throws_ok(
  $$ select public.set_device_push_prefs('ExponentPushToken[pa-phone]', array['unknown'], false) $$,
  '23514', null, 'an unknown group is refused'
);
select throws_ok(
  $$ update public.device_push_tokens set paused = false $$,
  '42501', null, 'no direct writes to the settings'
);
select tests.clear_auth();

-- Grants
select ok(not has_function_privilege('anon', 'public.set_device_push_prefs(text, text[], boolean)', 'execute'),
  'anon cannot set phone settings');
select ok(not has_function_privilege('authenticated', 'public.device_push_tokens_for(uuid[])', 'execute'),
  'a signed-in user cannot list tokens for recipients');

-- The dispatcher reads the settings
set local role service_role;
select results_eq(
  format($$ select token, muted_groups, paused from public.device_push_tokens_for(array[%L::uuid]) $$, :'pa'),
  $$ values ('ExponentPushToken[pa-phone]', array['money']::text[], true) $$,
  'device_push_tokens_for returns each phone''s settings'
);
reset role;

-- A phone that moves to another account starts from the defaults
select tests.authenticate_as(:'c1'::uuid);
select public.register_device_push_token('ExponentPushToken[pa-phone]', 'android');
select tests.clear_auth();
select results_eq(
  $$ select profile_id, muted_groups, paused from public.device_push_tokens where token = 'ExponentPushToken[pa-phone]' $$,
  format($$ values (%L::uuid, '{}'::text[], false) $$, :'c1'),
  'a token re-registered by another account resets its settings'
);

-- Re-registering by the same owner keeps the settings
select tests.authenticate_as(:'c1'::uuid);
select public.set_device_push_prefs('ExponentPushToken[pa-phone]', array['notes'], false);
select public.register_device_push_token('ExponentPushToken[pa-phone]', 'android');
select tests.clear_auth();
select is(
  (select muted_groups from public.device_push_tokens where token = 'ExponentPushToken[pa-phone]'),
  array['notes']::text[], 'the owner re-registering keeps their settings'
);

select * from finish();
rollback;
