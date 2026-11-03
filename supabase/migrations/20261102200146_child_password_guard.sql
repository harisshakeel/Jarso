-- Child password guard: no child password is ever usable.
--
-- A child signs in only with family code + nickname + PIN (ADR 0004). A child session could still
-- call GoTrue's updateUser({ password }) and later sign in by password, skipping the PIN and its
-- lockout. The server used to close that by rotating the password on every PIN sign-in, but GoTrue
-- ends a user's other sessions on a password change, so the phone and the web signed each other
-- out. This trigger closes the gap in the database instead: whenever a child's password hash
-- changes, it is replaced with the hash of a random value nobody ever sees.
--
-- Why the caller isn't checked: GoTrue writes auth.users as supabase_auth_admin both for a user's
-- own updateUser and for the admin updateUserById, so the database can't tell them apart. It
-- doesn't need to: every legitimate child password is random and unused already (sign-in mints
-- sessions from the PIN check), so scrambling every change loses nothing. The role comes from
-- app metadata only, which only the service role can write; user metadata is never read. The
-- function never raises, so a GoTrue write never fails because of it. The email-change path to
-- a recovery-based reset stays closed by the hosted "double confirm email changes" setting.

create or replace function public.scramble_child_password()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.encrypted_password := extensions.crypt(
    gen_random_uuid()::text || gen_random_uuid()::text,
    extensions.gen_salt('bf')
  );
  return new;
end;
$$;

comment on function public.scramble_child_password() is 'auth.users before-update trigger: replaces any new child (app_metadata.jarso_role=child) password hash with the hash of an unknown random value.';

revoke execute on function public.scramble_child_password() from public, anon, authenticated;

create trigger on_auth_child_password_changed
  before update of encrypted_password on auth.users
  for each row
  when (
    new.raw_app_meta_data ->> 'jarso_role' = 'child'
    and new.encrypted_password is distinct from old.encrypted_password
  )
  execute function public.scramble_child_password();

-- One-time backfill: a password a child already set for itself stops working. Safe to run again;
-- each run leaves another unknown hash. The BEFORE trigger above also fires on this update, so rows hash twice (harmless). Sessions live in auth.sessions, so nobody is signed out.
update auth.users
set encrypted_password = extensions.crypt(
  gen_random_uuid()::text || gen_random_uuid()::text,
  extensions.gen_salt('bf')
)
where raw_app_meta_data ->> 'jarso_role' = 'child';
