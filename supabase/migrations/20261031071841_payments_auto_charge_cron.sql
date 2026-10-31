-- Auto charge scheduling (payments design §6.7). pg_cron calls the app's cron route hourly at :09
-- (after generate-due-occurrences at :05 and reminders at :07) through pg_net. The route URL and
-- its bearer secret live in Supabase Vault as `app_url` and `cron_secret`; they are created per
-- environment by hand, never in a migration. Until both exist the job does nothing, so local
-- runs and CI are unaffected. A daily Vercel Cron on the same route is the fallback.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  else
    raise warning 'pg_net not available: trigger_auto_charge will do nothing';
  end if;
end;
$$;

create or replace function public.trigger_auto_charge()
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
    url := pg_catalog.rtrim(v_app_url, '/') || '/api/cron/payments/auto-charge',
    headers := pg_catalog.jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
end;
$$;

comment on function public.trigger_auto_charge() is
  'Cron job, no grants. POSTs to <app_url>/api/cron/payments/auto-charge with Authorization: Bearer <cron_secret>, both read from Vault (vault.decrypted_secrets names app_url and cron_secret). Does nothing when either secret, Vault or pg_net is missing. The request is queued by pg_net and sent after commit.';

revoke execute on function public.trigger_auto_charge() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'charge-due-cards',
      '9 * * * *',
      $cmd$select public.trigger_auto_charge()$cmd$
    );
  else
    raise warning 'pg_cron not available: charge-due-cards not scheduled';
  end if;
end;
$$;
