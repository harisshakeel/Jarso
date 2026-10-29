-- Paged history: list_ledger_history gains a `p_before` cursor so the parent's
-- history page can reach entries older than the first page.

drop function public.list_ledger_history(uuid, int);

create function public.list_ledger_history(
  p_child_id uuid,
  p_limit int default 50,
  p_before timestamptz default null
)
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
    and (p_before is null or le.occurred_at < p_before)
  order by le.occurred_at desc, le.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

comment on function public.list_ledger_history(uuid, int, timestamptz) is 'Recorded-mode ledger entries, newest first, optionally only those before p_before (limit clamped 1-200). Caller must be the child or their parent. JA403.';

revoke execute on function public.list_ledger_history(uuid, int, timestamptz) from public, anon;
grant execute on function public.list_ledger_history(uuid, int, timestamptz) to authenticated;
