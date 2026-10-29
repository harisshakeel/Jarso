-- Family settings (feat/family-settings-unlink): remove a child, rename a child, change the
-- family timezone. Removing a child marks the membership removed and frees the nickname,
-- deletes the PIN credentials and attempt counters, expires the child's pending invitations
-- and writes an audit row. The app then revokes the child's sessions and deletes the auth
-- identity while the child has no money history (ADR 0007); once ledger rows exist for a
-- child, remove_child returns false and the identity is kept, disabled.

-- ---------------------------------------------------------------------------
-- family_members: who removed a member and when
-- ---------------------------------------------------------------------------

alter table public.family_members
  add column removed_at timestamptz,
  add column removed_by uuid references public.profiles (id) on delete set null;

create index family_members_removed_by_idx on public.family_members (removed_by);

-- nickname_key is the per-family uniqueness key (partial unique index on role = 'child').
-- Only approved children hold one; removal frees it so a new child can take the nickname.
alter table public.family_members
  drop constraint family_members_nickname_key_check,
  add constraint family_members_nickname_key_check
    check ((role = 'child' and status = 'approved') = (nickname_key is not null));

comment on column public.family_members.removed_at is 'Set by remove_child; status is removed from then on.';
comment on column public.family_members.removed_by is 'Parent who removed the member.';

-- ---------------------------------------------------------------------------
-- remove_child
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

  -- True while nothing else refers to the child. Later slices return false once ledger rows
  -- exist for the child, so the auth identity is kept (disabled) and money history survives.
  return true;
end;
$$;

comment on function public.remove_child(uuid) is
  'Parent removes a child: membership removed, nickname freed, credentials deleted, audited; idempotent for an already-removed child of the same family. Returns true when the auth identity may be deleted. JA401/JA403.';

-- ---------------------------------------------------------------------------
-- rename_child
-- ---------------------------------------------------------------------------

create or replace function public.rename_child(p_child_id uuid, p_nickname text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_family_id uuid;
  v_status text;
  v_old text;
  v_nickname text := pg_catalog.btrim(p_nickname);
begin
  if v_uid is null then
    raise exception using errcode = 'JA401', message = 'Not signed in';
  end if;

  if not public.is_parent_of(p_child_id) then
    raise exception using errcode = 'JA403', message = 'Only the child''s parent can rename them';
  end if;

  if v_nickname is null or pg_catalog.char_length(v_nickname) not between 1 and 20
     or v_nickname !~ '^[[:alpha:][:digit:] _.''-]+$' then
    raise exception using errcode = '22023', message = 'Nickname must be 1 to 20 letters, numbers, spaces or _ . '' -';
  end if;

  select fm.family_id, fm.status, pr.nickname
  into v_family_id, v_status, v_old
  from public.family_members fm
  join public.profiles pr on pr.id = fm.profile_id
  where fm.profile_id = p_child_id
    and fm.role = 'child'
  for update of fm;

  -- Re-checked under the lock: a concurrent removal must win over a rename.
  if not found or v_status <> 'approved' then
    raise exception using errcode = 'JA403', message = 'Only the child''s parent can rename them';
  end if;

  begin
    update public.family_members
    set nickname_key = pg_catalog.lower(v_nickname)
    where profile_id = p_child_id;
  exception when unique_violation then
    raise exception using errcode = 'JA409', message = 'Nickname already used in this family';
  end;

  update public.profiles set nickname = v_nickname where id = p_child_id;

  insert into public.audit_log (family_id, actor_id, action, subject_id, details)
  values (v_family_id, v_uid, 'child.renamed', p_child_id,
          jsonb_build_object('from', v_old, 'to', v_nickname));
end;
$$;

comment on function public.rename_child(uuid, text) is
  'Parent renames a child; same nickname rules as register_child. JA401/JA403/JA409/22023.';

-- ---------------------------------------------------------------------------
-- update_family_timezone
-- ---------------------------------------------------------------------------

create or replace function public.update_family_timezone(p_timezone text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_family_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = 'JA401', message = 'Not signed in';
  end if;

  select fm.family_id
  into v_family_id
  from public.family_members fm
  where fm.profile_id = v_uid
    and fm.role = 'parent'
    and fm.status = 'approved';

  if v_family_id is null then
    raise exception using errcode = 'JA403', message = 'Only a parent in a family can change its settings';
  end if;

  if p_timezone is null
     or not exists (select 1 from pg_catalog.pg_timezone_names tz where tz.name = p_timezone) then
    raise exception using errcode = '22023', message = 'Unknown timezone';
  end if;

  update public.families set timezone = p_timezone where id = v_family_id;

  insert into public.audit_log (family_id, actor_id, action, subject_id, details)
  values (v_family_id, v_uid, 'family.updated', v_family_id, jsonb_build_object('timezone', p_timezone));
end;
$$;

comment on function public.update_family_timezone(text) is
  'Parent changes the family timezone (schedules in later slices read it). JA401/JA403/22023.';

-- ---------------------------------------------------------------------------
-- Grants (Supabase grants new functions to anon/authenticated by default; narrow them)
-- ---------------------------------------------------------------------------

revoke execute on function
  public.remove_child(uuid),
  public.rename_child(uuid, text),
  public.update_family_timezone(text)
from public, anon;

grant execute on function
  public.remove_child(uuid),
  public.rename_child(uuid, text),
  public.update_family_timezone(text)
to authenticated;
