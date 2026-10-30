begin;
\ir _helpers.psql
select plan(9);

-- Family A: parents PA and PB, child C (guide on).
select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('c@example.com', 'child') as c \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'UTC') as fa \gset
select public.register_child(:'c'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select public.set_guide_access(:'c'::uuid, true);
select tests.clear_auth();

insert into public.family_members (family_id, profile_id, role, status)
values (:'fa'::uuid, :'pb'::uuid, 'parent', 'approved');

select (now() at time zone 'UTC')::date as today \gset
select gen_random_uuid()::text as gift_key \gset

-- ---------------------------------------------------------------------------
-- create_gift: a repeated key from the same parent returns the first gift
-- ---------------------------------------------------------------------------

select has_column('public', 'parent_gifts', 'idempotency_key', 'gifts carry an idempotency key');
select col_not_null('public', 'parent_gifts', 'idempotency_key', 'and it is required');
select hasnt_function('public', 'create_gift', array['uuid', 'bigint', 'date', 'text'],
  'the keyless create_gift is gone');
select function_privs_are('public', 'create_gift', array['uuid', 'bigint', 'date', 'text', 'text'],
  'anon', array[]::text[], 'anon cannot create gifts');

select tests.authenticate_as(:'pa'::uuid);
select public.create_gift(:'c'::uuid, 1000, :'today'::date, 'Well done', :'gift_key') as g1 \gset
select public.create_gift(:'c'::uuid, 1000, :'today'::date, 'Well done', :'gift_key') as g1_again \gset
select is(:'g1_again'::uuid, :'g1'::uuid, 'create_gift twice with one key returns one id');
select is(
  (select count(*)::int from public.parent_gifts where created_by = :'pa'::uuid),
  1, 'and one row');
select is(
  (select count(*)::int from public.audit_log where action = 'gift.created' and subject_id = :'g1'::uuid),
  1, 'and one audit entry');
select throws_ok(
  format($$ select public.create_gift(%L, 1000, %L, null, '  ') $$, :'c', :'today'),
  '22023', null, 'a blank key is refused');

select tests.authenticate_as(:'pb'::uuid);
select public.create_gift(:'c'::uuid, 1000, :'today'::date, 'Well done', :'gift_key') as g2 \gset
select isnt(:'g2'::uuid, :'g1'::uuid, 'same key from a different parent creates a separate gift');
select tests.clear_auth();

select * from finish();
rollback;
