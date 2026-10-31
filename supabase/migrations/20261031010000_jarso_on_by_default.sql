-- Jarso on by default (product owner, 2026-10-31; ADR 0011 amended). A child with no switch row
-- has Jarso on; only a parent's explicit "off" turns it off. A switch turned on under the older
-- consent (version 1) counts as on too. The parent is told on the add-child form, and can turn
-- Jarso off any time on the child's page. No new tables, so RLS is unchanged.

comment on table public.guide_access is 'Per-child Jarso switch. No row means on (the default since 2026-10-31); a row with enabled = false means a parent turned it off. Changes are audited.';
comment on column public.guide_access.consent_version is 'Which explanation the parent had when they last turned Jarso on. 1: the child''s messages go to Anthropic (ADR 0010). 2: so does the child''s own money and learning data Jarso looks up (ADR 0011).';

-- Same as 20261031000000 except the check: refused only when a parent turned Jarso off.
create or replace function public.guide_start_conversation(p_child_id uuid, p_entry text, p_context_key text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_family_id uuid;
  v_id uuid;
begin
  -- Membership first, like remove_child, so the two can't deadlock and no chat outlives a removal.
  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.profile_id = p_child_id and fm.role = 'child' and fm.status = 'approved'
  for share;
  if v_family_id is null then
    raise exception using errcode = 'JA403', message = 'Not an approved child';
  end if;
  if exists (select 1 from public.guide_access ga where ga.child_id = p_child_id and not ga.enabled) then
    raise exception using errcode = 'JA403', message = 'Jarso is off for this child';
  end if;

  insert into public.guide_conversations (family_id, child_id, entry, context_key)
  values (v_family_id, p_child_id, p_entry, p_context_key)
  returning id into v_id;
  return v_id;
end;
$$;

comment on function public.guide_start_conversation(uuid, text, text) is 'Server only. Opens a chat for an approved child unless a parent turned Jarso off (on by default). JA403.';
