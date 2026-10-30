-- Savings requests (slice 4): the requests table, reserved/held amounts and the
-- single window counter used by caps and auto-approve rules.

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  child_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('withdrawal', 'deposit')),
  status text not null check (status in ('pending', 'approved', 'handed_over', 'confirmed', 'rejected', 'cancelled')),
  amount_minor bigint not null check (amount_minor between 1 and 100000000000),
  reason text check (char_length(reason) <= 140),
  decision_note text check (char_length(decision_note) <= 140),
  auto boolean not null default false,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,
  completed_at timestamptz,
  occurred_at timestamptz not null default now(),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint requests_child_idempotency_key unique (child_id, idempotency_key),
  constraint requests_withdrawal_never_confirmed check (not (kind = 'withdrawal' and status = 'confirmed')),
  constraint requests_deposit_never_approved check (not (kind = 'deposit' and status in ('approved', 'handed_over')))
);

comment on table public.requests is 'Savings requests: a child asks to take money out of Save (withdrawal) or records money put into Save (deposit). Written only by definer functions.';
comment on column public.requests.amount_minor is 'Integer minor units, 1..100000000000.';
comment on column public.requests.auto is 'True when a rule decided it (auto-approved withdrawal, auto-confirmed deposit).';
comment on column public.requests.occurred_at is 'When the child made the request; the window for caps and auto rules.';

create index requests_child_id_status_idx on public.requests (child_id, status);
create index requests_family_id_idx on public.requests (family_id);
create index requests_decided_by_idx on public.requests (decided_by);
create index requests_completed_by_idx on public.requests (completed_by);

create trigger requests_set_updated_at
  before update on public.requests
  for each row execute function public.set_updated_at();

alter table public.requests enable row level security;

revoke all on public.requests from anon;
revoke insert, update, delete, truncate on public.requests from authenticated;

create policy "Requests are viewable by the child and their parents"
  on public.requests for select
  to authenticated
  using ((select public.is_self(child_id)) or (select public.is_parent_of(child_id)));

-- ---------------------------------------------------------------------------
-- reserved_save / held_spend / available_*
-- ---------------------------------------------------------------------------

create or replace function public.reserved_save(p_child_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_self(p_child_id) or public.is_parent_of(p_child_id)) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  return coalesce((
    select pg_catalog.sum(r.amount_minor)::bigint
    from public.requests r
    where r.child_id = p_child_id
      and r.kind = 'withdrawal'
      and r.status in ('pending', 'approved')
  ), 0);
end;
$$;

comment on function public.reserved_save(uuid) is 'Save promised to pending or approved withdrawals, in minor units. Caller must be the child or their parent. JA403.';

create or replace function public.held_spend(p_child_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_self(p_child_id) or public.is_parent_of(p_child_id)) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  return coalesce((
    select pg_catalog.sum(r.amount_minor)::bigint
    from public.requests r
    where r.child_id = p_child_id
      and r.kind = 'deposit'
      and r.status = 'pending'
  ), 0);
end;
$$;

comment on function public.held_spend(uuid) is 'Spend held by pending deposits, in minor units. Caller must be the child or their parent. JA403.';

create or replace function public.available_save(p_child_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_self(p_child_id) or public.is_parent_of(p_child_id)) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  return public.balance(p_child_id, 'save', 'recorded') - public.reserved_save(p_child_id);
end;
$$;

comment on function public.available_save(uuid) is 'Save balance minus reserved_save, in minor units. Caller must be the child or their parent. JA403.';

create or replace function public.available_spend(p_child_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_self(p_child_id) or public.is_parent_of(p_child_id)) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  return public.balance(p_child_id, 'spend', 'recorded') - public.held_spend(p_child_id);
end;
$$;

comment on function public.available_spend(uuid) is 'Spend balance minus held_spend, in minor units. Caller must be the child or their parent. JA403.';

-- ---------------------------------------------------------------------------
-- request_window_total: the one counter for caps, auto-approve and auto-confirm
-- ---------------------------------------------------------------------------

create or replace function public.request_window_total(
  p_child_id uuid,
  p_kind text,
  p_statuses text[],
  p_window_start timestamptz
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.sum(r.amount_minor)::bigint, 0)
  from public.requests r
  where r.child_id = p_child_id
    and r.kind = p_kind
    and r.status = any (p_statuses)
    and (p_window_start is null or r.occurred_at >= p_window_start);
$$;

comment on function public.request_window_total(uuid, text, text[], timestamptz) is 'Internal, no grants. Sum of a child''s requests of one kind in the given statuses with occurred_at >= p_window_start (all time when null). The single counter for caps, auto-approve and auto-confirm.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function public.request_window_total(uuid, text, text[], timestamptz)
  from public, anon, authenticated;

revoke execute on function
  public.reserved_save(uuid),
  public.held_spend(uuid),
  public.available_save(uuid),
  public.available_spend(uuid)
from public, anon;

grant execute on function
  public.reserved_save(uuid),
  public.held_spend(uuid),
  public.available_save(uuid),
  public.available_spend(uuid)
to authenticated;
