begin;
\ir _helpers.psql
select plan(67);

-- Fixtures: family A with parent PA and children C and C2; family B with parent PB and child CB.
select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('c@example.com', 'child') as c \gset
select tests.create_user('c2@example.com', 'child') as c2 \gset
select tests.create_user('cb@example.com', 'child') as cb \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'Europe/London') as fa \gset
select public.register_child(:'c'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select public.register_child(:'c2'::uuid, :'fa'::uuid, 'Alex', '2345', true);
select tests.authenticate_as(:'pb'::uuid);
select public.create_family('EUR', 'UTC') as fb \gset
select public.register_child(:'cb'::uuid, :'fb'::uuid, 'Jo', '3456', true);

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------

select tests.clear_auth();
select ok(
  (select bool_and(c.relrowsecurity) from pg_class c
   where c.oid in ('public.guide_access'::regclass, 'public.guide_conversations'::regclass, 'public.guide_messages'::regclass)),
  'RLS is on for every guide table');
select table_privs_are('public', 'guide_messages', 'authenticated', array['SELECT'], 'authenticated may only select messages');
select table_privs_are('public', 'guide_conversations', 'authenticated', array['SELECT'], 'and chats');
select table_privs_are('public', 'guide_access', 'anon', array[]::text[], 'anon has no access');
select function_privs_are('public', 'guide_record_turn',
  array['uuid', 'uuid', 'text', 'text', 'text', 'text', 'boolean', 'text', 'jsonb', 'integer'],
  'authenticated', array[]::text[], 'only the server records turns');
select function_privs_are('public', 'guide_start_conversation', array['uuid', 'text', 'text'],
  'authenticated', array[]::text[], 'only the server opens chats');
select function_privs_are('public', 'guide_usage_since', array['timestamp with time zone'],
  'authenticated', array[]::text[], 'only the server reads usage');
select function_privs_are('public', 'guide_start_conversation', array['uuid', 'text', 'text'],
  'service_role', array['EXECUTE'], 'the server starts chats');
select function_privs_are('public', 'set_guide_access', array['uuid', 'boolean'], 'anon', array[]::text[],
  'anon cannot switch the guide');
select function_privs_are('public', 'rate_guide_message', array['uuid', 'smallint'], 'anon', array[]::text[],
  'anon cannot rate');
select function_privs_are('public', 'blank_old_guide_text', array[]::text[], 'service_role', array[]::text[],
  'the retention job has no grants');
select ok(
  not exists (select 1 from pg_available_extensions where name = 'pg_cron')
  or exists (select 1 from cron.job where jobname = 'blank-old-guide-text'),
  'the retention job is scheduled where pg_cron exists');

-- ---------------------------------------------------------------------------
-- The parent's switch
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'pa'::uuid);
select lives_ok(format($$ select public.set_guide_access(%L, true) $$, :'c'), 'a parent turns the guide on');
select is(
  (select enabled::text || '/' || (changed_by = :'pa'::uuid)::text from public.guide_access where child_id = :'c'::uuid),
  'true/true', 'the switch records who turned it on');
select public.set_guide_access(:'c'::uuid, true);
select is(
  (select count(*)::int from public.audit_log where action = 'guide.access_changed' and subject_id = :'c'::uuid),
  1, 'the change is audited once, even after a second tap');

select tests.authenticate_as(:'pb'::uuid);
select throws_ok(format($$ select public.set_guide_access(%L, true) $$, :'c2'), 'JA403', null,
  'another family''s parent cannot switch it');
select tests.authenticate_as(:'c'::uuid);
select throws_ok(format($$ select public.set_guide_access(%L, false) $$, :'c'), 'JA403', null,
  'a child cannot switch it');
select tests.clear_auth();
select throws_ok(format($$ select public.set_guide_access(%L, true) $$, :'c'), 'JA401', null, 'signed out is refused');

-- ---------------------------------------------------------------------------
-- Server writes (service_role)
-- ---------------------------------------------------------------------------

set local role service_role;
select public.guide_start_conversation(:'c'::uuid, 'home', 'home') as convo \gset
select ok(:'convo' is not null, 'the server opens a chat for a child whose guide is on');
select throws_ok(format($$ select public.guide_start_conversation(%L, 'home', 'home') $$, :'c2'), 'JA403', null,
  'no chat for a child whose guide is off');
select throws_ok(format($$ select public.guide_start_conversation(%L, 'home', 'home') $$, :'pa'), 'JA403', null,
  'no chat for a parent');
select throws_ok(format($$ select public.guide_start_conversation(%L, 'home', 'Free Text!') $$, :'c'), '23514', null,
  'a context key is content keys, never free text');

select public.guide_record_turn(:'convo'::uuid, :'c'::uuid, 'What is saving?', 'guide', 'Saving is keeping money for later.',
  'on_topic', false, 'claude-opus-5-5', '{"main_input": 800, "main_output": 120, "screen_input": 400}'::jsonb, 3200) as reply \gset
select is(
  (select count(*)::int from public.guide_messages where conversation_id = :'convo'::uuid),
  2, 'a turn stores the child''s message and the reply');
select is((select turns::int from public.guide_conversations where id = :'convo'::uuid), 1, 'and counts one turn');
select is(
  (select main_input_tokens || '/' || screen_input_tokens || '/' || latency_ms from public.guide_messages where id = :'reply'::uuid),
  '800/400/3200', 'token counts and latency are kept on the reply');
select is(
  (select string_agg(role, ',' order by created_at, role) from public.guide_messages where conversation_id = :'convo'::uuid),
  'child,guide', 'the child''s message sorts before the reply');

select public.guide_record_turn(:'convo'::uuid, :'c'::uuid, 'someone hurt me', 'fixed_copy', 'Thank you for telling me.',
  'safety', true, '', '{}'::jsonb, 1500);
select ok((select flagged from public.guide_conversations where id = :'convo'::uuid), 'a flagged reply flags the chat');
select is(
  (select text from public.guide_messages where conversation_id = :'convo'::uuid and role = 'child' order by created_at desc limit 1),
  '', 'a message that got a safety response is never stored');
select public.guide_record_turn(:'convo'::uuid, :'c'::uuid, 'my address is 1 Oak Road', 'fixed_copy', 'Let''s keep personal stuff private.',
  'personal_info', false, '', '{}'::jsonb, 900);
select is(
  (select text from public.guide_messages where conversation_id = :'convo'::uuid and role = 'child' order by created_at desc limit 1),
  '', 'or one that got a personal-details response');

select throws_ok(
  format($$ select public.guide_record_turn(%L, %L, 'hi', 'guide', 'hi', 'on_topic', false, 'm', '{}'::jsonb, 1) $$, :'convo', :'c2'),
  'JA403', null, 'a turn cannot be written to another child''s chat');
select throws_ok(
  format($$ select public.guide_record_turn(%L, %L, 'hi', 'child', 'hi', 'on_topic', false, 'm', '{}'::jsonb, 1) $$, :'convo', :'c'),
  '22023', null, 'the reply must come from the guide');
select throws_ok(
  format($$ select public.guide_record_turn(%L, %L, 'hi', 'guide', repeat('x', 2001), 'on_topic', false, 'm', '{}'::jsonb, 1) $$, :'convo', :'c'),
  '22023', null, 'an over-long reply is refused before anything is written');
select throws_ok(
  format($$ select public.guide_record_turn(%L, %L, 'hi', 'guide', 'hi', 'on_topic', false, 'm', '[1]'::jsonb, 1) $$, :'convo', :'c'),
  '22023', null, 'usage must be an object');
select lives_ok(
  format($$ select public.guide_record_turn(%L, %L, 'hi', 'guide', 'hi', 'on_topic', false, 'm', '{"main_input": 800.0, "main_output": -5}'::jsonb, 1) $$, :'convo', :'c'),
  'odd usage numbers are clamped, not fatal');

update public.guide_conversations set turns = 11 where id = :'convo'::uuid;
select lives_ok(
  format($$ select public.guide_record_turn(%L, %L, 'hi', 'guide', 'hi', 'on_topic', false, 'm', '{}'::jsonb, 1) $$, :'convo', :'c'),
  'the twelfth turn fits');
select throws_ok(
  format($$ select public.guide_record_turn(%L, %L, 'hi', 'guide', 'hi', 'on_topic', false, 'm', '{}'::jsonb, 1) $$, :'convo', :'c'),
  'JA409', null, 'a chat stops at 12 turns');

select is(
  (select main_input::int || '/' || screen_input::int from public.guide_usage_since(now() - interval '1 hour') where model = 'claude-opus-5-5'),
  '800/400', 'usage totals feed the daily budget, replies only');
select is(
  (select count(*)::int from public.guide_usage_since(now() + interval '1 hour')),
  0, 'and only since the given time');
select throws_ok($$ select * from public.guide_usage_since(null) $$, '22023', null, 'a missing start time is refused');
reset role;

-- ---------------------------------------------------------------------------
-- Who can read
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c'::uuid);
select ok((select count(*) from public.guide_messages) > 0, 'the child reads their own chat');
select tests.authenticate_as(:'pa'::uuid);
select ok((select count(*) from public.guide_messages where child_id = :'c'::uuid) > 0, 'their parent reads it');
select is(
  (select count(*)::int from public.guide_messages where child_id = :'c'::uuid and text = 'someone hurt me'),
  0, 'but never the message that got a safety response');
select tests.authenticate_as(:'c2'::uuid);
select is(
  (select count(*)::int from public.guide_messages) + (select count(*)::int from public.guide_conversations)
  + (select count(*)::int from public.guide_access),
  0, 'a brother or sister sees nothing');
select tests.authenticate_as(:'pb'::uuid);
select is(
  (select count(*)::int from public.guide_messages) + (select count(*)::int from public.guide_conversations)
  + (select count(*)::int from public.guide_access),
  0, 'another family sees nothing');

select tests.authenticate_as(:'c'::uuid);
select throws_ok(
  format($$ insert into public.guide_messages (conversation_id, child_id, role, text) values (%L, %L, 'child', 'fake') $$, :'convo', :'c'),
  '42501', null, 'a child cannot write what the guide said');
select throws_ok($$ update public.guide_messages set text = 'changed' $$, '42501', null, 'or change a transcript');
select throws_ok(
  format($$ select public.guide_start_conversation(%L, 'home', 'home') $$, :'c'),
  '42501', null, 'or open a chat directly');

-- The schema ties a message's child to its chat's child, whatever writes it.
select tests.clear_auth();
select throws_ok(
  format($$ insert into public.guide_messages (conversation_id, child_id, role, text) values (%L, %L, 'child', 'x') $$, :'convo', :'c2'),
  '23503', null, 'a message cannot claim a different child than its chat');
select throws_ok(
  format($$ insert into public.guide_messages (conversation_id, child_id, role, text, route) values (%L, %L, 'child', 'x', 'on_topic') $$, :'convo', :'c'),
  '23514', null, 'a child''s message never carries a route');

-- ---------------------------------------------------------------------------
-- Ratings
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c'::uuid);
select lives_ok(format($$ select public.rate_guide_message(%L, 1::smallint) $$, :'reply'), 'a child rates a reply');
select is((select rating::int from public.guide_messages where id = :'reply'::uuid), 1, 'the rating is kept');
select throws_ok(
  format($$ select public.rate_guide_message(id, 1::smallint) from public.guide_messages where conversation_id = %L and role = 'child' limit 1 $$, :'convo'),
  'JA403', null, 'their own messages are not rated');
select throws_ok(
  format($$ select public.rate_guide_message(id, 1::smallint) from public.guide_messages where conversation_id = %L and role = 'fixed_copy' limit 1 $$, :'convo'),
  'JA403', null, 'fixed copy is not rated');
select throws_ok(format($$ select public.rate_guide_message(%L, 2::smallint) $$, :'reply'), '22023', null, 'ratings are 1 or -1');
select tests.authenticate_as(:'c2'::uuid);
select throws_ok(format($$ select public.rate_guide_message(%L, -1::smallint) $$, :'reply'), 'JA403', null,
  'a brother or sister cannot rate it');
select tests.authenticate_as(:'pa'::uuid);
select throws_ok(format($$ select public.rate_guide_message(%L, -1::smallint) $$, :'reply'), 'JA403', null,
  'nor can a parent');

-- ---------------------------------------------------------------------------
-- Switching off stops new chats
-- ---------------------------------------------------------------------------

select public.set_guide_access(:'c'::uuid, false);
set local role service_role;
select throws_ok(format($$ select public.guide_start_conversation(%L, 'home', 'home') $$, :'c'), 'JA403', null,
  'no new chat once the parent switches it off');
reset role;
select tests.authenticate_as(:'pa'::uuid);
select public.set_guide_access(:'c'::uuid, true);

-- ---------------------------------------------------------------------------
-- Retention: text is blanked after 30 days
-- ---------------------------------------------------------------------------

select tests.clear_auth();
update public.guide_messages set created_at = now() - interval '31 days' where conversation_id = :'convo'::uuid;
update public.guide_messages set created_at = now() - interval '29 days' where id = :'reply'::uuid;
select is(public.blank_old_guide_text(), (select count(*)::int from public.guide_messages where conversation_id = :'convo'::uuid) - 1,
  'messages older than 30 days are blanked');
select is((select text from public.guide_messages where id = :'reply'::uuid), 'Saving is keeping money for later.',
  'a 29-day-old message is kept');
select is(
  (select count(*)::int from public.guide_messages
   where conversation_id = :'convo'::uuid and id <> :'reply'::uuid and (text <> '' or text_blanked_at is null)),
  0, 'the older text is gone');
select is((select main_input_tokens::int from public.guide_messages where id = :'reply'::uuid), 800, 'the metadata stays');
select is(public.blank_old_guide_text(), 0, 'blanking twice changes nothing');
select ok(
  exists (select 1 from public.job_runs where job = 'blank-old-guide-text' and status = 'ok' and finished_at is not null),
  'each run is recorded');

-- ---------------------------------------------------------------------------
-- Removing a child deletes their guide chats and switch
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'pa'::uuid);
select ok(public.remove_child(:'c'::uuid), 'a parent removes the child');
select is(
  (select count(*)::int from public.guide_messages where child_id = :'c'::uuid)
  + (select count(*)::int from public.guide_conversations where child_id = :'c'::uuid),
  0, 'their parent reads nothing of theirs any more');
select lives_ok(format($$ select public.remove_child(%L) $$, :'c'), 'removing again is safe');
select tests.clear_auth();
select is(
  (select count(*)::int from public.guide_messages where child_id = :'c'::uuid)
  + (select count(*)::int from public.guide_conversations where child_id = :'c'::uuid)
  + (select count(*)::int from public.guide_access where child_id = :'c'::uuid),
  0, 'their chats and switch are deleted');

select * from finish();
rollback;
