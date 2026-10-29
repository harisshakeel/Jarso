-- Learning progress (FR06, FR08, FR10). Design: docs/superpowers/specs/2026-10-29-learning-and-guide-design.md
-- §4.5 and ADR 0009. Missions, topics and review items are versioned JSON in the app
-- (src/content/learning); only a child's progress lives here, keyed by stable content keys.
--
-- Missions use fictional amounts and never touch ledger_entries (invariants 2 and 11). A child
-- writes only through the security definer functions below, which check that the caller is an
-- approved child. Grading runs in app code (one shared gradeStep), so a child calling these
-- functions directly could forge their own learning stats and nothing else: accepted (spec §12).
-- Answers themselves are not stored (only right or wrong, hints and tries), and every write
-- function caps how much one child can write (JA429), so direct calls can't fill the tables.
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
  check ((status = 'completed') = (completed_at is not null)),
  -- Lets step_results tie its child_id (the column RLS reads) to the attempt's child.
  constraint mission_attempts_id_child_key unique (id, child_id)
);

comment on table public.mission_attempts is 'A child''s run through one mission. At most one started attempt per child and mission. Written only by the learning functions.';
comment on column public.mission_attempts.content_version is 'Version of the mission content the attempt ran; a new version abandons an open attempt.';

create unique index mission_attempts_one_open_idx
  on public.mission_attempts (child_id, mission_key)
  where status = 'started';
create index mission_attempts_child_started_idx on public.mission_attempts (child_id, started_at desc);
create index mission_attempts_family_id_idx on public.mission_attempts (family_id);

create table public.step_results (
  attempt_id uuid not null,
  child_id uuid not null references public.profiles (id) on delete cascade,
  step_key text not null check (step_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(step_key) <= 40),
  phase text not null check (phase in ('main', 'replay')),
  step_type text not null check (step_type in ('choice', 'predict', 'reason', 'amount', 'split', 'sort', 'match')),
  skill_key text not null check (skill_key ~ '^[a-z_]+\.[a-z_]+$' and char_length(skill_key) <= 40),
  correct boolean not null,
  hints_used smallint not null check (hints_used between 0 and 2),
  tries smallint not null check (tries between 1 and 2),
  answered_at timestamptz not null default now(),
  primary key (attempt_id, step_key, phase),
  constraint step_results_attempt_fkey foreign key (attempt_id, child_id)
    references public.mission_attempts (id, child_id) on delete cascade
);

comment on table public.step_results is 'The final result of one mission step (main run or end-of-mission replay): right or wrong, hints and tries; the answer itself is not kept. Append-only; a retry of the same step is a no-op.';

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
  last_result text check (last_result in ('correct', 'correct_with_help', 'wrong')),
  last_reviewed_on date,
  primary key (child_id, skill_key)
);

comment on table public.review_items is 'Spaced review per skill: boxes of 1, 3, 7 and 14 days. Right without hints moves up a box; wrong goes back to box 1.';


create table public.practice_results (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.profiles (id) on delete cascade,
  item_key text not null check (item_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(item_key) <= 40),
  skill_key text not null check (skill_key ~ '^[a-z_]+\.[a-z_]+$' and char_length(skill_key) <= 40),
  answered_on date not null,
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
  question_count smallint not null check (question_count between 1 and 20),
  correct_count smallint not null check (correct_count >= 0),
  completed_at timestamptz not null default now(),
  check (correct_count <= question_count)
);

comment on table public.learning_checkins is 'The FR10 starting check-in, once per child: how many questions and how many were right. A starting point for the parent''s view; locks nothing and sets no skill level.';

-- ---------------------------------------------------------------------------
-- RLS: the child and the child's parents read; writes only through functions
-- ---------------------------------------------------------------------------

alter table public.mission_attempts enable row level security;
alter table public.step_results enable row level security;
alter table public.skill_progress enable row level security;
alter table public.review_items enable row level security;
alter table public.practice_results enable row level security;
alter table public.learning_checkins enable row level security;

-- RLS does not cover TRUNCATE (or REFERENCES, TRIGGER, MAINTAIN), so authenticated keeps SELECT
-- only and anon nothing.
revoke all on public.mission_attempts, public.step_results, public.skill_progress,
  public.review_items, public.practice_results, public.learning_checkins from anon, authenticated;
grant select on public.mission_attempts, public.step_results, public.skill_progress,
  public.review_items, public.practice_results, public.learning_checkins to authenticated;

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

-- Caps on what one child can write, so direct calls can't fill the tables (JA429). Generous for
-- real use: a mission has at most 10 steps (so 20 results with replays), a busy day is a few
-- missions and one practice set.
--   attempts started in 24 hours: 40; results per attempt: 20; practice answers per day: 60.

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

  -- Locked, so a complete_mission that commits first is seen here, not overwritten.
  select * into v_open
  from public.mission_attempts a
  where a.child_id = v_uid and a.mission_key = p_mission_key and a.status = 'started'
  for update;

  if found then
    if v_open.content_version = p_content_version then
      return v_open.id;
    end if;
    -- An old page must not abandon an attempt on newer content.
    if p_content_version < v_open.content_version then
      raise exception using errcode = 'JA409', message = 'This mission was updated';
    end if;
    -- The content changed since the child started: begin again on the new version.
    update public.mission_attempts set status = 'abandoned' where id = v_open.id;
  end if;

  if (select count(*) from public.mission_attempts a
      where a.child_id = v_uid and a.started_at > now() - interval '24 hours') >= 40 then
    raise exception using errcode = 'JA429', message = 'Too many missions started today';
  end if;

  insert into public.mission_attempts (family_id, child_id, mission_key, content_version)
  values (v_family_id, v_uid, p_mission_key, p_content_version)
  returning id into v_id;
  return v_id;
end;
$$;

comment on function public.start_mission(text, integer) is 'Approved child starts a mission or resumes the open attempt for it (same content version); a newer version abandons the open attempt, an older one is refused. At most 40 starts in 24 hours. JA401, JA403, JA409, JA429, 22023.';

create or replace function public.record_step_result(
  p_attempt_id uuid,
  p_step_key text,
  p_phase text,
  p_step_type text,
  p_skill_key text,
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
  v_first_try boolean;
begin
  perform public.learning_child_family();

  if p_phase is null or p_phase not in ('main', 'replay')
     or p_step_type is null or p_step_type not in ('choice', 'predict', 'reason', 'amount', 'split', 'sort', 'match')
     or p_step_key is null or p_step_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_step_key) > 40
     or p_skill_key is null or p_skill_key !~ '^[a-z_]+\.[a-z_]+$' or char_length(p_skill_key) > 40
     or p_correct is null
     or p_hints_used is null or p_hints_used not between 0 and 2
     or p_tries is null or p_tries not between 1 and 2 then
    raise exception using errcode = '22023', message = 'Invalid step result';
  end if;

  select * into v_attempt from public.mission_attempts a where a.id = p_attempt_id for update;
  if not found or v_attempt.child_id <> v_uid then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;
  -- A late retry after the mission finished (or was restarted) changes nothing.
  if v_attempt.status <> 'started' then
    return false;
  end if;

  if exists (
    select 1 from public.step_results r
    where r.attempt_id = p_attempt_id and r.step_key = p_step_key and r.phase = p_phase
  ) then
    return false;
  end if;
  if (select count(*) from public.step_results r where r.attempt_id = p_attempt_id) >= 20 then
    raise exception using errcode = 'JA429', message = 'Too many answers for one mission';
  end if;

  -- The attempt row is locked, so no concurrent call can insert the same step in between.
  insert into public.step_results (
    attempt_id, child_id, step_key, phase, step_type, skill_key, correct, hints_used, tries
  ) values (
    p_attempt_id, v_uid, p_step_key, p_phase, p_step_type, p_skill_key, p_correct, p_hints_used, p_tries
  );

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

comment on function public.record_step_result(uuid, text, text, text, text, boolean, integer, integer) is
  'Approved child records the final result of a step in their own open attempt and updates the skill (levels never drop). False when already recorded or the attempt is finished. At most 20 results per attempt. JA403, JA429, 22023.';

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

comment on function public.complete_mission(uuid) is 'Approved child finishes their open attempt; schedules a first review for each skill it touched that has none. False when already completed. JA403, JA409 (restarted), 22023 (nothing answered).';

create or replace function public.record_practice_result(
  p_item_key text,
  p_skill_key text,
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
  v_box smallint;
begin
  if p_item_key is null or p_item_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_item_key) > 40
     or p_skill_key is null or p_skill_key !~ '^[a-z_]+\.[a-z_]+$' or char_length(p_skill_key) > 40
     or p_correct is null
     or p_hints_used is null or p_hints_used not between 0 and 2
     or p_tries is null or p_tries not between 1 and 2 then
    raise exception using errcode = '22023', message = 'Invalid practice result';
  end if;

  -- Serialises this child's practice writes, so the daily cap and the duplicate check hold.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('learning:' || v_uid::text, 0));

  if exists (
    select 1 from public.practice_results r
    where r.child_id = v_uid and r.item_key = p_item_key and r.answered_on = v_today
  ) then
    return false;
  end if;
  if (select count(*) from public.practice_results r
      where r.child_id = v_uid and r.answered_on = v_today) >= 60 then
    raise exception using errcode = 'JA429', message = 'Too much practice for one day';
  end if;

  insert into public.practice_results (child_id, item_key, skill_key, answered_on, correct, hints_used, tries)
  values (v_uid, p_item_key, p_skill_key, v_today, p_correct, p_hints_used, p_tries);

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
        set due_on = v_today + v_item.box, last_result = 'correct_with_help', last_reviewed_on = v_today
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

comment on function public.record_practice_result(text, text, boolean, integer, integer) is
  'Approved child records a practice answer; a due review moves up a box (right first try, no hints), stays (right with help) or drops to box 1 (wrong). One result per item per family day (false on repeat), at most 60 a day. JA403, JA429, 22023.';

create or replace function public.complete_checkin(
  p_content_version integer,
  p_question_count integer,
  p_correct_count integer
)
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
     or p_question_count is null or p_question_count not between 1 and 20
     or p_correct_count is null or p_correct_count < 0 or p_correct_count > p_question_count then
    raise exception using errcode = '22023', message = 'Invalid check-in';
  end if;

  insert into public.learning_checkins (child_id, content_version, question_count, correct_count)
  values (v_uid, p_content_version, p_question_count, p_correct_count)
  on conflict (child_id) do nothing
  returning true into v_inserted;

  return coalesce(v_inserted, false);
end;
$$;

comment on function public.complete_checkin(integer, integer, integer) is 'Approved child records the starting check-in once; false when already done. JA403, 22023.';

revoke execute on function public.start_mission(text, integer) from public, anon;
revoke execute on function public.record_step_result(uuid, text, text, text, text, boolean, integer, integer) from public, anon;
revoke execute on function public.complete_mission(uuid) from public, anon;
revoke execute on function public.record_practice_result(text, text, boolean, integer, integer) from public, anon;
revoke execute on function public.complete_checkin(integer, integer, integer) from public, anon;

grant execute on function public.start_mission(text, integer) to authenticated;
grant execute on function public.record_step_result(uuid, text, text, text, text, boolean, integer, integer) to authenticated;
grant execute on function public.complete_mission(uuid) to authenticated;
grant execute on function public.record_practice_result(text, text, boolean, integer, integer) to authenticated;
grant execute on function public.complete_checkin(integer, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- remove_child: also delete learning progress (ADR 0007, data minimisation)
-- ---------------------------------------------------------------------------
-- Same as 20261029130007 plus the learning deletes. When the identity is deleted the rows
-- cascade anyway; when it is kept (money history) nobody can read them any more, so they go.

create or replace function public.remove_child(p_child_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_parent_family uuid;
  v_family_id uuid;
  v_status text;
  v_nickname text;
begin
  if v_uid is null then
    raise exception using errcode = 'JA401', message = 'Not signed in';
  end if;

  select fm.family_id
  into v_parent_family
  from public.family_members fm
  where fm.profile_id = v_uid
    and fm.role = 'parent'
    and fm.status = 'approved';

  -- Lock the child's row first, then decide on what it says now (not on an earlier read).
  select fm.family_id, fm.status, pr.nickname
  into v_family_id, v_status, v_nickname
  from public.family_members fm
  join public.profiles pr on pr.id = fm.profile_id
  where fm.profile_id = p_child_id
    and fm.role = 'child'
  for update of fm;

  if not found or v_parent_family is null or v_family_id <> v_parent_family then
    raise exception using errcode = 'JA403', message = 'Only the child''s parent can remove them';
  end if;

  if v_status = 'approved' then
    update public.family_members
    set status = 'removed',
        nickname_key = null,
        removed_at = now(),
        removed_by = v_uid
    where profile_id = p_child_id;

    update public.profiles set nickname = null where id = p_child_id;

    insert into public.audit_log (family_id, actor_id, action, subject_id, details)
    values (v_family_id, v_uid, 'child.removed', p_child_id, jsonb_build_object('nickname', v_nickname));
  elsif v_status <> 'removed' then
    raise exception using errcode = 'JA403', message = 'Only the child''s parent can remove them';
  end if;

  -- Idempotent from here: a parent whose first attempt failed after this commit (session
  -- revoke or identity delete) can run it again until the removal completes.
  delete from public.child_credentials c where c.profile_id = p_child_id;
  delete from public.child_pin_attempts a where a.child_id = p_child_id;
  delete from public.mission_attempts m where m.child_id = p_child_id; -- step_results cascade
  delete from public.skill_progress s where s.child_id = p_child_id;
  delete from public.review_items r where r.child_id = p_child_id;
  delete from public.practice_results r where r.child_id = p_child_id;
  delete from public.learning_checkins c where c.child_id = p_child_id;

  -- The auth identity may be deleted only while the child has no money history (ADR 0007).
  -- Otherwise it is kept, disabled, and the ledger rows survive (ledger_entries.child_id is
  -- on delete restrict, so a delete would fail anyway).
  return not exists (select 1 from public.ledger_entries le where le.child_id = p_child_id);
end;
$$;

comment on function public.remove_child(uuid) is
  'Parent removes a child: membership removed, nickname freed, credentials and learning progress deleted, audited; idempotent for an already-removed child of the same family. Returns true when the auth identity may be deleted (no ledger rows for the child), false when it must be kept. JA401/JA403.';
