begin;
\ir _helpers.psql
select plan(24);

-- Fixtures: PA and PB are parents, C is a child of PA's family.
select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('c@example.com', 'child') as c \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'Europe/London') as fa \gset
select public.register_child(:'c'::uuid, :'fa'::uuid, 'Sam', '1234', true);

-- ---------------------------------------------------------------------------
-- complete_parent_profile: happy path
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select public.complete_parent_profile(date '1985-06-15', 'PK', 'female') $$,
  'parent completes their profile');
select is(
  (select date_of_birth::text || '/' || country || '/' || gender from public.parent_details where profile_id = :'pa'::uuid),
  '1985-06-15/PK/female', 'details stored');
select ok(
  (select completed_at is not null from public.parent_details where profile_id = :'pa'::uuid),
  'completion time recorded');
select is((select count(*)::int from public.parent_details), 1, 'owner sees their own row');

-- Editing keeps the original completion time.
select tests.clear_auth();
update public.parent_details set completed_at = timestamptz '2020-01-01 00:00+00' where profile_id = :'pa'::uuid;
select tests.authenticate_as(:'pa'::uuid);
select lives_ok(
  $$ select public.complete_parent_profile(date '1984-01-02', 'GB', 'prefer_not_to_say') $$,
  'parent edits their details');
select is(
  (select date_of_birth::text || '/' || country || '/' || gender from public.parent_details where profile_id = :'pa'::uuid),
  '1984-01-02/GB/prefer_not_to_say', 'details updated');
select is(
  (select completed_at from public.parent_details where profile_id = :'pa'::uuid),
  timestamptz '2020-01-01 00:00+00', 'first completion time kept');

select lives_ok(
  format('select public.complete_parent_profile(%L::date, %L, %L)',
         (current_date - interval '18 years')::date, 'GB', 'male'),
  'someone who turns 18 today is accepted');

-- ---------------------------------------------------------------------------
-- complete_parent_profile: rules
-- ---------------------------------------------------------------------------

select throws_ok(
  format('select public.complete_parent_profile(%L::date, %L, %L)',
         (current_date - interval '18 years' + interval '1 day')::date, 'GB', 'male'),
  '22023', null, 'under 18 refused');
select throws_ok(
  $$ select public.complete_parent_profile(date '1899-12-31', 'GB', 'male') $$,
  '22023', null, 'birth year before 1900 refused');
select throws_ok(
  $$ select public.complete_parent_profile(null, 'GB', 'male') $$,
  '22023', null, 'missing date of birth refused');
select throws_ok(
  $$ select public.complete_parent_profile(date '1985-06-15', 'pk', 'male') $$,
  '22023', null, 'lower-case country refused');
select throws_ok(
  $$ select public.complete_parent_profile(date '1985-06-15', 'PAK', 'male') $$,
  '22023', null, 'three-letter country refused');
select throws_ok(
  $$ select public.complete_parent_profile(date '1985-06-15', 'GB', 'other') $$,
  '22023', null, 'unknown gender option refused');

-- ---------------------------------------------------------------------------
-- Who can call it, and who can read the details
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c'::uuid);
select throws_ok(
  $$ select public.complete_parent_profile(date '1985-06-15', 'GB', 'male') $$,
  'JA403', null, 'a child cannot complete a parent profile');
select is((select count(*)::int from public.parent_details), 0, 'a child cannot read their parent''s details');

select tests.authenticate_as(:'pb'::uuid);
select is((select count(*)::int from public.parent_details), 0, 'another parent cannot read the details');
select lives_ok(
  $$ select public.complete_parent_profile(date '1990-03-03', 'IN', 'non_binary') $$,
  'another parent completes their own profile');
select is((select count(*)::int from public.parent_details), 1, 'and sees only their own row');

select throws_ok(
  format($$ insert into public.parent_details (profile_id, date_of_birth, country, gender)
            values (%L, date '2015-01-01', 'GB', 'male') $$, :'pb'),
  '42501', null, 'direct insert is refused, the function is the only write path');
select throws_ok(
  $$ update public.parent_details set date_of_birth = date '2015-01-01' $$,
  '42501', null, 'direct update is refused, so the 18+ rule cannot be skipped');
select throws_ok(
  $$ delete from public.parent_details $$,
  '42501', null, 'direct delete is refused');

select tests.clear_auth();
select throws_ok(
  $$ select public.complete_parent_profile(date '1985-06-15', 'GB', 'male') $$,
  'JA401', null, 'signed-out callers are refused');

set local role anon;
select throws_ok(
  $$ select public.complete_parent_profile(date '1985-06-15', 'GB', 'male') $$,
  '42501', null, 'anon cannot execute the function');
reset role;

select * from finish();
rollback;
