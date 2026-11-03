begin;
\ir _helpers.psql
select plan(20);

select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pz@example.com') as pz \gset
select tests.create_user('c1@example.com', 'child') as c1 \gset

select tests.authenticate_as(:'pz'::uuid);
select public.create_family('INR', 'Asia/Kolkata') as fz \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);

-- Sending
select is(
  public.send_child_note(:'c1'::uuid, '  Great saving this week!  ', 'key-1'),
  'sent', 'a parent sends their child a note');
select is(
  public.send_child_note(:'c1'::uuid, 'Great saving this week!', 'key-1'),
  'already_sent', 'a repeat of the same key sends nothing');

select tests.clear_auth();
select is(
  (select count(*)::int from public.notifications where kind = 'parent_note'),
  1, 'one notice for one key');
select is(
  (select recipient_id from public.notifications where kind = 'parent_note'),
  :'c1'::uuid, 'the notice is for the child');
select is(
  (select payload ->> 'text' from public.notifications where kind = 'parent_note'),
  'Great saving this week!', 'the text is trimmed');
select is(
  (select source_type || ':' || source_id::text from public.notifications where kind = 'parent_note'),
  'note:' || :'pa', 'the source is the parent who wrote it');
select is(
  (select details from public.audit_log where action = 'note.sent' and subject_id = :'c1'::uuid),
  '{}'::jsonb, 'the audit row records the send, never the text');

-- Who reads it
select tests.authenticate_as(:'c1'::uuid);
select is(
  (select count(*)::int from public.notifications where kind = 'parent_note'),
  1, 'the child reads the note in their News');
select tests.authenticate_as(:'pa'::uuid);
select is(
  (select count(*)::int from public.notifications where kind = 'parent_note'),
  0, 'the parent gets no copy');

-- Who may send, and what
select tests.authenticate_as(:'c1'::uuid);
select throws_ok(
  format($$select public.send_child_note(%L, 'Hi', 'key-c')$$, :'c1'),
  'JA403', null, 'a child cannot send a note');
select tests.authenticate_as(:'pz'::uuid);
select throws_ok(
  format($$select public.send_child_note(%L, 'Hi', 'key-z')$$, :'c1'),
  'JA403', null, 'a parent of another family cannot');
select tests.authenticate_as(:'pa'::uuid);
select throws_ok(
  format($$select public.send_child_note(%L, '   ', 'key-2')$$, :'c1'),
  '22023', null, 'a blank note is refused');
select throws_ok(
  format($$select public.send_child_note(%L, %L, 'key-3')$$, :'c1', repeat('a', 141)),
  '22023', null, 'a note over 140 characters is refused');
select throws_ok(
  format($$select public.send_child_note(%L, 'Hi', '')$$, :'c1'),
  '22023', null, 'a note without a key is refused');

select throws_ok(
  format($$select public.send_child_note(%L, E'\n\t ', 'key-4')$$, :'c1'),
  '22023', null, 'a note of only whitespace is refused');

-- The daily cap: 20 notes a day, then a calm refusal; a repeat key still answers.
select is(
  (select count(*)::int from (
    select public.send_child_note(:'c1'::uuid, 'Note ' || n, 'cap-' || n) as status
    from generate_series(1, 19) n) sent where status = 'sent'),
  19, 'nineteen more notes go, twenty today');
select throws_ok(
  format($$select public.send_child_note(%L, 'One more', 'cap-20')$$, :'c1'),
  'JA429', null, 'the 21st note in a day is refused');
select is(
  public.send_child_note(:'c1'::uuid, 'Note 5', 'cap-5'),
  'already_sent', 'a retry of a sent note is still answered at the cap');

-- Removed members: a removed parent can't send, and a removed child gets nothing.
select tests.clear_auth();
update public.family_members set status = 'removed' where profile_id = :'pa'::uuid;
select tests.authenticate_as(:'pa'::uuid);
select throws_ok(
  format($$select public.send_child_note(%L, 'Hi', 'key-r1')$$, :'c1'),
  'JA403', null, 'a removed parent cannot send a note');
select tests.clear_auth();
update public.family_members set status = 'approved' where profile_id = :'pa'::uuid;
update public.family_members set status = 'removed' where profile_id = :'c1'::uuid;
select tests.authenticate_as(:'pa'::uuid);
select throws_ok(
  format($$select public.send_child_note(%L, 'Hi', 'key-r2')$$, :'c1'),
  'JA403', null, 'a removed child gets no note');

select * from finish();
rollback;
