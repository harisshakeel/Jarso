-- Card handover (spec 2026-10-31-stripe-card-handover-design §6.3-§6.6).
-- A parent can pay a due allowance or gift by card, by hand or automatically on the due day.
-- The provider never posts money: a succeeded payment reaches the ledger only through
-- apply_payment, under the same locks as the cash handover, so cash and card serialise.
-- Every table here is provider-neutral and written only by the service role or by
-- security definer functions. The child never sees any of it: the child's history reads
-- the ledger, where a card handover shows as method = 'card'.

-- ---------------------------------------------------------------------------
-- payment_customers: one provider customer (and at most one saved card) per parent
-- ---------------------------------------------------------------------------

create table public.payment_customers (
  parent_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('stripe', 'fake')),
  customer_ref text not null check (char_length(customer_ref) between 1 and 255),
  method_ref text check (char_length(method_ref) between 1 and 255),
  card_brand text check (char_length(card_brand) <= 32),
  card_last4 text check (card_last4 ~ '^[0-9]{4}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (parent_id, provider)
);

comment on table public.payment_customers is 'A parent''s customer at a payment provider and their saved card (opaque refs only, never card numbers). The parent reads their own; written by the service role only.';
comment on column public.payment_customers.method_ref is 'Saved payment method for off-session (auto) charges; null = no saved card.';

create trigger payment_customers_set_updated_at
  before update on public.payment_customers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- payment_setups: a save-card session, so the webhook knows whose card it is
-- ---------------------------------------------------------------------------

create table public.payment_setups (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('stripe', 'fake')),
  provider_ref text check (char_length(provider_ref) between 1 and 255),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'expired')),
  arm_type text check (arm_type in ('allowance_schedule', 'parent_gift')),
  arm_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_setups_arm_pair check ((arm_type is null) = (arm_id is null))
);

comment on table public.payment_setups is 'Save-card session. The parent reads their own; written by the service role only.';
comment on column public.payment_setups.arm_type is 'Auto-charge toggle to turn on once the card is saved (with arm_id); null = just save the card.';

create unique index payment_setups_provider_ref_key
  on public.payment_setups (provider, provider_ref)
  where provider_ref is not null;
create index payment_setups_parent_id_idx on public.payment_setups (parent_id);

create trigger payment_setups_set_updated_at
  before update on public.payment_setups
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- payments: one card payment attempt for an occurrence or a gift
-- ---------------------------------------------------------------------------

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  child_id uuid not null references public.profiles (id) on delete cascade,
  payer_id uuid references public.profiles (id) on delete set null,
  provider text not null check (provider in ('stripe', 'fake')),
  provider_ref text check (char_length(provider_ref) between 1 and 255),
  source_type text not null check (source_type in ('occurrence', 'parent_gift')),
  source_id uuid not null,
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 100000000000),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  cash_minor bigint not null check (cash_minor >= 0),
  saved_minor bigint not null check (saved_minor >= 0),
  trigger text not null default 'manual' check (trigger in ('manual', 'auto')),
  status text not null default 'pending' check (status in (
    'pending', 'requires_action', 'succeeded', 'failed', 'canceled', 'expired', 'succeeded_unapplied'
  )),
  failure_code text check (failure_code ~ '^[a-z_]{1,64}$'),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Card always pays the item's full amount: cash to Spend, saved to Save.
  constraint payments_split_check check (cash_minor + saved_minor = amount_minor)
);

comment on table public.payments is 'Card payment for a due allowance occurrence or gift. The child''s parents read; written by the service role and definer functions only.';
comment on column public.payments.cash_minor is 'Part posted to Spend on success (the "cash" side of the handover split).';
comment on column public.payments.status is 'Provider status, plus succeeded_unapplied: money captured but not posted (the source was already handed over, closed, cancelled, or its amount changed).';
comment on column public.payments.source_id is 'allowance_occurrences.id or parent_gifts.id; polymorphic, no FK.';

-- One live attempt per source; a failed / expired / canceled one frees the source.
create unique index payments_one_live_per_source
  on public.payments (source_type, source_id)
  where status in ('pending', 'requires_action', 'succeeded');
-- One automatic attempt per source, ever. Overlapping auto runs claim by inserting.
create unique index payments_one_auto_per_source
  on public.payments (source_type, source_id)
  where trigger = 'auto';
create unique index payments_provider_ref_key
  on public.payments (provider, provider_ref)
  where provider_ref is not null;
create index payments_source_idx on public.payments (source_type, source_id);
create index payments_child_id_idx on public.payments (child_id);
create index payments_family_id_idx on public.payments (family_id);
create index payments_payer_id_idx on public.payments (payer_id);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- payment_webhook_events: replay guard
-- ---------------------------------------------------------------------------

create table public.payment_webhook_events (
  provider text not null check (provider in ('stripe', 'fake')),
  event_id text not null check (char_length(event_id) between 1 and 255),
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

comment on table public.payment_webhook_events is 'Provider event ids already handled; inserting a seen id is a no-op. Service role only.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.payment_customers enable row level security;
alter table public.payment_setups enable row level security;
alter table public.payments enable row level security;
alter table public.payment_webhook_events enable row level security;

-- Writes go through the service role only; RLS also ignores TRUNCATE.
revoke all on public.payment_customers, public.payment_setups, public.payments, public.payment_webhook_events from anon;
revoke insert, update, delete, truncate on public.payment_customers, public.payment_setups, public.payments from authenticated;
revoke all on public.payment_webhook_events from authenticated;

create policy "Payment customers are viewable by their parent"
  on public.payment_customers for select
  to authenticated
  using (parent_id = (select auth.uid()));
create policy "Payment customers are not inserted directly"
  on public.payment_customers for insert
  to authenticated
  with check (false);
create policy "Payment customers are not updated directly"
  on public.payment_customers for update
  to authenticated
  using (false)
  with check (false);
create policy "Payment customers are not deleted directly"
  on public.payment_customers for delete
  to authenticated
  using (false);

create policy "Payment setups are viewable by their parent"
  on public.payment_setups for select
  to authenticated
  using (parent_id = (select auth.uid()));
create policy "Payment setups are not inserted directly"
  on public.payment_setups for insert
  to authenticated
  with check (false);
create policy "Payment setups are not updated directly"
  on public.payment_setups for update
  to authenticated
  using (false)
  with check (false);
create policy "Payment setups are not deleted directly"
  on public.payment_setups for delete
  to authenticated
  using (false);

-- Parents only: the child never sees payment state.
create policy "Payments are viewable by the child's parents"
  on public.payments for select
  to authenticated
  using ((select public.is_parent_of(child_id)));
create policy "Payments are not inserted directly"
  on public.payments for insert
  to authenticated
  with check (false);
create policy "Payments are not updated directly"
  on public.payments for update
  to authenticated
  using (false)
  with check (false);
create policy "Payments are not deleted directly"
  on public.payments for delete
  to authenticated
  using (false);

-- payment_webhook_events: no policies for anyone; the service role bypasses RLS.

-- ---------------------------------------------------------------------------
-- Auto-charge toggles and the ledger method
-- ---------------------------------------------------------------------------

alter table public.allowance_schedules
  add column auto_charge boolean not null default false,
  add column auto_charge_by uuid references public.profiles (id) on delete set null,
  add column auto_charge_since timestamptz;
alter table public.parent_gifts
  add column auto_charge boolean not null default false,
  add column auto_charge_by uuid references public.profiles (id) on delete set null,
  add column auto_charge_since timestamptz;

comment on column public.allowance_schedules.auto_charge is 'Charge auto_charge_by''s saved card on each due day on or after auto_charge_since (family date). Written by set_auto_charge / arm_auto_charge.';
comment on column public.parent_gifts.auto_charge is 'Charge auto_charge_by''s saved card on give_on, when that is on or after auto_charge_since (family date). Written by set_auto_charge / arm_auto_charge.';

create index allowance_schedules_auto_charge_by_idx on public.allowance_schedules (auto_charge_by);
create index parent_gifts_auto_charge_by_idx on public.parent_gifts (auto_charge_by);

alter table public.ledger_entries
  add column method text not null default 'cash' check (method in ('cash', 'card'));

comment on column public.ledger_entries.method is 'How the money was handed over: cash (default, every non-card write) or card (apply_payment).';

-- ---------------------------------------------------------------------------
-- Notifications: card_charge_failed (to the payer), source type payment
-- ---------------------------------------------------------------------------

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'limit_exceeded', 'withdrawal_requested', 'withdrawal_decided',
  'deposit_requested', 'deposit_decided',
  'emergency_requested', 'emergency_decided',
  'allowance_due', 'handover_reminder',
  'card_charge_failed'
));

alter table public.notifications drop constraint notifications_source_type_check;
alter table public.notifications add constraint notifications_source_type_check
  check (source_type in ('ledger_entry', 'request', 'allowance_occurrence', 'payment'));

-- ---------------------------------------------------------------------------
-- apply_payment: post a succeeded card payment (service role, from the webhook)
-- ---------------------------------------------------------------------------

create or replace function public.apply_payment(p_payment_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p public.payments;
  v_o public.allowance_occurrences;
  v_g public.parent_gifts;
  v_child_id uuid;
  v_family_id uuid;
  v_result text;
  v_kind text;
  v_label text;
  v_prefix text;
begin
  -- Lock order, same as confirm_handover / confirm_gift_handover with the payment in
  -- front: the payment row, then the source row, then the child's ledger advisory lock.
  select * into v_p from public.payments p where p.id = p_payment_id for update;
  if not found then
    raise exception using errcode = 'JA404', message = 'Payment not found';
  end if;
  if v_p.status in ('succeeded', 'succeeded_unapplied') then
    return 'already_applied';
  end if;

  -- Any other status still posts: the provider captured the money (for example a
  -- succeeded event after a declined first try in the same checkout).
  if v_p.source_type = 'occurrence' then
    select * into v_o from public.allowance_occurrences o where o.id = v_p.source_id for update;
    if not found then
      raise exception using errcode = 'JA404', message = 'Payment source not found';
    end if;
    v_child_id := v_o.child_id;
    v_family_id := v_o.family_id;
  else
    select * into v_g from public.parent_gifts g where g.id = v_p.source_id for update;
    if not found then
      raise exception using errcode = 'JA404', message = 'Payment source not found';
    end if;
    v_child_id := v_g.child_id;
    v_family_id := v_g.family_id;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ledger:' || v_child_id::text, 0));

  if v_child_id <> v_p.child_id or v_family_id <> v_p.family_id then
    raise exception using errcode = '22023', message = 'Payment does not match its source';
  end if;

  if v_p.source_type = 'occurrence' then
    v_result := case
      when v_o.status = 'closed' then 'not_given'
      when v_o.status <> 'due' then 'already_confirmed'
      when v_o.amount_minor <> v_p.amount_minor then 'amount_changed'
    end;
  else
    v_result := case
      when v_g.status = 'cancelled' then 'cancelled'
      when v_g.status <> 'pending' then 'already_confirmed'
      when v_g.amount_minor <> v_p.amount_minor then 'amount_changed'
    end;
  end if;

  if v_result is not null then
    update public.payments set status = 'succeeded_unapplied' where id = v_p.id;
    return v_result;
  end if;

  if v_p.source_type = 'occurrence' then
    v_kind := 'allowance_in';
    v_label := 'Allowance';
    v_prefix := 'occurrence:';
  else
    v_kind := 'parent_gift_in';
    v_label := coalesce(v_g.note, 'Gift');
    v_prefix := 'parent_gift:';
  end if;

  if v_p.cash_minor > 0 then
    insert into public.ledger_entries (
      family_id, child_id, mode, jar, kind, direction, amount_minor, label,
      source_type, source_id, idempotency_key, created_by, occurred_at, method
    )
    values (
      v_family_id, v_child_id, 'recorded', 'spend', v_kind, 'in', v_p.cash_minor, v_label,
      v_p.source_type, v_p.source_id, v_prefix || v_p.source_id || ':spend', v_p.payer_id, now(), 'card'
    );
  end if;
  if v_p.saved_minor > 0 then
    insert into public.ledger_entries (
      family_id, child_id, mode, jar, kind, direction, amount_minor, label,
      source_type, source_id, idempotency_key, created_by, occurred_at, method
    )
    values (
      v_family_id, v_child_id, 'recorded', 'save', v_kind, 'in', v_p.saved_minor, v_label,
      v_p.source_type, v_p.source_id, v_prefix || v_p.source_id || ':save', v_p.payer_id, now(), 'card'
    );
  end if;

  -- The payer confirms even if they have since left the family: they paid.
  if v_p.source_type = 'occurrence' then
    update public.allowance_occurrences
    set status = 'confirmed',
        cash_minor = v_p.cash_minor,
        saved_minor = v_p.saved_minor,
        shortfall_minor = 0,
        confirmed_by = v_p.payer_id,
        confirmed_at = now()
    where id = v_o.id;
  else
    update public.parent_gifts
    set status = 'given',
        cash_minor = v_p.cash_minor,
        saved_minor = v_p.saved_minor,
        given_by = v_p.payer_id,
        given_at = now()
    where id = v_g.id;
  end if;

  -- Only reachable from a failed / expired / canceled payment: a newer attempt for the
  -- same source would block the live index. The item is paid, so that attempt is
  -- dropped; if it still completes, applying it returns already_confirmed.
  update public.payments
  set status = 'canceled'
  where source_type = v_p.source_type
    and source_id = v_p.source_id
    and id <> v_p.id
    and status in ('pending', 'requires_action');

  update public.payments set status = 'succeeded' where id = v_p.id;

  return 'confirmed';
end;
$$;

comment on function public.apply_payment(uuid) is 'Service role only. Posts a succeeded card payment like a cash handover (ledger keys occurrence:<id>:spend|save / parent_gift:<id>:spend|save, method card, created_by and confirmed_by / given_by = payer). Returns confirmed, already_applied (payment already succeeded or succeeded_unapplied), or already_confirmed / not_given / cancelled / amount_changed, which post nothing and set succeeded_unapplied. JA404, 22023.';

-- ---------------------------------------------------------------------------
-- fail_payment: a pending attempt failed, expired or was canceled
-- ---------------------------------------------------------------------------

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

  if v_p.trigger = 'auto' and p_status = 'failed' and v_p.payer_id is not null then
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

comment on function public.fail_payment(uuid, text, text) is 'Service role only. Moves a pending / requires_action payment to failed, expired or canceled with an optional failure code (^[a-z_]{1,64}$); any other status is left alone. A failed auto charge notifies the payer (card_charge_failed, source payment). JA404, 22023.';

-- ---------------------------------------------------------------------------
-- due_auto_charges: what the auto-charge job should claim now
-- ---------------------------------------------------------------------------

create or replace function public.due_auto_charges(
  p_provider text,
  p_now timestamptz default now(),
  p_limit int default 50
)
returns table (
  source_type text,
  source_id uuid,
  family_id uuid,
  child_id uuid,
  payer_id uuid,
  amount_minor bigint,
  currency text,
  customer_ref text,
  method_ref text
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.source_type, d.source_id, d.family_id, d.child_id, d.payer_id,
         d.amount_minor, d.currency, pc.customer_ref, pc.method_ref
  from (
    select 'occurrence'::text as source_type, o.id as source_id, o.family_id, o.child_id,
           s.auto_charge_by as payer_id, o.amount_minor, f.currency, o.due_on, o.created_at
    from public.allowance_occurrences o
    join public.allowance_schedules s on s.id = o.schedule_id
    join public.families f on f.id = o.family_id
    where o.status = 'due'
      and s.auto_charge
      and o.due_on >= (s.auto_charge_since at time zone f.timezone)::date
      and o.due_on <= public.family_today(o.family_id, p_now)
    union all
    select 'parent_gift'::text, g.id, g.family_id, g.child_id,
           g.auto_charge_by, g.amount_minor, f.currency, g.give_on, g.created_at
    from public.parent_gifts g
    join public.families f on f.id = g.family_id
    where g.status = 'pending'
      and g.auto_charge
      and g.give_on >= (g.auto_charge_since at time zone f.timezone)::date
      and g.give_on <= public.family_today(g.family_id, p_now)
  ) d
  join public.payment_customers pc
    on pc.parent_id = d.payer_id
   and pc.provider = p_provider
   and pc.method_ref is not null
  where exists (
      -- The payer is still an approved parent of the child.
      select 1
      from public.family_members p
      join public.family_members c on c.family_id = p.family_id
      where p.profile_id = d.payer_id and p.role = 'parent' and p.status = 'approved'
        and c.profile_id = d.child_id and c.role = 'child' and c.status = 'approved'
    )
    and not exists (
      select 1
      from public.payments pay
      where pay.source_type = d.source_type
        and pay.source_id = d.source_id
        and (pay.trigger = 'auto' or pay.status in ('pending', 'requires_action', 'succeeded'))
    )
  order by d.due_on, d.created_at, d.source_id
  limit least(greatest(coalesce(p_limit, 50), 1), 500);
$$;

comment on function public.due_auto_charges(text, timestamptz, int) is 'Service role only. Due occurrences and gifts with auto charge on, due on or after auto_charge_since (family date) and by family today at p_now, whose payer is still an approved parent with a saved card (method_ref) at p_provider, and that have no auto payment of any status and no live payment. Oldest first; limit clamped 1-500.';

-- ---------------------------------------------------------------------------
-- Auto-charge toggles
-- ---------------------------------------------------------------------------

-- Shared by set_auto_charge (the signed-in parent) and arm_auto_charge (the service role,
-- after a save-card webhook). A missing target and a forbidden one both raise JA403.
create or replace function public.write_auto_charge(
  p_parent_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_on boolean,
  p_provider text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_child_id uuid;
  v_family_id uuid;
  v_status text;
begin
  if p_target_type is null or p_target_type not in ('allowance_schedule', 'parent_gift') or p_on is null then
    raise exception using errcode = '22023', message = 'Invalid auto charge target';
  end if;

  if p_target_type = 'allowance_schedule' then
    select s.child_id, s.family_id, s.status into v_child_id, v_family_id, v_status
    from public.allowance_schedules s where s.id = p_target_id for update;
  else
    select g.child_id, g.family_id, g.status into v_child_id, v_family_id, v_status
    from public.parent_gifts g where g.id = p_target_id for update;
  end if;

  if v_child_id is null or p_parent_id is null or not exists (
    select 1
    from public.family_members p
    join public.family_members c on c.family_id = p.family_id
    where p.profile_id = p_parent_id and p.role = 'parent' and p.status = 'approved'
      and c.profile_id = v_child_id and c.role = 'child' and c.status = 'approved'
  ) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  if p_on then
    if v_status in ('stopped', 'given', 'cancelled') then
      raise exception using errcode = 'JA409', message = 'Nothing left to charge';
    end if;
    if not exists (
      select 1 from public.payment_customers pc
      where pc.parent_id = p_parent_id and pc.provider = p_provider and pc.method_ref is not null
    ) then
      raise exception using errcode = 'JA409', message = 'Save a card first';
    end if;
  end if;

  -- Turning on again for the same payer keeps auto_charge_since, so nothing already due
  -- since then drops out; a new payer starts from now.
  if p_target_type = 'allowance_schedule' then
    update public.allowance_schedules s
    set auto_charge = p_on,
        auto_charge_by = case when p_on then p_parent_id end,
        auto_charge_since = case
          when not p_on then null
          when s.auto_charge and s.auto_charge_by = p_parent_id then s.auto_charge_since
          else now()
        end
    where s.id = p_target_id;
  else
    update public.parent_gifts g
    set auto_charge = p_on,
        auto_charge_by = case when p_on then p_parent_id end,
        auto_charge_since = case
          when not p_on then null
          when g.auto_charge and g.auto_charge_by = p_parent_id then g.auto_charge_since
          else now()
        end
    where g.id = p_target_id;
  end if;

  insert into public.audit_log (family_id, actor_id, action, subject_id, details)
  values (
    v_family_id, p_parent_id, 'auto_charge.changed', p_target_id,
    pg_catalog.jsonb_build_object('target_type', p_target_type, 'on', p_on, 'provider', p_provider)
  );
end;
$$;

comment on function public.write_auto_charge(uuid, text, uuid, boolean, text) is 'Internal. Turns auto charge on (by p_parent_id, since now unless already on by them) or off (clears all three columns) for a schedule or gift; audits auto_charge.changed. JA403 (not an approved parent of the target''s child, or missing), JA409 (on: stopped / given / cancelled target, or no saved card at p_provider), 22023.';

create or replace function public.set_auto_charge(
  p_target_type text,
  p_target_id uuid,
  p_on boolean,
  p_provider text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.write_auto_charge((select auth.uid()), p_target_type, p_target_id, p_on, p_provider);
end;
$$;

comment on function public.set_auto_charge(text, uuid, boolean, text) is 'Signed-in parent turns auto charge on or off for their child''s allowance schedule or gift. On needs their saved card at p_provider. JA403, JA409 (Save a card first; nothing left to charge), 22023.';

create or replace function public.arm_auto_charge(
  p_parent_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_provider text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.write_auto_charge(p_parent_id, p_target_type, p_target_id, true, p_provider);
end;
$$;

comment on function public.arm_auto_charge(uuid, text, uuid, text) is 'Service role only (save-card webhook). Same as set_auto_charge on, for an explicit parent. JA403, JA409 (Save a card first; nothing left to charge), 22023.';

create or replace function public.clear_auto_charge_by(p_parent_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.allowance_schedules
  set auto_charge = false, auto_charge_by = null, auto_charge_since = null
  where auto_charge_by = p_parent_id;

  update public.parent_gifts
  set auto_charge = false, auto_charge_by = null, auto_charge_since = null
  where auto_charge_by = p_parent_id;
end;
$$;

comment on function public.clear_auto_charge_by(uuid) is 'Service role only. Turns off every auto-charge toggle the parent set (card removed).';

-- ---------------------------------------------------------------------------
-- Guards: no edits, cancels or not-given while a card payment is in progress.
-- Bodies otherwise unchanged from 20261029130005_parent_gifts / 20261029130004_handover;
-- create or replace keeps the existing grants. An attempt past its expires_at no longer
-- blocks, so a lost expiry webhook cannot lock the item.
-- ---------------------------------------------------------------------------

create or replace function public.card_payment_in_progress(p_source_type text, p_source_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.payments p
    where p.source_type = p_source_type
      and p.source_id = p_source_id
      and p.status in ('pending', 'requires_action')
      and (p.expires_at is null or p.expires_at > now())
  );
$$;

comment on function public.card_payment_in_progress(text, uuid) is 'Internal. A pending or requires_action payment, not past its expires_at, exists for the source.';

create or replace function public.update_gift(
  p_gift_id uuid,
  p_amount_minor bigint,
  p_give_on date,
  p_note text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_g public.parent_gifts;
  v_note text := nullif(pg_catalog.btrim(p_note), '');
begin
  v_g := public.lock_gift_for_parent(p_gift_id);
  if v_g.status <> 'pending' then
    raise exception using errcode = 'JA409', message = 'Gift is no longer pending';
  end if;
  if public.card_payment_in_progress('parent_gift', v_g.id) then
    raise exception using errcode = 'JA409', message = 'A card payment is in progress';
  end if;

  if p_amount_minor is null or p_amount_minor <= 0 or p_amount_minor > 100000000000 then
    raise exception using errcode = '22023', message = 'Invalid gift amount';
  end if;
  -- An unchanged date may already be past (a due gift); a new date must be today..today + 366.
  if p_give_on is null
     or (p_give_on <> v_g.give_on
         and (p_give_on < public.family_today(v_g.family_id)
              or p_give_on > public.family_today(v_g.family_id) + 366)) then
    raise exception using errcode = '22023', message = 'Give-on date must be from today to a year ahead';
  end if;
  if pg_catalog.char_length(v_note) > 140 then
    raise exception using errcode = '22023', message = 'Note is too long';
  end if;

  update public.parent_gifts
  set amount_minor = p_amount_minor,
      give_on = p_give_on,
      note = v_note
  where id = v_g.id;

  insert into public.audit_log (family_id, actor_id, action, subject_id, details)
  values (
    v_g.family_id, v_uid, 'gift.updated', v_g.id,
    pg_catalog.jsonb_build_object(
      'amount_minor', p_amount_minor, 'give_on', p_give_on, 'has_note', v_note is not null,
      'previous_amount_minor', v_g.amount_minor, 'previous_give_on', v_g.give_on
    )
  );

  return v_g.id;
end;
$$;

comment on function public.update_gift(uuid, bigint, date, text) is 'Parent edits a pending gift''s amount, date and note. JA403, JA409 (not pending; a card payment is in progress), 22023 (amount outside 1..100000000000, a changed give_on outside family today..today + 366, note over 140).';

create or replace function public.cancel_gift(p_gift_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_g public.parent_gifts;
begin
  v_g := public.lock_gift_for_parent(p_gift_id);
  if v_g.status <> 'pending' then
    raise exception using errcode = 'JA409', message = 'Gift is no longer pending';
  end if;
  if public.card_payment_in_progress('parent_gift', v_g.id) then
    raise exception using errcode = 'JA409', message = 'A card payment is in progress';
  end if;

  update public.parent_gifts set status = 'cancelled' where id = v_g.id;

  insert into public.audit_log (family_id, actor_id, action, subject_id, details)
  values (
    v_g.family_id, v_uid, 'gift.cancelled', v_g.id,
    pg_catalog.jsonb_build_object('child_id', v_g.child_id, 'amount_minor', v_g.amount_minor, 'give_on', v_g.give_on)
  );

  return v_g.id;
end;
$$;

comment on function public.cancel_gift(uuid) is 'Parent cancels a pending gift (terminal; the child never sees it). JA403, JA409 (not pending; a card payment is in progress).';

create or replace function public.mark_not_given(p_occurrence_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_o public.allowance_occurrences;
begin
  v_o := public.lock_occurrence_for_parent(p_occurrence_id);
  if v_o.status <> 'due' then
    return 'already_handled';
  end if;
  if public.card_payment_in_progress('occurrence', v_o.id) then
    raise exception using errcode = 'JA409', message = 'A card payment is in progress';
  end if;

  update public.allowance_occurrences
  set status = 'closed',
      confirmed_by = v_uid,
      confirmed_at = now()
  where id = v_o.id;

  insert into public.audit_log (family_id, actor_id, action, subject_id, details)
  values (
    v_o.family_id, v_uid, 'allowance.not_given', v_o.id,
    pg_catalog.jsonb_build_object('child_id', v_o.child_id, 'amount_minor', v_o.amount_minor, 'due_on', v_o.due_on)
  );

  -- slice 5: notify(not_given)

  return 'closed';
end;
$$;

comment on function public.mark_not_given(uuid) is 'Parent closes a due occurrence as not given; posts no ledger rows. Returns already_handled if not due. JA403, JA409 (a card payment is in progress).';

-- ---------------------------------------------------------------------------
-- list_ledger_history v3: method (cash or card). Body otherwise from 20261029183422_purchases.
-- ---------------------------------------------------------------------------

drop function public.list_ledger_history(uuid, int, timestamptz);

create function public.list_ledger_history(
  p_child_id uuid,
  p_limit int default 50,
  p_before timestamptz default null
)
returns table (
  id uuid,
  kind text,
  jar text,
  direction text,
  amount_minor bigint,
  label text,
  source_type text,
  source_id uuid,
  occurred_at timestamptz,
  reverses_entry_id uuid,
  reversed boolean,
  method text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_self(p_child_id) or public.is_parent_of(p_child_id)) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  return query
  select le.id, le.kind, le.jar, le.direction, le.amount_minor, le.label,
         le.source_type, le.source_id, le.occurred_at, le.reverses_entry_id,
         exists (select 1 from public.ledger_entries r where r.reverses_entry_id = le.id),
         le.method
  from public.ledger_entries le
  where le.child_id = p_child_id
    and le.mode = 'recorded'
    and (p_before is null or le.occurred_at < p_before)
  order by le.occurred_at desc, le.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

comment on function public.list_ledger_history(uuid, int, timestamptz) is 'Recorded-mode ledger entries, newest first, optionally only those before p_before (limit clamped 1-200), with reverses_entry_id, reversed (an entry reverses this row) and method (cash or card). Reversal rows are included. Caller must be the child or their parent. JA403.';

-- ---------------------------------------------------------------------------
-- Grants: Supabase grants new functions to anon/authenticated/service_role by default
-- ---------------------------------------------------------------------------

revoke execute on function
  public.write_auto_charge(uuid, text, uuid, boolean, text),
  public.card_payment_in_progress(text, uuid)
from public, anon, authenticated, service_role;

revoke execute on function
  public.apply_payment(uuid),
  public.fail_payment(uuid, text, text),
  public.due_auto_charges(text, timestamptz, int),
  public.arm_auto_charge(uuid, text, uuid, text),
  public.clear_auto_charge_by(uuid)
from public, anon, authenticated;

grant execute on function
  public.apply_payment(uuid),
  public.fail_payment(uuid, text, text),
  public.due_auto_charges(text, timestamptz, int),
  public.arm_auto_charge(uuid, text, uuid, text),
  public.clear_auto_charge_by(uuid)
to service_role;

revoke execute on function public.set_auto_charge(text, uuid, boolean, text) from public, anon, service_role;
grant execute on function public.set_auto_charge(text, uuid, boolean, text) to authenticated;

revoke execute on function public.list_ledger_history(uuid, int, timestamptz) from public, anon;
grant execute on function public.list_ledger_history(uuid, int, timestamptz) to authenticated;
