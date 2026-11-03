begin;
\ir _helpers.psql
select plan(12);

-- (1) A child's own password change (GoTrue updateUser writes encrypted_password) is replaced
-- with a hash the chosen password doesn't match.
select tests.create_user('kid@child.jarso.invalid', 'child') as kid \gset
update auth.users
set encrypted_password = extensions.crypt('known-pass', extensions.gen_salt('bf'))
where id = :'kid'::uuid;
select ok(
  (select encrypted_password is not null
      and extensions.crypt('known-pass', encrypted_password) <> encrypted_password
   from auth.users where id = :'kid'::uuid),
  'a child password the child chose never matches the stored hash'
);

-- (2) A parent's password change is untouched.
select tests.create_user('pa@example.com') as pa \gset
update auth.users
set encrypted_password = extensions.crypt('parent-pass', extensions.gen_salt('bf'))
where id = :'pa'::uuid;
select ok(
  (select extensions.crypt('parent-pass', encrypted_password) = encrypted_password
   from auth.users where id = :'pa'::uuid),
  'a parent password is stored as set'
);

-- (3) GoTrue's admin createUser: insert without app metadata, then write jarso_role in a later
-- UPDATE. The role write alone leaves the hash alone; a later password change is replaced.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated',
        'new@child.jarso.invalid', extensions.crypt('initial-pass', extensions.gen_salt('bf')),
        '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now());
select encrypted_password as initial_hash from auth.users where id = '33333333-3333-4333-8333-333333333333' \gset
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"jarso_role":"child"}'::jsonb
where id = '33333333-3333-4333-8333-333333333333';
select is(
  (select encrypted_password from auth.users where id = '33333333-3333-4333-8333-333333333333'),
  :'initial_hash',
  'writing the child role alone leaves the password hash unchanged'
);
update auth.users
set encrypted_password = extensions.crypt('later-pass', extensions.gen_salt('bf'))
where id = '33333333-3333-4333-8333-333333333333';
select ok(
  (select extensions.crypt('later-pass', encrypted_password) <> encrypted_password
   from auth.users where id = '33333333-3333-4333-8333-333333333333'),
  'a password set after the child role arrives is replaced'
);

-- (4) Password and child role in one statement: still replaced.
select tests.create_user('both@example.com') as both_user \gset
update auth.users
set encrypted_password = extensions.crypt('both-pass', extensions.gen_salt('bf')),
    raw_app_meta_data = raw_app_meta_data || '{"jarso_role":"child"}'::jsonb
where id = :'both_user'::uuid;
select ok(
  (select extensions.crypt('both-pass', encrypted_password) <> encrypted_password
   from auth.users where id = :'both_user'::uuid),
  'a password written together with the child role is replaced'
);

-- (4b) A write that names encrypted_password without changing it (GoTrue-style full-row update)
-- leaves the hash alone: the `is distinct from` guard keeps the trigger from firing.
select encrypted_password as same_before from auth.users where id = :'kid'::uuid \gset
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"provider":"email"}'::jsonb,
    encrypted_password = encrypted_password
where id = :'kid'::uuid;
select is(
  (select encrypted_password from auth.users where id = :'kid'::uuid),
  :'same_before',
  'an unchanged password hash in the SET list is left alone'
);

-- (5) Wiring and privileges.
select has_trigger('auth', 'users', 'on_auth_child_password_changed', 'the guard trigger is on auth.users');
select ok(
  not has_function_privilege('anon', 'public.scramble_child_password()', 'execute'),
  'anon cannot execute scramble_child_password'
);
select ok(
  not has_function_privilege('authenticated', 'public.scramble_child_password()', 'execute'),
  'authenticated cannot execute scramble_child_password'
);

-- (6) The migration's backfill (same statement) is safe to run again: each run leaves another
-- unknown hash for children and never touches a parent.
select encrypted_password as kid_before from auth.users where id = :'kid'::uuid \gset
update auth.users
set encrypted_password = extensions.crypt(
  gen_random_uuid()::text || gen_random_uuid()::text,
  extensions.gen_salt('bf')
)
where raw_app_meta_data ->> 'jarso_role' = 'child';
select encrypted_password as kid_first from auth.users where id = :'kid'::uuid \gset
update auth.users
set encrypted_password = extensions.crypt(
  gen_random_uuid()::text || gen_random_uuid()::text,
  extensions.gen_salt('bf')
)
where raw_app_meta_data ->> 'jarso_role' = 'child';
select ok(
  :'kid_first' <> :'kid_before'
    and (select encrypted_password from auth.users where id = :'kid'::uuid) <> :'kid_first',
  'each backfill run re-randomises a child password'
);
select ok(
  (select extensions.crypt('known-pass', encrypted_password) <> encrypted_password
   from auth.users where id = :'kid'::uuid),
  'after the backfill the child password still matches nothing known'
);
select ok(
  (select extensions.crypt('parent-pass', encrypted_password) = encrypted_password
   from auth.users where id = :'pa'::uuid),
  'the backfill leaves parent passwords alone'
);

select * from finish();
rollback;
