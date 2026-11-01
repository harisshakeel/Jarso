-- An auto charge that ends expired (the stale sweep after a provider outage or a lost webhook) is
-- never retried, so the payer hears about it like a failed one. Canceled still sends nothing.
-- create or replace keeps the existing grants.

create or replace function public.fail_payment(p_payment_id uuid, p_status text, p_failure_code text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p public.payments;
begin
  if p_status is null or p_status not in ('failed', 'expired', 'canceled') then
    raise exception using errcode = '22023', message = 'Invalid payment status';
  end if;
  if p_failure_code is not null and p_failure_code !~ '^[a-z_]{1,64}$' then
    raise exception using errcode = '22023', message = 'Invalid failure code';
  end if;

  select * into v_p from public.payments p where p.id = p_payment_id for update;
  if not found then
    raise exception using errcode = 'JA404', message = 'Payment not found';
  end if;
  -- The status machine only moves forward: a late or replayed event is a no-op.
  if v_p.status not in ('pending', 'requires_action') then
    return;
  end if;

  update public.payments
  set status = p_status,
      failure_code = p_failure_code
  where id = v_p.id;

  if v_p.trigger = 'auto' and p_status in ('failed', 'expired') and v_p.payer_id is not null then
    insert into public.notifications (family_id, recipient_id, child_id, kind, source_type, source_id, payload)
    values (
      v_p.family_id, v_p.payer_id, v_p.child_id, 'card_charge_failed', 'payment', v_p.id,
      pg_catalog.jsonb_build_object(
        'source_type', v_p.source_type, 'source_id', v_p.source_id,
        'amount_minor', v_p.amount_minor, 'failure_code', p_failure_code
      )
    );
  end if;
end;
$$;

comment on function public.fail_payment(uuid, text, text) is 'Service role only. Moves a pending / requires_action payment to failed, expired or canceled with an optional failure code (^[a-z_]{1,64}$); any other status is left alone. A failed or expired auto charge notifies the payer (card_charge_failed, source payment); canceled does not. JA404, 22023.';

-- The request gets a 60 s timeout, matching the route's maxDuration.
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
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;
