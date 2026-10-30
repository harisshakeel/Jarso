begin;
\ir _helpers.psql
select plan(32);

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

-- A pending gift due the same day: the reminder job must ignore gifts.
insert into public.parent_gifts (family_id, child_id, amount_minor, give_on, idempotency_key)
values (:'fa'::uuid, :'c1'::uuid, 300, date '2026-11-02', gen_random_uuid())
returning id as g1 \gset

-- Access
select tests.authenticate_as(:'pa'::uuid);
select throws_ok($$select public.send_handover_reminders()$$, '42501', null, 'authenticated cannot run reminders');
select tests.clear_auth();

-- Due day
select public.send_handover_reminders('2026-11-02 10:00Z') as r \gset
select is((select count(*)::int from public.notifications where family_id = :'fa'::uuid), 3, 'due day: two parents and the child');
select is((select count(*)::int from public.notifications where kind = 'allowance_due' and recipient_id in (:'pa'::uuid, :'pb'::uuid)), 2, 'two parent allowance_due rows');
select is((select count(*)::int from public.notifications where kind = 'allowance_due' and recipient_id = :'c1'::uuid), 1, 'one child allowance_due row');
select is((select count(*)::int from public.notifications where source_type = 'allowance_occurrence' and source_id = :'o1'::uuid), 3, 'rows point at the occurrence');
select public.send_handover_reminders('2026-11-02 18:00Z') as r \gset
select is((select count(*)::int from public.notifications where family_id = :'fa'::uuid), 3, 'rerun the same day adds nothing');

-- Quiet days, then the 3-day mark
select public.send_handover_reminders('2026-11-03 10:00Z') as r \gset
select is((select count(*)::int from public.notifications where family_id = :'fa'::uuid), 3, 'day 1: nothing');
select public.send_handover_reminders('2026-11-04 10:00Z') as r \gset
select is((select count(*)::int from public.notifications where family_id = :'fa'::uuid), 3, 'day 2: nothing');
select public.send_handover_reminders('2026-11-05 10:00Z') as r \gset
select is((select count(*)::int from public.notifications where family_id = :'fa'::uuid), 5, 'day 3: reminder to both parents');
select is((select count(*)::int from public.notifications where kind = 'handover_reminder' and recipient_id = :'c1'::uuid), 0, 'child gets no handover reminder');
select public.send_handover_reminders('2026-11-05 20:00Z') as r \gset
select is((select count(*)::int from public.notifications where family_id = :'fa'::uuid), 5, 'rerun the same day adds nothing');
select public.send_handover_reminders('2026-11-08 10:00Z') as r \gset
select is((select count(*)::int from public.notifications where family_id = :'fa'::uuid), 7, 'day 6: two more');
select is((select (payload->>'days_overdue')::int from public.notifications where kind = 'handover_reminder' and window_key = :'o1' || ':2026-11-08' limit 1), 6, 'payload carries days_overdue');

-- Review Focus 1: handed over between runs
update public.allowance_occurrences set status = 'confirmed', cash_minor = 500, saved_minor = 0, confirmed_at = now() where id = :'o1'::uuid;
select public.send_handover_reminders('2026-11-11 10:00Z') as r \gset
select is((select count(*)::int from public.notifications where family_id = :'fa'::uuid), 7, 'confirmed occurrence gets no reminder');

-- Late first sight
insert into public.allowance_occurrences (schedule_id, family_id, child_id, period_key, due_on, amount_minor)
values (:'s1'::uuid, :'fa'::uuid, :'c1'::uuid, 'p2', date '2026-10-31', 500)
returning id as o2 \gset
select public.send_handover_reminders('2026-11-02 10:00Z') as r \gset
select is((select count(*)::int from public.notifications where family_id = :'fa'::uuid), 7, 'first seen at day 2: waits');
select public.send_handover_reminders('2026-11-03 10:00Z') as r \gset
select is((select count(*)::int from public.notifications where family_id = :'fa'::uuid), 9, 'day 3: reminder');
select is((select count(*)::int from public.notifications where source_id = :'o2'::uuid and kind = 'allowance_due'), 0, 'no due notice for a late first sight');

-- Paused schedule still reminds
update public.allowance_schedules set status = 'paused' where id = :'s1'::uuid;
insert into public.allowance_occurrences (schedule_id, family_id, child_id, period_key, due_on, amount_minor)
values (:'s1'::uuid, :'fa'::uuid, :'c1'::uuid, 'p3', date '2026-10-19', 500);
select public.send_handover_reminders('2026-11-03 10:00Z') as r \gset
select is((select count(*)::int from public.notifications where family_id = :'fa'::uuid), 11, 'paused schedule: old due occurrence still reminds');

-- Gifts untouched
select is((select count(*)::int from public.notifications where source_id = :'g1'::uuid), 0, 'no notice points at a pending parent gift');

-- Job log: every run writes a finished job_runs row (job_runs.started_at is this transaction's now()).
select is((select count(*)::int from public.job_runs where job = 'send-handover-reminders' and started_at = now() and status = 'ok' and finished_at is not null), 11, 'each reminder run is logged as ok in job_runs');

-- One failing occurrence is isolated: the run ends as error, names it, and later occurrences still notify.
insert into public.allowance_occurrences (schedule_id, family_id, child_id, period_key, due_on, amount_minor)
values (:'s1'::uuid, :'fa'::uuid, :'c1'::uuid, 'p4', date '2026-11-17', 500)
returning id as o4 \gset
insert into public.allowance_occurrences (schedule_id, family_id, child_id, period_key, due_on, amount_minor)
values (:'s1'::uuid, :'fa'::uuid, :'c1'::uuid, 'p5', date '2026-11-20', 500)
returning id as o5 \gset
create function tests.fail_for_o4() returns trigger language plpgsql as $$
begin
  raise exception 'test failure for this occurrence';
end;
$$;
create trigger fail_for_o4 before insert on public.notifications
  for each row when (new.source_id = :'o4'::uuid) execute function tests.fail_for_o4();

select public.send_handover_reminders('2026-11-20 10:00Z') as r \gset
select is((select count(*)::int from public.notifications where source_id = :'o4'::uuid), 0, 'failing occurrence creates no notices');
select is((select count(*)::int from public.notifications where source_id = :'o5'::uuid and kind = 'allowance_due'), 3, 'later occurrence still notifies after a failure');
select is((select status from public.job_runs where job = 'send-handover-reminders' and status = 'error' and started_at = now() order by finished_at desc limit 1), 'error', 'failed run is logged as error');
select is((select details->'errors'->0->>'occurrence_id' from public.job_runs where job = 'send-handover-reminders' and status = 'error' and started_at = now() order by finished_at desc limit 1), :'o4', 'job_runs.details.errors names the failed occurrence');
drop trigger fail_for_o4 on public.notifications;

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
