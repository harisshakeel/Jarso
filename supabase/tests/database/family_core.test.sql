begin;
\ir _helpers.psql
select plan(36);

-- Fixtures: parents PA and PB each create a family; PX has none; CH is a child-role user.
select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('px@example.com') as px \gset
select tests.create_user('ch@example.com', 'child') as ch \gset

-- handle_new_user: role comes from app metadata only.
select is((select role from public.profiles where id = :'pa'::uuid), 'parent', 'parent app role → profile role parent');
select is((select role from public.profiles where id = :'ch'::uuid), 'child', 'child app role → profile role child');

insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
        'spoof@example.com', '{}'::jsonb, '{"jarso_role":"child"}'::jsonb, now(), now());
select is((select role from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
          'parent', 'user metadata cannot set role');

-- create_family as PA.
select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'Europe/London') as fa \gset
select isnt(:'fa'::uuid, null, 'create_family returns an id');
select matches((select code from public.families where id = :'fa'::uuid), '^[A-HJ-NP-Z2-9]{6}$', 'family code uses the alphabet');
select is((select currency || '/' || timezone from public.families where id = :'fa'::uuid), 'GBP/Europe/London', 'currency and timezone stored');
select is(
  (select role || '/' || status from public.family_members where family_id = :'fa'::uuid and profile_id = :'pa'::uuid),
  'parent/approved', 'creator is an approved parent member');
select is(
  (select count(*)::int from public.audit_log where family_id = :'fa'::uuid and action = 'family.created' and actor_id = :'pa'::uuid),
  1, 'family.created audited and visible to parent');
select is(public.current_family_id(), :'fa'::uuid, 'current_family_id returns own family');
select ok(public.is_approved_member(:'fa'::uuid), 'PA is approved member of A');
select ok(public.is_self(:'pa'::uuid), 'is_self true for caller');

select throws_ok($$ select public.create_family('GBP', 'Europe/London') $$, 'JA409', null, 'second family rejected');
select throws_ok(
  format('insert into public.family_members (family_id, profile_id, role, status) values (%L, %L, %L, %L)',
         :'fa', :'px', 'parent', 'approved'),
  '42501', null, 'direct family_members insert blocked by RLS');
select throws_ok(format('update public.profiles set role = %L where id = %L', 'child', :'pa'), '42501', null, 'role not updatable');
select throws_ok(format('update public.profiles set nickname = %L where id = %L', 'x', :'pa'), '42501', null, 'nickname not updatable');
select lives_ok(format('update public.profiles set full_name = %L where id = %L', 'x', :'pa'), 'full_name updatable');
select is((select full_name from public.profiles where id = :'pa'::uuid), 'x', 'full_name updated');

-- Input validation.
select tests.authenticate_as(:'px'::uuid);
select throws_ok($$ select public.create_family('gbp', 'UTC') $$, '23514', null, 'lowercase currency rejected');
select throws_ok($$ select public.create_family('GBP', 'Mars/Olympus') $$, '22023', null, 'unknown timezone rejected');

-- create_family as a child.
select tests.authenticate_as(:'ch'::uuid);
select throws_ok($$ select public.create_family('GBP', 'UTC') $$, 'JA403', null, 'child cannot create a family');

-- Family B; isolation from A.
select tests.authenticate_as(:'pb'::uuid);
select public.create_family('EUR', 'UTC') as fb \gset
select is((select count(*)::int from public.families where id = :'fa'::uuid), 0, 'PB cannot see family A');
select is((select count(*)::int from public.family_members where family_id = :'fa'::uuid), 0, 'PB cannot see A members');
select is((select count(*)::int from public.audit_log where family_id = :'fa'::uuid), 0, 'PB cannot see A audit log');
select is((select count(*)::int from public.profiles where id = :'pa'::uuid), 0, 'PB cannot see PA profile');
select ok(not public.is_parent_of(:'pa'::uuid), 'is_parent_of false across families');

-- Child CH joins family A (as postgres: register_child arrives in a later task).
select tests.clear_auth();
insert into public.family_members (family_id, profile_id, role, status, nickname_key, consent_at, consent_by)
values (:'fa'::uuid, :'ch'::uuid, 'child', 'approved', 'ch', now(), :'pa'::uuid);
select throws_ok(
  format('insert into public.family_members (family_id, profile_id, role, nickname_key) values (%L, %L, %L, %L)', :'fb', :'px', 'child', 'px'),
  '23514', null, 'child membership requires consent');

select tests.authenticate_as(:'pa'::uuid);
select ok(public.is_parent_of(:'ch'::uuid), 'PA is parent of CH');
select is((select count(*)::int from public.profiles where id = :'ch'::uuid), 1, 'PA sees child profile');

select tests.authenticate_as(:'ch'::uuid);
select is((select count(*)::int from public.profiles where id = :'pa'::uuid), 1, 'child sees own family parent');
update public.profiles set full_name = 'Kid', avatar_url = 'x' where id = :'ch'::uuid;
update public.profiles set full_name = 'Kid' where id = :'pa'::uuid;
select tests.clear_auth();
select is(
  (select count(*)::int from public.profiles where full_name = 'Kid' or avatar_url = 'x'),
  0, 'a child cannot update its own or a parent''s full_name or avatar_url');
select tests.authenticate_as(:'ch'::uuid);
select is((select count(*)::int from public.audit_log), 0, 'child cannot read audit log');
select ok(not public.is_parent_of(:'pa'::uuid), 'child is not parent of anyone');

select tests.authenticate_as(:'pb'::uuid);
select ok(not public.is_parent_of(:'ch'::uuid), 'PB is not parent of A child');
select is((select count(*)::int from public.profiles where id = :'ch'::uuid), 0, 'PB cannot see A child profile');

-- PX: no family.
select tests.authenticate_as(:'px'::uuid);
select is((select count(*)::int from public.families), 0, 'PX sees no families');

-- anon cannot call create_family.
select tests.clear_auth();
set local role anon;
select throws_ok($$ select public.create_family('GBP', 'UTC') $$, '42501', null, 'anon cannot execute create_family');

select * from finish();
rollback;
