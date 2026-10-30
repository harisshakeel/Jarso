begin;
\ir _helpers.psql
select plan(15);

-- Family A: parents PA and PB, child C (guide on).
select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('c@example.com', 'child') as c \gset
select tests.create_user('c2@example.com', 'child') as c2 \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'UTC') as fa \gset
select public.register_child(:'c'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select public.register_child(:'c2'::uuid, :'fa'::uuid, 'Alex', '2345', true);
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
select throws_ok(
  format($$ select public.create_gift(%L, 1000, %L, null, %L) $$, :'c2', :'today', :'gift_key'),
  'JA409', null, 'same key for a different child does not return the first child''s gift');

select tests.authenticate_as(:'pb'::uuid);
select public.create_gift(:'c'::uuid, 1000, :'today'::date, 'Well done', :'gift_key') as g2 \gset
select isnt(:'g2'::uuid, :'g1'::uuid, 'same key from a different parent creates a separate gift');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- Guide turns: one stored turn per client message id
-- ---------------------------------------------------------------------------

select function_privs_are('public', 'guide_find_turn', array['uuid', 'uuid'],
  'authenticated', array[]::text[], 'only the server looks up a turn');
select function_privs_are('public', 'guide_find_turn', array['uuid', 'uuid'],
  'service_role', array['EXECUTE'], 'the server looks up turns');

set local role service_role;
select gen_random_uuid() as mid \gset
select public.guide_start_conversation(:'c'::uuid, 'home', 'home') as convo \gset
select public.guide_record_turn(:'convo'::uuid, :'c'::uuid, 'What is saving?', 'guide', 'Saving is keeping money.',
  'on_topic', false, 'm', '{}'::jsonb, 10, :'mid'::uuid) as reply \gset

select throws_ok(
  format($$ select public.guide_record_turn(%L, %L, 'What is saving?', 'guide', 'Again.',
    'on_topic', false, 'm', '{}'::jsonb, 10, %L) $$, :'convo', :'c', :'mid'),
  '23505', null, 'guide_record_turn rejects a second child row with the same client_message_id');

select results_eq(
  format($$ select conversation_id, reply_id from public.guide_find_turn(%L, %L) $$, :'c', :'mid'),
  format($$ values (%L::uuid, %L::uuid) $$, :'convo', :'reply'),
  'guide_find_turn returns the recorded turn');
select is_empty(
  format($$ select * from public.guide_find_turn(%L, %L) $$, :'c', gen_random_uuid()),
  'an unknown client message id finds nothing');
reset role;

select * from finish();
rollback;
