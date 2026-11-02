-- A child can never hold a password they chose (ADR 0004).
--
-- A child signs in with a PIN only; their auth user gets a random password at creation that
-- nobody knows. A child session can still call GoTrue's updateUser({ password }) and then sign
-- in with the synthetic email and that password, skipping the PIN and its lockout. Until now
-- the server rotated the password to close that, which also signed out the child's other
-- devices. This trigger closes it at the source: once a user is a child, encrypted_password
-- never changes again, whoever asks (the child through GoTrue, or the admin API).
--
-- GoTrue's admin createUser writes the password in the INSERT and app_metadata (jarso_role)
-- in a follow-up UPDATE that leaves encrypted_password as it is, so creating a child still
-- works; on_auth_user_app_metadata_updated (20261029010105) handles that UPDATE.

-- First, a fresh random password for every existing child, so a password a child set before
-- this migration stops working too. Before the trigger exists, which would refuse it.
update auth.users u
set encrypted_password = extensions.crypt(
  pg_catalog.encode(extensions.gen_random_bytes(32), 'hex'),
  extensions.gen_salt('bf', 10)
)
where u.raw_app_meta_data ->> 'jarso_role' = 'child';

create function public.refuse_child_password_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '42501',
    message = 'A child account cannot have its password changed';
end;
$$;

comment on function public.refuse_child_password_change() is 'auth.users update trigger: refuses any change of a child''s encrypted_password (jarso_role child before or after the update), so a child session can never set a password and sign in without the PIN.';

revoke execute on function public.refuse_child_password_change() from public, anon, authenticated, service_role;

create trigger on_auth_child_password_change
  before update of encrypted_password on auth.users
  for each row
  when (
    new.encrypted_password is distinct from old.encrypted_password
    and (
      old.raw_app_meta_data ->> 'jarso_role' = 'child'
      or new.raw_app_meta_data ->> 'jarso_role' = 'child'
    )
  )
  execute function public.refuse_child_password_change();
