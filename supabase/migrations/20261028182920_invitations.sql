-- Child-started invitations (D13): invitations table, create_invitation,
-- find_invitation and the invitation branch of register_child. Also hardens
-- child accounts: escalating PIN lockout, nickname_key iff child, and an
-- idempotent credential insert in register_child. Spec §5 slice 1.

-- ---------------------------------------------------------------------------
-- Hardening: nickname_key present exactly for child rows
-- ---------------------------------------------------------------------------

alter table public.family_members
  drop constraint family_members_check1,
  add constraint family_members_nickname_key_check check ((role = 'child') = (nickname_key is not null));

-- ---------------------------------------------------------------------------
-- Hardening: escalating lockout
-- ---------------------------------------------------------------------------

alter table public.child_credentials
  add column lock_count int not null default 0 check (lock_count >= 0);

comment on column public.child_credentials.lock_count is 'Locks since the last successful sign-in or PIN reset; lock n lasts 15 min × 2^(n-1), capped at 24 hours.';

-- ---------------------------------------------------------------------------
-- invitations
-- ---------------------------------------------------------------------------

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'child_to_parent' check (kind = 'child_to_parent'),
  nickname text not null check (pg_catalog.char_length(nickname) between 1 and 20),
  parent_email text not null,
  token_hash text not null unique,
  code_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired')),
  expires_at timestamptz not null,
  accepted_by uuid references public.profiles (id) on delete set null,
  child_id uuid references public.profiles (id) on delete set null,
  family_id uuid references public.families (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.invitations is 'Child-started request for a parent to create the child''s account. RLS on with no policies: service role and security definer functions only.';
comment on column public.invitations.nickname is 'Nickname the child chose; the parent may change it when accepting.';
comment on column public.invitations.parent_email is 'Where the optional invitation email goes. Never shown back to clients.';
comment on column public.invitations.token_hash is 'Hash of the secret in the invitation link. The raw token is never stored.';
comment on column public.invitations.code_hash is 'Hash of the short code the child shows the parent. The raw code is never stored.';
comment on column public.invitations.accepted_by is 'Parent who accepted; set with child_id and family_id by register_child.';

create index invitations_accepted_by_idx on public.invitations (accepted_by);
create index invitations_child_id_idx on public.invitations (child_id);
create index invitations_family_id_idx on public.invitations (family_id);

alter table public.invitations enable row level security;

-- No policies; RLS also ignores TRUNCATE.
revoke all on public.invitations from anon;
revoke insert, update, delete, truncate on public.invitations from authenticated;

-- ---------------------------------------------------------------------------
-- create_invitation
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
  if v_nickname is null or pg_catalog.char_length(v_nickname) not between 1 and 20 then
    raise exception using errcode = '22023', message = 'Nickname must be 1 to 20 characters';
  end if;

  insert into public.invitations (nickname, parent_email, token_hash, code_hash, expires_at)
  values (v_nickname, pg_catalog.btrim(p_parent_email), p_token_hash, p_code_hash, now() + interval '7 days')
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.create_invitation(text, text, text, text) is 'Records a pending child-started invitation valid for 7 days. Callers pass hashes only. service_role only; 22023.';

-- ---------------------------------------------------------------------------
-- find_invitation
-- ---------------------------------------------------------------------------

create or replace function public.find_invitation(p_hash text)
returns table (id uuid, nickname text)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.nickname
  from public.invitations i
  where (i.token_hash = p_hash or i.code_hash = p_hash)
    and i.status = 'pending'
    and i.expires_at > now();
$$;

comment on function public.find_invitation(text) is 'Resolves a link-token or short-code hash to a pending, unexpired invitation; empty otherwise.';

-- ---------------------------------------------------------------------------
-- register_child: invitation branch + idempotent credential insert
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

  if v_nickname is null or pg_catalog.char_length(v_nickname) not between 1 and 20 then
    raise exception using errcode = '22023', message = 'Nickname must be 1 to 20 characters';
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
        failed_attempts = 0,
        locked_until = null,
        lock_count = 0;

  insert into public.audit_log (family_id, actor_id, action, subject_id, details)
  values (
    p_family_id, v_uid, 'child.added', p_child_id,
    pg_catalog.jsonb_build_object('nickname', v_nickname)
  );

  if p_invitation_id is not null then
    update public.invitations
    set status = 'accepted', accepted_by = v_uid, child_id = p_child_id, family_id = p_family_id
    where id = p_invitation_id;

    insert into public.audit_log (family_id, actor_id, action, subject_id)
    values (p_family_id, v_uid, 'invitation.accepted', p_invitation_id);
  end if;
end;
$$;

comment on function public.register_child(uuid, uuid, text, text, boolean, uuid) is 'Approved parent adds an existing child-role profile to their family with consent and a PIN, optionally accepting a pending invitation. JA401/JA403/JA404/JA409, 22023.';

-- ---------------------------------------------------------------------------
-- set_child_pin: also clears lock_count
-- ---------------------------------------------------------------------------

create or replace function public.set_child_pin(p_child_id uuid, p_pin text)
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

  if not public.is_parent_of(p_child_id) then
    raise exception using errcode = 'JA403', message = 'Only the child''s parent can set the PIN';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then
    raise exception using errcode = '22023', message = 'PIN must be 4 to 6 digits';
  end if;

  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.profile_id = p_child_id;

  insert into public.child_credentials (profile_id, pin_hash, set_by)
  values (p_child_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), v_uid)
  on conflict (profile_id) do update
    set pin_hash = excluded.pin_hash,
        set_by = excluded.set_by,
        failed_attempts = 0,
        locked_until = null,
        lock_count = 0;

  insert into public.audit_log (family_id, actor_id, action, subject_id)
  values (v_family_id, v_uid, 'child.pin_reset', p_child_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- verify_child_pin: escalating lockout
-- ---------------------------------------------------------------------------

-- Never raises for a bad sign-in: an exception would roll back the failed-attempt
-- counter. Callers map 'invalid' → UNAUTHORIZED and 'locked' → RATE_LIMITED.
create or replace function public.verify_child_pin(p_family_code text, p_nickname text, p_pin text)
returns table (child_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text := pg_catalog.upper(pg_catalog.regexp_replace(coalesce(p_family_code, ''), '[[:space:]-]', '', 'g'));
  v_key text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_nickname, '')));
  v_child_id uuid;
  v_cred public.child_credentials%rowtype;
begin
  select fm.profile_id into v_child_id
  from public.families f
  join public.family_members fm on fm.family_id = f.id
  where f.code = v_code
    and fm.nickname_key = v_key
    and fm.role = 'child'
    and fm.status = 'approved';

  if v_child_id is not null then
    -- Row lock serialises concurrent attempts so none escape the counter.
    select * into v_cred
    from public.child_credentials cc
    where cc.profile_id = v_child_id
    for update;
  end if;

  if v_cred.profile_id is null then
    -- Spend the same hashing time as a real check so timing does not reveal nicknames.
    perform extensions.crypt(coalesce(p_pin, ''), extensions.gen_salt('bf', 10));
    return query select null::uuid, 'invalid'::text;
    return;
  end if;

  if v_cred.locked_until is not null and v_cred.locked_until > now() then
    return query select null::uuid, 'locked'::text;
    return;
  end if;

  if p_pin is not null and extensions.crypt(p_pin, v_cred.pin_hash) = v_cred.pin_hash then
    update public.child_credentials cc
    set failed_attempts = 0, locked_until = null, lock_count = 0
    where cc.profile_id = v_child_id;

    return query select v_child_id, 'ok'::text;
    return;
  end if;

  if v_cred.failed_attempts + 1 >= 5 then
    -- Lock n lasts 15 min × 2^(n-1), capped at 24 h (the exponent cap keeps the
    -- interval in range). The count restarts so each window allows five tries.
    update public.child_credentials cc
    set failed_attempts = 0,
        lock_count = v_cred.lock_count + 1,
        locked_until = now() + least(
          interval '15 minutes' * pg_catalog.power(2, least(v_cred.lock_count, 7)),
          interval '24 hours'
        )
    where cc.profile_id = v_child_id;
  else
    update public.child_credentials cc
    set failed_attempts = v_cred.failed_attempts + 1
    where cc.profile_id = v_child_id;
  end if;

  return query select null::uuid, 'invalid'::text;
end;
$$;

comment on function public.verify_child_pin(text, text, text) is 'Child sign-in check. Returns (child_id, status) with status ok | invalid | locked; each 5 wrong PINs lock for 15 min, doubling per lock up to 24 h until a success or PIN reset. service_role only.';

-- ---------------------------------------------------------------------------
-- Grants (Supabase grants new functions to anon/authenticated by default;
-- create or replace keeps the existing grants on the replaced functions)
-- ---------------------------------------------------------------------------

revoke execute on function
  public.create_invitation(text, text, text, text),
  public.find_invitation(text)
from public, anon;

revoke execute on function public.create_invitation(text, text, text, text) from authenticated;

grant execute on function public.find_invitation(text) to authenticated;
grant execute on function public.create_invitation(text, text, text, text) to service_role;
