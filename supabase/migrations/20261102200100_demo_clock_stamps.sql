-- Demo clock (D11), part 2: business timestamps are written in the family's time. Each trigger
-- adds the family's clock offset (family_clock_offset, 0 for every real family) to the time a
-- function wrote, so the functions themselves keep writing now() or the device time.
--
-- Shifted: ledger_entries.occurred_at on insert (not reversals or fixes: they copy a time that
-- is already shifted); requests.occurred_at on insert and decided_at / completed_at when set;
-- allowance_occurrences.confirmed_at and parent_gifts.given_at when set;
-- mission_attempts.completed_at when set.
-- Not shifted: every created_at (diary undo/fix windows and canUndo follow it) and
-- mission_attempts.started_at (the 40-per-24h mission limit compares it with real time).
--
-- "When set" means on insert when not null, and on update when the value changes and is not
-- null. Trigger functions are invoker: they run as the definer function that writes the row.

-- ---------------------------------------------------------------------------
-- ledger_entries.occurred_at
-- ---------------------------------------------------------------------------

create function public.ledger_entries_family_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind <> 'reversal' and new.corrects_entry_id is null then
    new.occurred_at := new.occurred_at + public.family_clock_offset(new.family_id);
  end if;
  return new;
end;
$$;

comment on function public.ledger_entries_family_time() is 'Trigger: writes ledger_entries.occurred_at in family time (demo clock offset added), except reversals and fixes, which copy the shifted time of the line they replace.';

create trigger ledger_entries_family_time
  before insert on public.ledger_entries
  for each row execute function public.ledger_entries_family_time();

-- ---------------------------------------------------------------------------
-- requests.occurred_at, decided_at, completed_at
-- ---------------------------------------------------------------------------

create function public.requests_family_time()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_offset interval := public.family_clock_offset(new.family_id);
begin
  if v_offset = interval '0' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- null + interval stays null.
    new.occurred_at := new.occurred_at + v_offset;
    new.decided_at := new.decided_at + v_offset;
    new.completed_at := new.completed_at + v_offset;
  else
    if new.decided_at is distinct from old.decided_at then
      new.decided_at := new.decided_at + v_offset;
    end if;
    if new.completed_at is distinct from old.completed_at then
      new.completed_at := new.completed_at + v_offset;
    end if;
  end if;
  return new;
end;
$$;

comment on function public.requests_family_time() is 'Trigger: writes requests.occurred_at (insert), decided_at and completed_at (when set) in family time (demo clock offset added).';

create trigger requests_family_time
  before insert or update on public.requests
  for each row execute function public.requests_family_time();

-- ---------------------------------------------------------------------------
-- allowance_occurrences.confirmed_at
-- ---------------------------------------------------------------------------

create function public.allowance_occurrences_family_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.confirmed_at is not null
     and (tg_op = 'INSERT' or new.confirmed_at is distinct from old.confirmed_at) then
    new.confirmed_at := new.confirmed_at + public.family_clock_offset(new.family_id);
  end if;
  return new;
end;
$$;

comment on function public.allowance_occurrences_family_time() is 'Trigger: writes allowance_occurrences.confirmed_at in family time (demo clock offset added) when set.';

create trigger allowance_occurrences_family_time
  before insert or update on public.allowance_occurrences
  for each row execute function public.allowance_occurrences_family_time();

-- ---------------------------------------------------------------------------
-- parent_gifts.given_at
-- ---------------------------------------------------------------------------

create function public.parent_gifts_family_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.given_at is not null
     and (tg_op = 'INSERT' or new.given_at is distinct from old.given_at) then
    new.given_at := new.given_at + public.family_clock_offset(new.family_id);
  end if;
  return new;
end;
$$;

comment on function public.parent_gifts_family_time() is 'Trigger: writes parent_gifts.given_at in family time (demo clock offset added) when set.';

create trigger parent_gifts_family_time
  before insert or update on public.parent_gifts
  for each row execute function public.parent_gifts_family_time();

-- ---------------------------------------------------------------------------
-- mission_attempts.completed_at (not started_at)
-- ---------------------------------------------------------------------------

create function public.mission_attempts_family_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.completed_at is not null
     and (tg_op = 'INSERT' or new.completed_at is distinct from old.completed_at) then
    new.completed_at := new.completed_at + public.family_clock_offset(new.family_id);
  end if;
  return new;
end;
$$;

comment on function public.mission_attempts_family_time() is 'Trigger: writes mission_attempts.completed_at in family time (demo clock offset added) when set. started_at stays real time: the 40-per-24h limit compares it with now().';

create trigger mission_attempts_family_time
  before insert or update on public.mission_attempts
  for each row execute function public.mission_attempts_family_time();

-- Trigger functions are never called directly.
revoke execute on function
  public.ledger_entries_family_time(),
  public.requests_family_time(),
  public.allowance_occurrences_family_time(),
  public.parent_gifts_family_time(),
  public.mission_attempts_family_time()
from public, anon, authenticated;
