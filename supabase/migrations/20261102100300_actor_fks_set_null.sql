-- "Who did this" columns no longer block deleting the actor's profile: the row stays and the
-- actor becomes unknown (null). Matches family_members.removed_by and the created_by columns
-- added since. families.created_by and the ledger_entries self-references stay restrict on
-- purpose (see docs/database.md).

alter table public.family_members
  drop constraint family_members_consent_by_fkey,
  add constraint family_members_consent_by_fkey
    foreign key (consent_by) references public.profiles (id) on delete set null,
  drop constraint family_members_approved_by_fkey,
  add constraint family_members_approved_by_fkey
    foreign key (approved_by) references public.profiles (id) on delete set null;

alter table public.child_credentials
  alter column set_by drop not null,
  drop constraint child_credentials_set_by_fkey,
  add constraint child_credentials_set_by_fkey
    foreign key (set_by) references public.profiles (id) on delete set null;

comment on column public.child_credentials.set_by is 'Parent who last set the PIN; null once that parent''s profile is deleted.';
