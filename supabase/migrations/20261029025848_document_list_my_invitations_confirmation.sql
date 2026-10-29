-- Records on the function that its email check depends on hosted auth settings (docs/auth.md).

comment on function public.list_my_invitations() is 'Pending, unexpired invitations addressed to the caller''s confirmed email (case-insensitive), newest first, at most 50. Parents only; empty for anyone else. Never returns the email. REQUIRES hosted Auth "Confirm email" and "Secure email change" ON: email_confirmed_at only proves ownership when sign-up cannot auto-confirm.';
