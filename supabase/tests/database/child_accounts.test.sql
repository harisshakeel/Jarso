begin;
\ir _helpers.psql
select plan(79);

-- Fixtures: PA owns family A, PB owns family B; C, C2, C3, C4 are child-role users; PX is a parent with no family.
select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('px@example.com') as px \gset
select tests.create_user('c@example.com', 'child') as c \gset
select tests.create_user('c2@example.com', 'child') as c2 \gset
select tests.create_user('c3@example.com', 'child') as c3 \gset
select tests.create_user('c4@example.com', 'child') as c4 \gset

select tests.authenticate_as(:'pb'::uuid);
select public.create_family('EUR', 'UTC') as fb \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'Europe/London') as fa \gset

-- register_child happy path.
select lives_ok(
  format('select public.register_child(%L, %L, %L, %L, true)', :'c', :'fa', '  Sam ', '1234'),
  'parent registers a child');
select is(
  (select role || '/' || status || '/' || consent_by::text || '/' || approved_by::text || '/' || nickname_key
   from public.family_members where profile_id = :'c'::uuid),
  'child/approved/' || :'pa' || '/' || :'pa' || '/sam',
  'child membership approved with consent by PA');
select ok(
  (select consent_at is not null and approved_at is not null from public.family_members where profile_id = :'c'::uuid),
  'consent_at and approved_at set');
select is((select nickname from public.profiles where id = :'c'::uuid), 'Sam', 'profile nickname trimmed');
select is(
  (select count(*)::int from public.audit_log
   where family_id = :'fa'::uuid and action = 'child.added' and subject_id = :'c'::uuid and actor_id = :'pa'::uuid),
  1, 'child.added audited');
select is(
  (select count(*)::int from public.audit_log where details::text like '%1234%'),
  0, 'PIN never written to the audit log');

-- register_child rejections.
select throws_ok(
  format('select public.register_child(%L, %L, %L, %L, true)', :'c2', :'fa', ' sam ', '1234'),
  'JA409', null, 'nickname unique in family, case and space insensitive');
select throws_ok(
  format('select public.register_child(%L, %L, %L, %L, false)', :'c2', :'fa', 'Alex', '1234'),
  'JA403', null, 'consent required');
select throws_ok(
  format('select public.register_child(%L, %L, %L, %L, true)', :'c2', :'fa', 'Alex', '12a4'),
  '22023', null, 'non-digit PIN rejected');
select throws_ok(
  format('select public.register_child(%L, %L, %L, %L, true)', :'c2', :'fa', 'Alex', '123'),
  '22023', null, 'short PIN rejected');
select throws_ok(
  format('select public.register_child(%L, %L, %L, %L, true)', :'c2', :'fa', 'Alex', '1234567'),
  '22023', null, 'long PIN rejected');
select throws_ok(
  format('select public.register_child(%L, %L, %L, %L, true)', :'c2', :'fa', '   ', '1234'),
  '22023', null, 'blank nickname rejected');
select throws_ok(
  format('select public.register_child(%L, %L, %L, %L, true)', :'c2', :'fa', repeat('a', 21), '1234'),
  '22023', null, 'nickname over 20 chars rejected');
select throws_ok(
  format('select public.register_child(%L, %L, %L, %L, true)', :'c', :'fa', 'Other', '1234'),
  'JA409', null, 'child already in a family');
select throws_ok(
  format('select public.register_child(%L, %L, %L, %L, true)', :'px', :'fa', 'Px', '1234'),
  'JA409', null, 'parent profile cannot be registered as a child');

select tests.authenticate_as(:'pb'::uuid);
select throws_ok(
  format('select public.register_child(%L, %L, %L, %L, true)', :'c2', :'fa', 'Alex', '1234'),
  'JA403', null, 'parent of another family cannot register into A');

select tests.authenticate_as(:'c'::uuid);
select throws_ok(
  format('select public.register_child(%L, %L, %L, %L, true)', :'c2', :'fa', 'Alex', '1234'),
  'JA403', null, 'child cannot register a child');

-- Same nickname is fine in another family.
select tests.authenticate_as(:'pb'::uuid);
select lives_ok(
  format('select public.register_child(%L, %L, %L, %L, true)', :'c3', :'fb', 'Sam', '5555'),
  'same nickname allowed in another family');

-- Credentials are hidden from clients.
select tests.authenticate_as(:'pa'::uuid);
select is((select count(*)::int from public.child_credentials), 0, 'parent cannot read child_credentials');
select is((select count(*)::int from public.usage_counters), 0, 'parent cannot read usage_counters');
select throws_ok(
  format('update public.child_credentials set recent_failures = 0 where profile_id = %L', :'c'),
  '42501', null, 'parent cannot write child_credentials');
select tests.authenticate_as(:'c'::uuid);
select is((select count(*)::int from public.child_credentials), 0, 'child cannot read child_credentials');

-- verify_child_pin is service_role only.
select throws_ok(
  format('select * from public.verify_child_pin(%L, %L, %L, ''src-1'')', 'x', 'sam', '1234'),
  '42501', null, 'authenticated cannot execute verify_child_pin (early check)');
select throws_ok($$ select public.hit_rate_limit('k', '1 minute', 2) $$, '42501', null,
  'authenticated cannot execute hit_rate_limit');

reset role; -- service_role cannot use schema tests
select tests.clear_auth();
select code as code_a from public.families where id = :'fa'::uuid \gset
select code as code_b from public.families where id = :'fb'::uuid \gset
set local role service_role;

-- verify_child_pin happy path with normalised inputs.
select results_eq(
  format('select child_id, status from public.verify_child_pin(%L, %L, %L, ''src-1'')',
         lower(substr(:'code_a', 1, 3)) || '-' || lower(substr(:'code_a', 4)) || ' ', '  SAM ', '1234'),
  format('values (%L::uuid, %L::text)', :'c', 'ok'),
  'correct PIN with lower-case, hyphenated code and upper-case nickname → ok');
select results_eq(
  format('select child_id, status from public.verify_child_pin(%L, %L, %L, ''src-1'')', :'code_b', 'sam', '5555'),
  format('values (%L::uuid, %L::text)', :'c3', 'ok'),
  'same nickname resolves per family');

-- Unknown family / nickname.
select results_eq(
  format('select child_id, status from public.verify_child_pin(%L, %L, %L, ''src-1'')', 'ZZZZZZ', 'sam', '1234'),
  $$ values (null::uuid, 'invalid'::text) $$, 'unknown family → invalid');
select results_eq(
  format('select child_id, status from public.verify_child_pin(%L, %L, %L, ''src-1'')', :'code_a', 'nobody', '1234'),
  $$ values (null::uuid, 'invalid'::text) $$, 'unknown nickname → invalid');
select results_eq(
  format('select child_id, status from public.verify_child_pin(%L, %L, %L, ''src-1'')', :'code_b', 'sam', '1234'),
  $$ values (null::uuid, 'invalid'::text) $$, 'PIN from another family''s child → invalid');

-- Four wrong PINs: invalid, counter persists (no exception rolls it back).
select results_eq(
  format('select child_id, status from public.verify_child_pin(%L, %L, %L, ''src-1'')', :'code_a', 'sam', '0000'),
  $$ values (null::uuid, 'invalid'::text) $$, 'wrong PIN → invalid');
select public.verify_child_pin(:'code_a', 'sam', '0000', 'src-1');
select public.verify_child_pin(:'code_a', 'sam', '0000', 'src-1');
select public.verify_child_pin(:'code_a', 'sam', '0000', 'src-1');
select is(
  (select failed_attempts || '/' || coalesce(locked_until::text, 'none') from public.child_pin_attempts where child_id = :'c'::uuid and source_hash = 'src-1'),
  '4/none', 'four failures recorded for the source, not locked');

-- Fifth wrong PIN locks.
select results_eq(
  format('select child_id, status from public.verify_child_pin(%L, %L, %L, ''src-1'')', :'code_a', 'sam', '0000'),
  $$ values (null::uuid, 'invalid'::text) $$, 'fifth wrong PIN → invalid');
select ok(
  (select locked_until > now() + interval '14 minutes' and failed_attempts = 0
   from public.child_pin_attempts where child_id = :'c'::uuid and source_hash = 'src-1'),
  'fifth failure locks the source for 15 minutes and restarts the count');
select results_eq(
  format('select child_id, status from public.verify_child_pin(%L, %L, %L, ''src-1'')', :'code_a', 'sam', '1234'),
  $$ values (null::uuid, 'locked'::text) $$, 'correct PIN while locked → locked');

-- Lock expiry: a correct PIN works again and resets counters.
reset role; -- service_role cannot use schema tests
select tests.clear_auth();
update public.child_pin_attempts
set locked_until = now() - interval '1 second', failed_attempts = 3
where child_id = :'c'::uuid;
set local role service_role;
select results_eq(
  format('select child_id, status from public.verify_child_pin(%L, %L, %L, ''src-1'')', :'code_a', 'sam', '1234'),
  format('values (%L::uuid, %L::text)', :'c', 'ok'),
  'correct PIN after lock expiry → ok');
select is(
  (select count(*)::int from public.child_pin_attempts where child_id = :'c'::uuid and source_hash = 'src-1'),
  0, 'success clears the source''s lock state');

-- Lock again, then parent resets the PIN.
select public.verify_child_pin(:'code_a', 'sam', '0000', 'src-1') from generate_series(1, 5);
select ok(
  (select locked_until > now() from public.child_pin_attempts where child_id = :'c'::uuid and source_hash = 'src-1'),
  'locked again before the reset');
reset role;
select tests.authenticate_as(:'pa'::uuid);
select lives_ok(format('select public.set_child_pin(%L, %L)', :'c', '9876'), 'parent resets PIN');
select throws_ok(format('select public.set_child_pin(%L, %L)', :'c', '98'), '22023', null, 'set_child_pin validates PIN');
select is(
  (select count(*)::int from public.audit_log where action = 'child.pin_reset' and subject_id = :'c'::uuid),
  1, 'child.pin_reset audited');

select tests.authenticate_as(:'pb'::uuid);
select throws_ok(format('select public.set_child_pin(%L, %L)', :'c', '1111'), 'JA403', null, 'other parent cannot reset PIN');

reset role; -- service_role cannot use schema tests
select tests.clear_auth();
set local role service_role;
select results_eq(
  format('select child_id, status from public.verify_child_pin(%L, %L, %L, ''src-1'')', :'code_a', 'sam', '9876'),
  format('values (%L::uuid, %L::text)', :'c', 'ok'),
  'reset clears the lock; new PIN works');

-- Removed members cannot sign in.
reset role; -- service_role cannot use schema tests
select tests.clear_auth();
update public.family_members set status = 'removed' where profile_id = :'c'::uuid;
set local role service_role;
select results_eq(
  format('select child_id, status from public.verify_child_pin(%L, %L, %L, ''src-1'')', :'code_a', 'sam', '9876'),
  $$ values (null::uuid, 'invalid'::text) $$, 'removed child → invalid');

-- hit_rate_limit: allow two per window, then refuse.
select results_eq(
  $$ select public.hit_rate_limit('k', '1 minute', 2) from generate_series(1, 3) $$,
  $$ values (true), (true), (false) $$,
  'hit_rate_limit allows max hits per window');

-- ---------------------------------------------------------------------------
-- Hardening: escalating lockout per (child, source) (C3 in family B, PIN 5555)
-- ---------------------------------------------------------------------------

select public.verify_child_pin(:'code_b', 'sam', '0000', 'src-1') from generate_series(1, 5);
select is(
  (select lock_count || '/' || failed_attempts || '/' || (locked_until = now() + interval '15 minutes')::text
   from public.child_pin_attempts where child_id = :'c3'::uuid and source_hash = 'src-1'),
  '1/0/true', 'first lock: 15 minutes, lock_count 1');
select results_eq(
  format('select child_id, status from public.verify_child_pin(%L, %L, %L, ''src-1'')', :'code_b', 'sam', '0000'),
  $$ values (null::uuid, 'locked'::text) $$, 'attempts while locked do not count');
select results_eq(
  format('select child_id, status from public.verify_child_pin(%L, %L, %L, ''src-2'')', :'code_b', 'sam', '5555'),
  format('values (%L::uuid, %L::text)', :'c3', 'ok'),
  'a lock on one source does not lock the child on another source');
select results_eq(
  format('select child_id, status from public.verify_child_pin(%L, %L, %L, ''src-1'')', :'code_b', 'sam', '5555'),
  $$ values (null::uuid, 'locked'::text) $$, 'a success elsewhere does not unlock the locked source');

reset role; -- service_role cannot use schema tests
select tests.clear_auth();
select is(
  (select count(*)::int from public.audit_log
   where action = 'child.locked' and subject_id = :'c3'::uuid and actor_id is null
     and details ->> 'scope' = 'source' and family_id = :'fb'::uuid),
  1, 'lock start audited as child.locked');
select is(
  (select count(*)::int from public.audit_log
   where action = 'child.locked' and (details::text like '%src-%' or details::text like '%0000%' or details ? 'ip')),
  0, 'child.locked never records the source or the PIN');
update public.child_pin_attempts set locked_until = now() - interval '1 second' where child_id = :'c3'::uuid;
set local role service_role;
select public.verify_child_pin(:'code_b', 'sam', '0000', 'src-1') from generate_series(1, 4);
select is(
  (select lock_count || '/' || failed_attempts || '/' || (locked_until < now())::text
   from public.child_pin_attempts where child_id = :'c3'::uuid and source_hash = 'src-1'),
  '1/4/true', 'lock expiry keeps lock_count; four new failures not yet locked');
select public.verify_child_pin(:'code_b', 'sam', '0000', 'src-1');
select is(
  (select lock_count || '/' || failed_attempts || '/' || (locked_until = now() + interval '30 minutes')::text
   from public.child_pin_attempts where child_id = :'c3'::uuid and source_hash = 'src-1'),
  '2/0/true', 'second lock: 30 minutes, lock_count 2');

reset role; -- service_role cannot use schema tests
select tests.clear_auth();
update public.child_pin_attempts set locked_until = now() - interval '1 second' where child_id = :'c3'::uuid;
set local role service_role;
select public.verify_child_pin(:'code_b', 'sam', '0000', 'src-1') from generate_series(1, 5);
select is(
  (select lock_count || '/' || (locked_until = now() + interval '60 minutes')::text
   from public.child_pin_attempts where child_id = :'c3'::uuid and source_hash = 'src-1'),
  '3/true', 'third lock: 60 minutes');

reset role; -- service_role cannot use schema tests
select tests.clear_auth();
update public.child_pin_attempts set locked_until = now() - interval '1 second', lock_count = 1000
where child_id = :'c3'::uuid;
set local role service_role;
select public.verify_child_pin(:'code_b', 'sam', '0000', 'src-1') from generate_series(1, 5);
select is(
  (select lock_count || '/' || (locked_until = now() + interval '24 hours')::text
   from public.child_pin_attempts where child_id = :'c3'::uuid and source_hash = 'src-1'),
  '1001/true', 'lock duration capped at 24 hours');

reset role; -- service_role cannot use schema tests
select tests.clear_auth();
update public.child_pin_attempts set locked_until = now() - interval '1 second', failed_attempts = 2
where child_id = :'c3'::uuid;
set local role service_role;
select results_eq(
  format('select child_id, status from public.verify_child_pin(%L, %L, %L, ''src-1'')', :'code_b', 'sam', '5555'),
  format('values (%L::uuid, %L::text)', :'c3', 'ok'),
  'correct PIN after expiry → ok');
select is(
  (select count(*)::int from public.child_pin_attempts where child_id = :'c3'::uuid and source_hash = 'src-1'),
  0, 'success resets the source''s lock_count and counters');
select public.verify_child_pin(:'code_b', 'sam', '0000', 'src-1') from generate_series(1, 5);
select ok(
  (select lock_count = 1 and locked_until = now() + interval '15 minutes'
   from public.child_pin_attempts where child_id = :'c3'::uuid and source_hash = 'src-1'),
  'after a success the next lock starts at 15 minutes again');

-- set_child_pin clears every source.
reset role;
select tests.clear_auth();
select tests.authenticate_as(:'pb'::uuid);
select lives_ok(format('select public.set_child_pin(%L, %L)', :'c3', '6666'), 'parent resets locked PIN');
reset role;
select tests.clear_auth();
select is(
  (select count(*)::int from public.child_pin_attempts where child_id = :'c3'::uuid),
  0, 'set_child_pin clears the lock state of every source');

-- ---------------------------------------------------------------------------
-- Hardening: cross-source safety cap (100 wrong PINs in 24 h)
-- ---------------------------------------------------------------------------

update public.child_credentials set recent_failures = 98, recent_failures_since = now() - interval '1 hour'
where profile_id = :'c3'::uuid;
set local role service_role;
select results_eq(
  format('select child_id, status from public.verify_child_pin(%L, %L, %L, ''src-9'')', :'code_b', 'sam', '0000'),
  $$ values (null::uuid, 'invalid'::text) $$, '99th failure in 24 h → invalid');
select results_eq(
  format('select child_id, status from public.verify_child_pin(%L, %L, %L, ''src-10'')', :'code_b', 'sam', '0000'),
  $$ values (null::uuid, 'invalid'::text) $$, '100th failure in 24 h → invalid');
select results_eq(
  format('select child_id, status from public.verify_child_pin(%L, %L, %L, ''src-11'')', :'code_b', 'sam', '6666'),
  $$ values (null::uuid, 'locked'::text) $$, 'after 100 failures the right PIN is refused from any source');
reset role;
select tests.clear_auth();
select is(
  (select count(*)::int from public.audit_log
   where action = 'child.locked' and subject_id = :'c3'::uuid and details ->> 'scope' = 'all'),
  1, 'safety cap audited once as child.locked (scope all)');
select tests.authenticate_as(:'pb'::uuid);
select lives_ok(format('select public.set_child_pin(%L, %L)', :'c3', '7777'), 'parent resets the frozen PIN');
reset role;
select tests.clear_auth();
select is(
  (select recent_failures || '/' || coalesce(recent_failures_since::text, 'none') || '/' || coalesce(frozen_at::text, 'none')
   from public.child_credentials where profile_id = :'c3'::uuid),
  '0/none/none', 'set_child_pin clears the safety cap');
update public.child_credentials set recent_failures = 99, recent_failures_since = now() - interval '25 hours'
where profile_id = :'c3'::uuid;
set local role service_role;
select results_eq(
  format('select child_id, status from public.verify_child_pin(%L, %L, %L, ''src-12'')', :'code_b', 'sam', '0000'),
  $$ values (null::uuid, 'invalid'::text) $$, 'failure after the 24 h window → invalid');
select results_eq(
  format('select child_id, status from public.verify_child_pin(%L, %L, %L, ''src-12'')', :'code_b', 'sam', '7777'),
  format('values (%L::uuid, %L::text)', :'c3', 'ok'),
  'an expired window does not freeze the child; new PIN works');
reset role;
select tests.clear_auth();
select is(
  (select recent_failures from public.child_credentials where profile_id = :'c3'::uuid),
  1, 'an expired window restarts the count');

-- child_pin_attempts is hidden from clients.
select tests.authenticate_as(:'pb'::uuid);
select throws_ok('select count(*) from public.child_pin_attempts', '42501', null, 'parent cannot read child_pin_attempts');
select throws_ok(
  format('delete from public.child_pin_attempts where child_id = %L', :'c3'),
  '42501', null, 'parent cannot write child_pin_attempts');
reset role;
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- revoke_user_sessions
-- ---------------------------------------------------------------------------

insert into auth.sessions (id, user_id, created_at, updated_at)
values ('33333333-3333-4333-8333-333333333333', :'c3'::uuid, now(), now()),
       ('44444444-4444-4444-8444-444444444444', :'pb'::uuid, now(), now());
insert into auth.refresh_tokens (instance_id, token, user_id, revoked, session_id, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'rt-c3', :'c3', false, '33333333-3333-4333-8333-333333333333', now(), now());

select tests.authenticate_as(:'pb'::uuid);
select throws_ok(
  format('select public.revoke_user_sessions(%L)', :'c3'),
  '42501', null, 'authenticated cannot execute revoke_user_sessions');
reset role;
select tests.clear_auth();
set local role service_role;
select is(public.revoke_user_sessions(:'c3'::uuid), 1, 'service_role revokes the user''s sessions');
reset role;
select is(
  (select count(*)::int from auth.sessions where user_id = :'c3'::uuid)
  + (select count(*)::int from auth.refresh_tokens where user_id = :'c3'),
  0, 'sessions and their refresh tokens are gone');
select is(
  (select count(*)::int from auth.sessions where user_id = :'pb'::uuid),
  1, 'other users'' sessions are untouched');

-- ---------------------------------------------------------------------------
-- Hardening: nickname_key iff child
-- ---------------------------------------------------------------------------

select throws_ok(
  format($$ insert into public.family_members (family_id, profile_id, role, consent_at)
            values (%L, %L, 'child', now()) $$, :'fa', :'c4'),
  '23514', null, 'child membership without nickname_key rejected');
select throws_ok(
  format($$ insert into public.family_members (family_id, profile_id, role, nickname_key)
            values (%L, %L, 'parent', 'px') $$, :'fa', :'px'),
  '23514', null, 'parent membership with nickname_key rejected');

-- ---------------------------------------------------------------------------
-- Hardening: register_child overwrites a stale credential row
-- ---------------------------------------------------------------------------

insert into public.child_credentials (profile_id, pin_hash, recent_failures, recent_failures_since, frozen_at, set_by)
values (:'c4'::uuid, 'stale', 100, now(), now(), :'pb'::uuid);
insert into public.child_pin_attempts (child_id, source_hash, failed_attempts, lock_count, locked_until)
values (:'c4'::uuid, 'src-1', 3, 2, now() + interval '1 hour');
select tests.authenticate_as(:'pa'::uuid);
select lives_ok(
  format('select public.register_child(%L, %L, %L, %L, true)', :'c4', :'fa', 'Zed', '4321'),
  'register_child succeeds over a stale credential row');
reset role;
select tests.clear_auth();
select is(
  (select recent_failures || '/' || coalesce(frozen_at::text, 'none') || '/' || set_by::text
          || '/' || (select count(*) from public.child_pin_attempts where child_id = :'c4'::uuid)
   from public.child_credentials where profile_id = :'c4'::uuid),
  '0/none/' || :'pa' || '/0', 'stale credential row and lock state reset and re-owned');
set local role service_role;
select results_eq(
  format('select child_id, status from public.verify_child_pin(%L, %L, %L, ''src-1'')', :'code_a', 'zed', '4321'),
  format('values (%L::uuid, %L::text)', :'c4', 'ok'),
  'new PIN replaces the stale hash');
reset role;

select * from finish();
rollback;
