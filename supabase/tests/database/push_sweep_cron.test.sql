begin;
select plan(8);

select has_function('public', 'trigger_push_sweep', array[]::text[], 'trigger_push_sweep() exists');
select is_definer('public', 'trigger_push_sweep', array[]::text[], 'trigger_push_sweep() is security definer');
select ok(
  not has_function_privilege('authenticated', 'public.trigger_push_sweep()', 'execute'),
  'authenticated cannot execute trigger_push_sweep()'
);
select ok(
  not has_function_privilege('anon', 'public.trigger_push_sweep()', 'execute'),
  'anon cannot execute trigger_push_sweep()'
);

select ok(
  exists (select 1 from cron.job where jobname = 'push-sweep' and schedule = '*/15 * * * *'),
  'push-sweep is scheduled every 15 minutes'
);

-- Without the Vault secrets it returns quietly and queues nothing.
delete from vault.secrets where name in ('app_url', 'cron_secret');
create temp table queued_before as select count(*) as n from net.http_request_queue;
select lives_ok(
  'select public.trigger_push_sweep()',
  'trigger_push_sweep() returns without error when the Vault secrets are absent'
);

-- With both (placeholders; rolled back) it queues one POST to the push cron route.
select vault.create_secret('http://app.test/', 'app_url');
select vault.create_secret('placeholder-cron-secret-0000', 'cron_secret');
select public.trigger_push_sweep();
select is(
  (select count(*) from net.http_request_queue
    where method = 'POST'
      and url = 'http://app.test/api/cron/push'
      and headers ->> 'Authorization' = 'Bearer placeholder-cron-secret-0000'
      and timeout_milliseconds = 30000)::int,
  1,
  'with the secrets set it queues one POST to the push route with the bearer and a 30 s timeout'
);
select is(
  (select count(*) from net.http_request_queue)::int - (select n from queued_before)::int,
  1,
  'and nothing else'
);

select * from finish();
rollback;
