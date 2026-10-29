-- Learning progress (FR06, FR08, FR10). Design: docs/superpowers/specs/2026-10-29-learning-and-guide-design.md
-- §4.5 and ADR 0009. Missions, topics and review items are versioned JSON in the app
-- (src/content/learning); only a child's progress lives here, keyed by stable content keys.
--
-- Missions use fictional amounts and never touch ledger_entries (invariants 2 and 11). A child
-- writes only through the security definer functions below, which check that the caller is an
-- approved child. Grading runs in app code (one shared gradeStep), so a child calling these
-- functions directly could forge their own learning stats and nothing else: accepted (spec §12).
-- The child and the child's approved parents can read; nobody else can.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.mission_attempts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  child_id uuid not null references public.profiles (id) on delete cascade,
  mission_key text not null check (mission_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(mission_key) <= 40),
  content_version integer not null check (content_version between 1 and 1000),
  status text not null default 'started' check (status in ('started', 'completed', 'abandoned')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((status = 'completed') = (completed_at is not null))
);

comment on table public.mission_attempts is 'A child''s run through one mission. At most one started attempt per child and mission. Written only by the learning functions.';
comment on column public.mission_attempts.content_version is 'Version of the mission content the attempt ran; a new version abandons an open attempt.';

create unique index mission_attempts_one_open_idx
  on public.mission_attempts (child_id, mission_key)
  where status = 'started';
create index mission_attempts_child_started_idx on public.mission_attempts (child_id, started_at desc);
create index mission_attempts_family_id_idx on public.mission_attempts (family_id);

create table public.step_results (
  attempt_id uuid not null references public.mission_attempts (id) on delete cascade,
  child_id uuid not null references public.profiles (id) on delete cascade,
  step_key text not null check (step_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(step_key) <= 40),
  phase text not null check (phase in ('main', 'replay')),
  step_type text not null check (step_type in ('choice', 'predict', 'reason', 'amount', 'split', 'sort', 'match')),
  skill_key text not null check (skill_key ~ '^[a-z_]+\.[a-z_]+$' and char_length(skill_key) <= 40),
  answer jsonb not null check (jsonb_typeof(answer) = 'object' and pg_column_size(answer) <= 2048),
  correct boolean not null,
  hints_used smallint not null check (hints_used between 0 and 2),
  tries smallint not null check (tries between 1 and 2),
  answered_at timestamptz not null default now(),
  primary key (attempt_id, step_key, phase)
);

comment on table public.step_results is 'The final result of one mission step (main run or end-of-mission replay). Append-only; a retry of the same step is a no-op.';

create index step_results_child_answered_idx on public.step_results (child_id, answered_at desc);

create table public.skill_progress (
  child_id uuid not null references public.profiles (id) on delete cascade,
  skill_key text not null check (skill_key ~ '^[a-z_]+\.[a-z_]+$' and char_length(skill_key) <= 40),
  level smallint not null default 0 check (level between 0 and 3),
  first_try_correct integer not null default 0 check (first_try_correct >= 0),
  correct_with_hints integer not null default 0 check (correct_with_hints >= 0),
  reasons_correct integer not null default 0 check (reasons_correct >= 0),
  reviews_passed integer not null default 0 check (reviews_passed >= 0),
  updated_at timestamptz not null default now(),
  primary key (child_id, skill_key)
);

comment on table public.skill_progress is 'FR10 skill levels: 1 Started, 2 Practised, 3 Got it (right without hints in a review). Never shown next to money (invariant 11).';

create table public.review_items (
  child_id uuid not null references public.profiles (id) on delete cascade,
  skill_key text not null check (skill_key ~ '^[a-z_]+\.[a-z_]+$' and char_length(skill_key) <= 40),
  box smallint not null default 1 check (box in (1, 3, 7, 14)),
  due_on date not null,
  last_result text check (last_result in ('correct', 'correct_with_hints', 'wrong')),
  last_reviewed_on date,
  primary key (child_id, skill_key)
);

comment on table public.review_items is 'Spaced review per skill: boxes of 1, 3, 7 and 14 days. Right without hints moves up a box; wrong goes back to box 1.';

create index review_items_child_due_idx on public.review_items (child_id, due_on);

create table public.practice_results (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.profiles (id) on delete cascade,
  item_key text not null check (item_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(item_key) <= 40),
  skill_key text not null check (skill_key ~ '^[a-z_]+\.[a-z_]+$' and char_length(skill_key) <= 40),
  answered_on date not null,
  answer jsonb not null check (jsonb_typeof(answer) = 'object' and pg_column_size(answer) <= 2048),
  correct boolean not null,
  hints_used smallint not null check (hints_used between 0 and 2),
  tries smallint not null check (tries between 1 and 2),
  answered_at timestamptz not null default now(),
  unique (child_id, item_key, answered_on)
);

comment on table public.practice_results is 'One answer to a review-pool item. At most one per item per family day, so a repeated submit is a no-op.';

create index practice_results_child_answered_idx on public.practice_results (child_id, answered_at desc);

create table public.learning_checkins (
  child_id uuid primary key references public.profiles (id) on delete cascade,
  content_version integer not null check (content_version between 1 and 1000),
  answers jsonb not null check (jsonb_typeof(answers) = 'array' and pg_column_size(answers) <= 8192),
  correct_count smallint not null check (correct_count between 0 and 5),
  completed_at timestamptz not null default now()
);

comment on table public.learning_checkins is 'The FR10 starting check-in: five questions, once per child. Locks nothing.';

-- ---------------------------------------------------------------------------
-- RLS: the child and the child's parents read; writes only through functions
-- ---------------------------------------------------------------------------

alter table public.mission_attempts enable row level security;
alter table public.step_results enable row level security;
alter table public.skill_progress enable row level security;
alter table public.review_items enable row level security;
alter table public.practice_results enable row level security;
alter table public.learning_checkins enable row level security;

-- RLS does not cover TRUNCATE, so writes are revoked outright.
revoke all on public.mission_attempts, public.step_results, public.skill_progress,
  public.review_items, public.practice_results, public.learning_checkins from anon;
revoke insert, update, delete, truncate on public.mission_attempts, public.step_results,
  public.skill_progress, public.review_items, public.practice_results, public.learning_checkins
  from authenticated;

create policy "Mission attempts are viewable by the child and their parents"
  on public.mission_attempts for select to authenticated
  using (public.is_self(child_id) or public.is_parent_of(child_id));

create policy "Step results are viewable by the child and their parents"
  on public.step_results for select to authenticated
  using (public.is_self(child_id) or public.is_parent_of(child_id));

create policy "Skill progress is viewable by the child and their parents"
  on public.skill_progress for select to authenticated
  using (public.is_self(child_id) or public.is_parent_of(child_id));

create policy "Review items are viewable by the child and their parents"
  on public.review_items for select to authenticated
  using (public.is_self(child_id) or public.is_parent_of(child_id));

create policy "Practice results are viewable by the child and their parents"
  on public.practice_results for select to authenticated
  using (public.is_self(child_id) or public.is_parent_of(child_id));

create policy "Check-ins are viewable by the child and their parents"
  on public.learning_checkins for select to authenticated
  using (public.is_self(child_id) or public.is_parent_of(child_id));

-- ---------------------------------------------------------------------------
-- Internal helper
-- ---------------------------------------------------------------------------

-- The caller's family when the caller is an approved child; JA401 signed out, JA403 otherwise.
create or replace function public.learning_child_family()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_family_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = 'JA401', message = 'Not signed in';
  end if;
  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.profile_id = v_uid
    and fm.role = 'child'
    and fm.status = 'approved';
  if v_family_id is null then
    raise exception using errcode = 'JA403', message = 'Only a child in a family can do this';
  end if;
  return v_family_id;
end;
$$;

comment on function public.learning_child_family() is 'Internal. The approved child caller''s family; JA401 when signed out, JA403 for anyone else.';

revoke execute on function public.learning_child_family() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Child writes
-- ---------------------------------------------------------------------------

create or replace function public.start_mission(p_mission_key text, p_content_version integer)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_family_id uuid := public.learning_child_family();
  v_open public.mission_attempts;
  v_id uuid;
begin
  if p_mission_key is null or p_mission_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_mission_key) > 40 then
    raise exception using errcode = '22023', message = 'Unknown mission';
  end if;
  if p_content_version is null or p_content_version not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'Unknown mission version';
  end if;

  -- One child starts one thing at a time: a double tap must not open two attempts.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('learning:' || v_uid::text, 0));

  select * into v_open
  from public.mission_attempts a
  where a.child_id = v_uid and a.mission_key = p_mission_key and a.status = 'started';

  if found then
    if v_open.content_version = p_content_version then
      return v_open.id;
    end if;
    -- The content changed since the child started: begin again on the new version.
    update public.mission_attempts set status = 'abandoned' where id = v_open.id;
  end if;

  insert into public.mission_attempts (family_id, child_id, mission_key, content_version)
  values (v_family_id, v_uid, p_mission_key, p_content_version)
  returning id into v_id;
  return v_id;
end;
$$;

comment on function public.start_mission(text, integer) is 'Approved child starts a mission or resumes the open attempt for it (same content version). JA401, JA403, 22023.';

create or replace function public.record_step_result(
  p_attempt_id uuid,
  p_step_key text,
  p_phase text,
  p_step_type text,
  p_skill_key text,
  p_answer jsonb,
  p_correct boolean,
  p_hints_used integer,
  p_tries integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_attempt public.mission_attempts;
  v_inserted boolean;
  v_first_try boolean;
begin
  perform public.learning_child_family();

  select * into v_attempt from public.mission_attempts a where a.id = p_attempt_id for update;
  if not found or v_attempt.child_id <> v_uid then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;
  -- A late retry after the mission finished changes nothing.
  if v_attempt.status <> 'started' then
    return false;
  end if;

  if p_phase is null or p_phase not in ('main', 'replay')
     or p_step_type is null or p_step_type not in ('choice', 'predict', 'reason', 'amount', 'split', 'sort', 'match')
     or p_step_key is null or p_step_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_step_key) > 40
     or p_skill_key is null or p_skill_key !~ '^[a-z_]+\.[a-z_]+$' or char_length(p_skill_key) > 40
     or p_answer is null or jsonb_typeof(p_answer) <> 'object' or pg_catalog.pg_column_size(p_answer) > 2048
     or p_correct is null
     or p_hints_used is null or p_hints_used not between 0 and 2
     or p_tries is null or p_tries not between 1 and 2 then
    raise exception using errcode = '22023', message = 'Invalid step result';
  end if;

  insert into public.step_results (
    attempt_id, child_id, step_key, phase, step_type, skill_key, answer, correct, hints_used, tries
  ) values (
    p_attempt_id, v_uid, p_step_key, p_phase, p_step_type, p_skill_key, p_answer, p_correct, p_hints_used, p_tries
  )
  on conflict (attempt_id, step_key, phase) do nothing
  returning true into v_inserted;

  if v_inserted is null then
    return false;
  end if;

  v_first_try := p_correct and p_tries = 1 and p_hints_used = 0;

  insert into public.skill_progress as sp (
    child_id, skill_key, level, first_try_correct, correct_with_hints, reasons_correct
  ) values (
    v_uid,
    p_skill_key,
    case when p_correct then 2 else 1 end,
    case when v_first_try and p_phase = 'main' then 1 else 0 end,
    case when p_correct and not v_first_try then 1 else 0 end,
    case when p_correct and p_step_type = 'reason' then 1 else 0 end
  )
  on conflict (child_id, skill_key) do update
    set level = greatest(sp.level, excluded.level),
        first_try_correct = sp.first_try_correct + excluded.first_try_correct,
        correct_with_hints = sp.correct_with_hints + excluded.correct_with_hints,
        reasons_correct = sp.reasons_correct + excluded.reasons_correct,
        updated_at = now();

  return true;
end;
$$;

comment on function public.record_step_result(uuid, text, text, text, text, jsonb, boolean, integer, integer) is
  'Approved child records the final result of a step in their own open attempt and updates the skill. Idempotent per (attempt, step, phase): false when already recorded or the attempt is finished. JA403, 22023.';

create or replace function public.complete_mission(p_attempt_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_family_id uuid := public.learning_child_family();
  v_attempt public.mission_attempts;
  v_today date;
begin
  select * into v_attempt from public.mission_attempts a where a.id = p_attempt_id for update;
  if not found or v_attempt.child_id <> v_uid then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;
  if v_attempt.status = 'completed' then
    return false;
  end if;
  if v_attempt.status = 'abandoned' then
    raise exception using errcode = 'JA409', message = 'This mission was restarted';
  end if;
  if not exists (select 1 from public.step_results r where r.attempt_id = p_attempt_id) then
    raise exception using errcode = '22023', message = 'Answer the mission first';
  end if;

  update public.mission_attempts set status = 'completed', completed_at = now() where id = p_attempt_id;

  -- Every skill the mission touched gets a review tomorrow (box 1), unless it has one already.
  v_today := public.family_today(v_family_id);
  insert into public.review_items (child_id, skill_key, box, due_on)
  select distinct v_uid, r.skill_key, 1, v_today + 1
  from public.step_results r
  where r.attempt_id = p_attempt_id
  on conflict (child_id, skill_key) do nothing;

  return true;
end;
$$;

comment on function public.complete_mission(uuid) is 'Approved child finishes their open attempt; schedules a first review for each skill it touched. False when already completed. JA403, JA409 (restarted), 22023 (nothing answered).';

create or replace function public.record_practice_result(
  p_item_key text,
  p_skill_key text,
  p_answer jsonb,
  p_correct boolean,
  p_hints_used integer,
  p_tries integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_family_id uuid := public.learning_child_family();
  v_today date := public.family_today(v_family_id);
  v_item public.review_items;
  v_inserted boolean;
  v_box smallint;
begin
  if p_item_key is null or p_item_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_item_key) > 40
     or p_skill_key is null or p_skill_key !~ '^[a-z_]+\.[a-z_]+$' or char_length(p_skill_key) > 40
     or p_answer is null or jsonb_typeof(p_answer) <> 'object' or pg_catalog.pg_column_size(p_answer) > 2048
     or p_correct is null
     or p_hints_used is null or p_hints_used not between 0 and 2
     or p_tries is null or p_tries not between 1 and 2 then
    raise exception using errcode = '22023', message = 'Invalid practice result';
  end if;

  insert into public.practice_results (
    child_id, item_key, skill_key, answered_on, answer, correct, hints_used, tries
  ) values (
    v_uid, p_item_key, p_skill_key, v_today, p_answer, p_correct, p_hints_used, p_tries
  )
  on conflict (child_id, item_key, answered_on) do nothing
  returning true into v_inserted;

  if v_inserted is null then
    return false;
  end if;

  select * into v_item
  from public.review_items ri
  where ri.child_id = v_uid and ri.skill_key = p_skill_key
  for update;

  -- Only a review that is due moves its box; extra practice is recorded but changes nothing.
  if found and v_item.due_on <= v_today then
    if p_correct and p_hints_used = 0 and p_tries = 1 then
      v_box := case v_item.box when 1 then 3 when 3 then 7 else 14 end;
      update public.review_items
        set box = v_box, due_on = v_today + v_box, last_result = 'correct', last_reviewed_on = v_today
        where child_id = v_uid and skill_key = p_skill_key;
      insert into public.skill_progress as sp (child_id, skill_key, level, reviews_passed)
      values (v_uid, p_skill_key, 3, 1)
      on conflict (child_id, skill_key) do update
        set level = 3, reviews_passed = sp.reviews_passed + 1, updated_at = now();
    elsif p_correct then
      update public.review_items
        set due_on = v_today + v_item.box, last_result = 'correct_with_hints', last_reviewed_on = v_today
        where child_id = v_uid and skill_key = p_skill_key;
    else
      update public.review_items
        set box = 1, due_on = v_today + 1, last_result = 'wrong', last_reviewed_on = v_today
        where child_id = v_uid and skill_key = p_skill_key;
    end if;
  end if;

  return true;
end;
$$;

comment on function public.record_practice_result(text, text, jsonb, boolean, integer, integer) is
  'Approved child records a practice answer; a due review moves up a box (right, no hints), stays (right with hints) or drops to box 1 (wrong). One result per item per family day: false on repeat. JA403, 22023.';

create or replace function public.complete_checkin(p_content_version integer, p_answers jsonb, p_correct_count integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_inserted boolean;
begin
  perform public.learning_child_family();
  if p_content_version is null or p_content_version not between 1 and 1000
     or p_answers is null or jsonb_typeof(p_answers) <> 'array' or pg_catalog.pg_column_size(p_answers) > 8192
     or p_correct_count is null or p_correct_count not between 0 and 5 then
    raise exception using errcode = '22023', message = 'Invalid check-in';
  end if;

  insert into public.learning_checkins (child_id, content_version, answers, correct_count)
  values (v_uid, p_content_version, p_answers, p_correct_count)
  on conflict (child_id) do nothing
  returning true into v_inserted;

  return coalesce(v_inserted, false);
end;
$$;

comment on function public.complete_checkin(integer, jsonb, integer) is 'Approved child records the starting check-in once; false when already done. JA403, 22023.';

revoke execute on function public.start_mission(text, integer) from public, anon;
revoke execute on function public.record_step_result(uuid, text, text, text, text, jsonb, boolean, integer, integer) from public, anon;
revoke execute on function public.complete_mission(uuid) from public, anon;
revoke execute on function public.record_practice_result(text, text, jsonb, boolean, integer, integer) from public, anon;
revoke execute on function public.complete_checkin(integer, jsonb, integer) from public, anon;

grant execute on function public.start_mission(text, integer) to authenticated;
grant execute on function public.record_step_result(uuid, text, text, text, text, jsonb, boolean, integer, integer) to authenticated;
grant execute on function public.complete_mission(uuid) to authenticated;
grant execute on function public.record_practice_result(text, text, jsonb, boolean, integer, integer) to authenticated;
grant execute on function public.complete_checkin(integer, jsonb, integer) to authenticated;
