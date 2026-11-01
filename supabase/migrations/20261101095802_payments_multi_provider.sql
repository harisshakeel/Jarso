-- Several card providers at once (spec 2026-11-01-multi-provider-razorpay §4).
-- Razorpay joins stripe and fake in every provider column, and each auto-charge toggle now
-- records which provider's saved card it charges (auto_charge_provider), so a parent can hold
-- one saved card per provider. due_auto_charges and clear_auto_charge_by take the provider(s)
-- instead of assuming one per deployment. Replaced functions keep their grants: service role only.

-- ---------------------------------------------------------------------------
-- 1. Widen the provider checks
-- ---------------------------------------------------------------------------

alter table public.payment_customers
  drop constraint payment_customers_provider_check,
  add constraint payment_customers_provider_check check (provider in ('stripe', 'razorpay', 'fake'));
alter table public.payment_setups
  drop constraint payment_setups_provider_check,
  add constraint payment_setups_provider_check check (provider in ('stripe', 'razorpay', 'fake'));
alter table public.payments
  drop constraint payments_provider_check,
  add constraint payments_provider_check check (provider in ('stripe', 'razorpay', 'fake'));
alter table public.payment_webhook_events
  drop constraint payment_webhook_events_provider_check,
  add constraint payment_webhook_events_provider_check check (provider in ('stripe', 'razorpay', 'fake'));

-- ---------------------------------------------------------------------------
-- 2. auto_charge_provider on schedules and gifts
-- ---------------------------------------------------------------------------

alter table public.allowance_schedules
  add column auto_charge_provider text
    constraint allowance_schedules_auto_charge_provider_check check (auto_charge_provider in ('stripe', 'razorpay', 'fake'));
alter table public.parent_gifts
  add column auto_charge_provider text
    constraint parent_gifts_auto_charge_provider_check check (auto_charge_provider in ('stripe', 'razorpay', 'fake'));

comment on column public.allowance_schedules.auto_charge_provider is 'Provider whose saved card auto_charge_by''s auto charge uses; set exactly when auto_charge is on. Written by set_auto_charge / arm_auto_charge.';
comment on column public.parent_gifts.auto_charge_provider is 'Provider whose saved card auto_charge_by''s auto charge uses; set exactly when auto_charge is on. Written by set_auto_charge / arm_auto_charge.';

-- Existing toggles used the payer's one saved card: Stripe first, then by provider name.
-- A toggle whose payer has no saved card could never be charged, so it is turned off.
update public.allowance_schedules s
set auto_charge_provider = (
  select pc.provider
  from public.payment_customers pc
  where pc.parent_id = s.auto_charge_by and pc.method_ref is not null
  order by pc.provider <> 'stripe', pc.provider
  limit 1
)
where s.auto_charge;

update public.allowance_schedules
set auto_charge = false, auto_charge_by = null, auto_charge_since = null
where auto_charge and auto_charge_provider is null;

update public.parent_gifts g
set auto_charge_provider = (
  select pc.provider
  from public.payment_customers pc
  where pc.parent_id = g.auto_charge_by and pc.method_ref is not null
  order by pc.provider <> 'stripe', pc.provider
  limit 1
)
where g.auto_charge;

update public.parent_gifts
set auto_charge = false, auto_charge_by = null, auto_charge_since = null
where auto_charge and auto_charge_provider is null;

alter table public.allowance_schedules
  add constraint allowance_schedules_auto_charge_provider_pair check (auto_charge = (auto_charge_provider is not null));
alter table public.parent_gifts
  add constraint parent_gifts_auto_charge_provider_pair check (auto_charge = (auto_charge_provider is not null));

-- ---------------------------------------------------------------------------
-- 3. write_auto_charge records the provider
-- ---------------------------------------------------------------------------
-- Same signature and body as 20261031084403 apart from auto_charge_provider; set_auto_charge
-- and arm_auto_charge already pass p_provider, so they are unchanged. create or replace keeps
-- the existing grants (none).

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
  v_give_on date;
begin
  if p_target_type is null or p_target_type not in ('allowance_schedule', 'parent_gift') or p_on is null then
    raise exception using errcode = '22023', message = 'Invalid auto charge target';
  end if;

  if p_target_type = 'allowance_schedule' then
    select s.child_id, s.family_id, s.status into v_child_id, v_family_id, v_status
    from public.allowance_schedules s where s.id = p_target_id for update;
  else
    select g.child_id, g.family_id, g.status, g.give_on into v_child_id, v_family_id, v_status, v_give_on
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
    -- A gift whose day has passed is never charged (no back-charging), so refuse it too.
    if v_status in ('stopped', 'given', 'cancelled')
       or v_give_on < public.family_today(v_family_id) then
      raise exception using errcode = 'JA409', message = 'Nothing left to charge';
    end if;
    if not exists (
      select 1 from public.payment_customers pc
      where pc.parent_id = p_parent_id and pc.provider = p_provider and pc.method_ref is not null
    ) then
      raise exception using errcode = 'JA409', message = 'Save a card first';
    end if;
  end if;

  -- Turning on again for the same payer and provider keeps auto_charge_since, so nothing
  -- already due since then drops out; a new payer or a new provider starts from now.
  if p_target_type = 'allowance_schedule' then
    update public.allowance_schedules s
    set auto_charge = p_on,
        auto_charge_by = case when p_on then p_parent_id end,
        auto_charge_provider = case when p_on then p_provider end,
        auto_charge_since = case
          when not p_on then null
          when s.auto_charge and s.auto_charge_by = p_parent_id and s.auto_charge_provider = p_provider
            then s.auto_charge_since
          else now()
        end
    where s.id = p_target_id;
  else
    update public.parent_gifts g
    set auto_charge = p_on,
        auto_charge_by = case when p_on then p_parent_id end,
        auto_charge_provider = case when p_on then p_provider end,
        auto_charge_since = case
          when not p_on then null
          when g.auto_charge and g.auto_charge_by = p_parent_id and g.auto_charge_provider = p_provider
            then g.auto_charge_since
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

comment on function public.write_auto_charge(uuid, text, uuid, boolean, text) is 'Internal. Turns auto charge on (by p_parent_id at p_provider''s saved card; since now unless already on by them at the same provider) or off (clears auto_charge, auto_charge_by, auto_charge_since and auto_charge_provider) for a schedule or gift; audits auto_charge.changed. JA403 (not an approved parent of the target''s child, or missing), JA409 (on: stopped / given / cancelled target, a gift whose give_on is before family today, or no saved card at p_provider), 22023.';

-- ---------------------------------------------------------------------------
-- 4. due_auto_charges(p_providers text[], ...) replaces the single-provider form
-- ---------------------------------------------------------------------------

drop function public.due_auto_charges(text, timestamptz, int);

create function public.due_auto_charges(
  p_providers text[],
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
  method_ref text,
  provider text
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.source_type, d.source_id, d.family_id, d.child_id, d.payer_id,
         d.amount_minor, d.currency, pc.customer_ref, pc.method_ref, pc.provider
  from (
    select 'occurrence'::text as source_type, o.id as source_id, o.family_id, o.child_id,
           s.auto_charge_by as payer_id, o.amount_minor, f.currency, o.due_on, o.created_at,
           s.auto_charge_provider as provider
    from public.allowance_occurrences o
    join public.allowance_schedules s on s.id = o.schedule_id
    join public.families f on f.id = o.family_id
    where o.status = 'due'
      and s.auto_charge
      and o.due_on >= (s.auto_charge_since at time zone f.timezone)::date
      and o.due_on <= public.family_today(o.family_id, p_now)
    union all
    select 'parent_gift'::text, g.id, g.family_id, g.child_id,
           g.auto_charge_by, g.amount_minor, f.currency, g.give_on, g.created_at,
           g.auto_charge_provider
    from public.parent_gifts g
    join public.families f on f.id = g.family_id
    where g.status = 'pending'
      and g.auto_charge
      and g.give_on >= (g.auto_charge_since at time zone f.timezone)::date
      and g.give_on <= public.family_today(g.family_id, p_now)
  ) d
  join public.payment_customers pc
    on pc.parent_id = d.payer_id
   and pc.provider = d.provider
   and pc.method_ref is not null
  where d.provider = any (coalesce(p_providers, array[]::text[]))
    and exists (
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

comment on function public.due_auto_charges(text[], timestamptz, int) is 'Service role only. Due occurrences and gifts with auto charge on at one of p_providers (null or empty = none), due on or after auto_charge_since (family date) and by family today at p_now, whose payer is still an approved parent with a saved card (method_ref) at the item''s auto_charge_provider, and that have no auto payment of any status and no live payment. Returns that provider with the card refs. Oldest first; limit clamped 1-500.';

revoke execute on function public.due_auto_charges(text[], timestamptz, int) from public, anon, authenticated;
grant execute on function public.due_auto_charges(text[], timestamptz, int) to service_role;

-- ---------------------------------------------------------------------------
-- 5. clear_auto_charge_by(p_parent_id, p_provider) replaces the one-argument form
-- ---------------------------------------------------------------------------

drop function public.clear_auto_charge_by(uuid);

create function public.clear_auto_charge_by(p_parent_id uuid, p_provider text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.allowance_schedules
  set auto_charge = false, auto_charge_by = null, auto_charge_since = null, auto_charge_provider = null
  where auto_charge_by = p_parent_id and auto_charge_provider = p_provider;

  update public.parent_gifts
  set auto_charge = false, auto_charge_by = null, auto_charge_since = null, auto_charge_provider = null
  where auto_charge_by = p_parent_id and auto_charge_provider = p_provider;
end;
$$;

comment on function public.clear_auto_charge_by(uuid, text) is 'Service role only. Turns off the auto-charge toggles the parent set that use p_provider''s card (card removed); their toggles on other providers are left alone.';

revoke execute on function public.clear_auto_charge_by(uuid, text) from public, anon, authenticated;
grant execute on function public.clear_auto_charge_by(uuid, text) to service_role;
