begin;
\ir _helpers.psql
select plan(44);

-- Fixtures: PA owns family A, PB owns family B; C, C2, C3 are child-role users; PX is a parent with no family.
select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('px@example.com') as px \gset
select tests.create_user('c@example.com', 'child') as c \gset
select tests.create_user('c2@example.com', 'child') as c2 \gset
select tests.create_user('c3@example.com', 'child') as c3 \gset

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
  format('update public.child_credentials set failed_attempts = 0 where profile_id = %L', :'c'),
  '42501', null, 'parent cannot write child_credentials');
select tests.authenticate_as(:'c'::uuid);
select is((select count(*)::int from public.child_credentials), 0, 'child cannot read child_credentials');

-- verify_child_pin is service_role only.
select throws_ok(
  format('select * from public.verify_child_pin(%L, %L, %L)', 'x', 'sam', '1234'),
  '42501', null, 'authenticated cannot execute verify_child_pin');
select throws_ok($$ select public.hit_rate_limit('k', '1 minute', 2) $$, '42501', null,
  'authenticated cannot execute hit_rate_limit');

reset role; -- service_role cannot use schema tests
select tests.clear_auth();
select code as code_a from public.families where id = :'fa'::uuid \gset
select code as code_b from public.families where id = :'fb'::uuid \gset
set local role service_role;

-- verify_child_pin happy path with normalised inputs.
select results_eq(
  format('select child_id, status from public.verify_child_pin(%L, %L, %L)',
         lower(substr(:'code_a', 1, 3)) || '-' || lower(substr(:'code_a', 4)) || ' ', '  SAM ', '1234'),
  format('values (%L::uuid, %L::text)', :'c', 'ok'),
  'correct PIN with lower-case, hyphenated code and upper-case nickname → ok');
select results_eq(
  format('select child_id, status from public.verify_child_pin(%L, %L, %L)', :'code_b', 'sam', '5555'),
  format('values (%L::uuid, %L::text)', :'c3', 'ok'),
  'same nickname resolves per family');

-- Unknown family / nickname.
select results_eq(
  format('select child_id, status from public.verify_child_pin(%L, %L, %L)', 'ZZZZZZ', 'sam', '1234'),
  $$ values (null::uuid, 'invalid'::text) $$, 'unknown family → invalid');
select results_eq(
  format('select child_id, status from public.verify_child_pin(%L, %L, %L)', :'code_a', 'nobody', '1234'),
  $$ values (null::uuid, 'invalid'::text) $$, 'unknown nickname → invalid');
select results_eq(
  format('select child_id, status from public.verify_child_pin(%L, %L, %L)', :'code_b', 'sam', '1234'),
  $$ values (null::uuid, 'invalid'::text) $$, 'PIN from another family''s child → invalid');

-- Four wrong PINs: invalid, counter persists (no exception rolls it back).
select results_eq(
  format('select child_id, status from public.verify_child_pin(%L, %L, %L)', :'code_a', 'sam', '0000'),
  $$ values (null::uuid, 'invalid'::text) $$, 'wrong PIN → invalid');
select public.verify_child_pin(:'code_a', 'sam', '0000');
select public.verify_child_pin(:'code_a', 'sam', '0000');
select public.verify_child_pin(:'code_a', 'sam', '0000');
select is(
  (select failed_attempts || '/' || coalesce(locked_until::text, 'none') from public.child_credentials where profile_id = :'c'::uuid),
  '4/none', 'four failures recorded, not locked');

-- Fifth wrong PIN locks.
select results_eq(
  format('select child_id, status from public.verify_child_pin(%L, %L, %L)', :'code_a', 'sam', '0000'),
  $$ values (null::uuid, 'invalid'::text) $$, 'fifth wrong PIN → invalid');
select ok(
  (select locked_until > now() + interval '14 minutes' and failed_attempts = 0
   from public.child_credentials where profile_id = :'c'::uuid),
  'fifth failure locks for 15 minutes and restarts the count');
select results_eq(
  format('select child_id, status from public.verify_child_pin(%L, %L, %L)', :'code_a', 'sam', '1234'),
  $$ values (null::uuid, 'locked'::text) $$, 'correct PIN while locked → locked');

-- Lock expiry: a correct PIN works again and resets counters.
reset role; -- service_role cannot use schema tests
select tests.clear_auth();
update public.child_credentials
set locked_until = now() - interval '1 second', failed_attempts = 3
where profile_id = :'c'::uuid;
set local role service_role;
select results_eq(
  format('select child_id, status from public.verify_child_pin(%L, %L, %L)', :'code_a', 'sam', '1234'),
  format('values (%L::uuid, %L::text)', :'c', 'ok'),
  'correct PIN after lock expiry → ok');
select is(
  (select failed_attempts || '/' || coalesce(locked_until::text, 'none') from public.child_credentials where profile_id = :'c'::uuid),
  '0/none', 'success resets counters');

-- Lock again, then parent resets the PIN.
select public.verify_child_pin(:'code_a', 'sam', '0000') from generate_series(1, 5);
select ok(
  (select locked_until > now() from public.child_credentials where profile_id = :'c'::uuid),
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
  format('select child_id, status from public.verify_child_pin(%L, %L, %L)', :'code_a', 'sam', '9876'),
  format('values (%L::uuid, %L::text)', :'c', 'ok'),
  'reset clears the lock; new PIN works');

-- Removed members cannot sign in.
reset role; -- service_role cannot use schema tests
select tests.clear_auth();
update public.family_members set status = 'removed' where profile_id = :'c'::uuid;
set local role service_role;
select results_eq(
  format('select child_id, status from public.verify_child_pin(%L, %L, %L)', :'code_a', 'sam', '9876'),
  $$ values (null::uuid, 'invalid'::text) $$, 'removed child → invalid');

-- hit_rate_limit: allow two per window, then refuse.
select results_eq(
  $$ select public.hit_rate_limit('k', '1 minute', 2) from generate_series(1, 3) $$,
  $$ values (true), (true), (false) $$,
  'hit_rate_limit allows max hits per window');

select * from finish();
rollback;
