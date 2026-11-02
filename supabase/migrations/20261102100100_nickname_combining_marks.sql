-- Nicknames may carry combining marks. The old check ('^[[:alpha:][:digit:] _.''-]+$') let
-- letters through but not the marks many scripts write names with: Devanagari viramas
-- ('कृष्ण'), Thai tone marks ('น้อย'), a combining accent with no precomposed form. One
-- shared check now, used by register_child, create_invitation and rename_child; the Zod schema
-- (family/schemas.ts) mirrors it with [\p{L}\p{M}\p{Nd} _.'-].
--
-- Postgres has no Unicode-category class, so the marks are named as ranges: the combining
-- diacritic blocks, Cyrillic/Hebrew/Arabic marks, and whole blocks for the scripts whose names
-- are mostly letters + marks (Indic, Thai, Lao, Tibetan, Myanmar, Khmer). Those blocks hold only
-- letters, marks, digits and a few script punctuation signs, none of which can form an email
-- address or a link, which is what the allowlist is for. Emoji, variation selectors, joiners and
-- bidi controls stay out.

create or replace function public.is_valid_nickname(p_nickname text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_nickname ~ ('^[[:alpha:][:digit:] _.'''
    || '̀-ͯ҃-҉֑-ׇؐ-ًؚ-ٰٟۖ-ۭ'
    || 'ऀ-෿฀-໿ༀ-࿿က-႟ក-៿'
    || '᪰-᫿᷀-゙᷿-゚︠-︯'
    || '-]+$')
$$;

comment on function public.is_valid_nickname(text) is 'Nickname charset: letters and digits of any script, their combining marks, space and _ . '' -. Length is checked by the callers.';

revoke execute on function public.is_valid_nickname(text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- register_child: same as 20261029013254, nickname check via is_valid_nickname
-- ---------------------------------------------------------------------------

create or replace function public.register_child(
  p_child_id uuid,
  p_family_id uuid,
  p_nickname text,
  p_pin text,
  p_consent boolean,
  p_invitation_id uuid default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_nickname text := pg_catalog.btrim(p_nickname);
begin
  if v_uid is null then
    raise exception using errcode = 'JA401', message = 'Not signed in';
  end if;

  if not exists (
    select 1
    from public.family_members fm
    where fm.family_id = p_family_id
      and fm.profile_id = v_uid
      and fm.role = 'parent'
      and fm.status = 'approved'
  ) then
    raise exception using errcode = 'JA403', message = 'Only a parent in this family can add a child';
  end if;

  if p_consent is not true then
    raise exception using errcode = 'JA403', message = 'Parent consent is required';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then
    raise exception using errcode = '22023', message = 'PIN must be 4 to 6 digits';
  end if;

  if v_nickname is null or pg_catalog.char_length(v_nickname) not between 1 and 20
     or not public.is_valid_nickname(v_nickname) then
    raise exception using errcode = '22023', message = 'Nickname must be 1 to 20 letters, numbers, spaces or _ . '' -';
  end if;

  if not exists (select 1 from public.profiles pr where pr.id = p_child_id and pr.role = 'child')
     or exists (select 1 from public.family_members fm where fm.profile_id = p_child_id) then
    raise exception using errcode = 'JA409', message = 'Child account is not available';
  end if;

  if p_invitation_id is not null then
    -- Row lock: a concurrent accept waits, then sees 'accepted' and fails.
    perform 1
    from public.invitations i
    where i.id = p_invitation_id
      and i.status = 'pending'
      and i.expires_at > now()
    for update;

    if not found then
      raise exception using errcode = 'JA404', message = 'Invitation not found or no longer valid';
    end if;
  end if;

  begin
    insert into public.family_members (
      family_id, profile_id, role, status, nickname_key,
      consent_at, consent_by, approved_by, approved_at
    )
    values (
      p_family_id, p_child_id, 'child', 'approved', pg_catalog.lower(v_nickname),
      now(), v_uid, v_uid, now()
    );
  exception when unique_violation then
    -- Nickname taken in this family, or a concurrent registration of the same child.
    raise exception using errcode = 'JA409', message = 'Nickname already used in this family';
  end;

  update public.profiles set nickname = v_nickname where id = p_child_id;

  -- A leftover row (e.g. from a half-finished earlier attempt) is overwritten, not surfaced as 23505.
  insert into public.child_credentials (profile_id, pin_hash, set_by)
  values (p_child_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), v_uid)
  on conflict (profile_id) do update
    set pin_hash = excluded.pin_hash,
        set_by = excluded.set_by,
        recent_failures = 0,
        recent_failures_since = null,
        frozen_at = null;

  delete from public.child_pin_attempts a where a.child_id = p_child_id;

  insert into public.audit_log (family_id, actor_id, action, subject_id, details)
  values (
    p_family_id, v_uid, 'child.added', p_child_id,
    pg_catalog.jsonb_build_object('nickname', v_nickname)
  );

  if p_invitation_id is not null then
    update public.invitations
    set status = 'accepted', accepted_by = v_uid, child_id = p_child_id, family_id = p_family_id,
        parent_email = null
    where id = p_invitation_id;

    insert into public.audit_log (family_id, actor_id, action, subject_id)
    values (p_family_id, v_uid, 'invitation.accepted', p_invitation_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_invitation: same as 20261029013254, nickname check via is_valid_nickname
-- ---------------------------------------------------------------------------

create or replace function public.create_invitation(
  p_nickname text,
  p_parent_email text,
  p_token_hash text,
  p_code_hash text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nickname text := pg_catalog.btrim(p_nickname);
  v_id uuid;
begin
  if v_nickname is null or pg_catalog.char_length(v_nickname) not between 1 and 20
     or not public.is_valid_nickname(v_nickname) then
    raise exception using errcode = '22023', message = 'Nickname must be 1 to 20 letters, numbers, spaces or _ . '' -';
  end if;

  insert into public.invitations (nickname, parent_email, token_hash, code_hash, expires_at)
  values (v_nickname, pg_catalog.btrim(p_parent_email), p_token_hash, p_code_hash, now() + interval '7 days')
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- rename_child: same as 20261029100000, nickname check via is_valid_nickname
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
     or not public.is_valid_nickname(v_nickname) then
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
