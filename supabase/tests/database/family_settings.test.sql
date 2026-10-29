begin;
\ir _helpers.psql
select plan(31);

-- Fixtures: PA owns family A with child C (Sam); PB owns family B; PX is a parent without a family.
select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('px@example.com') as px \gset
select tests.create_user('c@example.com', 'child') as c \gset
select tests.create_user('c2@example.com', 'child') as c2 \gset

select tests.authenticate_as(:'pb'::uuid);
select public.create_family('EUR', 'UTC') as fb \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'Europe/London') as fa \gset
select public.register_child(:'c'::uuid, :'fa'::uuid, 'Sam', '1234', true);

-- ---------------------------------------------------------------------------
-- rename_child
-- ---------------------------------------------------------------------------

select lives_ok(
  format('select public.rename_child(%L, %L)', :'c', '  Sammy '),
  'parent renames the child');
select is((select nickname from public.profiles where id = :'c'::uuid), 'Sammy', 'profile nickname updated and trimmed');
select is((select nickname_key from public.family_members where profile_id = :'c'::uuid), 'sammy', 'nickname_key follows the rename');
select is(
  (select details->>'from' || '>' || (details->>'to') from public.audit_log
   where action = 'child.renamed' and subject_id = :'c'::uuid),
  'Sam>Sammy', 'child.renamed audited with old and new nickname');

select throws_ok(
  format('select public.rename_child(%L, %L)', :'c', 'a@b'),
  '22023', null, 'rename rejects characters outside the nickname rules');
select throws_ok(
  format('select public.rename_child(%L, %L)', :'c', ''),
  '22023', null, 'rename rejects an empty nickname');

select public.register_child(:'c2'::uuid, :'fa'::uuid, 'Alex', '2345', true);
select throws_ok(
  format('select public.rename_child(%L, %L)', :'c2', 'SAMMY'),
  'JA409', null, 'rename refuses a nickname another child in the family uses (case-insensitive)');

select tests.authenticate_as(:'pb'::uuid);
select throws_ok(
  format('select public.rename_child(%L, %L)', :'c', 'Hacked'),
  'JA403', null, 'a parent from another family cannot rename the child');

select tests.authenticate_as(:'c'::uuid);
select throws_ok(
  format('select public.rename_child(%L, %L)', :'c', 'Me'),
  'JA403', null, 'a child cannot rename themselves');

select tests.clear_auth();
select throws_ok(
  format('select public.rename_child(%L, %L)', :'c', 'Nobody'),
  'JA401', null, 'signed-out callers are rejected');

-- ---------------------------------------------------------------------------
-- update_family_timezone
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'pa'::uuid);
select lives_ok(
  $$select public.update_family_timezone('Asia/Karachi')$$,
  'parent changes the family timezone');
select is((select timezone from public.families where id = :'fa'::uuid), 'Asia/Karachi', 'timezone stored');
select is(
  (select count(*)::int from public.audit_log where action = 'family.updated' and family_id = :'fa'::uuid),
  1, 'family.updated audited');
select throws_ok(
  $$select public.update_family_timezone('Mars/Olympus')$$,
  '22023', null, 'unknown timezone rejected');
select is((select timezone from public.families where id = :'fb'::uuid), 'UTC', 'other family untouched');

select tests.authenticate_as(:'px'::uuid);
select throws_ok(
  $$select public.update_family_timezone('UTC')$$,
  'JA403', null, 'a parent without a family cannot change settings');

select tests.authenticate_as(:'c'::uuid);
select throws_ok(
  $$select public.update_family_timezone('UTC')$$,
  'JA403', null, 'a child cannot change family settings');

-- ---------------------------------------------------------------------------
-- remove_child
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'pb'::uuid);
select throws_ok(
  format('select public.remove_child(%L)', :'c'),
  'JA403', null, 'a parent from another family cannot remove the child');

select tests.authenticate_as(:'c'::uuid);
select throws_ok(
  format('select public.remove_child(%L)', :'c'),
  'JA403', null, 'a child cannot remove themselves');

select tests.authenticate_as(:'pa'::uuid);
select is(public.remove_child(:'c'::uuid), true, 'parent removes the child; identity may be deleted (no money history)');
select is(
  (select status || '/' || coalesce(nickname_key, 'null') || '/' || removed_by::text
   from public.family_members where profile_id = :'c'::uuid),
  'removed/null/' || :'pa', 'membership removed, nickname freed, remover recorded');
select ok(
  (select removed_at is not null from public.family_members where profile_id = :'c'::uuid),
  'removed_at set');
select is((select count(*)::int from public.child_credentials where profile_id = :'c'::uuid), 0, 'PIN credentials deleted');
select is(
  (select details->>'nickname' from public.audit_log where action = 'child.removed' and subject_id = :'c'::uuid),
  'Sammy', 'child.removed audited with the nickname');
select is((select nickname from public.profiles where id = :'c'::uuid), null, 'profile nickname cleared');
select is(public.is_parent_of(:'c'::uuid), false, 'removed child is no longer the parent''s child');
select is(public.remove_child(:'c'::uuid), true, 'removing again is idempotent so a failed app-side step can be retried');
select is(
  (select count(*)::int from public.audit_log where action = 'child.removed' and subject_id = :'c'::uuid),
  1, 'a repeated removal does not audit twice');
select throws_ok(
  format('select public.rename_child(%L, %L)', :'c', 'Back'),
  'JA403', null, 'a removed child cannot be renamed');

select tests.authenticate_as(:'pb'::uuid);
select throws_ok(
  format('select public.remove_child(%L)', :'c'),
  'JA403', null, 'a parent from another family cannot re-run the removal either');
select tests.authenticate_as(:'pa'::uuid);

-- The freed nickname can be given to a new child.
select tests.create_user('c3@example.com', 'child') as c3 \gset
select tests.authenticate_as(:'pa'::uuid);
select lives_ok(
  format('select public.register_child(%L, %L, %L, %L, true)', :'c3', :'fa', 'Sammy', '9876'),
  'nickname of a removed child is free for a new child');

select * from finish();
rollback;
