-- Parent profile completion (feat/parent-profile-completion, ADR 0008). A parent records date
-- of birth, country and gender before using the main features. Kept out of `profiles` on
-- purpose: profiles are readable by the whole family, children included, while these details
-- are visible only to the parent who owns them. The only write path is
-- complete_parent_profile(), which enforces the adult-age and value rules.

-- ---------------------------------------------------------------------------
-- parent_details
-- ---------------------------------------------------------------------------

create table public.parent_details (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  date_of_birth date not null check (date_of_birth >= date '1900-01-01'),
  country text not null check (country ~ '^[A-Z]{2}$'),
  gender text not null check (gender in ('female', 'male', 'non_binary', 'prefer_not_to_say')),
  completed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.parent_details is 'A parent''s own details (ADR 0008). Owner-only; written by complete_parent_profile().';
comment on column public.parent_details.country is 'ISO 3166-1 alpha-2 code; the app validates it against the assigned list.';
comment on column public.parent_details.completed_at is 'First completion; kept when the parent edits the details later.';

create trigger parent_details_set_updated_at
  before update on public.parent_details
  for each row execute function public.set_updated_at();

alter table public.parent_details enable row level security;

-- RLS does not apply to TRUNCATE, so writes are revoked outright; reads go through the policy.
revoke all on public.parent_details from anon;
revoke insert, update, delete, truncate on public.parent_details from authenticated;

create policy "Parent details are viewable by their owner"
  on public.parent_details for select
  to authenticated
  using (profile_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- complete_parent_profile
-- ---------------------------------------------------------------------------

create or replace function public.complete_parent_profile(
  p_date_of_birth date,
  p_country text,
  p_gender text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception using errcode = 'JA401', message = 'Not signed in';
  end if;

  if not exists (select 1 from public.profiles pr where pr.id = v_uid and pr.role = 'parent') then
    raise exception using errcode = 'JA403', message = 'Only a parent completes a parent profile';
  end if;

  if p_date_of_birth is null
     or p_date_of_birth < date '1900-01-01'
     or p_date_of_birth > (current_date - interval '18 years')::date then
    raise exception using errcode = '22023', message = 'A parent must be at least 18';
  end if;

  if p_country is null or p_country !~ '^[A-Z]{2}$' then
    raise exception using errcode = '22023', message = 'Country must be a two-letter code';
  end if;

  if p_gender is null or p_gender not in ('female', 'male', 'non_binary', 'prefer_not_to_say') then
    raise exception using errcode = '22023', message = 'Unknown gender option';
  end if;

  insert into public.parent_details (profile_id, date_of_birth, country, gender)
  values (v_uid, p_date_of_birth, p_country, p_gender)
  on conflict (profile_id) do update
    set date_of_birth = excluded.date_of_birth,
        country = excluded.country,
        gender = excluded.gender;
end;
$$;

comment on function public.complete_parent_profile(date, text, text) is
  'Signed-in parent records or updates their own details; 18+, ISO country code, known gender option. JA401/JA403/22023.';

revoke execute on function public.complete_parent_profile(date, text, text) from public, anon;
grant execute on function public.complete_parent_profile(date, text, text) to authenticated;
