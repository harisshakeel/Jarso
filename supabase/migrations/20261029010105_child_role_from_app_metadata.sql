-- Child role from app metadata written after the insert.
--
-- GoTrue's admin createUser inserts auth.users first and writes app_metadata (our
-- jarso_role) in a later UPDATE, so handle_new_user (an insert trigger) never sees it and
-- every child auth user got a 'parent' profile; register_child then refused it. Found by the
-- slice-1 e2e run. This trigger applies the admin-set role when it arrives. Only a profile
-- outside every family can become a child, so a metadata change can't demote an active parent.

create or replace function public.handle_user_app_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles p
  set role = 'child'
  where p.id = new.id
    and p.role <> 'child'
    and not exists (select 1 from public.family_members fm where fm.profile_id = new.id);
  return new;
end;
$$;

comment on function public.handle_user_app_metadata() is 'auth.users update trigger: applies an admin-set jarso_role=child to a profile not yet in any family.';

revoke execute on function public.handle_user_app_metadata() from public, anon, authenticated;

create trigger on_auth_user_app_metadata_updated
  after update of raw_app_meta_data on auth.users
  for each row
  when (
    new.raw_app_meta_data ->> 'jarso_role' = 'child'
    and old.raw_app_meta_data ->> 'jarso_role' is distinct from 'child'
  )
  execute function public.handle_user_app_metadata();
