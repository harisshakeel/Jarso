-- Generator timeout without losing the run row. The hourly job runs under a 60 s
-- statement_timeout set in the cron command; when it fires, the whole statement rolls back,
-- including the job_runs row, so a slow run left no trace. plpgsql can't give one loop
-- iteration its own statement_timeout (the setting is read when a top-level statement starts),
-- and catching query_canceled would leave the rest of the run unbounded. Instead:
--   * a 45 s time budget, checked before each schedule: past it the loop stops, the run is
--     recorded as error with stopped_early = true, and the next hourly run catches up (the
--     generator is idempotent);
--   * lock_timeout = 5s for the function (read whenever a lock wait starts, so it does apply
--     inside it): a schedule stuck behind a lock fails alone with 55P03 and is recorded like
--     any other failing schedule.
-- The 60 s cron timeout stays as the backstop. Otherwise the same as 20261029130003.

create or replace function public.generate_due_occurrences(p_now timestamptz default now())
returns int
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_run_id uuid;
  v_s public.allowance_schedules;
  v_id uuid;
  v_today date;
  v_index int;
  v_inserted int := 0;
  v_failed int := 0;
  v_errors jsonb := '[]'::jsonb;
  -- Below the cron command's 60 s statement_timeout, so the run row is written in time.
  c_budget constant interval := '45 seconds';
  v_started timestamptz := pg_catalog.clock_timestamp();
  v_stopped_early boolean := false;
begin
  insert into public.job_runs (job) values ('generate-due-occurrences') returning id into v_run_id;

  -- Active schedules, and paused ones with a pause date, whose child is still
  -- an approved child member of the schedule's family.
  for v_id in
    select s.id
    from public.allowance_schedules s
    where (s.status = 'active' or (s.status = 'paused' and s.paused_through is not null))
      and exists (
        select 1 from public.family_members fm
        where fm.family_id = s.family_id
          and fm.profile_id = s.child_id
          and fm.role = 'child'
          and fm.status = 'approved'
      )
    order by s.created_at, s.id
  loop
    -- Out of time: stop here and let the next hourly run catch up.
    if pg_catalog.clock_timestamp() - v_started > c_budget then
      v_stopped_early := true;
      exit;
    end if;

    -- One bad schedule must not stop the others: record it and carry on.
    begin
      -- Skip a schedule a parent is editing right now; the next run catches up.
      select * into v_s from public.allowance_schedules s where s.id = v_id for update skip locked;
      continue when not found;

      v_today := public.family_today(v_s.family_id, p_now);
      -- No family row (being deleted): nothing to generate.
      continue when v_today is null;

      if v_s.status = 'paused' then
        continue when v_s.paused_through is null or v_s.paused_through >= v_today;

        -- Periods inside the pause are never generated: first period after it.
        v_index := v_s.next_index;
        while public.allowance_due_on(v_s.anchor_on, v_s.frequency, v_index) <= v_s.paused_through loop
          v_index := v_index + 1;
        end loop;

        update public.allowance_schedules
        set status = 'active',
            next_index = v_index,
            paused_through = null,
            pause_message = null
        where id = v_s.id;

        insert into public.audit_log (family_id, actor_id, action, subject_id, details)
        values (
          v_s.family_id, null, 'allowance.resumed', v_s.id,
          pg_catalog.jsonb_build_object('auto', true, 'skipped_periods', v_index - v_s.next_index)
        );
      end if;

      v_inserted := v_inserted + public.generate_for_schedule(v_s.id, v_today);
    exception when others then
      v_failed := v_failed + 1;
      if pg_catalog.jsonb_array_length(v_errors) < 20 then
        v_errors := v_errors || pg_catalog.jsonb_build_object(
          'schedule_id', v_id, 'sqlstate', sqlstate, 'message', pg_catalog.left(sqlerrm, 200)
        );
      end if;
    end;
  end loop;

  update public.job_runs
  set finished_at = pg_catalog.clock_timestamp(),
      status = case when v_failed = 0 and not v_stopped_early then 'ok' else 'error' end,
      details = pg_catalog.jsonb_build_object(
        'inserted', v_inserted, 'failed', v_failed, 'errors', v_errors,
        'stopped_early', v_stopped_early
      )
  where id = v_run_id;

  return v_inserted;
end;
$$;

comment on function public.generate_due_occurrences(timestamptz) is 'Cron job. Auto-resumes paused schedules whose paused_through has passed (skipping periods inside the pause), then generates due periods for every active schedule at its family''s local date. Skips schedules whose child is no longer an approved child member. A failing schedule (including a 5 s lock timeout) is recorded in job_runs.details (schedule_id, sqlstate, message cut to 200 chars) and the run ends as error; others still run. Stops starting new schedules after 45 s (details.stopped_early, run ends as error) so the run row is written before the cron 60 s timeout; the next run catches up. Returns rows inserted.';
