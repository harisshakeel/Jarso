-- Demo clock (D11): whether the caller's family is a demo family, so the parent settings page
-- shows the Demo clock card only there. families.demo_clock_enabled is not readable by
-- signed-in users (20261102200000), hence a definer function that answers for the caller only.

create function public.family_demo_clock()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_members fm
    join public.families f on f.id = fm.family_id
    where fm.profile_id = (select auth.uid())
      and fm.status = 'approved'
      and f.demo_clock_enabled
  );
$$;

comment on function public.family_demo_clock() is 'Demo clock (D11): true when the caller is an approved member of a family with demo_clock_enabled; false otherwise (and when signed out).';

revoke execute on function public.family_demo_clock() from public, anon;
grant execute on function public.family_demo_clock() to authenticated;
