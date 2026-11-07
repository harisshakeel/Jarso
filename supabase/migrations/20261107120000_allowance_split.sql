-- The allowance carries a planned Spend/Save split (ADR 0019, kid rework plan 7).
--
-- Only the Save part is stored (save_minor); Spend is always amount_minor - save_minor, so the
-- two parts add up to the amount exactly. Null means no plan (schedules made before this, and
-- callers that send none): the handover is then prefilled from the last handover as before.
-- Each generated occurrence copies the schedule's Save, like its amount (D6), so a later change
-- never rewrites an item already due. A plan is never money: nothing here writes the ledger.
--
-- No new table, so no new RLS policy: both tables keep RLS on, their select policies, and
-- definer-only writes. create_allowance and change_allowance gain a defaulted last parameter;
-- the old four-argument functions are dropped so there is one candidate per name, and callers
-- that send four named arguments (older phone builds) still resolve. list_due_for_parent
-- returns one more column, so it is dropped and recreated. Grants are restated below.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.allowance_schedules
  add column save_minor bigint,
  add constraint allowance_schedules_save_minor_check
    check (save_minor is null or (save_minor >= 0 and save_minor <= amount_minor));

comment on column public.allowance_schedules.save_minor is 'Planned Save part of each allowance, minor units, 0..amount_minor; Spend is the rest. Null = no plan (the handover prefills from the last one). Written by create_allowance / change_allowance.';

alter table public.allowance_occurrences
  add column save_minor bigint,
  add constraint allowance_occurrences_save_minor_check
    check (save_minor is null or (save_minor >= 0 and save_minor <= amount_minor));

comment on column public.allowance_occurrences.save_minor is 'Snapshot of the schedule''s planned Save at generation (like amount_minor, D6). Prefills the handover; never posts by itself.';

-- The table hides its auto-charge columns with column grants (allowance_hide_auto_charge_from_child),
-- so a new column needs its own grant. The plan is not a payment detail: the child may read it.
grant select (save_minor) on public.allowance_schedules to authenticated;

-- ---------------------------------------------------------------------------
-- Generation copies the plan (body otherwise unchanged from 20261029130002)
-- ---------------------------------------------------------------------------

create or replace function public.generate_for_schedule(p_schedule_id uuid, p_today date)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_s public.allowance_schedules;
  v_due date;
  v_index int;
  v_rows int;
  v_inserted int := 0;
begin
  if p_today is null then
    return 0;
  end if;

  select * into v_s from public.allowance_schedules s where s.id = p_schedule_id for update;
  -- Paused periods are skipped, not deferred: only active schedules generate.
  if not found or v_s.status <> 'active' then
    return 0;
  end if;

  v_index := v_s.next_index;
  loop
    v_due := public.allowance_due_on(v_s.anchor_on, v_s.frequency, v_index);
    exit when v_due is null or v_due > p_today;

    insert into public.allowance_occurrences (
      schedule_id, family_id, child_id, period_key, due_on, amount_minor, save_minor
    )
    values (
      v_s.id, v_s.family_id, v_s.child_id, pg_catalog.to_char(v_due, 'YYYY-MM-DD'), v_due,
      v_s.amount_minor, v_s.save_minor
    )
    on conflict (schedule_id, period_key) do nothing;
    get diagnostics v_rows = row_count;
    v_inserted := v_inserted + v_rows;

    v_index := v_index + 1;
  end loop;

  if v_index <> v_s.next_index then
    update public.allowance_schedules set next_index = v_index where id = v_s.id;
  end if;

  return v_inserted;
end;
$$;

comment on function public.generate_for_schedule(uuid, date) is 'Internal. Inserts every period of an active schedule due on or before p_today (idempotent), with the schedule''s amount and planned Save, and advances next_index. Returns rows inserted.';

-- ---------------------------------------------------------------------------
-- create_allowance(…, p_save_minor)
-- ---------------------------------------------------------------------------

drop function public.create_allowance(uuid, bigint, text, date);

create function public.create_allowance(
  p_child_id uuid,
  p_amount_minor bigint,
  p_frequency text,
  p_first_on date,
  p_save_minor bigint default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_family_id uuid;
  v_id uuid;
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

  if p_amount_minor is null or p_amount_minor <= 0 or p_amount_minor > 100000000000
     or p_frequency is null or p_frequency not in ('weekly', 'monthly', 'quarterly', 'annual') then
    raise exception using errcode = '22023', message = 'Invalid allowance';
  end if;
  if p_save_minor is not null and (p_save_minor < 0 or p_save_minor > p_amount_minor) then
    raise exception using errcode = '22023', message = 'Save must be from 0 to the amount';
  end if;
  if p_first_on is null or p_first_on < public.family_today(v_family_id)
     or p_first_on > public.family_today(v_family_id) + 366 then
    raise exception using errcode = '22023', message = 'First date must be from today to a year ahead';
  end if;

  begin
    insert into public.allowance_schedules (
      family_id, child_id, amount_minor, frequency, anchor_on, save_minor, created_by
    )
    values (v_family_id, p_child_id, p_amount_minor, p_frequency, p_first_on, p_save_minor, v_uid)
    returning id into v_id;
  exception when unique_violation then
    raise exception using errcode = 'JA409', message = 'Child already has an allowance';
  end;

  insert into public.audit_log (family_id, actor_id, action, subject_id, details)
  values (
    v_family_id, v_uid, 'allowance.created', v_id,
    pg_catalog.jsonb_build_object(
      'child_id', p_child_id, 'amount_minor', p_amount_minor,
      'frequency', p_frequency, 'first_on', p_first_on, 'save_minor', p_save_minor
    )
  );

  -- A first date of today is due now, not at the next job run.
  perform public.generate_for_schedule(v_id, public.family_today(v_family_id));

  return v_id;
end;
$$;

comment on function public.create_allowance(uuid, bigint, text, date, bigint) is 'Parent sets up the child''s recurring allowance with an optional planned Save (null = no plan; Spend is the rest); a first date of today is due at once. JA403, JA409 (one already active or paused), 22023 (bad amount/frequency, amount over 100000000000, Save below 0 or over the amount, or first date outside family today..today + 366).';

-- ---------------------------------------------------------------------------
-- change_allowance(…, p_save_minor) (body otherwise unchanged from 20261029163318)
-- ---------------------------------------------------------------------------

drop function public.change_allowance(uuid, bigint, text, date);

create function public.change_allowance(
  p_schedule_id uuid,
  p_amount_minor bigint,
  p_frequency text,
  p_next_on date,
  p_save_minor bigint default null
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
  v_save bigint;
begin
  v_s := public.lock_allowance_for_parent(p_schedule_id);
  if v_s.status = 'stopped' then
    raise exception using errcode = 'JA409', message = 'Allowance has stopped';
  end if;

  if p_amount_minor is null or p_amount_minor <= 0 or p_amount_minor > 100000000000
     or p_frequency is null or p_frequency not in ('weekly', 'monthly', 'quarterly', 'annual') then
    raise exception using errcode = '22023', message = 'Invalid allowance';
  end if;
  if p_save_minor is not null and (p_save_minor < 0 or p_save_minor > p_amount_minor) then
    raise exception using errcode = '22023', message = 'Save must be from 0 to the amount';
  end if;

  -- No Save sent (an older client, or the guide's change draft): keep the current plan while
  -- it still fits the new amount, otherwise there is no plan.
  v_save := case
    when p_save_minor is not null then p_save_minor
    when v_s.save_minor is not null and v_s.save_minor <= p_amount_minor then v_s.save_minor
    else null
  end;

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
      save_minor = v_save,
      anchor_on = case when v_keep_anchor then v_s.anchor_on else p_next_on end,
      next_index = case when v_keep_anchor then v_s.next_index else 0 end
  where id = v_s.id;

  insert into public.audit_log (family_id, actor_id, action, subject_id, details)
  values (
    v_s.family_id, v_uid, 'allowance.changed', v_s.id,
    pg_catalog.jsonb_build_object(
      'amount_minor', p_amount_minor, 'frequency', p_frequency, 'next_on', p_next_on,
      'save_minor', v_save,
      'previous_amount_minor', v_s.amount_minor, 'previous_frequency', v_s.frequency,
      'previous_save_minor', v_s.save_minor
    )
  );

  -- A next date of today is due now (no-op while paused).
  perform public.generate_for_schedule(v_s.id, v_today);

  return v_s.id;
end;
$$;

comment on function public.change_allowance(uuid, bigint, text, date, bigint) is 'Parent changes amount/frequency (and the planned Save) from p_next_on. p_save_minor null keeps the current Save when it fits the new amount, else clears it. Same frequency and p_next_on = the current next due date keeps the anchor; otherwise p_next_on is the new anchor. Generated occurrences keep their amount and Save (D6); a next date of today is due at once. JA403, JA409 (stopped), 22023 (bad values, amount over 100000000000, Save below 0 or over the amount, or p_next_on outside today..today + 366 or not after the last generated due date, or on or before paused_through while paused).';

-- ---------------------------------------------------------------------------
-- list_due_for_parent returns the plan (body otherwise unchanged from 20261029130005)
-- ---------------------------------------------------------------------------

drop function public.list_due_for_parent(uuid);

create function public.list_due_for_parent(p_child_id uuid)
returns table (
  kind text,
  id uuid,
  due_on date,
  amount_minor bigint,
  note text,
  save_minor bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- The secrecy gate: due counts include pending gifts, so never for the child.
  if not public.is_parent_of(p_child_id) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  return query
  select d.kind, d.id, d.due_on, d.amount_minor, d.note, d.save_minor
  from (
    select 'allowance'::text as kind, o.id, o.due_on, o.amount_minor, null::text as note,
      o.save_minor, o.created_at
    from public.allowance_occurrences o
    where o.child_id = p_child_id
      and o.status = 'due'
    union all
    select 'gift'::text, g.id, g.give_on, g.amount_minor, g.note, null::bigint, g.created_at
    from public.parent_gifts g
    where g.child_id = p_child_id
      and g.status = 'pending'
      and g.give_on <= public.family_today(g.family_id)
  ) d
  order by d.due_on, d.created_at, d.kind, d.id;
end;
$$;

comment on function public.list_due_for_parent(uuid) is 'Due allowance occurrences (with their planned Save) and pending gifts with give_on <= family today (Save null), oldest first. Parent only (JA403 for the child too: it reveals pending gifts).';

-- ---------------------------------------------------------------------------
-- Grants (a dropped function loses its grants; new functions default to PUBLIC)
-- ---------------------------------------------------------------------------

revoke execute on function
  public.create_allowance(uuid, bigint, text, date, bigint),
  public.change_allowance(uuid, bigint, text, date, bigint),
  public.list_due_for_parent(uuid)
from public, anon;

grant execute on function
  public.create_allowance(uuid, bigint, text, date, bigint),
  public.change_allowance(uuid, bigint, text, date, bigint),
  public.list_due_for_parent(uuid)
to authenticated;
