-- A handover on an occurrence already marked not given, or on a cancelled gift, returned
-- already_confirmed, which the app showed as success although nothing was recorded. Each
-- terminal status now has its own result: the app tells the parent nothing was recorded.
-- Bodies are otherwise unchanged from 20261029130004_handover / 20261029130005_parent_gifts;
-- create or replace keeps the existing grants.

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
  if v_o.status = 'closed' then
    return 'not_given';
  end if;
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

comment on function public.confirm_handover(uuid, bigint, bigint, text) is 'Ledger keys derive from the occurrence; p_idempotency_key must be non-blank but is not stored. Parent records what was handed over: cash to Spend, saved to Save (each <= 100000000000, sum 1..amount; the rest is shortfall). Exactly once: a confirmed occurrence returns already_confirmed, one marked not given returns not_given; neither posts. JA403, 22023.';

create or replace function public.confirm_gift_handover(
  p_gift_id uuid,
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
  v_g public.parent_gifts;
  v_label text;
begin
  v_g := public.lock_gift_for_parent(p_gift_id);
  if v_g.status = 'cancelled' then
    return 'cancelled';
  end if;
  if v_g.status <> 'pending' then
    return 'already_confirmed';
  end if;

  if v_g.give_on > public.family_today(v_g.family_id) then
    raise exception using errcode = 'JA409', message = 'Gift is not due yet';
  end if;

  -- No shortfall for gifts; the 100x cap only guards against typos.
  -- numeric avoids bigint overflow on absurd inputs.
  if p_cash_minor is null or p_saved_minor is null
     or p_cash_minor < 0 or p_saved_minor < 0
     or p_cash_minor > 100000000000 or p_saved_minor > 100000000000
     or p_cash_minor::numeric + p_saved_minor <= 0
     or p_cash_minor::numeric + p_saved_minor > v_g.amount_minor::numeric * 100
     or p_idempotency_key is null or pg_catalog.btrim(p_idempotency_key) = '' then
    raise exception using errcode = '22023', message = 'Invalid handover amounts';
  end if;

  -- Lock order: the gift row first (above), then the child's ledger advisory lock.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ledger:' || v_g.child_id::text, 0));

  v_label := coalesce(v_g.note, 'Gift');

  if p_cash_minor > 0 then
    insert into public.ledger_entries (
      family_id, child_id, mode, jar, kind, direction, amount_minor, label,
      source_type, source_id, idempotency_key, created_by, occurred_at
    )
    values (
      v_g.family_id, v_g.child_id, 'recorded', 'spend', 'parent_gift_in', 'in', p_cash_minor, v_label,
      'parent_gift', v_g.id, 'parent_gift:' || v_g.id || ':spend', v_uid, now()
    );
  end if;
  if p_saved_minor > 0 then
    insert into public.ledger_entries (
      family_id, child_id, mode, jar, kind, direction, amount_minor, label,
      source_type, source_id, idempotency_key, created_by, occurred_at
    )
    values (
      v_g.family_id, v_g.child_id, 'recorded', 'save', 'parent_gift_in', 'in', p_saved_minor, v_label,
      'parent_gift', v_g.id, 'parent_gift:' || v_g.id || ':save', v_uid, now()
    );
  end if;

  update public.parent_gifts
  set status = 'given',
      cash_minor = p_cash_minor,
      saved_minor = p_saved_minor,
      given_by = v_uid,
      given_at = now()
  where id = v_g.id;

  -- slice 5: notify(gift_given)

  return 'confirmed';
end;
$$;

comment on function public.confirm_gift_handover(uuid, bigint, bigint, text) is 'Ledger keys derive from the gift; p_idempotency_key must be non-blank but is not stored. Parent records what was handed over: cash to Spend, saved to Save (each <= 100000000000, sum 1..100x planned, no shortfall); label = note or ''Gift''. Exactly once: a given gift returns already_confirmed, a cancelled one returns cancelled; neither posts. JA403, JA409 (give_on after family today), 22023.';
