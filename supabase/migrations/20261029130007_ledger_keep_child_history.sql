-- A child's money history outlives their account (ADR 0007). This was folded into the ledger
-- migration after hosted had already applied it, so it ships here as its own step.

-- restrict, not cascade: deleting a child's identity must never delete money history.
alter table public.ledger_entries
  drop constraint ledger_entries_child_id_fkey,
  add constraint ledger_entries_child_id_fkey
    foreign key (child_id) references public.profiles (id) on delete restrict;

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
