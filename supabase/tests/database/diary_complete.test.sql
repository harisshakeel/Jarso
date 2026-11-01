begin;
\ir _helpers.psql
select plan(79);

-- Fixtures: PA owns family A (UTC) with children C1 and C2; PB is a second approved parent.
select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('c1@example.com', 'child') as c1 \gset
select tests.create_user('c2@example.com', 'child') as c2 \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select public.register_child(:'c2'::uuid, :'fa'::uuid, 'Max', '1234', true);
select tests.clear_auth();

insert into public.family_members (family_id, profile_id, role, status)
values (:'fa'::uuid, :'pb'::uuid, 'parent', 'approved');

-- Seed C1 Spend 1000 as postgres. C2 starts at 0.
insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, label, source_type, idempotency_key, created_by, occurred_at)
values (:'fa'::uuid, :'c1'::uuid, 'spend', 'allowance_in', 'in', 1000, 'Allowance', 'occurrence', 'seed:c1', :'pa'::uuid, '2025-01-01');
select id as seed1 from public.ledger_entries where idempotency_key = 'seed:c1' \gset

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c1'::uuid);
select throws_ok(format($$select public.diary_chain_root(%L)$$, :'seed1'), '42501', null, 'diary_chain_root is not granted');
select throws_ok(
  format($$select public.record_money_received_at(%L, 100, 'spend', 'job', null, 'kg', now())$$, :'c1'),
  '42501', null, 'record_money_received_at is not granted');
select throws_ok(format($$select public.undo_diary_entry_at(%L, now())$$, :'seed1'), '42501', null, 'undo_diary_entry_at is not granted');
select throws_ok(
  format($$select public.correct_diary_entry_at(%L, 100, 'other', null, 'kg', now())$$, :'seed1'),
  '42501', null, 'correct_diary_entry_at is not granted');
select tests.authenticate_as(:'pa'::uuid);
select throws_ok(
  format($$select public.record_money_received(%L, 100, 'spend', 'job', null, 'kp')$$, :'c1'),
  'JA403', null, 'a parent cannot record money received');
select tests.authenticate_as(:'c2'::uuid);
select throws_ok(
  format($$select public.record_money_received(%L, 100, 'spend', 'job', null, 'ks')$$, :'c1'),
  'JA403', null, 'a sibling cannot record money received for another child');
select tests.clear_auth();
set local role anon;
select throws_ok(
  format($$select public.record_money_received(%L, 100, 'spend', 'job', null, 'ka')$$, :'c1'),
  '42501', null, 'anon cannot record money received');
reset role;

-- ---------------------------------------------------------------------------
-- Purchase categories (C1, Spend 1000)
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c1'::uuid);
select (public.record_purchase(:'c1'::uuid, 100, null, 'cat1', p_category => 'snacks'))->>'entry_id' as pc1 \gset
select is((select category from public.ledger_entries where id = :'pc1'::uuid), 'snacks', 'record_purchase stores the category');
select (public.record_purchase(:'c1'::uuid, 100, null, 'cat2'))->>'entry_id' as pc2 \gset
select is((select category from public.ledger_entries where id = :'pc2'::uuid), 'other', 'no category stores other');
select (public.record_purchase(:'c1'::uuid, 100, null, 'cat3', null, null))->>'entry_id' as pc3 \gset
select is((select category from public.ledger_entries where id = :'pc3'::uuid), 'other', 'a null category stores other');
select throws_ok(
  format($$select public.record_purchase(%L, 100, null, 'cat4', null, 'birthday')$$, :'c1'),
  '22023', null, 'a received key on a purchase is rejected');
select is(public.balance(:'c1'::uuid, 'spend'), 700::bigint, 'Spend 700 after three purchases');
select tests.clear_auth();

-- The check ties the category to the kind.
select throws_ok(
  format($$insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, source_type, idempotency_key, category) values (%L, %L, 'spend', 'gift_in', 'in', 1, 'diary', 'chk1', 'snacks')$$, :'fa', :'c1'),
  '23514', null, 'the category check rejects a spend key on a gift_in');
select throws_ok(
  format($$insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, source_type, idempotency_key, category) values (%L, %L, 'spend', 'allowance_in', 'in', 1, 'occurrence', 'chk2', 'other')$$, :'fa', :'c1'),
  '23514', null, 'the category check rejects a category on an allowance');
select throws_ok(
  format($$insert into public.ledger_entries (family_id, child_id, jar, kind, direction, amount_minor, source_type, idempotency_key, corrects_entry_id) values (%L, %L, 'spend', 'allowance_in', 'in', 1, 'occurrence', 'chk3', %L)$$, :'fa', :'c1', :'seed1'),
  '23514', null, 'only a diary line can replace another');

-- ---------------------------------------------------------------------------
-- Money received into Save (C1), and the reserved-Save guard on undo and fix
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c1'::uuid);
select throws_ok(
  format($$select public.record_money_received(%L, 100, 'other', 'job', null, 'rb1')$$, :'c1'),
  '22023', null, 'a jar outside spend/save is rejected');
select throws_ok(
  format($$select public.record_money_received(%L, 100, 'save', 'snacks', null, 'rb2')$$, :'c1'),
  '22023', null, 'a spend key on money received is rejected');
select throws_ok(
  format($$select public.record_money_received(%L, 100, 'save', null, null, 'rb3')$$, :'c1'),
  '22023', null, 'money received needs a category');

select public.record_money_received(:'c1'::uuid, 1000, 'save', 'birthday', '  Nani  ', 'r1') as rs \gset
select is((:'rs'::jsonb)->>'status', 'recorded', 'money received is recorded');
select (:'rs'::jsonb)->>'entry_id' as rs1 \gset
select is(public.balance(:'c1'::uuid, 'save'), 1000::bigint, 'Save goes up at once');
select is(
  (select kind || ':' || jar || ':' || direction || ':' || source_type || ':' || category || ':' || label || ':' || idempotency_key
   from public.ledger_entries where id = :'rs1'::uuid),
  'gift_in:save:in:diary:birthday:Nani:received:' || :'c1' || ':r1',
  'money received row shape, trimmed label and key');
select is((public.record_money_received(:'c1'::uuid, 1000, 'save', 'birthday', 'Nani', 'r1'))->>'entry_id', :'rs1',
  'same key returns the same entry');
select tests.clear_auth();
select is(
  (select count(*)::int from public.notifications where kind = 'money_received' and source_id = :'rs1'::uuid),
  2, 'one money_received notice per parent, none for the replay');
select is(
  (select source_type || '|' || coalesce(window_key, 'null') || '|' || payload::text
   from public.notifications where kind = 'money_received' and recipient_id = :'pa'::uuid),
  'ledger_entry|null|{"jar": "save", "category": "birthday", "amount_minor": 1000}',
  'money_received notice source and payload');

select tests.authenticate_as(:'c1'::uuid);
select is((public.create_withdrawal(:'c1'::uuid, 500, null, 'w1'))->>'status', 'pending', 'a withdrawal reserves 500 of Save');
select is(public.undo_diary_entry(:'rs1'::uuid), 'not_enough_save', 'undo refused while a withdrawal reserves the money');
select is(public.correct_diary_entry(:'rs1'::uuid, 400, 'birthday', 'Nani', 'rsf1'), '{"status": "not_enough_save"}'::jsonb,
  'a fix down to 400 is refused (Save would drop below the reserved 500)');
select is(public.balance(:'c1'::uuid, 'save'), 1000::bigint, 'refusals post nothing');
select (public.correct_diary_entry(:'rs1'::uuid, 600, 'birthday', 'Nani', 'rsf2'))->>'entry_id' as rs2 \gset
select is(public.balance(:'c1'::uuid, 'save'), 600::bigint, 'a fix down to 600 keeps the reserved 500');
select tests.clear_auth();
select is(
  (select payload::text from public.notifications where kind = 'entry_corrected' and source_id = :'rs2'::uuid and recipient_id = :'pa'::uuid),
  '{"kind": "gift_in", "amount_minor": 600, "old_amount_minor": 1000}', 'entry_corrected names the kind and both amounts');

-- Money received into Spend can be undone (C1 Spend 700).
select tests.authenticate_as(:'c1'::uuid);
select (public.record_money_received(:'c1'::uuid, 200, 'spend', 'job', null, 'r2'))->>'entry_id' as rj \gset
select is(public.balance(:'c1'::uuid, 'spend'), 900::bigint, 'Spend 900 with the job money');
select is(public.undo_diary_entry(:'rj'::uuid), 'undone', 'money received is undone');
select is(public.balance(:'c1'::uuid, 'spend'), 700::bigint, 'Spend back to 700');
select is(
  (select r.direction || ':' || r.category || ':' || (r.occurred_at = e.occurred_at)::text
   from public.ledger_entries r join public.ledger_entries e on e.id = r.reverses_entry_id
   where r.reverses_entry_id = :'rj'::uuid),
  'out:job:true', 'the reversal goes out, copies the category and keeps the line''s occurred_at');
select is(public.undo_purchase(:'rj'::uuid), 'already_undone', 'undo_purchase is an alias of undo_diary_entry');

-- ---------------------------------------------------------------------------
-- Fix a purchase (C1 Spend 700)
-- ---------------------------------------------------------------------------

select (public.record_purchase(:'c1'::uuid, 500, 'Crisps', 'f', p_category => 'snacks'))->>'entry_id' as f0 \gset
select is(public.balance(:'c1'::uuid, 'spend'), 200::bigint, 'Spend 200 after a 500 purchase');
select public.correct_diary_entry(:'f0'::uuid, 350, 'snacks', 'Crisps', 'fx1') as rf1 \gset
select is((:'rf1'::jsonb)->>'status', 'fixed', 'a fix from 500 to 350 is fixed');
select (:'rf1'::jsonb)->>'entry_id' as f1 \gset
select is(public.balance(:'c1'::uuid, 'spend'), 350::bigint, 'Spend is 700 - 350: the purchase counts once at its new amount');
select is(public.correct_diary_entry(:'f0'::uuid, 350, 'snacks', 'Crisps', 'fx1'), :'rf1'::jsonb, 'a repeated key returns the first result');
select is(
  (select replaced from public.list_ledger_history(:'c1'::uuid) h where h.id = :'f0'::uuid),
  true, 'history marks the old line replaced');
select is(
  (select h.prev_amount_minor::text || ':' || h.prev_category || ':' || h.prev_label || ':' || (h.corrects_entry_id = :'f0'::uuid)::text
     || ':' || h.replaced::text || ':' || h.reversed::text || ':' || h.category
   from public.list_ledger_history(:'c1'::uuid) h where h.id = :'f1'::uuid),
  '500:snacks:Crisps:true:false:false:snacks', 'the new line shows what it was');
select is(
  (select (n.occurred_at = o.occurred_at)::text || ':' || n.idempotency_key || ':'
     || (select r.idempotency_key || ':' || (r.occurred_at = o.occurred_at)::text from public.ledger_entries r where r.reverses_entry_id = o.id)
   from public.ledger_entries n join public.ledger_entries o on o.id = n.corrects_entry_id
   where n.id = :'f1'::uuid),
  'true:fix:' || :'c1' || ':fx1:reversal:' || :'f0' || ':true', 'reversal and new line keep the original occurred_at; keys');
select tests.clear_auth();
select is(
  (select count(*)::int from public.notifications where kind = 'entry_corrected' and source_id = :'f1'::uuid and recipient_id = :'pa'::uuid),
  1, 'one entry_corrected notice for the new amount');

select tests.authenticate_as(:'c1'::uuid);
select is(public.correct_diary_entry(:'f0'::uuid, 300, 'snacks', 'Crisps', 'fx9'), '{"status": "not_fixable"}'::jsonb,
  'a second fix of the replaced line is not_fixable');
select throws_ok(format($$select public.undo_diary_entry(%L)$$, :'f0'), '22023', null, 'undo of a replaced line raises 22023');

select (public.correct_diary_entry(:'f1'::uuid, 350, 'games', 'Crisps', 'fx2'))->>'entry_id' as f2 \gset
select is((select category from public.ledger_entries where id = :'f2'::uuid), 'games', 'a category-only fix is fixed');
select tests.clear_auth();
select is(
  (select count(*)::int from public.notifications where kind = 'entry_corrected' and source_id = :'f2'::uuid),
  0, 'a category-only fix sends no entry_corrected notice');

select tests.authenticate_as(:'c1'::uuid);
select is(public.correct_diary_entry(:'f2'::uuid, 350, 'games', '  Crisps ', 'fx3'), '{"status": "unchanged"}'::jsonb,
  'identical values are unchanged');
select is(public.correct_diary_entry(:'f2'::uuid, 10000, 'games', 'Crisps', 'fx4'), '{"status": "not_enough_spend", "free_minor": 350}'::jsonb,
  'a fix past the free Spend is refused with the free amount');
select is(
  (select string_agg(v.amount_minor::text || ':' || v.category, ',' order by v.n)
   from public.list_entry_versions(:'f0'::uuid) with ordinality as v(id, amount_minor, category, label, created_at, n)),
  '500:snacks,350:snacks,350:games', 'list_entry_versions returns the whole chain, oldest first');
select is(
  (select count(*)::int from public.list_entry_versions(:'f2'::uuid)), 3, 'from any line of the chain');

-- Who may fix and read versions.
select tests.authenticate_as(:'pa'::uuid);
select throws_ok(format($$select public.correct_diary_entry(%L, 300, 'games', null, 'fp')$$, :'f2'), 'JA403', null, 'a parent cannot fix');
select is((select count(*)::int from public.list_entry_versions(:'f2'::uuid)), 3, 'a parent reads the versions');
select tests.authenticate_as(:'c2'::uuid);
select throws_ok(format($$select public.correct_diary_entry(%L, 300, 'games', null, 'fs')$$, :'f2'), 'JA403', null, 'another child cannot fix');
select throws_ok(format($$select * from public.list_entry_versions(%L)$$, :'f2'), 'JA403', null, 'another child cannot read the versions');
select throws_ok($$select public.correct_diary_entry(gen_random_uuid(), 300, 'games', null, 'fm')$$, 'JA403', null, 'a missing entry is JA403');
select tests.authenticate_as(:'c1'::uuid);
select is(public.correct_diary_entry(:'seed1'::uuid, 300, 'other', null, 'fa'), '{"status": "not_fixable"}'::jsonb,
  'an allowance line is not_fixable');

-- ---------------------------------------------------------------------------
-- Windows count from the root's created_at (as postgres with C1's claims)
-- ---------------------------------------------------------------------------

-- In one transaction every row shares created_at = now(), so the root is backdated 3 days
-- (as postgres) to tell the root's created_at apart from the current line's (C1 Spend 350).
select tests.clear_auth();
select set_config('request.jwt.claims', jsonb_build_object('sub', :'c1', 'role', 'authenticated')::text, true);
select (public.record_purchase_at(:'c1'::uuid, 100, 'Bus', 'win', now()))->>'entry_id' as w0 \gset
update public.ledger_entries set created_at = now() - interval '3 days' where id = :'w0'::uuid;
select (public.correct_diary_entry_at(:'w0'::uuid, 80, 'travel', 'Bus', 'wf1', now()))->>'entry_id' as w1 \gset
select is(
  (select (h.window_from = now() - interval '3 days')::text || ':'
     || (h.window_from < (select n.created_at from public.ledger_entries n where n.id = :'w1'::uuid))::text
   from public.list_ledger_history(:'c1'::uuid) h where h.id = :'w1'::uuid),
  'true:true', 'window_from is the root''s created_at, not the current line''s');
-- Root + 7 days + 1 s is now() + 4 days + 1 s; the current line alone would still allow it.
select is(
  public.correct_diary_entry_at(:'w1'::uuid, 60, 'travel', 'Bus', 'wf2', now() + interval '4 days 1 second'),
  '{"status": "not_fixable"}'::jsonb, 'a fix 7 days and 1 second after the root is not_fixable');
select public.correct_diary_entry_at(:'w1'::uuid, 60, 'travel', 'Bus', 'wf3', now() + interval '4 days') as rw2 \gset
select is((:'rw2'::jsonb)->>'status', 'fixed', 'a fix exactly 7 days after the root is fixed');
select (:'rw2'::jsonb)->>'entry_id' as w2 \gset
-- Root + 24 h + 1 s is two days before the current line was written: only the root makes it late.
select is(public.undo_diary_entry_at(:'w2'::uuid, now() - interval '2 days' + interval '1 second'), 'too_late',
  'undo 24 hours and 1 second after the root is too_late');
select is(public.undo_diary_entry_at(:'w2'::uuid, now() - interval '2 days'), 'undone',
  'undo exactly 24 hours after the root is undone');

-- A purchase stamped 6 days ago (synced late) still has its full undo and fix time.
select (public.record_purchase_at(:'c1'::uuid, 100, null, 'late', p_now => now() - interval '6 days'))->>'entry_id' as late \gset
select tests.authenticate_as(:'c1'::uuid);
select (public.correct_diary_entry(:'late'::uuid, 120, 'other', null, 'fl'))->>'entry_id' as late2 \gset
select is((select amount_minor from public.ledger_entries where id = :'late2'::uuid), 120::bigint, 'a purchase from 6 days ago can be fixed now');
select is(public.undo_diary_entry(:'late2'::uuid), 'undone', 'and its fixed line can be undone now');

-- ---------------------------------------------------------------------------
-- Money received into Spend cannot be undone past the overspend rule (C2, Spend 0)
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'c2'::uuid);
select (public.record_money_received(:'c2'::uuid, 2000, 'spend', 'family', null, 'g1'))->>'entry_id' as g1 \gset
select is((public.record_purchase(:'c2'::uuid, 1500, null, 'p1'))->>'status', 'recorded', 'C2 spends 1500 of the 2000');
select is(public.undo_diary_entry(:'g1'::uuid), 'not_enough_spend', 'undoing the 2000 would push Spend below zero');
select is(public.balance(:'c2'::uuid, 'spend'), 500::bigint, 'the refused undo posts nothing');

-- ---------------------------------------------------------------------------
-- A fix over the item limit sends no second notice (C2, Spend 500)
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'pa'::uuid);
select public.set_money_rule(:'c2'::uuid, 'spend_limit', 'item', 250);
select tests.authenticate_as(:'c2'::uuid);
select public.record_purchase(:'c2'::uuid, 300, null, 'l1') as rl1 \gset
select is((:'rl1'::jsonb)->>'notices', '1', 'a 300 purchase crosses the 250 item limit');
select is((public.correct_diary_entry(((:'rl1'::jsonb)->>'entry_id')::uuid, 400, 'other', null, 'lf1'))->>'status', 'fixed',
  'the purchase is fixed to 400');
select tests.clear_auth();
select is(
  (select count(*)::int || '|' || min(window_key) from public.notifications where child_id = :'c2'::uuid and kind = 'limit_exceeded' and recipient_id = :'pa'::uuid),
  '1|spend_limit:item:' || ((:'rl1'::jsonb)->>'entry_id'), 'one item notice, keyed by the first line of the chain');

-- ---------------------------------------------------------------------------
-- Fixing money received lower than Spend allows (C3, Spend 0)
-- ---------------------------------------------------------------------------

select tests.create_user('c3@example.com', 'child') as c3 \gset
select tests.create_user('c4@example.com', 'child') as c4 \gset
select tests.authenticate_as(:'pa'::uuid);
select public.register_child(:'c3'::uuid, :'fa'::uuid, 'Kit', '1234', true);
select public.register_child(:'c4'::uuid, :'fa'::uuid, 'Zed', '1234', true);
select tests.authenticate_as(:'c3'::uuid);
select (public.record_money_received(:'c3'::uuid, 2000, 'spend', 'family', null, 'h1'))->>'entry_id' as h1 \gset
select is((public.record_purchase(:'c3'::uuid, 1500, null, 'hp1'))->>'status', 'recorded', 'C3 spends 1500 of the 2000');
select is(public.correct_diary_entry(:'h1'::uuid, 400, 'family', null, 'hf1'),
  '{"status": "not_enough_spend", "free_minor": 500}'::jsonb, 'fixing the 2000 down to 400 would push Spend below zero');
select is(public.balance(:'c3'::uuid, 'spend'), 500::bigint, 'the refused fix posts nothing');

-- ---------------------------------------------------------------------------
-- Overspend on with a pending deposit: Spend may not drop below what is held (C4)
-- Guard: overspend on and held_spend > 0 refuses when balance - amount < held_spend.
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'pa'::uuid);
select public.set_allow_negative_spend(:'c4'::uuid, true);
select tests.authenticate_as(:'c4'::uuid);
select (public.record_money_received(:'c4'::uuid, 2000, 'spend', 'family', null, 'k1'))->>'entry_id' as k1 \gset
select is((public.create_deposit(:'c4'::uuid, 500, 'kd1'))->>'status', 'pending', 'C4 has a pending deposit of 500 held from Spend');
-- 2000 - 1900 = 100 < 500 held
select is(public.correct_diary_entry(:'k1'::uuid, 100, 'family', null, 'kf1'),
  '{"status": "not_enough_spend", "free_minor": 1500}'::jsonb, 'overspend on: a fix that takes Spend below the held 500 is refused');
-- 2000 - 2000 = 0 < 500 held
select is(public.undo_diary_entry(:'k1'::uuid), 'not_enough_spend', 'overspend on: an undo that takes Spend below the held 500 is refused');
select is(public.balance(:'c4'::uuid, 'spend'), 2000::bigint, 'the refused fix and undo post nothing');
-- 2000 - 1400 = 600 >= 500 held
select is((public.correct_diary_entry(:'k1'::uuid, 600, 'family', null, 'kf2'))->>'status', 'fixed',
  'overspend on: a fix that leaves Spend at the held 500 or more is allowed');
select is(public.balance(:'c4'::uuid, 'spend'), 600::bigint, 'Spend is 600 after the fix');
select tests.clear_auth();

select * from finish();
rollback;
