begin;
\ir _helpers.psql
select plan(6);

-- A child's password never changes once they are a child; a parent's does.

-- As GoTrue's admin createUser does it: the password in the insert, app_metadata in an UPDATE.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated',
        'kid@child.jarso.invalid', extensions.crypt('random-at-creation', extensions.gen_salt('bf', 4)),
        '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now());
select lives_ok(
  $$ update auth.users
     set raw_app_meta_data = raw_app_meta_data || '{"jarso_role":"child"}'::jsonb,
         encrypted_password = encrypted_password,
         email_confirmed_at = now()
     where id = '33333333-3333-4333-8333-333333333333' $$,
  'the app_metadata follow-up update of a new child works');
select is((select role from public.profiles where id = '33333333-3333-4333-8333-333333333333'),
          'child', 'and the profile becomes a child');

select throws_ok(
  $$ update auth.users
     set encrypted_password = extensions.crypt('chosen-by-child', extensions.gen_salt('bf', 4))
     where id = '33333333-3333-4333-8333-333333333333' $$,
  '42501', 'A child account cannot have its password changed',
  'a child''s password cannot be changed');

-- A child made by the helper has no password at all; setting one is refused too.
select tests.create_user('c@example.com', 'child') as c \gset
select throws_ok(
  format($$ update auth.users set encrypted_password = 'x' where id = %L $$, :'c'),
  '42501', null, 'a child with no password cannot get one');

select lives_ok(
  format($$ update auth.users set last_sign_in_at = now() where id = %L $$, :'c'),
  'other updates of a child (sign-in stamps) still work');

select tests.create_user('p@example.com') as p \gset
select lives_ok(
  format($$ update auth.users set encrypted_password = 'x' where id = %L $$, :'p'),
  'a parent can change their password');

select * from finish();
rollback;
