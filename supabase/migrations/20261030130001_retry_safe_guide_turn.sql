-- Retry safety for the guide: a lost reply makes the sheet send the question again. The
-- child's message keeps the sheet's client message id; a repeat is refused (23505), and
-- guide_find_turn lets the server answer a re-sent question with the stored reply.
-- No new tables, so RLS is unchanged; the new signatures repeat their grants.

-- ---------------------------------------------------------------------------
-- guide_messages.client_message_id
-- ---------------------------------------------------------------------------

alter table public.guide_messages
  add column client_message_id uuid,
  -- Kept on the child's message only; the reply is found beside it.
  add constraint guide_messages_client_message_id_child_only
    check (role = 'child' or client_message_id is null);

comment on column public.guide_messages.client_message_id is 'Child messages only: the id the guide sheet gave the question. A re-sent question with the same id gets the stored reply.';

create unique index guide_messages_child_client_message_id_key
  on public.guide_messages (child_id, client_message_id)
  where client_message_id is not null;

drop function public.guide_record_turn(uuid, uuid, text, text, text, text, boolean, text, jsonb, integer);

create function public.guide_record_turn(
  p_conversation_id uuid,
  p_child_id uuid,
  p_child_text text,
  p_reply_role text,
  p_reply_text text,
  p_route text,
  p_flagged boolean,
  p_model text,
  p_usage jsonb,
  p_latency_ms integer,
  -- Default null keeps the old 10-argument call working while a deploy or rollback runs.
  p_client_message_id uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_conversation public.guide_conversations;
  v_reply_id uuid;
  v_usage jsonb := coalesce(p_usage, '{}'::jsonb);
  v_at timestamptz;
  v_child_text text;
begin
  if p_reply_role is null or p_reply_role not in ('guide', 'fixed_copy')
     or p_route is null
     or p_child_text is null or char_length(p_child_text) > 2000
     or p_reply_text is null or char_length(p_reply_text) > 2000
     or jsonb_typeof(v_usage) <> 'object' then
    raise exception using errcode = '22023', message = 'Invalid turn';
  end if;

  -- Membership first (as in remove_child), then the chat row.
  perform 1
  from public.family_members fm
  where fm.profile_id = p_child_id and fm.role = 'child' and fm.status = 'approved'
  for share;
  if not found then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  select * into v_conversation from public.guide_conversations c where c.id = p_conversation_id for update;
  if not found or v_conversation.child_id is distinct from p_child_id then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;
  if v_conversation.turns >= 12 then
    raise exception using errcode = 'JA409', message = 'This chat is full';
  end if;

  -- A message that got a safety or personal-details response is never kept.
  v_child_text := case when p_route in ('safety', 'personal_info') then '' else p_child_text end;
  -- After the lock, so turns that waited on it still sort in commit order.
  v_at := pg_catalog.clock_timestamp();

  -- A repeated client message id fails here (23505) and nothing of the turn is kept.
  insert into public.guide_messages (conversation_id, child_id, role, text, client_message_id, created_at)
  values (p_conversation_id, p_child_id, 'child', v_child_text, p_client_message_id, v_at);

  insert into public.guide_messages (
    conversation_id, child_id, role, text, route, flagged, model,
    main_input_tokens, main_output_tokens, main_cache_read_tokens, main_cache_write_tokens,
    screen_input_tokens, screen_output_tokens, latency_ms, created_at
  ) values (
    p_conversation_id, p_child_id, p_reply_role, p_reply_text, p_route, coalesce(p_flagged, false),
    nullif(p_model, ''),
    least(greatest(coalesce((v_usage ->> 'main_input')::numeric, 0), 0), 2147483647)::integer,
    least(greatest(coalesce((v_usage ->> 'main_output')::numeric, 0), 0), 2147483647)::integer,
    least(greatest(coalesce((v_usage ->> 'main_cache_read')::numeric, 0), 0), 2147483647)::integer,
    least(greatest(coalesce((v_usage ->> 'main_cache_write')::numeric, 0), 0), 2147483647)::integer,
    least(greatest(coalesce((v_usage ->> 'screen_input')::numeric, 0), 0), 2147483647)::integer,
    least(greatest(coalesce((v_usage ->> 'screen_output')::numeric, 0), 0), 2147483647)::integer,
    greatest(coalesce(p_latency_ms, 0), 0),
    v_at
  )
  returning id into v_reply_id;

  update public.guide_conversations
    set turns = turns + 1,
        flagged = flagged or coalesce(p_flagged, false),
        last_message_at = v_at
    where id = p_conversation_id;

  return v_reply_id;
end;
$$;

comment on function public.guide_record_turn(uuid, uuid, text, text, text, text, boolean, text, jsonb, integer, uuid) is
  'Server only. Stores the child''s (scrubbed; blank after a safety or personal-details response) message with its client message id (null for older callers: no retry lookup) and the reply in one transaction and counts the turn. JA403, JA409 (12 turns), 22023, 23505 (client message id already recorded for this child).';

-- The reply shares the child message's created_at (one clock read per turn).
create function public.guide_find_turn(p_child_id uuid, p_client_message_id uuid)
returns table (conversation_id uuid, reply_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select c.conversation_id, r.id
  from public.guide_messages c
  join public.guide_messages r
    on r.conversation_id = c.conversation_id
   and r.created_at = c.created_at
   and r.role <> 'child'
  where c.child_id = p_child_id
    and c.client_message_id = p_client_message_id
    and c.role = 'child';
$$;

comment on function public.guide_find_turn(uuid, uuid) is 'Server only. The chat and reply recorded for a child''s client message id, or no row.';

revoke execute on function public.guide_record_turn(uuid, uuid, text, text, text, text, boolean, text, jsonb, integer, uuid) from public, anon, authenticated;
revoke execute on function public.guide_find_turn(uuid, uuid) from public, anon, authenticated;
grant execute on function public.guide_record_turn(uuid, uuid, text, text, text, text, boolean, text, jsonb, integer, uuid) to service_role;
grant execute on function public.guide_find_turn(uuid, uuid) to service_role;
