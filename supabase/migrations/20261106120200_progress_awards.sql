-- Progress awards (mobile kid rework, plan 2): the triggers that award Sparks from the ledger,
-- lessons and goals, the daily check-in, the child's Jarso look and the get_progress read model.
-- Builds on the engine in 20261106120100_progress.
--
-- Sparks are never money: nothing here writes ledger_entries, and undo or a fix never takes
-- Sparks back. An award failure must never block a money or lesson write, so every trigger body
-- wraps its award in its own exception block and only raises a warning.
-- Lock order: the caller's source locks (ledger advisory lock, attempt row, goal row) come first;
-- progress_lock takes the child_progress row last.

-- ---------------------------------------------------------------------------
-- Ledger: logs (purchase, diary money received), saves (deposit posted), goal milestones
-- ---------------------------------------------------------------------------

create or replace function public.progress_on_ledger_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A first diary line is a log. A fix's new line (corrects_entry_id) and a reversal never are.
  if new.corrects_entry_id is null
     and (new.kind = 'purchase' or (new.kind = 'gift_in' and new.source_type = 'diary')) then
    begin
      perform public.progress_award(new.child_id, 'log', 'log:' || new.id::text, 10);
    exception when others then
      raise warning 'progress: log award skipped for ledger entry % (%: %)', new.id, sqlstate, sqlerrm;
    end;
  elsif new.kind = 'deposit_in' then
    -- post_request is the only writer of deposit_in; source_id is the request.
    begin
      perform public.progress_award(
        new.child_id, 'save', 'save:' || coalesce(new.source_id, new.id)::text, 20);
    exception when others then
      raise warning 'progress: save award skipped for ledger entry % (%: %)', new.id, sqlstate, sqlerrm;
    end;
  end if;

  -- Any recorded Save movement can cross a goal milestone.
  if new.jar = 'save' then
    begin
      perform public.progress_check_goal(new.child_id, true);
    exception when others then
      raise warning 'progress: goal check skipped for ledger entry % (%: %)', new.id, sqlstate, sqlerrm;
    end;
  end if;

  return null;
end;
$$;

comment on function public.progress_on_ledger_entry() is 'Trigger (after insert on ledger_entries, recorded rows only). Log award 10 (key log:<entry>) for a purchase or diary money received that is not a fix; save award 20 (key save:<request>) for a deposit_in; goal milestones for any Save row. Never raises.';

create trigger progress_on_ledger_entry
  after insert on public.ledger_entries
  for each row
  when (new.mode = 'recorded' and (new.kind in ('purchase', 'gift_in', 'deposit_in') or new.jar = 'save'))
  execute function public.progress_on_ledger_entry();

-- ---------------------------------------------------------------------------
-- Learning: steps and completed missions
-- ---------------------------------------------------------------------------

create or replace function public.progress_on_step_result()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mission_key text;
begin
  begin
    if new.phase = 'main' then
      -- step_results has no mission_key; the attempt (already locked by record_step_result) has.
      select a.mission_key into v_mission_key
      from public.mission_attempts a
      where a.id = new.attempt_id;
      -- Once per step for life; a repeated key marks the day active and pays 0.
      perform public.progress_award(
        new.child_id, 'step', 'step:' || v_mission_key || ':' || new.step_key, 15);
    else
      -- The end-of-mission replay pays nothing but still counts for the streak.
      perform public.progress_mark_active(new.child_id, 'step');
    end if;
  exception when others then
    raise warning 'progress: step award skipped for attempt % step % (%: %)',
      new.attempt_id, new.step_key, sqlstate, sqlerrm;
  end;
  return null;
end;
$$;

comment on function public.progress_on_step_result() is 'Trigger (after insert on step_results). Main phase: step award 15 (key step:<mission>:<step>, once for life, 20 a day). Replay phase: marks the day active only. Never raises.';

create trigger progress_on_step_result
  after insert on public.step_results
  for each row
  execute function public.progress_on_step_result();

create or replace function public.progress_on_mission_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.child_progress;
begin
  begin
    v_row := public.progress_lock(new.child_id);
    if v_row.child_id is null then
      raise exception using errcode = 'JA404', message = 'Child not found';
    end if;
    -- Count each mission once: a repeat completion of the same mission adds nothing.
    if not exists (
      select 1 from public.mission_attempts ma
      where ma.child_id = new.child_id
        and ma.mission_key = new.mission_key
        and ma.status = 'completed'
        and ma.id <> new.id
    ) then
      update public.child_progress cp
      set missions_count = cp.missions_count + 1
      where cp.child_id = new.child_id;
    end if;
    perform public.progress_check_badges(new.child_id, public.family_today(v_row.family_id));
  exception when others then
    raise warning 'progress: mission count skipped for attempt % (%: %)', new.id, sqlstate, sqlerrm;
  end;
  return null;
end;
$$;

comment on function public.progress_on_mission_completed() is 'Trigger (after update of status on mission_attempts, into completed). Counts a distinct mission once (a repeat completion of the same mission_key adds nothing) and checks the mission badges. No Sparks. Never raises.';

create trigger progress_on_mission_completed
  after update of status on public.mission_attempts
  for each row
  when (new.status = 'completed' and old.status is distinct from 'completed')
  execute function public.progress_on_mission_completed();

-- ---------------------------------------------------------------------------
-- Goals: a new goal or a changed target records passed milestones at 0
-- ---------------------------------------------------------------------------

create or replace function public.progress_on_goal_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    -- p_award false: milestones the goal already passes are written at 0, so they never pay.
    perform public.progress_check_goal(new.child_id, false);
  exception when others then
    raise warning 'progress: goal check skipped for goal % (%: %)', new.id, sqlstate, sqlerrm;
  end;
  return null;
end;
$$;

comment on function public.progress_on_goal_change() is 'Trigger (after insert on goals, or after its target_minor changes). Records milestones already passed with 0 Sparks and grants goal_set. Never raises.';

create trigger progress_on_goal_insert
  after insert on public.goals
  for each row
  execute function public.progress_on_goal_change();

create trigger progress_on_goal_target
  after update of target_minor on public.goals
  for each row
  when (old.target_minor is distinct from new.target_minor)
  execute function public.progress_on_goal_change();

-- ---------------------------------------------------------------------------
-- daily_checkin: "anything about money today?" once a family-local day, 5 Sparks
-- ---------------------------------------------------------------------------

create or replace function public.daily_checkin_at(p_answer text, p_now timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.child_progress;
  v_day date;
  v_key text;
  v_amount int;
begin
  if v_uid is null or not exists (
    select 1 from public.family_members fm
    where fm.profile_id = v_uid and fm.role = 'child' and fm.status = 'approved'
  ) then
    raise exception using errcode = 'JA403', message = 'Only a child can check in';
  end if;
  if p_answer is null or p_answer not in ('yes', 'nope') or p_now is null then
    raise exception using errcode = '22023', message = 'Invalid check-in';
  end if;

  -- Only lock: the child's progress row. progress_award writes the answer into the day row
  -- itself, under the same lock (first answer of the day wins).
  v_row := public.progress_lock(v_uid);
  if v_row.child_id is null then
    raise exception using errcode = 'JA403', message = 'Only a child can check in';
  end if;

  v_day := public.family_today(v_row.family_id, p_now);
  v_key := 'checkin:' || pg_catalog.to_char(v_day, 'YYYY-MM-DD');

  if exists (select 1 from public.spark_events se where se.child_id = v_uid and se.source_key = v_key) then
    return pg_catalog.jsonb_build_object('status', 'already', 'sparks', 0);
  end if;

  v_amount := public.progress_award(v_uid, 'checkin', v_key, 5, p_now, p_checkin => p_answer);
  return pg_catalog.jsonb_build_object('status', 'recorded', 'sparks', v_amount);
end;
$$;

comment on function public.daily_checkin_at(text, timestamptz) is 'Internal, no grants: the clock seam behind daily_checkin (pgTAP). Checks in the calling child on the family-local day of p_now. JA403, 22023.';

create or replace function public.daily_checkin(p_answer text)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select public.daily_checkin_at(p_answer, pg_catalog.now());
$$;

comment on function public.daily_checkin(text) is 'Child answers the daily check-in (yes or nope) on the family-local day. The first answer of the day is kept and pays 5 Sparks (key checkin:<day>); it makes the day active. Never writes a ledger row. Returns {status: recorded|already, sparks}. JA403 (not an approved child), 22023 (answer not yes/nope).';

-- ---------------------------------------------------------------------------
-- set_jarso_look: the child picks a lid colour and an unlocked outfit
-- ---------------------------------------------------------------------------

create or replace function public.set_jarso_look(p_lid text, p_wear text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.child_progress;
begin
  if v_uid is null or not exists (
    select 1 from public.family_members fm
    where fm.profile_id = v_uid and fm.role = 'child' and fm.status = 'approved'
  ) then
    raise exception using errcode = 'JA403', message = 'Only a child can change their Jarso';
  end if;
  if p_lid is null or p_lid not in ('cyan', 'grape', 'blush', 'green', 'ink')
     or public.progress_wear_level(p_wear) is null then
    raise exception using errcode = '22023', message = 'Unknown look';
  end if;

  v_row := public.progress_lock(v_uid);
  if v_row.child_id is null then
    raise exception using errcode = 'JA403', message = 'Only a child can change their Jarso';
  end if;
  if public.progress_wear_level(p_wear) > v_row.level then
    raise exception using errcode = 'JA409', message = 'Not unlocked yet';
  end if;

  update public.child_progress cp
  set lid = p_lid, wear = p_wear
  where cp.child_id = v_uid;
end;
$$;

comment on function public.set_jarso_look(text, text) is 'Child sets their Jarso lid colour (cyan, grape, blush, green, ink) and outfit (none, cap, shades, headphones, crown). JA403 (not an approved child), 22023 (unknown value), JA409 Not unlocked yet (outfit above the child''s level).';

-- ---------------------------------------------------------------------------
-- get_progress: the single read model for the app
-- ---------------------------------------------------------------------------

create or replace function public.get_progress(p_child_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_family_id uuid;
  v_row public.child_progress;
  v_today date;
  v_level smallint;
  v_streak int := 0;
  v_rest boolean := false;
begin
  if p_child_id is null or not (public.is_self(p_child_id) or public.is_parent_of(p_child_id)) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  -- Only an approved child has progress (also refuses a parent asking about themselves).
  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.profile_id = p_child_id and fm.role = 'child' and fm.status = 'approved';
  if v_family_id is null then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  -- No row yet (nothing awarded since the child joined) reads as a fresh start.
  select cp.* into v_row from public.child_progress cp where cp.child_id = p_child_id;
  v_level := coalesce(v_row.level, 1);
  v_today := public.family_today(v_family_id);

  -- The stored streak is as of the last award; the live one knows about missed days since.
  select s.streak, s.rest_used_this_week into v_streak, v_rest
  from public.progress_streak(p_child_id, v_today) s;

  return pg_catalog.jsonb_build_object(
    'sparks', coalesce(v_row.sparks, 0),
    'level', v_level,
    -- Sparks needed for the next level; null at level 10. Mirrors @jarso/core/progress.
    'nextLevelAt', (array[100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200])[v_level::int],
    'streak', coalesce(v_streak, 0),
    'bestStreak', greatest(coalesce(v_row.best_streak, 0), coalesce(v_streak, 0)),
    'restUsedThisWeek', coalesce(v_rest, false),
    'checkedInToday', exists (
      select 1 from public.child_activity_days d
      where d.child_id = p_child_id and d.day = v_today and d.checkin is not null
    ),
    'look', pg_catalog.jsonb_build_object(
      'lid', coalesce(v_row.lid, 'cyan'),
      'wear', coalesce(v_row.wear, 'none')
    ),
    'badges', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('key', b.badge_key, 'earnedAt', b.earned_at)
        order by b.earned_at, b.badge_key)
      from public.child_badges b
      where b.child_id = p_child_id
    ), '[]'::jsonb),
    'recent', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('kind', e.kind, 'amount', e.amount, 'createdAt', e.created_at)
        order by e.created_at desc, e.id)
      from (
        select se.id, se.kind, se.amount, se.created_at
        from public.spark_events se
        where se.child_id = p_child_id and se.amount > 0
        order by se.created_at desc, se.id
        limit 10
      ) e
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.get_progress(uuid) is 'A child''s progress for the app: {sparks, level, nextLevelAt (null at 10), streak (live), bestStreak, restUsedThisWeek, checkedInToday, look {lid, wear}, badges [{key, earnedAt}], recent [{kind, amount, createdAt}] (last 10 paid events)}. The child or their parent. JA403.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function public.progress_on_ledger_entry() from public, anon, authenticated;
revoke execute on function public.progress_on_step_result() from public, anon, authenticated;
revoke execute on function public.progress_on_mission_completed() from public, anon, authenticated;
revoke execute on function public.progress_on_goal_change() from public, anon, authenticated;
revoke execute on function public.daily_checkin_at(text, timestamptz) from public, anon, authenticated;

revoke execute on function public.daily_checkin(text) from public, anon;
revoke execute on function public.set_jarso_look(text, text) from public, anon;
revoke execute on function public.get_progress(uuid) from public, anon;
grant execute on function public.daily_checkin(text) to authenticated;
grant execute on function public.set_jarso_look(text, text) to authenticated;
grant execute on function public.get_progress(uuid) to authenticated;
