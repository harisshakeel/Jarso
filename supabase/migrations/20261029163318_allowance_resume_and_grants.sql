-- Allowance hardening from the slice 2 review. Bodies are otherwise unchanged from
-- 20261029130002_allowance_schedules; create or replace keeps the existing grants.
--
-- 1. resume_allowance after a dated pause that had already ended (the hourly job had not yet
--    resumed it) skipped every period before today, including those after the pause.
-- 2. change_allowance while paused through a date accepted a next date inside the pause,
--    which auto-resume then skipped without a word.
-- 3. Internal helpers kept EXECUTE for service_role through Supabase's default privileges.

create or replace function public.change_allowance(
  p_schedule_id uuid,
  p_amount_minor bigint,
  p_frequency text,
  p_next_on date
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_s public.allowance_schedules;
  v_today date;
  v_last_due date;
  v_keep_anchor boolean;
begin
  v_s := public.lock_allowance_for_parent(p_schedule_id);
  if v_s.status = 'stopped' then
    raise exception using errcode = 'JA409', message = 'Allowance has stopped';
  end if;

  if p_amount_minor is null or p_amount_minor <= 0 or p_amount_minor > 100000000000
     or p_frequency is null or p_frequency not in ('weekly', 'monthly', 'quarterly', 'annual') then
    raise exception using errcode = '22023', message = 'Invalid allowance';
  end if;

  v_today := public.family_today(v_s.family_id);
  perform public.generate_for_schedule(v_s.id, v_today);
  -- Catch-up may have advanced next_index.
  select s.next_index into v_s.next_index from public.allowance_schedules s where s.id = v_s.id;

  select pg_catalog.max(o.due_on) into v_last_due
  from public.allowance_occurrences o
  where o.schedule_id = v_s.id;

  if p_next_on is null or p_next_on < v_today or p_next_on > v_today + 366 or p_next_on <= v_last_due then
    raise exception using errcode = '22023', message = 'Next date must be within a year and after the last allowance';
  end if;
  -- Auto-resume skips every period through paused_through, so a next date inside the pause
  -- would silently never become due.
  if v_s.status = 'paused' and v_s.paused_through is not null and p_next_on <= v_s.paused_through then
    raise exception using errcode = '22023', message = 'Next date must be after the pause';
  end if;

  -- Same cadence and next date: keep the anchor, so a 31st stays the 31st after a short
  -- month. Anything else starts a new cadence from p_next_on.
  v_keep_anchor := p_frequency = v_s.frequency
    and p_next_on = public.allowance_due_on(v_s.anchor_on, v_s.frequency, v_s.next_index);

  update public.allowance_schedules
  set amount_minor = p_amount_minor,
      frequency = p_frequency,
      anchor_on = case when v_keep_anchor then v_s.anchor_on else p_next_on end,
      next_index = case when v_keep_anchor then v_s.next_index else 0 end
  where id = v_s.id;

  insert into public.audit_log (family_id, actor_id, action, subject_id, details)
  values (
    v_s.family_id, v_uid, 'allowance.changed', v_s.id,
    pg_catalog.jsonb_build_object(
      'amount_minor', p_amount_minor, 'frequency', p_frequency, 'next_on', p_next_on,
      'previous_amount_minor', v_s.amount_minor, 'previous_frequency', v_s.frequency
    )
  );

  -- A next date of today is due now (no-op while paused).
  perform public.generate_for_schedule(v_s.id, v_today);

  return v_s.id;
end;
$$;

comment on function public.change_allowance(uuid, bigint, text, date) is 'Parent changes amount/frequency from p_next_on. Same frequency and p_next_on = the current next due date keeps the anchor; otherwise p_next_on is the new anchor. Generated occurrences keep their amount (D6); a next date of today is due at once. JA403, JA409 (stopped), 22023 (bad values, amount over 100000000000, or p_next_on outside today..today + 366 or not after the last generated due date, or on or before paused_through while paused).';

create or replace function public.resume_allowance(p_schedule_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_s public.allowance_schedules;
  v_today date;
  v_index int;
begin
  v_s := public.lock_allowance_for_parent(p_schedule_id);
  if v_s.status <> 'paused' then
    raise exception using errcode = 'JA409', message = 'Allowance is not paused';
  end if;

  v_today := public.family_today(v_s.family_id);

  -- Skip periods that fell in the pause: before today and, for a dated pause, through
  -- paused_through. A dated pause that already ended (the hourly job hasn't resumed it yet)
  -- keeps the periods after it, like the job's own auto-resume.
  v_index := v_s.next_index;
  while public.allowance_due_on(v_s.anchor_on, v_s.frequency, v_index) < v_today
    and (v_s.paused_through is null
         or public.allowance_due_on(v_s.anchor_on, v_s.frequency, v_index) <= v_s.paused_through) loop
    v_index := v_index + 1;
  end loop;

  update public.allowance_schedules
  set status = 'active',
      next_index = v_index,
      paused_through = null,
      pause_message = null
  where id = v_s.id;

  perform public.generate_for_schedule(v_s.id, v_today);

  insert into public.audit_log (family_id, actor_id, action, subject_id, details)
  values (
    v_s.family_id, v_uid, 'allowance.resumed', v_s.id,
    pg_catalog.jsonb_build_object('skipped_periods', v_index - v_s.next_index)
  );

  return v_s.id;
end;
$$;

comment on function public.resume_allowance(uuid) is 'Parent resumes a paused allowance. Periods inside the pause stay skipped (before today, and through paused_through for a dated pause); later ones, including a period due today, become due. JA403, JA409 (not paused).';

-- Internal helpers: only other security definer functions (and pg_cron, as the owner) call them.
revoke execute on function
  public.generate_for_schedule(uuid, date),
  public.lock_allowance_for_parent(uuid),
  public.lock_occurrence_for_parent(uuid),
  public.lock_gift_for_parent(uuid),
  public.generate_due_occurrences(timestamptz)
from service_role;
