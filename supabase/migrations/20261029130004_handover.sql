-- Allowance handover: a parent confirms what was actually handed over, or marks
-- the occurrence not given. Slice 2 design §4.3 / S10.
-- Both are exactly-once: only a 'due' occurrence changes, under a row lock.

-- Locks the occurrence and checks the caller is a parent of its child. Internal.
-- A missing row and a forbidden row both raise JA403 so existence does not leak.
create or replace function public.lock_occurrence_for_parent(p_occurrence_id uuid)
returns public.allowance_occurrences
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_o public.allowance_occurrences;
begin
  select * into v_o from public.allowance_occurrences o where o.id = p_occurrence_id for update;
  if not found or not public.is_parent_of(v_o.child_id) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;
  return v_o;
end;
$$;

comment on function public.lock_occurrence_for_parent(uuid) is 'Internal. Locks the occurrence for update; JA403 unless the caller is an approved parent of its child (also when it does not exist).';

create or replace function public.confirm_handover(
  p_occurrence_id uuid,
  p_cash_minor bigint,
  p_saved_minor bigint,
  p_idempotency_key text
)
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
    return 'already_confirmed';
  end if;

  -- numeric sums cannot overflow, so absurd inputs are 22023 rather than 22003.
  if p_cash_minor is null or p_saved_minor is null
     or p_cash_minor < 0 or p_saved_minor < 0
     or p_cash_minor > 100000000000 or p_saved_minor > 100000000000
     or p_cash_minor::numeric + p_saved_minor <= 0
     or p_cash_minor::numeric + p_saved_minor > v_o.amount_minor
     or p_idempotency_key is null or pg_catalog.btrim(p_idempotency_key) = '' then
    raise exception using errcode = '22023', message = 'Invalid handover amounts';
  end if;

  -- Lock order for every ledger writer: the source row first (above), then the child's
  -- ledger advisory lock, never the reverse. Later balance checks (purchases, savings
  -- requests) rely on it to serialise writes per child.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ledger:' || v_o.child_id::text, 0));

  if p_cash_minor > 0 then
    insert into public.ledger_entries (
      family_id, child_id, mode, jar, kind, direction, amount_minor, label,
      source_type, source_id, idempotency_key, created_by, occurred_at
    )
    values (
      v_o.family_id, v_o.child_id, 'recorded', 'spend', 'allowance_in', 'in', p_cash_minor, 'Allowance',
      'occurrence', v_o.id, 'occurrence:' || v_o.id || ':spend', v_uid, now()
    );
  end if;
  if p_saved_minor > 0 then
    insert into public.ledger_entries (
      family_id, child_id, mode, jar, kind, direction, amount_minor, label,
      source_type, source_id, idempotency_key, created_by, occurred_at
    )
    values (
      v_o.family_id, v_o.child_id, 'recorded', 'save', 'allowance_in', 'in', p_saved_minor, 'Allowance',
      'occurrence', v_o.id, 'occurrence:' || v_o.id || ':save', v_uid, now()
    );
  end if;

  update public.allowance_occurrences
  set status = 'confirmed',
      cash_minor = p_cash_minor,
      saved_minor = p_saved_minor,
      shortfall_minor = v_o.amount_minor - p_cash_minor - p_saved_minor,
      confirmed_by = v_uid,
      confirmed_at = now()
  where id = v_o.id;

  -- slice 5: notify(handover_done)

  return 'confirmed';
end;
$$;

comment on function public.confirm_handover(uuid, bigint, bigint, text) is 'Ledger keys derive from the occurrence; p_idempotency_key must be non-blank but is not stored. Parent records what was handed over: cash to Spend, saved to Save (each <= 100000000000, sum 1..amount; the rest is shortfall). Exactly once: any non-due occurrence returns already_confirmed. JA403, 22023.';

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

comment on function public.mark_not_given(uuid) is 'Parent closes a due occurrence as not given; posts no ledger rows. Returns already_handled if not due. JA403.';

revoke execute on function public.lock_occurrence_for_parent(uuid) from public, anon, authenticated;

revoke execute on function
  public.confirm_handover(uuid, bigint, bigint, text),
  public.mark_not_given(uuid)
from public, anon;

grant execute on function
  public.confirm_handover(uuid, bigint, bigint, text),
  public.mark_not_given(uuid)
to authenticated;
