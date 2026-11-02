-- Jarso for parents (FR07 follow-up): a parent can ask Jarso about one of their children from
-- their own Home. The chat still belongs to the child (its data is the child's, RLS unchanged),
-- and `asked_by` says which approved parent asked. Null keeps meaning the child asked.

alter table public.guide_conversations
  add column asked_by uuid references public.profiles (id) on delete cascade;

comment on column public.guide_conversations.asked_by is
  'The approved parent who asked, for a chat a parent had about this child; null when the child asked. Parent chats stay out of the child''s chat list and flagged counts.';

-- A parent chat opens from the parent's Home.
alter table public.guide_conversations drop constraint guide_conversations_entry_check;
alter table public.guide_conversations
  add constraint guide_conversations_entry_check
  check (entry in ('step', 'why', 'topic', 'home', 'parent'));

-- The parent's list and flagged badge read only the child's own chats.
create index guide_conversations_child_own_idx
  on public.guide_conversations (child_id, flagged desc, last_message_at desc)
  where asked_by is null;

drop function if exists public.guide_start_conversation(uuid, text, text);

create or replace function public.guide_start_conversation(
  p_child_id uuid,
  p_entry text,
  p_context_key text,
  p_asked_by uuid default null
)
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
  -- A parent may ask only about a child of their own family.
  if p_asked_by is not null and not exists (
    select 1 from public.family_members fm
    where fm.profile_id = p_asked_by and fm.family_id = v_family_id
      and fm.role = 'parent' and fm.status = 'approved'
  ) then
    raise exception using errcode = 'JA403', message = 'Not a parent of this child';
  end if;
  if (p_entry = 'parent') <> (p_asked_by is not null) then
    raise exception using errcode = '22023', message = 'A parent chat needs its parent';
  end if;

  insert into public.guide_conversations (family_id, child_id, entry, context_key, asked_by)
  values (v_family_id, p_child_id, p_entry, p_context_key, p_asked_by)
  returning id into v_id;
  return v_id;
end;
$$;

comment on function public.guide_start_conversation(uuid, text, text, uuid) is
  'Server only. Opens a chat for an approved child unless a parent turned Jarso off (on by default); with p_asked_by, a chat an approved parent of the child is having about them (entry parent). JA403, 22023.';

revoke all on function public.guide_start_conversation(uuid, text, text, uuid) from public, anon, authenticated;
