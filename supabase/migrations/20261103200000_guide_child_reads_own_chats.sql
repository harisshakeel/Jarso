-- A chat a parent had about a child (`asked_by` set) belongs to the child's data but is not the
-- child's to read: the phone and web list only the child's own chats, and the database now says
-- the same. Only the SELECT policies change; parents keep reading everything about their child.

drop policy "Guide chats are viewable by the child and their parents" on public.guide_conversations;
create policy "Guide chats are viewable by the child and their parents"
  on public.guide_conversations for select to authenticated
  using ((public.is_self(child_id) and asked_by is null) or public.is_parent_of(child_id));

drop policy "Guide messages are viewable by the child and their parents" on public.guide_messages;
create policy "Guide messages are viewable by the child and their parents"
  on public.guide_messages for select to authenticated
  using (
    public.is_parent_of(child_id)
    or (
      public.is_self(child_id)
      and exists (
        select 1 from public.guide_conversations c
        where c.id = guide_messages.conversation_id and c.asked_by is null
      )
    )
  );

-- The child's rating write must not reach a reply in a chat a parent had about them either.
-- Same function as in 20261030120000_guide.sql (signature, security definer, search_path,
-- grants unchanged) with one more condition on the update.
create or replace function public.rate_guide_message(p_message_id uuid, p_rating smallint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception using errcode = 'JA401', message = 'Not signed in';
  end if;
  if p_rating is null or p_rating not in (-1, 1) then
    raise exception using errcode = '22023', message = 'Unknown rating';
  end if;
  update public.guide_messages
    set rating = p_rating
    where id = p_message_id and child_id = v_uid and role = 'guide'
      and exists (
        select 1 from public.guide_conversations c
        where c.id = public.guide_messages.conversation_id and c.asked_by is null
      );
  if not found then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;
end;
$$;

