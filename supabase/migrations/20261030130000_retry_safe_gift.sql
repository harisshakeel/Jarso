-- Retry safety for creating a gift. A response lost on a slow network makes the gift form send
-- again; create_gift now takes the form's idempotency key, and a repeat from the same parent
-- returns the gift it already made instead of a copy.
-- No new tables, so RLS is unchanged; the new signature repeats its grants.

-- ---------------------------------------------------------------------------
-- parent_gifts.idempotency_key
-- ---------------------------------------------------------------------------

alter table public.parent_gifts add column idempotency_key text;
update public.parent_gifts set idempotency_key = gen_random_uuid()::text where idempotency_key is null;
alter table public.parent_gifts
  alter column idempotency_key set not null,
  add constraint parent_gifts_idempotency_key_length
    check (char_length(idempotency_key) between 1 and 200),
  add constraint parent_gifts_created_by_idempotency_key_key unique (created_by, idempotency_key);

comment on column public.parent_gifts.idempotency_key is 'From the gift form, one per form open. Unique per creating parent; a repeat returns the existing gift.';

drop function public.create_gift(uuid, bigint, date, text);

create function public.create_gift(
  p_child_id uuid,
  p_amount_minor bigint,
  p_give_on date,
  p_note text,
  -- Default null keeps the old 4-argument call working while a deploy or rollback runs.
  p_idempotency_key text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_family_id uuid;
  v_note text := nullif(pg_catalog.btrim(p_note), '');
  -- No key (an older app build): a fresh one, so the gift is made once, without retry safety.
  v_key text := coalesce(p_idempotency_key, pg_catalog.gen_random_uuid()::text);
  v_id uuid;
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

  if pg_catalog.btrim(v_key) = '' or pg_catalog.char_length(v_key) > 200 then
    raise exception using errcode = '22023', message = 'Invalid gift';
  end if;

  -- A retry returns the original gift without re-checking the date (it may be a day later).
  select g.id into v_id
  from public.parent_gifts g
  where g.created_by = v_uid and g.idempotency_key = v_key and g.child_id = p_child_id;
  if found then
    return v_id;
  end if;

  if p_amount_minor is null or p_amount_minor <= 0 or p_amount_minor > 100000000000 then
    raise exception using errcode = '22023', message = 'Invalid gift amount';
  end if;
  if p_give_on is null or p_give_on < public.family_today(v_family_id)
     or p_give_on > public.family_today(v_family_id) + 366 then
    raise exception using errcode = '22023', message = 'Give-on date must be from today to a year ahead';
  end if;
  if pg_catalog.char_length(v_note) > 140 then
    raise exception using errcode = '22023', message = 'Note is too long';
  end if;

  -- Two sends racing past the lookup: the loser waits on the unique key, inserts nothing and
  -- reads the winner's row. A key this parent already used for another child is refused.
  insert into public.parent_gifts (family_id, child_id, amount_minor, give_on, note, created_by, idempotency_key)
  values (v_family_id, p_child_id, p_amount_minor, p_give_on, v_note, v_uid, v_key)
  on conflict (created_by, idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    select g.id into v_id
    from public.parent_gifts g
    where g.created_by = v_uid and g.idempotency_key = v_key and g.child_id = p_child_id;
    if v_id is null then
      raise exception using errcode = 'JA409', message = 'Key already used for another gift';
    end if;
    return v_id;
  end if;

  insert into public.audit_log (family_id, actor_id, action, subject_id, details)
  values (
    v_family_id, v_uid, 'gift.created', v_id,
    pg_catalog.jsonb_build_object(
      'child_id', p_child_id, 'amount_minor', p_amount_minor,
      'give_on', p_give_on, 'has_note', v_note is not null
    )
  );

  return v_id;
end;
$$;

comment on function public.create_gift(uuid, bigint, date, text, text) is 'Parent plans a one-time gift for the child (hidden from the child until given). Note trimmed, empty = null. A repeated key from the same parent for the same child returns the existing gift id without inserting or auditing; a null key (older callers) gets a fresh random one. JA403, JA409 (key already used by this parent for another child), 22023 (blank key or key over 200, amount outside 1..100000000000, give_on outside family today..today + 366, note over 140).';

revoke execute on function public.create_gift(uuid, bigint, date, text, text) from public, anon;
grant execute on function public.create_gift(uuid, bigint, date, text, text) to authenticated;
