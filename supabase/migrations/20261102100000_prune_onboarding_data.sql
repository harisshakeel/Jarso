-- Retention for onboarding data (data minimisation). Daily cron, same shape as
-- blank_old_guide_text: security definer, a job_runs row per run, no grants.
--  * invitations that were never accepted go 30 days after they expired (they hold a parent's
--    email address and a child's nickname). Accepted ones stay: they record the consent path.
--  * usage_counters windows older than 2 days (the longest limiter window is 1 day).
-- Expired guide_memories are already swept daily by blank_old_guide_text (20261031070000).

create or replace function public.prune_onboarding_data()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run_id uuid;
  v_invitations integer;
  v_counters integer;
begin
  insert into public.job_runs (job) values ('prune-onboarding-data') returning id into v_run_id;
  delete from public.invitations
    where status <> 'accepted' and expires_at < now() - interval '30 days';
  get diagnostics v_invitations = row_count;
  delete from public.usage_counters where window_start < now() - interval '2 days';
  get diagnostics v_counters = row_count;
  update public.job_runs
    set finished_at = pg_catalog.clock_timestamp(), status = 'ok',
        details = jsonb_build_object('invitations', v_invitations, 'usage_counters', v_counters)
    where id = v_run_id;
  return v_invitations + v_counters;
end;
$$;

comment on function public.prune_onboarding_data() is 'Cron only. Deletes invitations not accepted and expired 30+ days ago, and rate-limit windows older than 2 days; records a job_runs row. Returns rows deleted.';

revoke execute on function public.prune_onboarding_data() from public, anon, authenticated, service_role;

-- Daily at 03:23 UTC. Same pattern as blank-old-guide-text: skip with a warning where pg_cron
-- is unavailable.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'prune-onboarding-data',
      '23 3 * * *',
      $cmd$set local statement_timeout = '60s'; select public.prune_onboarding_data()$cmd$
    );
  else
    raise warning 'pg_cron not available: prune-onboarding-data not scheduled';
  end if;
end;
$$;
