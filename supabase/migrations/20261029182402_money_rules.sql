-- Child settings and money rules: the overspend switch and parent-set limits.
-- Written only by the set_* functions below; read by the child and their parents.

create table public.child_settings (
  child_id uuid primary key references public.profiles (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  allow_negative_spend boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.child_settings is 'Per-child parent-controlled settings. A missing row means defaults. Written only by set_allow_negative_spend.';
comment on column public.child_settings.allow_negative_spend is 'When true the child may spend below zero in Spend.';

create index child_settings_family_id_idx on public.child_settings (family_id);
create index child_settings_updated_by_idx on public.child_settings (updated_by);

create trigger child_settings_set_updated_at
  before update on public.child_settings
  for each row execute function public.set_updated_at();

create table public.money_rules (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  child_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('spend_limit', 'withdrawal_cap', 'withdrawal_auto_approve', 'deposit_auto_confirm')),
  period text not null check (period in ('item', 'week', 'month')),
  amount_minor bigint not null check (amount_minor between 1 and 100000000000),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint money_rules_child_kind_period_key unique (child_id, kind, period)
);

comment on table public.money_rules is 'Parent-set limits and auto-approve thresholds per child, kind and period. Written only by set_money_rule.';
comment on column public.money_rules.amount_minor is 'Integer minor units, 1..100000000000.';

create index money_rules_family_id_idx on public.money_rules (family_id);
create index money_rules_created_by_idx on public.money_rules (created_by);
create index money_rules_updated_by_idx on public.money_rules (updated_by);

create trigger money_rules_set_updated_at
  before update on public.money_rules
  for each row execute function public.set_updated_at();

alter table public.child_settings enable row level security;
alter table public.money_rules enable row level security;

revoke all on public.child_settings, public.money_rules from anon;
revoke insert, update, delete, truncate on public.child_settings, public.money_rules from authenticated;

create policy "Child settings are viewable by the child and their parents"
  on public.child_settings for select
  to authenticated
  using ((select public.is_self(child_id)) or (select public.is_parent_of(child_id)));

create policy "Money rules are viewable by the child and their parents"
  on public.money_rules for select
  to authenticated
  using ((select public.is_self(child_id)) or (select public.is_parent_of(child_id)));

-- ---------------------------------------------------------------------------
-- Writers (parent only)
-- ---------------------------------------------------------------------------

create or replace function public.set_allow_negative_spend(p_child_id uuid, p_allowed boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_family_id uuid;
begin
  if not public.is_parent_of(p_child_id) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.profile_id = p_child_id
    and fm.role = 'child'
    and fm.status = 'approved';
  if v_family_id is null then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  if p_allowed is null then
    raise exception using errcode = '22023', message = 'Invalid setting';
  end if;

  insert into public.child_settings (child_id, family_id, allow_negative_spend, updated_by)
  values (p_child_id, v_family_id, p_allowed, v_uid)
  on conflict (child_id) do update
    set allow_negative_spend = excluded.allow_negative_spend,
        updated_by = excluded.updated_by;

  insert into public.audit_log (family_id, actor_id, action, subject_id, details)
  values (v_family_id, v_uid, 'settings.overspend', p_child_id, pg_catalog.jsonb_build_object('allowed', p_allowed));
end;
$$;

comment on function public.set_allow_negative_spend(uuid, boolean) is 'Parent turns overspending (Spend below zero) on or off for a child; upserts child_settings and audits settings.overspend. JA403, 22023 (null).';

create or replace function public.set_money_rule(
  p_child_id uuid,
  p_kind text,
  p_period text,
  p_amount_minor bigint
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_family_id uuid;
  v_deleted integer;
begin
  if not public.is_parent_of(p_child_id) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.profile_id = p_child_id
    and fm.role = 'child'
    and fm.status = 'approved';
  if v_family_id is null then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  if p_kind is null or p_kind not in ('spend_limit', 'withdrawal_cap', 'withdrawal_auto_approve', 'deposit_auto_confirm')
     or p_period is null or p_period not in ('item', 'week', 'month')
     or (p_amount_minor is not null and (p_amount_minor < 1 or p_amount_minor > 100000000000)) then
    raise exception using errcode = '22023', message = 'Invalid money rule';
  end if;

  if p_amount_minor is null then
    delete from public.money_rules
    where child_id = p_child_id and kind = p_kind and period = p_period;
    get diagnostics v_deleted = row_count;
    -- Clearing a rule that is not set changes nothing, so it leaves no audit row.
    if v_deleted > 0 then
      insert into public.audit_log (family_id, actor_id, action, subject_id, details)
      values (
        v_family_id, v_uid, 'rule.cleared', p_child_id,
        pg_catalog.jsonb_build_object('kind', p_kind, 'period', p_period, 'amount_minor', null)
      );
    end if;
    return;
  end if;

  insert into public.money_rules (family_id, child_id, kind, period, amount_minor, created_by, updated_by)
  values (v_family_id, p_child_id, p_kind, p_period, p_amount_minor, v_uid, v_uid)
  on conflict (child_id, kind, period) do update
    set amount_minor = excluded.amount_minor,
        updated_by = excluded.updated_by;

  insert into public.audit_log (family_id, actor_id, action, subject_id, details)
  values (
    v_family_id, v_uid, 'rule.set', p_child_id,
    pg_catalog.jsonb_build_object('kind', p_kind, 'period', p_period, 'amount_minor', p_amount_minor)
  );
end;
$$;

comment on function public.set_money_rule(uuid, text, text, bigint) is 'Parent sets (upsert) or clears (null amount) a rule. Audits rule.set / rule.cleared (clearing a rule that is not set audits nothing). JA403, 22023 (unknown kind or period, amount outside 1..100000000000).';

-- Start of the Monday-based week or the month containing p_at, in the family timezone. Null for 'item'.
create or replace function public.rule_window_start(p_family_id uuid, p_period text, p_at timestamptz)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case p_period
    when 'week' then pg_catalog.date_trunc('week', p_at at time zone f.timezone) at time zone f.timezone
    when 'month' then pg_catalog.date_trunc('month', p_at at time zone f.timezone) at time zone f.timezone
    else null
  end
  from public.families f
  where f.id = p_family_id;
$$;

comment on function public.rule_window_start(uuid, text, timestamptz) is 'Internal, no grants. Start of the Monday-based week or the month containing p_at in the family timezone; null for item or an unknown family.';

revoke execute on function public.rule_window_start(uuid, text, timestamptz) from public, anon, authenticated;

revoke execute on function
  public.set_allow_negative_spend(uuid, boolean),
  public.set_money_rule(uuid, text, text, bigint)
from public, anon;

grant execute on function
  public.set_allow_negative_spend(uuid, boolean),
  public.set_money_rule(uuid, text, text, bigint)
to authenticated;
