-- Turning auto charge off while a save-card session that would turn it on is still pending
-- used to lose: the session's webhook armed the toggle again afterwards. Now turning off clears
-- the pending session's arm (the card is still saved when it completes), and the webhook arms
-- through arm_auto_charge_for_setup, which locks the target before re-reading that arm. Both
-- paths take the target's row lock first, so whichever commits second sees the other.

-- ---------------------------------------------------------------------------
-- 1. write_auto_charge: turning off clears pending arms for the target
-- ---------------------------------------------------------------------------
-- Same signature and body as 20261101095802 apart from the payment_setups update.
-- create or replace keeps the existing grants (none).

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

  -- Turning off also drops any pending save-card session's intent to turn this on, so its
  -- webhook (arm_auto_charge_for_setup, which takes this row lock first) can't undo the off.
  if not p_on then
    update public.payment_setups ps
    set arm_type = null, arm_id = null
    where ps.status = 'pending' and ps.arm_type = p_target_type and ps.arm_id = p_target_id;
  end if;

  insert into public.audit_log (family_id, actor_id, action, subject_id, details)
  values (
    v_family_id, p_parent_id, 'auto_charge.changed', p_target_id,
    pg_catalog.jsonb_build_object('target_type', p_target_type, 'on', p_on, 'provider', p_provider)
  );
end;
$$;

comment on function public.write_auto_charge(uuid, text, uuid, boolean, text) is 'Internal. Turns auto charge on (by p_parent_id at p_provider''s saved card; since now unless already on by them at the same provider) or off (clears auto_charge, auto_charge_by, auto_charge_since and auto_charge_provider, and the arm of any pending payment_setups for the target) for a schedule or gift; audits auto_charge.changed. JA403 (not an approved parent of the target''s child, or missing), JA409 (on: stopped / given / cancelled target, a gift whose give_on is before family today, or no saved card at p_provider), 22023.';

-- ---------------------------------------------------------------------------
-- 2. arm_auto_charge_for_setup: the webhook's arm, re-checked under the target's lock
-- ---------------------------------------------------------------------------

create function public.arm_auto_charge_for_setup(p_setup_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_parent_id uuid;
  v_provider text;
  v_arm_type text;
  v_arm_id uuid;
begin
  select ps.parent_id, ps.provider, ps.arm_type, ps.arm_id
  into v_parent_id, v_provider, v_arm_type, v_arm_id
  from public.payment_setups ps where ps.id = p_setup_id;
  if v_arm_type is null then
    return false;
  end if;

  -- Same lock order as turning off (write_auto_charge): the target first. A turn-off that
  -- committed while this waited has cleared the arm, which the re-read below then sees.
  if v_arm_type = 'allowance_schedule' then
    perform 1 from public.allowance_schedules s where s.id = v_arm_id for update;
  else
    perform 1 from public.parent_gifts g where g.id = v_arm_id for update;
  end if;

  select ps.arm_type, ps.arm_id into v_arm_type, v_arm_id
  from public.payment_setups ps where ps.id = p_setup_id;
  if v_arm_type is null then
    return false;
  end if;

  perform public.write_auto_charge(v_parent_id, v_arm_type, v_arm_id, true, v_provider);
  return true;
end;
$$;

comment on function public.arm_auto_charge_for_setup(uuid) is 'Service role only (save-card webhook). Turns on the auto-charge toggle the setup was started for, as its parent at its provider, unless that arm was cleared (the toggle was turned off meanwhile): then false. True when armed. JA403, JA409 and 22023 as write_auto_charge.';

revoke execute on function public.arm_auto_charge_for_setup(uuid) from public, anon, authenticated;
grant execute on function public.arm_auto_charge_for_setup(uuid) to service_role;
