-- Parent notes (parent dashboard, spec answer 8, 2026-11-03): a parent sends their child a short
-- note from the dashboard, and it lands in the child's News as a notice. No new table: the
-- notice row is the note. `source_id` is the parent who wrote it; `window_key` carries the
-- sheet's idempotency key, so a re-send after a lost response makes one notice (the dedupe
-- index on recipient, kind, child and window_key).

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'limit_exceeded', 'withdrawal_requested', 'withdrawal_decided',
  'deposit_requested', 'deposit_decided',
  'emergency_requested', 'emergency_decided',
  'allowance_due', 'handover_reminder',
  'card_charge_failed',
  'money_received', 'entry_corrected',
  'jar_moved',
  'parent_note'
));

alter table public.notifications drop constraint notifications_source_type_check;
alter table public.notifications add constraint notifications_source_type_check
  check (source_type in ('ledger_entry', 'request', 'allowance_occurrence', 'payment', 'note'));

comment on column public.notifications.source_id is 'Originating ledger entry, request, allowance occurrence or payment; for a parent_note, the parent who wrote it. Polymorphic, no FK.';

-- At most this many notes to one child per rolling day, from all their parents together.
create or replace function public.send_child_note(
  p_child_id uuid,
  p_text text,
  p_idempotency_key text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  -- Every kind of whitespace, not only spaces: a direct call can skip the app's own trim.
  v_text text := nullif(pg_catalog.regexp_replace(p_text, '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
  v_key text := nullif(pg_catalog.btrim(p_idempotency_key), '');
  v_family_id uuid;
  v_sent int;
begin
  if not public.is_parent_of(p_child_id) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.profile_id = p_child_id
    and fm.role = 'child'
    and fm.status = 'approved';
  if v_family_id is null then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  if v_text is null or pg_catalog.char_length(v_text) > 140
     or v_key is null or pg_catalog.char_length(v_key) > 200 then
    raise exception using errcode = '22023', message = 'Invalid note';
  end if;

  -- One writer at a time per child, so two sends can't both slip under the cap.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('note:' || p_child_id::text, 0));

  -- A repeat of the same key is answered before the cap, so a retry never reads as too many.
  if exists (
    select 1 from public.notifications n
    where n.recipient_id = p_child_id
      and n.child_id = p_child_id
      and n.kind = 'parent_note'
      and n.window_key = 'note:' || v_key
  ) then
    return 'already_sent';
  end if;

  if (
    select pg_catalog.count(*) from public.notifications n
    where n.recipient_id = p_child_id
      and n.kind = 'parent_note'
      and n.created_at > pg_catalog.now() - interval '1 day'
  ) >= 20 then
    raise exception using errcode = 'JA429', message = 'Too many notes';
  end if;

  v_sent := public.notify_child(
    p_child_id, 'parent_note', 'note', v_uid, 'note:' || v_key,
    pg_catalog.jsonb_build_object('text', v_text));
  if v_sent = 0 then
    -- The child stopped being an approved member between the check and the insert.
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  -- The audit row records that a note went, never what it said.
  insert into public.audit_log (family_id, actor_id, action, subject_id, details)
  values (v_family_id, v_uid, 'note.sent', p_child_id, '{}'::jsonb);
  return 'sent';
end;
$$;

comment on function public.send_child_note(uuid, text, text) is
  'A parent sends their approved child a note (1 to 140 characters) as a parent_note notice; returns sent, or already_sent for a repeat key. At most 20 per child per rolling day (JA429). Audits note.sent without the text. JA403, 22023.';

revoke execute on function public.send_child_note(uuid, text, text) from public, anon;
grant execute on function public.send_child_note(uuid, text, text) to authenticated;
