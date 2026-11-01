begin;
\ir _helpers.psql
select plan(28);

-- Web push (FR16): subscriptions are the signed-in member's, one per browser endpoint; the
-- dispatcher claims each notice once with what its text needs.

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
select has_table('public', 'push_subscriptions', 'push_subscriptions exists');
select has_column('public', 'notifications', 'pushed_at', 'notifications.pushed_at exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.push_subscriptions'::regclass),
  'RLS is on for push_subscriptions'
);
select policies_are('public', 'push_subscriptions', array['Push subscriptions are the owner''s'],
  'only a select policy: writes go through functions');

-- Subscribe as a member
select tests.authenticate_as(:'pa'::uuid);
select lives_ok(
  $$ select public.push_subscribe('https://push.example.test/dev-a', 'p256dh-a', 'auth-a', 'Chrome on Android') $$,
  'an approved parent subscribes'
);
select is((select count(*)::int from public.push_subscriptions), 1, 'the owner sees their row');
select is((select user_agent from public.push_subscriptions), 'Chrome on Android', 'the agent family is kept');
select lives_ok(
  $$ select public.push_subscribe('https://push.example.test/dev-a', 'p256dh-a2', 'auth-a2') $$,
  'subscribing the same endpoint again refreshes it'
);
select is((select p256dh from public.push_subscriptions), 'p256dh-a2', 'the keys are the newest');
select is((select count(*)::int from public.push_subscriptions), 1, 'still one row for the endpoint');
select throws_ok(
  $$ select public.push_subscribe('https://push.example.test/dev-long', repeat('x', 201), 'auth') $$,
  '23514', null, 'a key over 200 characters is refused'
);
select throws_ok(
  $$ select public.push_subscribe('http://push.example.test/plain', 'p', 'a') $$,
  '23514', null, 'a non-https endpoint is refused'
);
-- Many devices: only the newest 10 are kept
select public.push_subscribe('https://push.example.test/many-' || i, 'p', 'a') from generate_series(1, 12) as i;
select is((select count(*)::int from public.push_subscriptions), 10, 'a member keeps at most 10 subscriptions');
select is((select count(*)::int from public.push_subscriptions where endpoint = 'https://push.example.test/dev-a'), 0,
  'the oldest subscriptions are the ones dropped');
select public.push_subscribe('https://push.example.test/dev-a', 'p256dh-a2', 'auth-a2');

-- Another account on the same device takes the endpoint over
select tests.authenticate_as(:'c1'::uuid);
select is((select count(*)::int from public.push_subscriptions), 0, 'the child cannot see the parent''s subscription');
select public.push_subscribe('https://push.example.test/dev-a', 'p256dh-c', 'auth-c');
select is((select count(*)::int from public.push_subscriptions), 1, 'the child now owns the endpoint');
select tests.clear_auth();
select is((select count(*)::int from public.push_subscriptions where endpoint = 'https://push.example.test/dev-a'), 1,
  'one row per endpoint across accounts');
select is((select profile_id from public.push_subscriptions where endpoint = 'https://push.example.test/dev-a'), :'c1'::uuid,
  'the endpoint belongs to the latest subscriber');

-- Not a member, not signed in
select tests.authenticate_as(:'nobody'::uuid);
select throws_ok(
  $$ select public.push_subscribe('https://push.example.test/dev-n', 'p', 'a') $$,
  '42501', null, 'a user in no family cannot subscribe'
);
select tests.clear_auth();

-- Unsubscribe only your own
select tests.authenticate_as(:'pa'::uuid);
select is(public.push_unsubscribe('https://push.example.test/dev-a'), false, 'unsubscribing someone else''s endpoint does nothing');
select tests.authenticate_as(:'c1'::uuid);
select is(public.push_unsubscribe('https://push.example.test/dev-a'), true, 'the owner unsubscribes');
select tests.clear_auth();

-- The dispatcher: claim once, with role, currency and nickname
select tests.authenticate_as(:'pa'::uuid);
select public.push_subscribe('https://push.example.test/dev-pa', 'p', 'a');
select tests.clear_auth();
select gen_random_uuid() as src \gset
select public.notify_parents(:'c1'::uuid, 'withdrawal_requested', 'request', :'src'::uuid, null, '{"amount_minor": 500}'::jsonb);
select public.notify_child(:'c1'::uuid, 'withdrawal_decided', 'request', :'src'::uuid, null, '{}'::jsonb);
-- An old notice is left in the inbox without a late ping.
insert into public.notifications (family_id, recipient_id, child_id, kind, source_type, source_id, created_at)
values (:'fa'::uuid, :'pa'::uuid, :'c1'::uuid, 'allowance_due', 'allowance_occurrence', :'src'::uuid, now() - interval '2 days');
-- A parent removed since their notice was written gets no push.
select public.notify_parents(:'c1'::uuid, 'limit_exceeded', 'ledger_entry', :'src'::uuid, 'w-pb', '{}'::jsonb);
delete from public.notifications where recipient_id = :'pa'::uuid and kind = 'limit_exceeded';
update public.family_members set status = 'removed' where profile_id = :'pb'::uuid;

select results_eq(
  $$ select recipient_role, currency, child_name, kind from public.claim_unpushed_notifications(10) order by recipient_role, kind $$,
  $$ values ('child', 'GBP', 'Sam', 'withdrawal_decided'), ('parent', 'GBP', 'Sam', 'withdrawal_requested') $$,
  'claims the last day''s notices of approved members with role, currency and nickname'
);
select is((select count(*)::int from public.notifications where pushed_at is null), 3, 'the old notice and the removed parent''s two stay unclaimed');
select is((select count(*)::int from public.claim_unpushed_notifications(10)), 0, 'a second claim finds nothing');
select is((select count(distinct profile_id)::int from public.push_subscriptions_for(array[:'pa'::uuid, :'pb'::uuid])), 1,
  'push_subscriptions_for returns the subscribed recipients only');
select is((select distinct profile_id from public.push_subscriptions_for(array[:'pa'::uuid, :'pb'::uuid])), :'pa'::uuid,
  'push_subscriptions_for names the subscriber');

-- Server-only functions
select tests.authenticate_as(:'pa'::uuid);
select throws_ok(
  $$ select * from public.claim_unpushed_notifications(10) $$,
  '42501', null, 'a signed-in user cannot claim notices'
);
select throws_ok(
  $$ select * from public.push_subscriptions_for(array[gen_random_uuid()]) $$,
  '42501', null, 'a signed-in user cannot read others'' subscriptions'
);
select tests.clear_auth();

select * from finish();
rollback;
