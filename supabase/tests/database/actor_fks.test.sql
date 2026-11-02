begin;
\ir _helpers.psql
select plan(6);

-- confdeltype: 'n' = set null, 'r' = restrict, 'a' = no action.
select is(
  (select confdeltype::text from pg_constraint where conname = 'family_members_consent_by_fkey'),
  'n', 'family_members.consent_by is on delete set null');
select is(
  (select confdeltype::text from pg_constraint where conname = 'family_members_approved_by_fkey'),
  'n', 'family_members.approved_by is on delete set null');
select is(
  (select confdeltype::text from pg_constraint where conname = 'child_credentials_set_by_fkey'),
  'n', 'child_credentials.set_by is on delete set null');
select col_is_null('public', 'child_credentials', 'set_by', 'child_credentials.set_by may be null');

-- Kept on purpose: deleting a family's creator or a referenced ledger entry stays blocked.
select isnt(
  (select confdeltype::text from pg_constraint
   where conrelid = 'public.families'::regclass and contype = 'f'
     and conkey = array[(select attnum from pg_attribute
                         where attrelid = 'public.families'::regclass and attname = 'created_by')]),
  'n', 'families.created_by does not null itself out');
select isnt(
  (select confdeltype::text from pg_constraint
   where conrelid = 'public.ledger_entries'::regclass and contype = 'f'
     and conkey = array[(select attnum from pg_attribute
                         where attrelid = 'public.ledger_entries'::regclass and attname = 'reverses_entry_id')]),
  'n', 'ledger_entries.reverses_entry_id does not null itself out');

select * from finish();
rollback;
