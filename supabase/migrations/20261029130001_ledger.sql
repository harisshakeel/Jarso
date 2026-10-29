-- Ledger: append-only money record, balance and history reads, job_runs.
-- architecture.md §4 and §5.1. Writes come from later security definer functions only.
-- Also replaces remove_child so a child with ledger rows keeps their identity (ADR 0007).

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
  -- restrict, not cascade: deleting a child's identity must never delete money history.
  child_id uuid not null references public.profiles (id) on delete restrict,
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
  check (mode = 'recorded' or source_type not in ('occurrence', 'parent_gift', 'request')),
  constraint ledger_entries_amount_minor_max check (amount_minor <= 100000000000),
  -- Every kind has one direction; only a reversal (which mirrors its entry) may be either.
  constraint ledger_kind_direction check (
    kind = 'reversal'
    or (kind in ('allowance_in', 'gift_in', 'parent_gift_in', 'deposit_in', 'withdrawal_in', 'grant_in') and direction = 'in')
    or (kind in ('purchase', 'deposit_out', 'withdrawal_out') and direction = 'out')
  ),
  -- A reversal always names the entry it reverses, and nothing else does.
  constraint ledger_reversal_link check ((kind = 'reversal') = (reverses_entry_id is not null))
);

comment on table public.ledger_entries is 'Append-only record of all money movement; balances are derived. Written only by security definer functions.';
comment on column public.ledger_entries.amount_minor is 'Positive integer minor units; direction gives the sign.';
comment on column public.ledger_entries.mode is 'recorded = real money; practice = simulated. Practice never uses allowance, gift or request sources.';
comment on column public.ledger_entries.idempotency_key is 'Unique per balance-changing write; retries are no-ops.';
comment on column public.ledger_entries.source_id is 'Originating row (occurrence, gift, request or diary entry); polymorphic, no FK.';

create index ledger_entries_child_mode_jar_occurred_idx
  on public.ledger_entries (child_id, mode, jar, occurred_at desc);
create index ledger_entries_family_id_idx on public.ledger_entries (family_id);
-- An entry is reversed at most once.
create unique index ledger_entries_reverses_entry_id_key
  on public.ledger_entries (reverses_entry_id)
  where reverses_entry_id is not null;
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

-- ---------------------------------------------------------------------------
-- remove_child: keep the identity once money history exists (ADR 0007)
-- ---------------------------------------------------------------------------

create or replace function public.remove_child(p_child_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_parent_family uuid;
  v_family_id uuid;
  v_status text;
  v_nickname text;
begin
  if v_uid is null then
    raise exception using errcode = 'JA401', message = 'Not signed in';
  end if;

  select fm.family_id
  into v_parent_family
  from public.family_members fm
  where fm.profile_id = v_uid
    and fm.role = 'parent'
    and fm.status = 'approved';

  -- Lock the child's row first, then decide on what it says now (not on an earlier read).
  select fm.family_id, fm.status, pr.nickname
  into v_family_id, v_status, v_nickname
  from public.family_members fm
  join public.profiles pr on pr.id = fm.profile_id
  where fm.profile_id = p_child_id
    and fm.role = 'child'
  for update of fm;

  if not found or v_parent_family is null or v_family_id <> v_parent_family then
    raise exception using errcode = 'JA403', message = 'Only the child''s parent can remove them';
  end if;

  if v_status = 'approved' then
    update public.family_members
    set status = 'removed',
        nickname_key = null,
        removed_at = now(),
        removed_by = v_uid
    where profile_id = p_child_id;

    update public.profiles set nickname = null where id = p_child_id;

    insert into public.audit_log (family_id, actor_id, action, subject_id, details)
    values (v_family_id, v_uid, 'child.removed', p_child_id, jsonb_build_object('nickname', v_nickname));
  elsif v_status <> 'removed' then
    raise exception using errcode = 'JA403', message = 'Only the child''s parent can remove them';
  end if;

  -- Idempotent from here: a parent whose first attempt failed after this commit (session
  -- revoke or identity delete) can run it again until the removal completes.
  delete from public.child_credentials c where c.profile_id = p_child_id;
  delete from public.child_pin_attempts a where a.child_id = p_child_id;

  -- The auth identity may be deleted only while the child has no money history (ADR 0007).
  -- Otherwise it is kept, disabled, and the ledger rows survive (ledger_entries.child_id is
  -- on delete restrict, so a delete would fail anyway).
  return not exists (select 1 from public.ledger_entries le where le.child_id = p_child_id);
end;
$$;

comment on function public.remove_child(uuid) is
  'Parent removes a child: membership removed, nickname freed, credentials deleted, audited; idempotent for an already-removed child of the same family. Returns true when the auth identity may be deleted (no ledger rows for the child), false when it must be kept. JA401/JA403.';
