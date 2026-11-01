-- A child can read their own allowance schedule, but its auto-charge state is the parent's
-- payment detail. RLS is row-level, so hide those columns with column privileges: signed-in
-- users read every column except auto_charge, auto_charge_by, auto_charge_since and
-- auto_charge_provider. Parents read that state through allowance_schedule_auto_charge.
-- Every function that reads or writes the table is security definer, so none is affected.

revoke select on public.allowance_schedules from anon, authenticated;
grant select (
  id, family_id, child_id, amount_minor, frequency, anchor_on, next_index, status,
  paused_through, pause_message, created_by, created_at, updated_at
) on public.allowance_schedules to authenticated;

create or replace function public.allowance_schedule_auto_charge(p_schedule_id uuid)
returns table (auto_charge boolean, auto_charge_provider text, auto_charge_by uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_child_id uuid;
begin
  select s.child_id into v_child_id from public.allowance_schedules s where s.id = p_schedule_id;
  if not found or not public.is_parent_of(v_child_id) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  return query
    select s.auto_charge, s.auto_charge_provider, s.auto_charge_by
    from public.allowance_schedules s where s.id = p_schedule_id;
end;
$$;

comment on function public.allowance_schedule_auto_charge(uuid) is 'Auto-charge state of a schedule (on, provider, who turned it on), for a parent of its child only. Children cannot read these columns. JA403 (missing or not a parent of the child).';

revoke execute on function public.allowance_schedule_auto_charge(uuid) from public, anon;
grant execute on function public.allowance_schedule_auto_charge(uuid) to authenticated;
