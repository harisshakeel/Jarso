-- Allowance schedules and their generated occurrences, with pause, resume,
-- change and stop. Slice 2 design §3 S6-S10 and §4.1; architecture.md §7.2.
-- Writes go through security definer functions only. Occurrence handover
-- (confirm / not given) is added by a later migration.

-- ---------------------------------------------------------------------------
-- allowance_schedules
-- ---------------------------------------------------------------------------

create table public.allowance_schedules (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  child_id uuid not null references public.profiles (id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  frequency text not null check (frequency in ('weekly', 'monthly', 'quarterly', 'annual')),
  anchor_on date not null,
  next_index int not null default 0 check (next_index >= 0),
  status text not null default 'active' check (status in ('active', 'paused', 'stopped')),
  paused_through date,
  pause_message text check (char_length(pause_message) <= 140),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint allowance_schedules_amount_minor_max check (amount_minor <= 100000000000)
);

comment on table public.allowance_schedules is 'Recurring allowance per child (at most one active or paused). Written only by security definer functions.';
comment on column public.allowance_schedules.anchor_on is 'Period 0 due date. Period n = allowance_due_on(anchor_on, frequency, n); never chained from the previous date. Reset by change_allowance unless only the amount changes.';
comment on column public.allowance_schedules.next_index is 'First period not yet generated (or skipped by a pause).';
comment on column public.allowance_schedules.paused_through is 'Paused through this family date (auto-resumes after it); null = until a parent resumes.';
comment on column public.allowance_schedules.pause_message is 'Optional trimmed message to the child, max 140 chars; shown as plain text.';

create unique index allowance_schedules_one_live_per_child_idx
  on public.allowance_schedules (child_id)
  where status in ('active', 'paused');
create index allowance_schedules_child_id_idx on public.allowance_schedules (child_id);
create index allowance_schedules_family_id_idx on public.allowance_schedules (family_id);
create index allowance_schedules_created_by_idx on public.allowance_schedules (created_by);

create trigger allowance_schedules_set_updated_at
  before update on public.allowance_schedules
  for each row execute function public.set_updated_at();

alter table public.allowance_schedules enable row level security;

-- ---------------------------------------------------------------------------
-- allowance_occurrences
-- ---------------------------------------------------------------------------

create table public.allowance_occurrences (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.allowance_schedules (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  child_id uuid not null references public.profiles (id) on delete cascade,
  period_key text not null,
  due_on date not null,
  amount_minor bigint not null check (amount_minor > 0),
  status text not null default 'due' check (status in ('due', 'confirmed', 'closed')),
  cash_minor bigint check (cash_minor >= 0),
  saved_minor bigint check (saved_minor >= 0),
  shortfall_minor bigint not null default 0 check (shortfall_minor >= 0),
  confirmed_by uuid references public.profiles (id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (schedule_id, period_key),
  constraint allowance_occurrences_amount_minor_max check (amount_minor <= 100000000000),
  -- A confirmed occurrence records the whole split: cash + saved + shortfall = amount.
  constraint allowance_occurrences_confirmed_split check (
    status <> 'confirmed'
    or (cash_minor is not null and saved_minor is not null and confirmed_at is not null
        and cash_minor + saved_minor + shortfall_minor = amount_minor)
  )
);

comment on table public.allowance_occurrences is 'One row per generated allowance period. Written only by security definer functions.';
comment on column public.allowance_occurrences.period_key is 'to_char(due_on, ''YYYY-MM-DD''); unique per schedule so generation is idempotent.';
comment on column public.allowance_occurrences.amount_minor is 'Snapshot of the schedule amount at generation (D6).';

create index allowance_occurrences_child_due_on_idx on public.allowance_occurrences (child_id, due_on desc);
-- Due lists and badges read only due rows.
create index allowance_occurrences_child_due_idx
  on public.allowance_occurrences (child_id, due_on)
  where status = 'due';
create index allowance_occurrences_family_id_idx on public.allowance_occurrences (family_id);
create index allowance_occurrences_confirmed_by_idx on public.allowance_occurrences (confirmed_by);

alter table public.allowance_occurrences enable row level security;

-- Writes go through functions only; RLS also ignores TRUNCATE.
revoke all on public.allowance_schedules, public.allowance_occurrences from anon;
revoke insert, update, delete, truncate on public.allowance_schedules, public.allowance_occurrences from authenticated;

create policy "Allowance schedules are viewable by the child and their parents"
  on public.allowance_schedules for select
  to authenticated
  using (public.is_self(child_id) or public.is_parent_of(child_id));

create policy "Allowance occurrences are viewable by the child and their parents"
  on public.allowance_occurrences for select
  to authenticated
  using (public.is_self(child_id) or public.is_parent_of(child_id));

-- ---------------------------------------------------------------------------
-- Date helpers
-- ---------------------------------------------------------------------------

create or replace function public.family_today(p_family_id uuid, p_now timestamptz default now())
returns date
language sql
stable
set search_path = ''
as $$
  select (p_now at time zone f.timezone)::date
  from public.families f
  where f.id = p_family_id;
$$;

comment on function public.family_today(uuid, timestamptz) is 'The family''s local date at p_now. Security invoker: null for a family the caller cannot see.';

create or replace function public.allowance_due_on(p_anchor date, p_frequency text, p_index int)
returns date
language sql
immutable
set search_path = ''
as $$
  select case p_frequency
    when 'weekly' then p_anchor + 7 * p_index
    when 'monthly' then (p_anchor + pg_catalog.make_interval(months => p_index))::date
    when 'quarterly' then (p_anchor + pg_catalog.make_interval(months => p_index * 3))::date
    when 'annual' then (p_anchor + pg_catalog.make_interval(months => p_index * 12))::date
  end;
$$;

comment on function public.allowance_due_on(date, text, int) is 'Due date of period p_index, stepped from the anchor (month-end clamped by Postgres). Null for an unknown frequency.';

-- ---------------------------------------------------------------------------
-- Generation (internal)
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

    insert into public.allowance_occurrences (schedule_id, family_id, child_id, period_key, due_on, amount_minor)
    values (v_s.id, v_s.family_id, v_s.child_id, pg_catalog.to_char(v_due, 'YYYY-MM-DD'), v_due, v_s.amount_minor)
    on conflict (schedule_id, period_key) do nothing;
    get diagnostics v_rows = row_count;
    v_inserted := v_inserted + v_rows;
    -- slice 5: notify(due)

    v_index := v_index + 1;
  end loop;

  if v_index <> v_s.next_index then
    update public.allowance_schedules set next_index = v_index where id = v_s.id;
  end if;

  return v_inserted;
end;
$$;

comment on function public.generate_for_schedule(uuid, date) is 'Internal. Inserts every period of an active schedule due on or before p_today (idempotent) and advances next_index. Returns rows inserted.';

-- Locks the schedule and checks the caller is a parent of its child. Internal.
create or replace function public.lock_allowance_for_parent(p_schedule_id uuid)
returns public.allowance_schedules
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_s public.allowance_schedules;
begin
  select * into v_s from public.allowance_schedules s where s.id = p_schedule_id for update;
  if not found or not public.is_parent_of(v_s.child_id) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;
  return v_s;
end;
$$;

comment on function public.lock_allowance_for_parent(uuid) is 'Internal. Locks the schedule for update; JA403 unless the caller is an approved parent of its child.';

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------

create or replace function public.allowance_next_due_on(p_schedule_id uuid)
returns date
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_s public.allowance_schedules;
  v_index int;
begin
  select * into v_s from public.allowance_schedules s where s.id = p_schedule_id;
  if not found or not (public.is_self(v_s.child_id) or public.is_parent_of(v_s.child_id)) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  if v_s.status = 'stopped' or (v_s.status = 'paused' and v_s.paused_through is null) then
    return null;
  end if;

  v_index := v_s.next_index;
  if v_s.status = 'paused' then
    -- Periods inside the pause are skipped: first period after paused_through.
    while public.allowance_due_on(v_s.anchor_on, v_s.frequency, v_index) <= v_s.paused_through loop
      v_index := v_index + 1;
    end loop;
  end if;
  return public.allowance_due_on(v_s.anchor_on, v_s.frequency, v_index);
end;
$$;

comment on function public.allowance_next_due_on(uuid) is 'Due date of the next period to be generated: when paused through a date, the first period after it; null when stopped or paused until resumed. Caller must be the child or their parent. JA403.';

-- ---------------------------------------------------------------------------
-- Parent writes
-- ---------------------------------------------------------------------------

create or replace function public.create_allowance(
  p_child_id uuid,
  p_amount_minor bigint,
  p_frequency text,
  p_first_on date
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
  if p_first_on is null or p_first_on < public.family_today(v_family_id)
     or p_first_on > public.family_today(v_family_id) + 366 then
    raise exception using errcode = '22023', message = 'First date must be from today to a year ahead';
  end if;

  begin
    insert into public.allowance_schedules (family_id, child_id, amount_minor, frequency, anchor_on, created_by)
    values (v_family_id, p_child_id, p_amount_minor, p_frequency, p_first_on, v_uid)
    returning id into v_id;
  exception when unique_violation then
    raise exception using errcode = 'JA409', message = 'Child already has an allowance';
  end;

  insert into public.audit_log (family_id, actor_id, action, subject_id, details)
  values (
    v_family_id, v_uid, 'allowance.created', v_id,
    pg_catalog.jsonb_build_object(
      'child_id', p_child_id, 'amount_minor', p_amount_minor,
      'frequency', p_frequency, 'first_on', p_first_on
    )
  );

  -- A first date of today is due now, not at the next job run.
  perform public.generate_for_schedule(v_id, public.family_today(v_family_id));

  return v_id;
end;
$$;

comment on function public.create_allowance(uuid, bigint, text, date) is 'Parent sets up the child''s recurring allowance; a first date of today is due at once. JA403, JA409 (one already active or paused), 22023 (bad amount/frequency, amount over 100000000000, or first date outside family today..today + 366).';

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

comment on function public.change_allowance(uuid, bigint, text, date) is 'Parent changes amount/frequency from p_next_on. Same frequency and p_next_on = the current next due date keeps the anchor; otherwise p_next_on is the new anchor. Generated occurrences keep their amount (D6); a next date of today is due at once. JA403, JA409 (stopped), 22023 (bad values, amount over 100000000000, or p_next_on outside today..today + 366 or not after the last generated due date).';

create or replace function public.pause_allowance(p_schedule_id uuid, p_through date, p_message text)
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
  v_message text := nullif(pg_catalog.btrim(p_message), '');
begin
  v_s := public.lock_allowance_for_parent(p_schedule_id);
  if v_s.status <> 'active' then
    raise exception using errcode = 'JA409', message = 'Allowance is not active';
  end if;

  v_today := public.family_today(v_s.family_id);
  -- Capped so next-due and auto-resume never walk an unbounded number of periods.
  if p_through < v_today or p_through > v_today + 366 then
    raise exception using errcode = '22023', message = 'Pause date must be from today to a year ahead';
  end if;
  if pg_catalog.char_length(v_message) > 140 then
    raise exception using errcode = '22023', message = 'Message is too long';
  end if;

  -- Everything due up to and including today stays due.
  perform public.generate_for_schedule(v_s.id, v_today);

  update public.allowance_schedules
  set status = 'paused',
      paused_through = p_through,
      pause_message = v_message
  where id = v_s.id;

  insert into public.audit_log (family_id, actor_id, action, subject_id, details)
  values (
    v_s.family_id, v_uid, 'allowance.paused', v_s.id,
    pg_catalog.jsonb_build_object('through', p_through, 'has_message', v_message is not null)
  );

  return v_s.id;
end;
$$;

comment on function public.pause_allowance(uuid, date, text) is 'Parent pauses from today, through p_through (null = until resumed), with an optional message. Catches up first. JA403, JA409 (not active), 22023 (p_through outside today..today + 366, message over 140).';

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

  -- Skip periods that fell in the pause: first period due today or later.
  v_index := v_s.next_index;
  while public.allowance_due_on(v_s.anchor_on, v_s.frequency, v_index) < v_today loop
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

comment on function public.resume_allowance(uuid) is 'Parent resumes a paused allowance. Paused periods stay skipped; a period due today becomes due. JA403, JA409 (not paused).';

create or replace function public.stop_allowance(p_schedule_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_s public.allowance_schedules;
begin
  v_s := public.lock_allowance_for_parent(p_schedule_id);
  if v_s.status = 'stopped' then
    raise exception using errcode = 'JA409', message = 'Allowance has stopped';
  end if;

  perform public.generate_for_schedule(v_s.id, public.family_today(v_s.family_id));

  update public.allowance_schedules set status = 'stopped' where id = v_s.id;

  insert into public.audit_log (family_id, actor_id, action, subject_id, details)
  values (v_s.family_id, v_uid, 'allowance.stopped', v_s.id, pg_catalog.jsonb_build_object('previous_status', v_s.status));

  return v_s.id;
end;
$$;

comment on function public.stop_allowance(uuid) is 'Parent ends the schedule (terminal). Catches up first; already-due occurrences stay due. JA403, JA409 (already stopped).';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function
  public.generate_for_schedule(uuid, date),
  public.lock_allowance_for_parent(uuid)
from public, anon, authenticated;

revoke execute on function
  public.family_today(uuid, timestamptz),
  public.allowance_due_on(date, text, int),
  public.allowance_next_due_on(uuid),
  public.create_allowance(uuid, bigint, text, date),
  public.change_allowance(uuid, bigint, text, date),
  public.pause_allowance(uuid, date, text),
  public.resume_allowance(uuid),
  public.stop_allowance(uuid)
from public, anon;

grant execute on function
  public.family_today(uuid, timestamptz),
  public.allowance_due_on(date, text, int),
  public.allowance_next_due_on(uuid),
  public.create_allowance(uuid, bigint, text, date),
  public.change_allowance(uuid, bigint, text, date),
  public.pause_allowance(uuid, date, text),
  public.resume_allowance(uuid),
  public.stop_allowance(uuid)
to authenticated;
