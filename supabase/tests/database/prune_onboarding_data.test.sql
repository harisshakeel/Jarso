begin;
\ir _helpers.psql
select plan(10);

-- Privileges and schedule
select function_privs_are('public', 'prune_onboarding_data', array[]::text[], 'service_role', array[]::text[],
  'service_role cannot run the retention job');
select function_privs_are('public', 'prune_onboarding_data', array[]::text[], 'authenticated', array[]::text[],
  'nor can authenticated');
select ok(
  not exists (select 1 from pg_available_extensions where name = 'pg_cron')
  or exists (select 1 from cron.job where jobname = 'prune-onboarding-data' and schedule = '23 3 * * *'),
  'the retention job is scheduled daily where pg_cron exists');

-- Fixtures (as the table owner): one invitation of each kind, and old and fresh counters.
insert into public.invitations (nickname, parent_email, token_hash, code_hash, status, expires_at) values
  ('Old', 'a@example.com', 't-old', 'c-old', 'pending', now() - interval '31 days'),
  ('Expired', 'b@example.com', 't-exp', 'c-exp', 'expired', now() - interval '40 days'),
  ('Recent', 'c@example.com', 't-rec', 'c-rec', 'pending', now() - interval '29 days'),
  ('Live', 'd@example.com', 't-live', 'c-live', 'pending', now() + interval '3 days'),
  ('Kept', 'e@example.com', 't-acc', 'c-acc', 'accepted', now() - interval '90 days');

insert into public.usage_counters (key, window_start, count) values
  ('test:old', now() - interval '3 days', 4),
  ('test:fresh', now() - interval '1 day', 2);

select is(public.prune_onboarding_data(), 3, 'two stale invitations and one old window are deleted');
select is(
  (select array_agg(nickname order by nickname) from public.invitations
   where token_hash in ('t-old', 't-exp', 't-rec', 't-live', 't-acc')),
  array['Kept', 'Live', 'Recent'],
  'unaccepted invitations expired 30+ days ago go; recent, live and accepted ones stay');
select is((select count(*)::int from public.usage_counters where key = 'test:old'), 0,
  'a window older than 2 days goes');
select is((select count(*)::int from public.usage_counters where key = 'test:fresh'), 1,
  'a window from yesterday stays (it may still be counting)');
select ok(
  exists (
    select 1 from public.job_runs
    where job = 'prune-onboarding-data' and status = 'ok' and finished_at is not null
      and details = '{"invitations": 2, "usage_counters": 1}'::jsonb),
  'the run is recorded with its counts');
select is(public.prune_onboarding_data(), 0, 'pruning twice changes nothing');
select is(
  (select count(*)::int from public.job_runs where job = 'prune-onboarding-data'), 2,
  'each run is recorded');

select * from finish();
rollback;
