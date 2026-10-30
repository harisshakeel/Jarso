-- Inbox: allowance due / handover reminder notices and per-recipient read state.
-- Notices are still written only by the internal notify_* functions.

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'limit_exceeded', 'withdrawal_requested', 'withdrawal_decided',
  'deposit_requested', 'deposit_decided',
  'allowance_due', 'handover_reminder'
));

alter table public.notifications drop constraint notifications_source_type_check;
alter table public.notifications add constraint notifications_source_type_check
  check (source_type in ('ledger_entry', 'request', 'allowance_occurrence'));

-- ---------------------------------------------------------------------------
-- Reminders: a due notice on the due date, then a reminder every third day
-- while the occurrence is still 'due'. One bad row must not stop the rest.
-- ---------------------------------------------------------------------------

create or replace function public.send_handover_reminders(p_now timestamptz default now())
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_o record;
  v_today date;
  v_days int;
  v_payload jsonb;
  v_inserted int := 0;
begin
  for v_o in
    select o.id, o.family_id, o.child_id, o.due_on, o.amount_minor
    from public.allowance_occurrences o
    where o.status = 'due'
    order by o.due_on, o.id
  loop
    v_today := public.family_today(v_o.family_id, p_now);
    continue when v_today is null;
    v_days := v_today - v_o.due_on;
    continue when v_days < 0 or (v_days > 0 and v_days % 3 <> 0);

    v_payload := pg_catalog.jsonb_build_object(
      'amount_minor', v_o.amount_minor, 'due_on', v_o.due_on, 'days_overdue', v_days
    );

    if v_days = 0 then
      v_inserted := v_inserted
        + public.notify_parents(v_o.child_id, 'allowance_due', 'allowance_occurrence', v_o.id, v_o.id::text || ':due', v_payload)
        + public.notify_child(v_o.child_id, 'allowance_due', 'allowance_occurrence', v_o.id, v_o.id::text || ':due', v_payload);
    else
      v_inserted := v_inserted
        + public.notify_parents(v_o.child_id, 'handover_reminder', 'allowance_occurrence', v_o.id, v_o.id::text || ':' || v_today::text, v_payload);
    end if;
  end loop;

  return v_inserted;
end;
$$;

comment on function public.send_handover_reminders(timestamptz) is
  'Cron job, no grants. For each allowance occurrence still ''due'': on the due date (family-local) notifies the parents and the child (allowance_due); every third day after, notifies the parents (handover_reminder). Deduplicated per day by window_key, so reruns add nothing. An occurrence first seen late waits for its next 3-day mark. Returns rows inserted.';

revoke execute on function public.send_handover_reminders(timestamptz) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'send-handover-reminders',
      '7 * * * *',
      $cmd$set local statement_timeout = '60s'; select public.send_handover_reminders()$cmd$
    );
  else
    raise warning 'pg_cron not available: send-handover-reminders not scheduled';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Read state: the recipient only; notifications stay without update grants.
-- ---------------------------------------------------------------------------

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  update public.notifications n
  set read_at = pg_catalog.now()
  where n.recipient_id = (select auth.uid())
    and n.read_at is null
    and (p_ids is null or n.id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.mark_notifications_read(uuid[]) is
  'Marks the caller''s own unread notices read (the given ids, or all when null). Returns the count.';

create or replace function public.unread_notification_count()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.count(*)::int
  from public.notifications n
  where n.recipient_id = (select auth.uid())
    and n.read_at is null
    and public.is_approved_member(n.family_id);
$$;

comment on function public.unread_notification_count() is
  'The caller''s unread notices in families they are an approved member of.';

revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
revoke execute on function public.unread_notification_count() from public, anon;
grant execute on function public.unread_notification_count() to authenticated;
