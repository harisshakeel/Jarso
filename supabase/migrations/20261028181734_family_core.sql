-- Family core: profile roles, families hub, memberships, audit log, RLS helper
-- predicates and create_family. ADR 0005; architecture.md §5.1 and §6.2.

-- ---------------------------------------------------------------------------
-- profiles: role + nickname, server-set only
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column role text not null default 'parent' check (role in ('parent', 'child')),
  add column nickname text check (role = 'child' or nickname is null);

comment on column public.profiles.role is 'parent | child. Set from auth app metadata at sign-up; never user-editable.';
comment on column public.profiles.nickname is 'Child sign-in name, unique per family. Child profiles only; set by functions.';

-- Role comes from raw_app_meta_data (admin-set), never raw_user_meta_data (client-set).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, role)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url',
    case when new.raw_app_meta_data ->> 'jarso_role' = 'child' then 'child' else 'parent' end
  );
  return new;
end;
$$;

-- Clients may update only their display columns; role/nickname are function-managed.
-- RLS does not apply to TRUNCATE, so it is revoked outright.
revoke update, truncate on public.profiles from anon, authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- families
-- ---------------------------------------------------------------------------

create table public.families (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'UTC',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.families is 'Family hub: owns the child sign-in code, currency and timezone. Written only by security definer functions.';
comment on column public.families.code is '6-char child sign-in code from ABCDEFGHJKLMNPQRSTUVWXYZ23456789.';
comment on column public.families.timezone is 'IANA timezone name, validated by create_family.';

create index families_created_by_idx on public.families (created_by);

create trigger families_set_updated_at
  before update on public.families
  for each row execute function public.set_updated_at();

alter table public.families enable row level security;

-- ---------------------------------------------------------------------------
-- family_members
-- ---------------------------------------------------------------------------

create table public.family_members (
  family_id uuid not null references public.families (id) on delete cascade,
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  role text not null check (role in ('parent', 'child')),
  status text not null default 'approved' check (status in ('approved', 'removed')),
  consent_at timestamptz,
  consent_by uuid references public.profiles (id),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (family_id, profile_id),
  check (role <> 'child' or consent_at is not null)
);

comment on table public.family_members is 'Links a profile to its family. profile_id is unique: one family per profile in the pilot. Written only by security definer functions.';
comment on column public.family_members.consent_at is 'Guardian consent time; required for child rows.';
comment on column public.family_members.consent_by is 'Parent who gave consent for this child.';

-- family_id is covered by the primary key's leading column; profile_id by its unique index.
create index family_members_consent_by_idx on public.family_members (consent_by);
create index family_members_approved_by_idx on public.family_members (approved_by);

alter table public.family_members enable row level security;

-- ---------------------------------------------------------------------------
-- audit_log
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  subject_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.audit_log is 'Append-only record of parent-controlled changes. Inserted by security definer functions only; readable by approved parents of the family.';
comment on column public.audit_log.action is 'Dotted event name, e.g. family.created.';
comment on column public.audit_log.subject_id is 'Row the action applies to (polymorphic, no FK).';

create index audit_log_family_id_created_at_idx on public.audit_log (family_id, created_at desc);
create index audit_log_actor_id_idx on public.audit_log (actor_id);

alter table public.audit_log enable row level security;

-- Writes go through functions only; RLS also ignores TRUNCATE.
revoke all on public.families, public.family_members, public.audit_log from anon;
revoke insert, update, delete, truncate on public.families, public.family_members, public.audit_log from authenticated;

-- ---------------------------------------------------------------------------
-- RLS helper predicates (security definer so policies can read family_members
-- without recursing through its own RLS)
-- ---------------------------------------------------------------------------

create or replace function public.is_approved_member(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.family_id = p_family_id
      and fm.profile_id = (select auth.uid())
      and fm.status = 'approved'
  );
$$;

comment on function public.is_approved_member(uuid) is 'RLS: caller has an approved membership in the family.';

create or replace function public.is_parent_of(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_members p
    join public.family_members c on c.family_id = p.family_id
    where p.profile_id = (select auth.uid())
      and p.role = 'parent'
      and p.status = 'approved'
      and c.profile_id = p_child_id
      and c.role = 'child'
      and c.status = 'approved'
  );
$$;

comment on function public.is_parent_of(uuid) is 'RLS: caller is an approved parent in the approved child''s family.';

create or replace function public.is_self(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_child_id is not null and p_child_id = (select auth.uid());
$$;

comment on function public.is_self(uuid) is 'RLS: the row belongs to the caller.';

create or replace function public.current_family_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select fm.family_id
  from public.family_members fm
  where fm.profile_id = (select auth.uid())
    and fm.status = 'approved';
$$;

comment on function public.current_family_id() is 'The caller''s approved family, or null.';

-- ---------------------------------------------------------------------------
-- create_family
-- ---------------------------------------------------------------------------

create or replace function public.create_family(p_currency text, p_timezone text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role text;
  v_family_id uuid;
  v_code text;
  v_bytes bytea;
  v_attempts int := 0;
  c_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if v_uid is null then
    raise exception using errcode = 'JA401', message = 'Not signed in';
  end if;

  select pr.role into v_role from public.profiles pr where pr.id = v_uid;
  if v_role is distinct from 'parent' then
    raise exception using errcode = 'JA403', message = 'Only a parent can create a family';
  end if;

  if exists (select 1 from public.family_members fm where fm.profile_id = v_uid) then
    raise exception using errcode = 'JA409', message = 'Already in a family';
  end if;

  if not exists (select 1 from pg_catalog.pg_timezone_names tz where tz.name = p_timezone) then
    raise exception using errcode = '22023', message = 'Unknown timezone';
  end if;

  loop
    -- First 6 bytes of a v4 UUID are fully random; 256 % 32 = 0 keeps the pick uniform.
    v_bytes := pg_catalog.uuid_send(pg_catalog.gen_random_uuid());
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || pg_catalog.substr(c_alphabet, pg_catalog.get_byte(v_bytes, i) % 32 + 1, 1);
    end loop;

    begin
      insert into public.families (code, currency, timezone, created_by)
      values (v_code, p_currency, p_timezone, v_uid)
      returning id into v_family_id;
      exit;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts >= 5 then
        raise;
      end if;
    end;
  end loop;

  begin
    insert into public.family_members (family_id, profile_id, role, status, approved_by, approved_at)
    values (v_family_id, v_uid, 'parent', 'approved', v_uid, now());
  exception when unique_violation then
    -- Concurrent create_family by the same parent.
    raise exception using errcode = 'JA409', message = 'Already in a family';
  end;

  insert into public.audit_log (family_id, actor_id, action, subject_id, details)
  values (
    v_family_id, v_uid, 'family.created', v_family_id,
    pg_catalog.jsonb_build_object('currency', p_currency, 'timezone', p_timezone)
  );

  return v_family_id;
end;
$$;

comment on function public.create_family(text, text) is 'Parent creates a family and becomes its first approved parent. JA401/JA403/JA409.';

revoke execute on function
  public.is_approved_member(uuid),
  public.is_parent_of(uuid),
  public.is_self(uuid),
  public.current_family_id(),
  public.create_family(text, text)
from public, anon;

grant execute on function
  public.is_approved_member(uuid),
  public.is_parent_of(uuid),
  public.is_self(uuid),
  public.current_family_id(),
  public.create_family(text, text)
to authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

drop policy "Profiles are viewable by their owner" on public.profiles;

create policy "Profiles are viewable by self and family"
  on public.profiles for select
  to authenticated
  using (
    id = (select auth.uid())
    or public.is_parent_of(id)
    or exists (
      select 1
      from public.family_members fm
      where fm.profile_id = profiles.id
        and fm.status = 'approved'
        and fm.family_id = (select public.current_family_id())
    )
  );

create policy "Families are viewable by approved members"
  on public.families for select
  to authenticated
  using (public.is_approved_member(id));

create policy "Family members are viewable by approved members"
  on public.family_members for select
  to authenticated
  using (public.is_approved_member(family_id));

create policy "Audit log is viewable by approved parents"
  on public.audit_log for select
  to authenticated
  using (
    exists (
      select 1
      from public.family_members fm
      where fm.family_id = audit_log.family_id
        and fm.profile_id = (select auth.uid())
        and fm.role = 'parent'
        and fm.status = 'approved'
    )
  );
