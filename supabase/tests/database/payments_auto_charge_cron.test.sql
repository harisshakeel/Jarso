begin;
select plan(8);

select has_function('public', 'trigger_auto_charge', array[]::text[], 'trigger_auto_charge() exists');
select is_definer('public', 'trigger_auto_charge', array[]::text[], 'trigger_auto_charge() is security definer');
select ok(
  not has_function_privilege('authenticated', 'public.trigger_auto_charge()', 'execute'),
  'authenticated cannot execute trigger_auto_charge()'
);
select ok(
  not has_function_privilege('anon', 'public.trigger_auto_charge()', 'execute'),
  'anon cannot execute trigger_auto_charge()'
);

select ok(
  exists (select 1 from cron.job where jobname = 'charge-due-cards' and schedule = '9 * * * *'),
  'charge-due-cards is scheduled hourly at :09'
);

-- Without the Vault secrets it returns quietly and queues nothing.
delete from vault.secrets where name in ('app_url', 'cron_secret');
create temp table queued_before as select count(*) as n from net.http_request_queue;
select lives_ok(
  'select public.trigger_auto_charge()',
  'trigger_auto_charge() returns without error when the Vault secrets are absent'
);

-- With both (placeholders; rolled back) it queues one POST to the cron route.
select vault.create_secret('http://app.test/', 'app_url');
select vault.create_secret('placeholder-cron-secret-0000', 'cron_secret');
select public.trigger_auto_charge();
select is(
  (select count(*) from net.http_request_queue
    where method = 'POST'
      and url = 'http://app.test/api/cron/payments/auto-charge'
      and headers ->> 'Authorization' = 'Bearer placeholder-cron-secret-0000'
      and timeout_milliseconds = 60000)::int,
  1,
  'with the secrets set it queues one POST to the cron route with the bearer and a 60 s timeout'
);
select is(
  (select count(*) from net.http_request_queue)::int - (select n from queued_before)::int,
  1,
  'and nothing else'
);

select * from finish();
rollback;
