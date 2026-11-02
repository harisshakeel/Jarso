-- Demo clock (D11), part 3: learning answers are written in the family's time too.
--
-- mission_attempts.completed_at and the family's today are shifted (20261102200100), but
-- step_results.answered_at and practice_results.answered_at were not, so after a clock move the
-- learning page counted days learned this week, the last learning day and the comeback nudge
-- from real time. Both are now shifted on insert, like ledger_entries.occurred_at.
--
-- Nothing compares answered_at with real time: the write caps count rows per attempt
-- (step_results) and per family day (practice_results.answered_on, already a family date).
-- Neither table has a family_id: a step's family is its attempt's, a practice answer's is the
-- child's approved family. Trigger functions are invoker, as in 20261102200100.

-- ---------------------------------------------------------------------------
-- step_results.answered_at
-- ---------------------------------------------------------------------------

create function public.step_results_family_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.answered_at := new.answered_at + public.family_clock_offset((
    select a.family_id from public.mission_attempts a where a.id = new.attempt_id
  ));
  return new;
end;
$$;

comment on function public.step_results_family_time() is 'Trigger: writes step_results.answered_at in family time (demo clock offset of the attempt''s family added) on insert.';

create trigger step_results_family_time
  before insert on public.step_results
  for each row execute function public.step_results_family_time();

-- ---------------------------------------------------------------------------
-- practice_results.answered_at
-- ---------------------------------------------------------------------------

create function public.practice_results_family_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.answered_at := new.answered_at + public.family_clock_offset((
    select fm.family_id
    from public.family_members fm
    where fm.profile_id = new.child_id
      and fm.role = 'child'
      and fm.status = 'approved'
  ));
  return new;
end;
$$;

comment on function public.practice_results_family_time() is 'Trigger: writes practice_results.answered_at in family time (demo clock offset of the child''s approved family added) on insert. answered_on is already a family date.';

create trigger practice_results_family_time
  before insert on public.practice_results
  for each row execute function public.practice_results_family_time();

-- Trigger functions are never called directly.
revoke execute on function
  public.step_results_family_time(),
  public.practice_results_family_time()
from public, anon, authenticated;
