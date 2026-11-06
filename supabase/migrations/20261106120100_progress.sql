-- Progress (mobile kid rework, plan 2): Sparks, levels, badges, the forgiving streak and the
-- child's Jarso look. Four tables plus the internal award engine. Sparks are never money: nothing
-- here touches ledger_entries, and nothing ever takes Sparks back.
-- The triggers, the check-in, set_jarso_look and get_progress come in progress_awards.
-- Values and caps mirror @jarso/core/progress (log 10 x3/day, check-in 5 x1/day, step 15 x20/day
-- and once per step, save 20 x2/day, goal milestone 25 once per goal and %, goal reached 100 at
-- most once per rolling 7 days). Days are family-local; weeks are ISO weeks from Monday.
-- Lock order: callers take their source locks first; progress_lock locks child_progress last.

-- ---------------------------------------------------------------------------
-- Mirrors of the core constants (needed by the child_progress check below)
-- ---------------------------------------------------------------------------

create or replace function public.progress_level(p_sparks bigint)
returns smallint
language sql
immutable
security definer
set search_path = ''
as $$
  select pg_catalog.count(*)::smallint
  from pg_catalog.unnest(array[0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200]::bigint[]) as t (need)
  where t.need <= greatest(coalesce(p_sparks, 0), 0);
$$;

comment on function public.progress_level(bigint) is 'Level 1..10 for a Sparks total. Thresholds [0,100,250,450,700,1000,1400,1900,2500,3200] mirror @jarso/core/progress.';

create or replace function public.progress_wear_level(p_wear text)
returns smallint
language sql
immutable
security definer
set search_path = ''
as $$
  select (case p_wear
    when 'none' then 1
    when 'cap' then 1
    when 'shades' then 3
    when 'headphones' then 4
    when 'crown' then 5
  end)::smallint;
$$;

comment on function public.progress_wear_level(text) is 'Level that unlocks a Jarso outfit; mirrors WEAR_UNLOCK_LEVEL in @jarso/core/mascot. Null for an unknown outfit.';

-- ---------------------------------------------------------------------------
-- child_progress: one row per child
-- ---------------------------------------------------------------------------

create table public.child_progress (
  child_id uuid primary key references public.profiles (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  sparks bigint not null default 0 check (sparks >= 0),
  level smallint not null default 1 check (level between 1 and 10),
  streak int not null default 0 check (streak >= 0),
  best_streak int not null default 0 check (best_streak >= 0),
  last_active_day date,
  rest_week date,
  lid text not null default 'cyan' check (lid in ('cyan', 'grape', 'blush', 'green', 'ink')),
  wear text not null default 'none' check (wear in ('none', 'cap', 'shades', 'headphones', 'crown')),
  logs_count int not null default 0 check (logs_count >= 0),
  saves_count int not null default 0 check (saves_count >= 0),
  steps_count int not null default 0 check (steps_count >= 0),
  checkins_count int not null default 0 check (checkins_count >= 0),
  missions_count int not null default 0 check (missions_count >= 0),
  goals_reached_count int not null default 0 check (goals_reached_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint child_progress_wear_unlocked check (public.progress_wear_level(wear) <= level)
);

comment on table public.child_progress is 'A child''s Sparks, level, streak, Jarso look and badge counters. Never money. Written only by the progress functions.';
comment on column public.child_progress.streak is 'Streak as of the last award; get_progress recomputes it live with progress_streak.';
comment on column public.child_progress.rest_week is 'Monday of the latest ISO week whose rest day covered a miss.';
comment on column public.child_progress.logs_count is 'Logs that paid Sparks (capped per day), like the other *_count columns; they drive the badges.';

create index child_progress_family_id_idx on public.child_progress (family_id);

create trigger child_progress_set_updated_at
  before update on public.child_progress
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- child_activity_days: what the child did on each family-local day (streak and caps)
-- ---------------------------------------------------------------------------

create table public.child_activity_days (
  child_id uuid not null references public.profiles (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  day date not null,
  checkin text check (checkin in ('yes', 'nope')),
  logs smallint not null default 0 check (logs >= 0),
  saves smallint not null default 0 check (saves >= 0),
  steps smallint not null default 0 check (steps >= 0),
  goal_awards smallint not null default 0 check (goal_awards >= 0),
  active boolean generated always as (checkin is not null or logs > 0 or steps > 0) stored,
  primary key (child_id, day)
);

comment on table public.child_activity_days is 'Per child and family-local day: the check-in answer and how many logs, saves, steps and goal awards happened (over-cap ones too). Drives the streak and the daily caps. Only the child reads it.';
comment on column public.child_activity_days.active is 'A check-in (any answer), a log or a step makes the day count for the streak.';

create index child_activity_days_family_id_idx on public.child_activity_days (family_id);

-- ---------------------------------------------------------------------------
-- spark_events: one row per paid (or silenced) award
-- ---------------------------------------------------------------------------

create table public.spark_events (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.profiles (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  kind text not null check (kind in ('log', 'checkin', 'step', 'save', 'goal_milestone', 'goal_reached')),
  amount int not null check (amount between 0 and 100),
  source_key text not null check (char_length(source_key) between 1 and 200),
  day date not null,
  created_at timestamptz not null default now(),
  unique (child_id, source_key)
);

comment on table public.spark_events is 'Sparks awarded to a child. source_key (unique per child) makes every award happen once for life. amount 0 marks a silenced award (a goal milestone already passed, or a goal reached inside the 7-day cap).';

create index spark_events_child_id_created_at_idx on public.spark_events (child_id, created_at desc);
create index spark_events_family_id_idx on public.spark_events (family_id);

-- ---------------------------------------------------------------------------
-- child_badges
-- ---------------------------------------------------------------------------

create table public.child_badges (
  child_id uuid not null references public.profiles (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  badge_key text not null check (badge_key ~ '^[a-z0-9_]{1,40}$'),
  earned_at timestamptz not null default now(),
  primary key (child_id, badge_key)
);

comment on table public.child_badges is 'Badges a child has earned (keys from @jarso/core/progress). Granted once by progress_check_badges; never taken away.';

create index child_badges_family_id_idx on public.child_badges (family_id);

-- ---------------------------------------------------------------------------
-- RLS: reads only; every write goes through the functions below
-- ---------------------------------------------------------------------------

alter table public.child_progress enable row level security;
alter table public.child_activity_days enable row level security;
alter table public.spark_events enable row level security;
alter table public.child_badges enable row level security;

revoke all on public.child_progress, public.child_activity_days, public.spark_events, public.child_badges from anon;
revoke insert, update, delete, truncate
  on public.child_progress, public.child_activity_days, public.spark_events, public.child_badges
  from authenticated;

create policy "Progress is viewable by the child and their parents"
  on public.child_progress for select
  to authenticated
  using ((select public.is_self(child_id)) or (select public.is_parent_of(child_id)));

create policy "Progress is not inserted directly"
  on public.child_progress for insert
  to authenticated
  with check (false);

create policy "Progress is not updated directly"
  on public.child_progress for update
  to authenticated
  using (false)
  with check (false);

create policy "Progress is not deleted directly"
  on public.child_progress for delete
  to authenticated
  using (false);

create policy "Activity days are viewable by the child only"
  on public.child_activity_days for select
  to authenticated
  using ((select public.is_self(child_id)));

create policy "Activity days are not inserted directly"
  on public.child_activity_days for insert
  to authenticated
  with check (false);

create policy "Activity days are not updated directly"
  on public.child_activity_days for update
  to authenticated
  using (false)
  with check (false);

create policy "Activity days are not deleted directly"
  on public.child_activity_days for delete
  to authenticated
  using (false);

create policy "Spark events are viewable by the child and their parents"
  on public.spark_events for select
  to authenticated
  using ((select public.is_self(child_id)) or (select public.is_parent_of(child_id)));

create policy "Spark events are not inserted directly"
  on public.spark_events for insert
  to authenticated
  with check (false);

create policy "Spark events are not updated directly"
  on public.spark_events for update
  to authenticated
  using (false)
  with check (false);

create policy "Spark events are not deleted directly"
  on public.spark_events for delete
  to authenticated
  using (false);

create policy "Badges are viewable by the child and their parents"
  on public.child_badges for select
  to authenticated
  using ((select public.is_self(child_id)) or (select public.is_parent_of(child_id)));

create policy "Badges are not inserted directly"
  on public.child_badges for insert
  to authenticated
  with check (false);

create policy "Badges are not updated directly"
  on public.child_badges for update
  to authenticated
  using (false)
  with check (false);

create policy "Badges are not deleted directly"
  on public.child_badges for delete
  to authenticated
  using (false);

-- ---------------------------------------------------------------------------
-- Internal: lock (and create) a child's progress row
-- ---------------------------------------------------------------------------

create or replace function public.progress_lock(p_child_id uuid)
returns public.child_progress
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.child_progress;
begin
  insert into public.child_progress (child_id, family_id)
  select fm.profile_id, fm.family_id
  from public.family_members fm
  where fm.profile_id = p_child_id
    and fm.role = 'child'
    and fm.status = 'approved'
  on conflict (child_id) do nothing;

  select cp.* into v_row
  from public.child_progress cp
  where cp.child_id = p_child_id
    and exists (
      select 1
      from public.family_members fm
      where fm.profile_id = cp.child_id
        and fm.family_id = cp.family_id
        and fm.role = 'child'
        and fm.status = 'approved'
    )
  for update of cp;

  if not found then
    return null;
  end if;
  return v_row;
end;
$$;

comment on function public.progress_lock(uuid) is 'Internal. Creates the child''s progress row if missing and locks it for update (always the last lock taken). Null when the id is not an approved child.';

-- ---------------------------------------------------------------------------
-- Internal: the streak
-- ---------------------------------------------------------------------------

create or replace function public.progress_streak(p_child_id uuid, p_today date)
returns table (streak int, rest_used_this_week boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_active date[];
  v_covered date[] := '{}';
  v_d date := p_today;
  v_week date;
  v_count int := 0;
begin
  select coalesce(pg_catalog.array_agg(d.day), '{}') into v_active
  from public.child_activity_days d
  where d.child_id = p_child_id
    and d.active
    and d.day between p_today - 402 and p_today;

  -- Today not done yet is not a miss.
  if not (v_d = any (v_active)) then
    v_d := v_d - 1;
  end if;

  for i in 1..400 loop
    v_week := pg_catalog.date_trunc('week', v_d::timestamp)::date;
    if v_d = any (v_active) then
      v_count := v_count + 1;
      v_d := v_d - 1;
    elsif not (v_week = any (v_covered)) and (v_d - 1) = any (v_active) then
      -- This ISO week's rest day covers the miss (the day before was active).
      v_covered := v_covered || v_week;
      v_d := v_d - 1;
    else
      exit;
    end if;
  end loop;

  streak := v_count;
  rest_used_this_week := pg_catalog.date_trunc('week', p_today::timestamp)::date = any (v_covered);
  return next;
end;
$$;

comment on function public.progress_streak(uuid, date) is 'Internal. Active days in a row up to p_today (today still open is not a miss), with one rest day per ISO week covering a single miss after an active day. Also whether this week''s rest day is used.';

create or replace function public.progress_refresh_streak(p_child_id uuid, p_day date)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_streak int;
  v_rest boolean;
  v_active boolean;
begin
  select s.streak, s.rest_used_this_week into v_streak, v_rest
  from public.progress_streak(p_child_id, p_day) s;

  select d.active into v_active
  from public.child_activity_days d
  where d.child_id = p_child_id and d.day = p_day;

  update public.child_progress cp
  set streak = v_streak,
      best_streak = greatest(cp.best_streak, v_streak),
      last_active_day = case
        when coalesce(v_active, false) then greatest(coalesce(cp.last_active_day, p_day), p_day)
        else cp.last_active_day
      end,
      rest_week = case
        when v_rest then pg_catalog.date_trunc('week', p_day::timestamp)::date
        else cp.rest_week
      end
  where cp.child_id = p_child_id;
end;
$$;

comment on function public.progress_refresh_streak(uuid, date) is 'Internal. Stores the streak as of p_day, raises best_streak, last_active_day and rest_week. Caller holds the progress lock.';

-- ---------------------------------------------------------------------------
-- Internal: badges
-- ---------------------------------------------------------------------------

create or replace function public.progress_check_badges(p_child_id uuid, p_day date)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.child_progress;
begin
  select cp.* into v_row from public.child_progress cp where cp.child_id = p_child_id;
  if not found then
    return;
  end if;

  insert into public.child_badges (child_id, family_id, badge_key)
  select p_child_id, v_row.family_id, b.badge_key
  from (values
    ('first_log', v_row.logs_count >= 1),
    ('logs_10', v_row.logs_count >= 10),
    ('logs_50', v_row.logs_count >= 50),
    ('logs_100', v_row.logs_count >= 100),
    ('diary_week', (
      select pg_catalog.count(*) = 7
      from public.child_activity_days d
      where d.child_id = p_child_id
        and d.day between p_day - 6 and p_day
        and d.logs > 0
    )),
    ('first_checkin', v_row.checkins_count >= 1),
    ('checkins_7', v_row.checkins_count >= 7),
    ('checkins_30', v_row.checkins_count >= 30),
    ('streak_3', v_row.best_streak >= 3),
    ('streak_7', v_row.best_streak >= 7),
    ('streak_14', v_row.best_streak >= 14),
    ('streak_30', v_row.best_streak >= 30),
    ('first_save', v_row.saves_count >= 1),
    ('saves_5', v_row.saves_count >= 5),
    ('saves_20', v_row.saves_count >= 20),
    ('first_mission', v_row.missions_count >= 1),
    ('missions_5', v_row.missions_count >= 5),
    ('missions_10', v_row.missions_count >= 10),
    ('goal_set', exists (select 1 from public.goals g where g.child_id = p_child_id)),
    -- progress_check_goal records every milestone passed (amount 0 when silenced).
    ('goal_half', exists (
      select 1
      from public.spark_events se
      where se.child_id = p_child_id
        and se.kind = 'goal_milestone'
        and se.source_key like 'goal:%:50'
    )),
    ('goal_reached', v_row.goals_reached_count >= 1),
    ('level_3', v_row.level >= 3),
    ('level_5', v_row.level >= 5)
  ) as b (badge_key, earned)
  where b.earned
  on conflict (child_id, badge_key) do nothing;
end;
$$;

comment on function public.progress_check_badges(uuid, date) is 'Internal. Grants every badge the child now qualifies for (counters, best streak, level, goal, goal at 50%, logs on the 7 days ending p_day). Never removes one.';

-- ---------------------------------------------------------------------------
-- Internal: award Sparks
-- ---------------------------------------------------------------------------

create or replace function public.progress_award(
  p_child_id uuid,
  p_kind text,
  p_source_key text,
  p_amount int,
  p_now timestamptz default now(),
  p_checkin text default null
)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.child_progress;
  v_day date;
  v_count int;
  v_cap int;
  v_amount int := p_amount;
  v_inserted int;
begin
  if p_kind is null or p_kind not in ('log', 'checkin', 'step', 'save', 'goal_milestone', 'goal_reached') then
    raise exception using errcode = '22023', message = 'Unknown award kind';
  end if;
  if p_amount is null or p_amount < 0 or p_amount > 100 then
    raise exception using errcode = '22023', message = 'Award amount out of range';
  end if;
  if p_source_key is null or char_length(p_source_key) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'Bad award key';
  end if;
  -- The check-in answer comes with the checkin award and only with it.
  if (p_kind = 'checkin' and (p_checkin is null or p_checkin not in ('yes', 'nope')))
     or (p_kind <> 'checkin' and p_checkin is not null) then
    raise exception using errcode = '22023', message = 'Bad check-in answer';
  end if;

  v_row := public.progress_lock(p_child_id);
  if v_row.child_id is null then
    raise exception using errcode = 'JA404', message = 'Child not found';
  end if;

  -- Every award happens once for life. Exact under the row lock; a replay pays nothing and
  -- moves no counter, but a repeated log or step still makes its day count for the streak.
  if exists (
    select 1 from public.spark_events se
    where se.child_id = p_child_id and se.source_key = p_source_key
  ) then
    if p_kind in ('log', 'step') then
      perform public.progress_mark_active(p_child_id, p_kind, p_now);
    end if;
    return 0;
  end if;

  v_day := public.family_today(v_row.family_id, p_now);

  -- The day's counter always moves (it counts toward the streak), even over the cap. The
  -- check-in answer is written here, under the row lock; the first answer of the day wins.
  insert into public.child_activity_days as d (child_id, family_id, day, checkin, logs, saves, steps, goal_awards)
  values (
    p_child_id, v_row.family_id, v_day,
    p_checkin,
    (p_kind = 'log')::int,
    (p_kind = 'save')::int,
    (p_kind = 'step')::int,
    (p_kind in ('goal_milestone', 'goal_reached'))::int
  )
  on conflict (child_id, day) do update
    set checkin = coalesce(d.checkin, excluded.checkin),
        logs = d.logs + excluded.logs,
        saves = d.saves + excluded.saves,
        steps = d.steps + excluded.steps,
        goal_awards = d.goal_awards + excluded.goal_awards
  returning (case p_kind when 'log' then d.logs when 'save' then d.saves when 'step' then d.steps else 0 end)
    into v_count;

  v_cap := case p_kind when 'log' then 3 when 'save' then 2 when 'step' then 20 end;

  if (v_cap is not null and v_count > v_cap)
     or (p_kind = 'checkin' and exists (
       select 1 from public.spark_events se
       where se.child_id = p_child_id and se.kind = 'checkin' and se.day = v_day
     )) then
    -- Over the cap: no Sparks, no event, but the day still counts.
    perform public.progress_refresh_streak(p_child_id, v_day);
    perform public.progress_check_badges(p_child_id, v_day);
    return 0;
  end if;

  -- A goal reached inside 7 days of the last paid one is recorded with 0, so it never pays later.
  if p_kind = 'goal_reached' and exists (
    select 1 from public.spark_events se
    where se.child_id = p_child_id
      and se.kind = 'goal_reached'
      and se.amount > 0
      and se.created_at > p_now - interval '7 days'
  ) then
    v_amount := 0;
  end if;

  insert into public.spark_events (child_id, family_id, kind, amount, source_key, day, created_at)
  values (p_child_id, v_row.family_id, p_kind, v_amount, p_source_key, v_day, p_now)
  on conflict (child_id, source_key) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return 0;
  end if;

  -- goals_reached_count counts only paid goals (not one already reached when set, a lowered
  -- target, or one inside the 7-day cap), so the goal_reached badge means real saving.
  update public.child_progress cp
  set sparks = cp.sparks + v_amount,
      level = greatest(cp.level, public.progress_level(cp.sparks + v_amount)),
      logs_count = cp.logs_count + (p_kind = 'log')::int,
      saves_count = cp.saves_count + (p_kind = 'save')::int,
      steps_count = cp.steps_count + (p_kind = 'step')::int,
      checkins_count = cp.checkins_count + (p_kind = 'checkin')::int,
      goals_reached_count = cp.goals_reached_count + (p_kind = 'goal_reached' and v_amount > 0)::int
  where cp.child_id = p_child_id;

  perform public.progress_refresh_streak(p_child_id, v_day);
  perform public.progress_check_badges(p_child_id, v_day);
  return v_amount;
end;
$$;

comment on function public.progress_award(uuid, text, text, int, timestamptz, text) is 'Internal. Awards p_amount Sparks once per (child, source key) on the family-local day of p_now, within the daily caps; returns what was paid (0 over the cap or on a replay; a replayed log or step still marks its day active). For kind checkin, p_checkin (yes/nope) is required and written to the day under the row lock, first answer wins; callers never write child_activity_days. Raises JA404 for a non-child, 22023 for a bad kind, amount, key or answer.';

create or replace function public.progress_mark_active(
  p_child_id uuid,
  p_kind text,
  p_now timestamptz default now()
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.child_progress;
  v_day date;
begin
  if p_kind is null or p_kind not in ('log', 'save', 'step') then
    raise exception using errcode = '22023', message = 'Unknown activity kind';
  end if;

  v_row := public.progress_lock(p_child_id);
  if v_row.child_id is null then
    raise exception using errcode = 'JA404', message = 'Child not found';
  end if;

  v_day := public.family_today(v_row.family_id, p_now);

  -- Sets the kind's counter to at least 1, never more. A step on a day with no step activity yet
  -- therefore takes one of the day's 20 step-cap slots (accepted); after that it adds nothing.
  insert into public.child_activity_days as d (child_id, family_id, day, logs, saves, steps)
  values (
    p_child_id, v_row.family_id, v_day,
    (p_kind = 'log')::int,
    (p_kind = 'save')::int,
    (p_kind = 'step')::int
  )
  on conflict (child_id, day) do update
    set logs = greatest(d.logs, excluded.logs),
        saves = greatest(d.saves, excluded.saves),
        steps = greatest(d.steps, excluded.steps);

  perform public.progress_refresh_streak(p_child_id, v_day);
  perform public.progress_check_badges(p_child_id, v_day);
end;
$$;

comment on function public.progress_mark_active(uuid, text, timestamptz) is 'Internal. Marks the family-local day of p_now as having a log, save or step with no Sparks (a step over the cap, a replay phase, a replayed award key). Can take one step-cap slot when the day had no step yet. Raises JA404 for a non-child.';

-- ---------------------------------------------------------------------------
-- Internal: goal milestones
-- ---------------------------------------------------------------------------

create or replace function public.progress_check_goal(p_child_id uuid, p_award boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.child_progress;
  v_goal_id uuid;
  v_target bigint;
  v_counted bigint;
  v_pct int;
begin
  v_row := public.progress_lock(p_child_id);
  if v_row.child_id is null then
    return;
  end if;

  select g.id, g.target_minor into v_goal_id, v_target
  from public.goals g
  where g.child_id = p_child_id and g.status = 'active';

  if v_goal_id is not null then
    -- Same rule as goal_progress (counted = Save - reserved, never below 0), without its caller
    -- check: this runs from triggers whatever the signed-in user.
    v_counted := greatest(
      coalesce((
        select pg_catalog.sum(case le.direction when 'in' then le.amount_minor else -le.amount_minor end)::bigint
        from public.ledger_entries le
        where le.child_id = p_child_id and le.jar = 'save' and le.mode = 'recorded'
      ), 0)
      - coalesce((
        select pg_catalog.sum(r.amount_minor)::bigint
        from public.requests r
        where r.child_id = p_child_id and r.kind = 'withdrawal' and r.status in ('pending', 'approved')
      ), 0),
      0);

    foreach v_pct in array array[25, 50, 75, 100] loop
      if v_counted * 100 >= v_target * v_pct then
        perform public.progress_award(
          p_child_id, 'goal_milestone', 'goal:' || v_goal_id::text || ':' || v_pct::text,
          case when p_award then 25 else 0 end);
      end if;
    end loop;

    if v_counted >= v_target then
      perform public.progress_award(
        p_child_id, 'goal_reached', 'goal_reached:' || v_goal_id::text,
        case when p_award then 100 else 0 end);
    end if;
  end if;

  perform public.progress_check_badges(p_child_id, public.family_today(v_row.family_id));
end;
$$;

comment on function public.progress_check_goal(uuid, boolean) is 'Internal. Records each 25/50/75/100% milestone of the active goal once (25 Sparks, or 0 when p_award is false) and goal reached (100, or 0; 7-day cap). Milestones already passed are never paid later. Also grants goal badges.';

-- ---------------------------------------------------------------------------
-- Backfill: a zero row for every approved child
-- ---------------------------------------------------------------------------

create or replace function public.progress_backfill()
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  insert into public.child_progress (child_id, family_id)
  select fm.profile_id, fm.family_id
  from public.family_members fm
  where fm.role = 'child' and fm.status = 'approved'
  on conflict (child_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.progress_backfill() is 'Internal. Adds a zero child_progress row for every approved child that has none; returns how many it added.';

select public.progress_backfill();

-- ---------------------------------------------------------------------------
-- Grants: the mirrors are pure; everything else is internal
-- ---------------------------------------------------------------------------

revoke execute on function public.progress_level(bigint) from public, anon;
revoke execute on function public.progress_wear_level(text) from public, anon;
grant execute on function public.progress_level(bigint) to authenticated;
grant execute on function public.progress_wear_level(text) to authenticated;

revoke execute on function public.progress_lock(uuid) from public, anon, authenticated;
revoke execute on function public.progress_streak(uuid, date) from public, anon, authenticated;
revoke execute on function public.progress_refresh_streak(uuid, date) from public, anon, authenticated;
revoke execute on function public.progress_check_badges(uuid, date) from public, anon, authenticated;
revoke execute on function public.progress_award(uuid, text, text, int, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.progress_mark_active(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.progress_check_goal(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.progress_backfill() from public, anon, authenticated;
