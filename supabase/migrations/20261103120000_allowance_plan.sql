-- Allowance-day plan (demo 3, 2026-11-03): on the day an allowance lands, the child's Home
-- offers a Save/Spend split worked out in code. "Do it" is an ordinary deposit (create_deposit,
-- so the parent's ask/notify setting and the auto-confirm rules apply as for any put-in);
-- "Not today" hides the card. Either way the card is not offered again for that allowance,
-- which is what this column records. The model never moves money.

alter table public.allowance_occurrences
  add column plan_decided_at timestamptz;

comment on column public.allowance_occurrences.plan_decided_at is
  'When the child took or dismissed the allowance-day plan for this handover; null while the card may still show. Written only by decide_allowance_plan.';

create or replace function public.decide_allowance_plan(p_occurrence_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_child_id uuid;
  v_status text;
begin
  select o.child_id, o.status into v_child_id, v_status
  from public.allowance_occurrences o
  where o.id = p_occurrence_id;

  -- A missing row and someone else's row look the same: not allowed.
  if v_child_id is null or not public.is_self(v_child_id) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  if v_status <> 'confirmed' then
    raise exception using errcode = 'JA409', message = 'Not handed over yet';
  end if;

  -- The first decision stands; a repeat changes nothing.
  update public.allowance_occurrences
  set plan_decided_at = coalesce(plan_decided_at, pg_catalog.now())
  where id = p_occurrence_id;
end;
$$;

comment on function public.decide_allowance_plan(uuid) is
  'The child records that they took or dismissed the allowance-day plan for one of their own confirmed allowances: sets plan_decided_at once (a repeat keeps the first time). JA403 (not the child, or no such row), JA409 (the allowance is not confirmed).';

revoke execute on function public.decide_allowance_plan(uuid) from public, anon;
grant execute on function public.decide_allowance_plan(uuid) to authenticated;
