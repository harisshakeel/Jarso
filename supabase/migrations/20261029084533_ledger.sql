-- Ledger: append-only money record, balance and history reads, job_runs.
-- architecture.md §4 and §5.1. Writes come from later security definer functions only.

-- ---------------------------------------------------------------------------
-- job_runs: cron/job bookkeeping, service role only
-- ---------------------------------------------------------------------------

create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'ok', 'error')),
  details jsonb
);

comment on table public.job_runs is 'One row per scheduled job run. RLS on, no policies: service role and definer functions only.';

create index job_runs_job_started_at_idx on public.job_runs (job, started_at desc);

alter table public.job_runs enable row level security;
revoke all on public.job_runs from anon, authenticated;

-- ---------------------------------------------------------------------------
-- ledger_entries
-- ---------------------------------------------------------------------------

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  child_id uuid not null references public.profiles (id) on delete cascade,
  mode text not null default 'recorded' check (mode in ('recorded', 'practice')),
  jar text not null check (jar in ('spend', 'save')),
  kind text not null check (kind in (
    'allowance_in', 'gift_in', 'parent_gift_in', 'purchase', 'deposit_out',
    'deposit_in', 'withdrawal_out', 'withdrawal_in', 'grant_in', 'reversal'
  )),
  direction text not null check (direction in ('in', 'out')),
  amount_minor bigint not null check (amount_minor > 0),
  label text,
  source_type text not null check (source_type in ('occurrence', 'parent_gift', 'request', 'diary')),
  source_id uuid,
  reverses_entry_id uuid references public.ledger_entries (id),
  idempotency_key text not null unique,
  created_by uuid references public.profiles (id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (mode = 'recorded' or source_type not in ('occurrence', 'parent_gift', 'request'))
);

comment on table public.ledger_entries is 'Append-only record of all money movement; balances are derived. Written only by security definer functions.';
comment on column public.ledger_entries.amount_minor is 'Positive integer minor units; direction gives the sign.';
comment on column public.ledger_entries.mode is 'recorded = real money; practice = simulated. Practice never uses allowance, gift or request sources.';
comment on column public.ledger_entries.idempotency_key is 'Unique per balance-changing write; retries are no-ops.';
comment on column public.ledger_entries.source_id is 'Originating row (occurrence, gift, request or diary entry); polymorphic, no FK.';

create index ledger_entries_child_mode_jar_occurred_idx
  on public.ledger_entries (child_id, mode, jar, occurred_at desc);
create index ledger_entries_family_id_idx on public.ledger_entries (family_id);
create index ledger_entries_reverses_entry_id_idx on public.ledger_entries (reverses_entry_id);
create index ledger_entries_created_by_idx on public.ledger_entries (created_by);

alter table public.ledger_entries enable row level security;

-- Writes go through functions only; RLS also ignores TRUNCATE.
revoke all on public.ledger_entries from anon;
revoke insert, update, delete, truncate on public.ledger_entries from authenticated;

create policy "Ledger is viewable by the child and their parents"
  on public.ledger_entries for select
  to authenticated
  using (public.is_self(child_id) or public.is_parent_of(child_id));

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------

create or replace function public.balance(p_child_id uuid, p_jar text, p_mode text default 'recorded')
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
    select pg_catalog.sum(case le.direction when 'in' then le.amount_minor else -le.amount_minor end)::bigint
    from public.ledger_entries le
    where le.child_id = p_child_id
      and le.jar = p_jar
      and le.mode = p_mode
  ), 0);
end;
$$;

comment on function public.balance(uuid, text, text) is 'Jar balance in minor units (in minus out) for a child and mode. Caller must be the child or their parent. JA403.';

create or replace function public.list_ledger_history(p_child_id uuid, p_limit int default 50)
returns table (
  id uuid,
  kind text,
  jar text,
  direction text,
  amount_minor bigint,
  label text,
  source_type text,
  source_id uuid,
  occurred_at timestamptz
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
         le.source_type, le.source_id, le.occurred_at
  from public.ledger_entries le
  where le.child_id = p_child_id
    and le.mode = 'recorded'
  order by le.occurred_at desc, le.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

comment on function public.list_ledger_history(uuid, int) is 'Recorded-mode ledger entries, newest first (limit clamped 1-200). Caller must be the child or their parent. JA403.';

revoke execute on function
  public.balance(uuid, text, text),
  public.list_ledger_history(uuid, int)
from public, anon;

grant execute on function
  public.balance(uuid, text, text),
  public.list_ledger_history(uuid, int)
to authenticated;
