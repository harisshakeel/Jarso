-- Push sweep every 15 minutes (mobile wave 3). The daily Vercel cron (01:30) was too slow for
-- allowance reminders and for child notices held overnight by quiet hours (released from
-- 07:00). pg_cron now calls /api/cron/push every 15 minutes through pg_net, as ADR 0012
-- suggested; the Vercel cron entry is removed in the same change. Immediate dispatch after
-- actions stays. Same shape as trigger_auto_charge (charge-due-cards): Vault app_url and
-- cron_secret, a quiet no-op when Vault, pg_net or a secret is missing.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  else
    raise warning 'pg_net not available: trigger_push_sweep will do nothing';
  end if;
end;
$$;

create or replace function public.trigger_push_sweep()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_app_url text;
  v_secret text;
begin
  if pg_catalog.to_regclass('vault.decrypted_secrets') is null
     or pg_catalog.to_regnamespace('net') is null then
    return;
  end if;

  select s.decrypted_secret into v_app_url
  from vault.decrypted_secrets s where s.name = 'app_url' limit 1;
  select s.decrypted_secret into v_secret
  from vault.decrypted_secrets s where s.name = 'cron_secret' limit 1;

  if coalesce(v_app_url, '') = '' or coalesce(v_secret, '') = '' then
    return;
  end if;

  perform net.http_post(
    url := pg_catalog.rtrim(v_app_url, '/') || '/api/cron/push',
    headers := pg_catalog.jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

comment on function public.trigger_push_sweep() is
  'Cron job, no grants. POSTs to <app_url>/api/cron/push with Authorization: Bearer <cron_secret>, both read from Vault (vault.decrypted_secrets names app_url and cron_secret). Does nothing when either secret, Vault or pg_net is missing. The request is queued by pg_net and sent after commit.';

revoke execute on function public.trigger_push_sweep() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'push-sweep',
      '*/15 * * * *',
      $cmd$select public.trigger_push_sweep()$cmd$
    );
  else
    raise warning 'pg_cron not available: push-sweep not scheduled';
  end if;
end;
$$;
