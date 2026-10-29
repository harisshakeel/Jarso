-- Hidden one-time parent gifts. Slice 2 design §3 S2-S5, §4.2-4.4, §11.
-- A pending or cancelled gift is invisible to the child everywhere: RLS shows
-- the child only given gifts, every function below is parent-only, and nothing
-- reaches the ledger until handover. Writes go through security definer
-- functions only.

-- ---------------------------------------------------------------------------
-- parent_gifts
-- ---------------------------------------------------------------------------

create table public.parent_gifts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  child_id uuid not null references public.profiles (id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  give_on date not null,
  note text check (char_length(note) <= 140),
  status text not null default 'pending' check (status in ('pending', 'given', 'cancelled')),
  cash_minor bigint check (cash_minor >= 0),
  saved_minor bigint check (saved_minor >= 0),
  given_by uuid references public.profiles (id) on delete set null,
  given_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'given' or (cash_minor is not null and saved_minor is not null and given_at is not null))
);

comment on table public.parent_gifts is 'One-time gifts from a parent. The child sees a row only once it is given. Written only by security definer functions.';
comment on column public.parent_gifts.amount_minor is 'Planned amount. The handed-over total (cash + saved) may differ; no shortfall for gifts.';
comment on column public.parent_gifts.give_on is 'Family date the gift is due; due = pending and give_on <= family today.';
comment on column public.parent_gifts.note is 'Optional trimmed note to the child, max 140 chars; shown as plain text after handover.';

create index parent_gifts_child_pending_give_on_idx
  on public.parent_gifts (child_id, give_on)
  where status = 'pending';
create index parent_gifts_child_id_idx on public.parent_gifts (child_id);
create index parent_gifts_family_id_idx on public.parent_gifts (family_id);
create index parent_gifts_created_by_idx on public.parent_gifts (created_by);
create index parent_gifts_given_by_idx on public.parent_gifts (given_by);

create trigger parent_gifts_set_updated_at
  before update on public.parent_gifts
  for each row execute function public.set_updated_at();

alter table public.parent_gifts enable row level security;

-- Writes go through functions only; RLS also ignores TRUNCATE.
revoke all on public.parent_gifts from anon;
revoke insert, update, delete, truncate on public.parent_gifts from authenticated;

create policy "Gifts are viewable by parents, and by the child once given"
  on public.parent_gifts for select
  to authenticated
  using (public.is_parent_of(child_id) or (public.is_self(child_id) and status = 'given'));

-- ---------------------------------------------------------------------------
-- Lock helper (internal)
-- ---------------------------------------------------------------------------

-- A missing row and a forbidden row both raise JA403 so existence does not leak.
create or replace function public.lock_gift_for_parent(p_gift_id uuid)
returns public.parent_gifts
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_g public.parent_gifts;
begin
  select * into v_g from public.parent_gifts g where g.id = p_gift_id for update;
  if not found or not public.is_parent_of(v_g.child_id) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;
  return v_g;
end;
$$;

comment on function public.lock_gift_for_parent(uuid) is 'Internal. Locks the gift for update; JA403 unless the caller is an approved parent of its child (also when it does not exist).';

-- ---------------------------------------------------------------------------
-- Parent writes
-- ---------------------------------------------------------------------------

create or replace function public.create_gift(
  p_child_id uuid,
  p_amount_minor bigint,
  p_give_on date,
  p_note text
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

  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception using errcode = '22023', message = 'Invalid gift amount';
  end if;
  if p_give_on is null or p_give_on < public.family_today(v_family_id) then
    raise exception using errcode = '22023', message = 'Give-on date must be today or later';
  end if;
  if pg_catalog.char_length(v_note) > 140 then
    raise exception using errcode = '22023', message = 'Note is too long';
  end if;

  insert into public.parent_gifts (family_id, child_id, amount_minor, give_on, note, created_by)
  values (v_family_id, p_child_id, p_amount_minor, p_give_on, v_note, v_uid)
  returning id into v_id;

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

comment on function public.create_gift(uuid, bigint, date, text) is 'Parent plans a one-time gift for the child (hidden from the child until given). Note trimmed, empty = null. JA403, 22023 (amount <= 0, give_on before family today, note over 140).';

create or replace function public.update_gift(
  p_gift_id uuid,
  p_amount_minor bigint,
  p_give_on date,
  p_note text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_g public.parent_gifts;
  v_note text := nullif(pg_catalog.btrim(p_note), '');
begin
  v_g := public.lock_gift_for_parent(p_gift_id);
  if v_g.status <> 'pending' then
    raise exception using errcode = 'JA409', message = 'Gift is no longer pending';
  end if;

  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception using errcode = '22023', message = 'Invalid gift amount';
  end if;
  -- An unchanged date may already be past (a due gift); a new date may not.
  if p_give_on is null
     or (p_give_on <> v_g.give_on and p_give_on < public.family_today(v_g.family_id)) then
    raise exception using errcode = '22023', message = 'Give-on date must be today or later';
  end if;
  if pg_catalog.char_length(v_note) > 140 then
    raise exception using errcode = '22023', message = 'Note is too long';
  end if;

  update public.parent_gifts
  set amount_minor = p_amount_minor,
      give_on = p_give_on,
      note = v_note
  where id = v_g.id;

  insert into public.audit_log (family_id, actor_id, action, subject_id, details)
  values (
    v_g.family_id, v_uid, 'gift.updated', v_g.id,
    pg_catalog.jsonb_build_object(
      'amount_minor', p_amount_minor, 'give_on', p_give_on, 'has_note', v_note is not null,
      'previous_amount_minor', v_g.amount_minor, 'previous_give_on', v_g.give_on
    )
  );

  return v_g.id;
end;
$$;

comment on function public.update_gift(uuid, bigint, date, text) is 'Parent edits a pending gift''s amount, date and note. JA403, JA409 (not pending), 22023 (amount <= 0, a changed give_on before family today, note over 140).';

create or replace function public.cancel_gift(p_gift_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_g public.parent_gifts;
begin
  v_g := public.lock_gift_for_parent(p_gift_id);
  if v_g.status <> 'pending' then
    raise exception using errcode = 'JA409', message = 'Gift is no longer pending';
  end if;

  update public.parent_gifts set status = 'cancelled' where id = v_g.id;

  insert into public.audit_log (family_id, actor_id, action, subject_id, details)
  values (
    v_g.family_id, v_uid, 'gift.cancelled', v_g.id,
    pg_catalog.jsonb_build_object('child_id', v_g.child_id, 'amount_minor', v_g.amount_minor, 'give_on', v_g.give_on)
  );

  return v_g.id;
end;
$$;

comment on function public.cancel_gift(uuid) is 'Parent cancels a pending gift (terminal; the child never sees it). JA403, JA409 (not pending).';

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
     or p_cash_minor::numeric + p_saved_minor <= 0
     or p_cash_minor::numeric + p_saved_minor > v_g.amount_minor::numeric * 100
     or p_idempotency_key is null or pg_catalog.btrim(p_idempotency_key) = '' then
    raise exception using errcode = '22023', message = 'Invalid handover amounts';
  end if;

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

comment on function public.confirm_gift_handover(uuid, bigint, bigint, text) is 'Ledger keys derive from the gift; p_idempotency_key must be non-blank but is not stored. Parent records what was handed over: cash to Spend, saved to Save (sum 1..100x planned, no shortfall); label = note or ''Gift''. Exactly once: any non-pending gift (given or cancelled) returns already_confirmed. JA403, JA409 (give_on after family today), 22023.';

-- ---------------------------------------------------------------------------
-- Parent reads
-- ---------------------------------------------------------------------------

create or replace function public.list_due_for_parent(p_child_id uuid)
returns table (
  kind text,
  id uuid,
  due_on date,
  amount_minor bigint,
  note text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- The secrecy gate: due counts include pending gifts, so never for the child.
  if not public.is_parent_of(p_child_id) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  return query
  select d.kind, d.id, d.due_on, d.amount_minor, d.note
  from (
    select 'allowance'::text as kind, o.id, o.due_on, o.amount_minor, null::text as note, o.created_at
    from public.allowance_occurrences o
    where o.child_id = p_child_id
      and o.status = 'due'
    union all
    select 'gift'::text, g.id, g.give_on, g.amount_minor, g.note, g.created_at
    from public.parent_gifts g
    where g.child_id = p_child_id
      and g.status = 'pending'
      and g.give_on <= public.family_today(g.family_id)
  ) d
  order by d.due_on, d.created_at, d.kind, d.id;
end;
$$;

comment on function public.list_due_for_parent(uuid) is 'Due allowance occurrences and pending gifts with give_on <= family today, oldest first. Parent only (JA403 for the child too: it reveals pending gifts).';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function public.lock_gift_for_parent(uuid) from public, anon, authenticated;

revoke execute on function
  public.create_gift(uuid, bigint, date, text),
  public.update_gift(uuid, bigint, date, text),
  public.cancel_gift(uuid),
  public.confirm_gift_handover(uuid, bigint, bigint, text),
  public.list_due_for_parent(uuid)
from public, anon;

grant execute on function
  public.create_gift(uuid, bigint, date, text),
  public.update_gift(uuid, bigint, date, text),
  public.cancel_gift(uuid),
  public.confirm_gift_handover(uuid, bigint, bigint, text),
  public.list_due_for_parent(uuid)
to authenticated;
