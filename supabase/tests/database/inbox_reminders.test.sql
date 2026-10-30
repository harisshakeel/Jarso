begin;
\ir _helpers.psql
select plan(27);

select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('c1@example.com', 'child') as c1 \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select tests.clear_auth();
insert into public.family_members (family_id, profile_id, role, status)
values (:'fa'::uuid, :'pb'::uuid, 'parent', 'approved');

-- Anchor far in the future so the generator never adds rows; occurrences are inserted by hand.
insert into public.allowance_schedules (family_id, child_id, amount_minor, frequency, anchor_on)
values (:'fa'::uuid, :'c1'::uuid, 500, 'weekly', date '2030-01-01')
returning id as s1 \gset

insert into public.allowance_occurrences (schedule_id, family_id, child_id, period_key, due_on, amount_minor)
values (:'s1'::uuid, :'fa'::uuid, :'c1'::uuid, 'p1', date '2026-11-02', 500)
returning id as o1 \gset

-- Access
select tests.authenticate_as(:'pa'::uuid);
select throws_ok($$select public.send_handover_reminders()$$, '42501', null, 'authenticated cannot run reminders');
select tests.clear_auth();

-- Due day
select is(public.send_handover_reminders('2026-11-02 10:00Z'), 3, 'due day: two parents and the child');
select is((select count(*)::int from public.notifications where kind = 'allowance_due' and recipient_id in (:'pa'::uuid, :'pb'::uuid)), 2, 'two parent allowance_due rows');
select is((select count(*)::int from public.notifications where kind = 'allowance_due' and recipient_id = :'c1'::uuid), 1, 'one child allowance_due row');
select is((select count(*)::int from public.notifications where source_type = 'allowance_occurrence' and source_id = :'o1'::uuid), 3, 'rows point at the occurrence');
select is(public.send_handover_reminders('2026-11-02 18:00Z'), 0, 'rerun the same day adds nothing');

-- Quiet days, then the 3-day mark
select is(public.send_handover_reminders('2026-11-03 10:00Z'), 0, 'day 1: nothing');
select is(public.send_handover_reminders('2026-11-04 10:00Z'), 0, 'day 2: nothing');
select is(public.send_handover_reminders('2026-11-05 10:00Z'), 2, 'day 3: reminder to both parents');
select is((select count(*)::int from public.notifications where kind = 'handover_reminder' and recipient_id = :'c1'::uuid), 0, 'child gets no handover reminder');
select is(public.send_handover_reminders('2026-11-05 20:00Z'), 0, 'rerun the same day adds nothing');
select is(public.send_handover_reminders('2026-11-08 10:00Z'), 2, 'day 6: two more');
select is((select (payload->>'days_overdue')::int from public.notifications where kind = 'handover_reminder' and window_key = :'o1' || ':2026-11-08' limit 1), 6, 'payload carries days_overdue');

-- Review Focus 1: handed over between runs
update public.allowance_occurrences set status = 'confirmed', cash_minor = 500, saved_minor = 0, confirmed_at = now() where id = :'o1'::uuid;
select is(public.send_handover_reminders('2026-11-11 10:00Z'), 0, 'confirmed occurrence gets no reminder');

-- Late first sight
insert into public.allowance_occurrences (schedule_id, family_id, child_id, period_key, due_on, amount_minor)
values (:'s1'::uuid, :'fa'::uuid, :'c1'::uuid, 'p2', date '2026-10-31', 500)
returning id as o2 \gset
select is(public.send_handover_reminders('2026-11-02 10:00Z'), 0, 'first seen at day 2: waits');
select is(public.send_handover_reminders('2026-11-03 10:00Z'), 2, 'day 3: reminder');
select is((select count(*)::int from public.notifications where source_id = :'o2'::uuid and kind = 'allowance_due'), 0, 'no due notice for a late first sight');

-- Paused schedule still reminds
update public.allowance_schedules set status = 'paused' where id = :'s1'::uuid;
insert into public.allowance_occurrences (schedule_id, family_id, child_id, period_key, due_on, amount_minor)
values (:'s1'::uuid, :'fa'::uuid, :'c1'::uuid, 'p3', date '2026-10-19', 500);
select is(public.send_handover_reminders('2026-11-03 10:00Z'), 2, 'paused schedule: old due occurrence still reminds');

-- Gifts untouched
select is((select count(*)::int from public.notifications n where n.source_type = 'allowance_occurrence' and exists (select 1 from public.parent_gifts g where g.id = n.source_id)), 0, 'no notice points at a parent gift');

-- Read state
select id as a_row from public.notifications where recipient_id = :'pa'::uuid order by created_at, id limit 1 \gset
select id as b_row from public.notifications where recipient_id = :'pb'::uuid order by created_at, id limit 1 \gset
select count(*)::int as a_total from public.notifications where recipient_id = :'pa'::uuid \gset

select tests.authenticate_as(:'pa'::uuid);
select is(public.unread_notification_count(), :a_total, 'unread count before');
select is(public.mark_notifications_read(array[:'a_row'::uuid]), 1, 'marks own row');
select is(public.mark_notifications_read(array[:'b_row'::uuid]), 0, 'cannot mark another recipient''s row');
select is(public.unread_notification_count(), :a_total - 1, 'unread count after one');
select is(public.mark_notifications_read(null), :a_total - 1, 'null marks all remaining own rows');
select is(public.unread_notification_count(), 0, 'unread count zero');
select throws_ok($$update public.notifications set read_at = null$$, '42501', null, 'direct update denied');
select tests.clear_auth();
select is((select count(*)::int from public.notifications where recipient_id = :'pb'::uuid and read_at is not null), 0, 'other parent unread state unchanged');

select * from finish();
rollback;
