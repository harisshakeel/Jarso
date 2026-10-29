begin;
\ir _helpers.psql
select plan(4);

-- GoTrue's admin createUser inserts the user, then writes app_metadata in a later UPDATE.
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated',
        'late@child.jarso.invalid', '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now());
select is((select role from public.profiles where id = '22222222-2222-4222-8222-222222222222'),
          'parent', 'before app metadata arrives the profile is a parent');

update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"jarso_role":"child"}'::jsonb
where id = '22222222-2222-4222-8222-222222222222';
select is((select role from public.profiles where id = '22222222-2222-4222-8222-222222222222'),
          'child', 'app metadata written after insert makes the profile a child');

-- User metadata is client-controlled and must never set the role.
select tests.create_user('spoof@example.com') as spoof \gset
update auth.users set raw_user_meta_data = '{"jarso_role":"child"}'::jsonb where id = :'spoof'::uuid;
select is((select role from public.profiles where id = :'spoof'::uuid), 'parent', 'user metadata cannot set role');

-- A parent already in a family is never turned into a child.
select tests.create_user('pa@example.com') as pa \gset
select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'UTC');
select tests.clear_auth();
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"jarso_role":"child"}'::jsonb
where id = :'pa'::uuid;
select is((select role from public.profiles where id = :'pa'::uuid), 'parent', 'a family member keeps their role');

select * from finish();
rollback;
