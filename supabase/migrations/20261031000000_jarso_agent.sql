-- Jarso, the agent (ADR 0011). Jarso answers a child's questions about their own money and
-- learning by looking them up with read-only tools, so that data now reaches Anthropic too. The
-- parent's switch therefore records which consent it was turned on under: version 2 covers the
-- child's messages plus the child's own money and learning data. An older consent counts as off
-- (the app and guide_start_conversation both check) until a parent turns Jarso on again.
--
-- Each reply also keeps which look-ups it made (tool names and arguments, never results), so a
-- parent reading a chat can see what Jarso read. After 30 days the retention job keeps only the
-- names: an argument can come from the child's words (a price). No new tables, so RLS is
-- unchanged; the new guide_record_turn signature repeats its grants.

-- ---------------------------------------------------------------------------
-- guide_access.consent_version
-- ---------------------------------------------------------------------------

alter table public.guide_access
  add column consent_version smallint not null default 1,
  add constraint guide_access_consent_version_check check (consent_version between 1 and 100);

comment on column public.guide_access.consent_version is 'Which consent the parent gave when turning Jarso on. 1: the child''s messages go to Anthropic (ADR 0010). 2: so does the child''s own money and learning data Jarso looks up (ADR 0011). Jarso runs only under the current version.';

-- ---------------------------------------------------------------------------
-- guide_messages.tool_calls
-- ---------------------------------------------------------------------------

alter table public.guide_messages
  add column tool_calls jsonb,
  -- Replies only: an array of at most 6 look-ups, each {name, input}.
  add constraint guide_messages_tool_calls_check check (
    tool_calls is null
    or (role <> 'child' and jsonb_typeof(tool_calls) = 'array' and jsonb_array_length(tool_calls) <= 6)
  );

comment on column public.guide_messages.tool_calls is 'Replies only: what Jarso looked up for this reply, in order, as [{name, input}]. Never the results.';

-- ---------------------------------------------------------------------------
-- Parent switch: records consent version 2
-- ---------------------------------------------------------------------------
-- Same as 20261030120000 plus the version. Turning Jarso on again over an older consent is a
-- real change (the new consent is recorded and audited), even though `enabled` stays true.

create or replace function public.set_guide_access(p_child_id uuid, p_enabled boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_family_id uuid;
  v_changed integer;
  v_version constant smallint := 2;
begin
  if v_uid is null then
    raise exception using errcode = 'JA401', message = 'Not signed in';
  end if;
  if p_enabled is null then
    raise exception using errcode = '22023', message = 'Choose on or off';
  end if;

  -- Locked like remove_child locks it, so a removal can't slip in between.
  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.profile_id = p_child_id and fm.role = 'child' and fm.status = 'approved'
  for share;
  if v_family_id is null or not public.is_parent_of(p_child_id) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  insert into public.guide_access as ga (child_id, family_id, enabled, consent_version, changed_by, changed_at)
  values (p_child_id, v_family_id, p_enabled, case when p_enabled then v_version else 1 end, v_uid, now())
  on conflict (child_id) do update
    set enabled = excluded.enabled,
        -- Turning off keeps the last consent on record; turning on records the current one.
        consent_version = case when excluded.enabled then excluded.consent_version else ga.consent_version end,
        changed_by = excluded.changed_by,
        changed_at = excluded.changed_at
    where ga.enabled is distinct from excluded.enabled
       or (excluded.enabled and ga.consent_version < excluded.consent_version);
  get diagnostics v_changed = row_count;

  -- Audit real changes only, so a double tap doesn't record consent twice.
  if v_changed > 0 then
    insert into public.audit_log (family_id, actor_id, action, subject_id, details)
    values (
      v_family_id, v_uid, 'guide.access_changed', p_child_id,
      jsonb_build_object('enabled', p_enabled, 'consent_version', case when p_enabled then v_version end)
    );
  end if;
end;
$$;

comment on function public.set_guide_access(uuid, boolean) is 'Approved parent turns Jarso on (recording consent version 2) or off for their child; audited when it changes. JA401, JA403, 22023.';

-- ---------------------------------------------------------------------------
-- A chat opens only under the current consent
-- ---------------------------------------------------------------------------

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
  if not exists (
    select 1 from public.guide_access ga
    where ga.child_id = p_child_id and ga.enabled and ga.consent_version >= 2
  ) then
    raise exception using errcode = 'JA403', message = 'Jarso is off for this child';
  end if;

  insert into public.guide_conversations (family_id, child_id, entry, context_key)
  values (v_family_id, p_child_id, p_entry, p_context_key)
  returning id into v_id;
  return v_id;
end;
$$;

comment on function public.guide_start_conversation(uuid, text, text) is 'Server only. Opens a chat for an approved child whose parent turned Jarso on under the current consent (version 2). JA403.';

-- ---------------------------------------------------------------------------
-- guide_record_turn: also keeps the reply's look-ups
-- ---------------------------------------------------------------------------
-- Same as 20261030130001 plus p_tool_calls on the reply row.

drop function public.guide_record_turn(uuid, uuid, text, text, text, text, boolean, text, jsonb, integer, uuid);

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
  p_client_message_id uuid default null,
  -- Default null keeps the 11-argument call working while a deploy or rollback runs.
  p_tool_calls jsonb default null
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
  v_tool_calls jsonb := case when p_tool_calls = '[]'::jsonb then null else p_tool_calls end;
begin
  if p_reply_role is null or p_reply_role not in ('guide', 'fixed_copy')
     or p_route is null
     or p_child_text is null or char_length(p_child_text) > 2000
     or p_reply_text is null or char_length(p_reply_text) > 2000
     or jsonb_typeof(v_usage) <> 'object'
     or (v_tool_calls is not null and (
       jsonb_typeof(v_tool_calls) <> 'array'
       or jsonb_array_length(v_tool_calls) > 6
       or exists (
         select 1 from jsonb_array_elements(v_tool_calls) as call
         where jsonb_typeof(call) <> 'object'
            or coalesce(call ->> 'name', '') !~ '^[a-z_]{1,40}$'
            or jsonb_typeof(call -> 'name') <> 'string'
            or pg_catalog.length(call::text) > 300
       )
     )) then
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
    screen_input_tokens, screen_output_tokens, latency_ms, tool_calls, created_at
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
    v_tool_calls,
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

comment on function public.guide_record_turn(uuid, uuid, text, text, text, text, boolean, text, jsonb, integer, uuid, jsonb) is
  'Server only. Stores the child''s (scrubbed; blank after a safety or personal-details response) message with its client message id and the reply with its look-ups ([{name, input}], at most 6) in one transaction and counts the turn. JA403, JA409 (12 turns), 22023, 23505 (client message id already recorded for this child).';

revoke execute on function public.guide_record_turn(uuid, uuid, text, text, text, text, boolean, text, jsonb, integer, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.guide_record_turn(uuid, uuid, text, text, text, text, boolean, text, jsonb, integer, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Retention: after 30 days a reply keeps only the names of its look-ups
-- ---------------------------------------------------------------------------
-- Same as 20261030120000 plus the tool_calls strip. Arguments can echo the child's words (the
-- price given to plan_saving), so they go with the text; the names stay with the metadata.

create or replace function public.blank_old_guide_text()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run_id uuid;
  v_count integer;
begin
  insert into public.job_runs (job) values ('blank-old-guide-text') returning id into v_run_id;
  update public.guide_messages m
    set text = '',
        text_blanked_at = now(),
        tool_calls = (
          select jsonb_agg(jsonb_build_object('name', call -> 'name'))
          from jsonb_array_elements(m.tool_calls) as call
        )
    where m.created_at < now() - interval '30 days' and m.text_blanked_at is null;
  get diagnostics v_count = row_count;
  update public.job_runs
    set finished_at = pg_catalog.clock_timestamp(), status = 'ok', details = jsonb_build_object('blanked', v_count)
    where id = v_run_id;
  return v_count;
end;
$$;

comment on function public.blank_old_guide_text() is 'Cron only. Blanks guide message text older than 30 days, keeps only the names of a reply''s look-ups, and records a job_runs row.';
