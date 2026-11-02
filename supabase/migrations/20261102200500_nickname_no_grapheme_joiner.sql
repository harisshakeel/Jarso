-- Nicknames: no combining grapheme joiner (U+034F).
--
-- U+034F sits inside the combining diacritics block that 20261102100100 allows, but it is
-- invisible and joins nothing a name needs, so 'Sam' and 'Sa<U+034F>m' would look the same.
-- The block is now split around it. The Zod schema (family/schemas.ts) lists exactly these
-- ranges instead of \p{M}, so the app and the database accept the same nicknames.
-- create or replace keeps the grants (none for users) and the three callers.

create or replace function public.is_valid_nickname(p_nickname text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_nickname ~ ('^[[:alpha:][:digit:] _.'''
    || U&'\0300-\034E\0350-\036F\0483-\0489\0591-\05C7\0610-\061A\064B-\065F\0670\06D6-\06ED'
    || U&'\0900-\0DFF\0E00-\0EFF\0F00-\0FFF\1000-\109F\1780-\17FF'
    || U&'\1AB0-\1AFF\1DC0-\1DFF\3099-\309A\FE20-\FE2F'
    || '-]+$')
$$;

comment on function public.is_valid_nickname(text) is 'Nickname charset: letters and digits of any script, their combining marks (named ranges, without the invisible U+034F combining grapheme joiner), space and _ . '' -. Length is checked by the callers. Mirrored by the nickname rule in src/features/family/schemas.ts.';
