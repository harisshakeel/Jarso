-- What a child calls a parent ("Mum", "Dad"). Parent-set, shown to the family; null = the app says 'your parent'.

alter table public.profiles
  add column child_facing_name text
    check (
      child_facing_name is null
      or (char_length(child_facing_name) between 1 and 20 and child_facing_name = btrim(child_facing_name))
    );

comment on column public.profiles.child_facing_name is 'What a child calls this parent, e.g. Mum. Parent-set; 1-20 chars, trimmed.';

-- Parents already update only their own row (policy "Parents can update their own profile");
-- children have no update path. Add the column to the column-level grant.
grant update (child_facing_name) on public.profiles to authenticated;
