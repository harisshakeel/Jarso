-- Hourly allowance generation. Slice 2 design §4.1; architecture.md §9.
-- Auto-resumes expired pauses, then generates every due period per family
-- timezone. Idempotent: reruns and late runs only catch up.

create or replace function public.generate_due_occurrences(p_now timestamptz default now())
returns int
language plpgsql
volatile
security definer
set search_path = ''
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
    -- One bad schedule must not stop the others: record it and carry on.
    begin
      -- Skip a schedule a parent is editing right now; the next run catches up.
      select * into v_s from public.allowance_schedules s where s.id = v_id for update skip locked;
      continue when not found;

      v_today := public.family_today(v_s.family_id, p_now);

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
        v_errors := v_errors || pg_catalog.jsonb_build_object('schedule_id', v_id, 'sqlstate', sqlstate);
      end if;
    end;
  end loop;

  update public.job_runs
  set finished_at = pg_catalog.clock_timestamp(),
      status = case when v_failed = 0 then 'ok' else 'error' end,
      details = pg_catalog.jsonb_build_object('inserted', v_inserted, 'failed', v_failed, 'errors', v_errors)
  where id = v_run_id;

  return v_inserted;
end;
$$;

comment on function public.generate_due_occurrences(timestamptz) is 'Cron job. Auto-resumes paused schedules whose paused_through has passed (skipping periods inside the pause), then generates due periods for every active schedule at its family''s local date. Skips schedules whose child is no longer an approved child member. A failing schedule is recorded in job_runs.details and the run ends as error; others still run. Returns rows inserted.';

revoke execute on function public.generate_due_occurrences(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Schedule: five past every hour. Skipped where pg_cron is not installed;
-- enable it on the hosted project (Database > Extensions) before release.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('generate-due-occurrences', '5 * * * *', 'select public.generate_due_occurrences()');
  else
    raise notice 'pg_cron not available: generate-due-occurrences not scheduled';
  end if;
end;
$$;
