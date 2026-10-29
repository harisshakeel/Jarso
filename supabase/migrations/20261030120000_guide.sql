-- AI money guide (FR07, FR09). Design: docs/superpowers/specs/2026-10-29-learning-and-guide-design.md §5
-- and ADR 0010. The guide is off for every child until a parent turns it on (guide_access), and
-- the app's FEATURE_GUIDE flag gates it as a whole.
--
-- Transcripts are written only by the app server after its own checks, through functions granted
-- to service_role: a child can't forge what the guide said, and a parent can trust what they read.
-- The child and the child's approved parents read through RLS. Message text is blanked after 30
-- days by a daily job; the metadata (route, flag, token counts) stays for cost and safety counts.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.guide_access (
  child_id uuid primary key references public.profiles (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  enabled boolean not null default false,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);

comment on table public.guide_access is 'Per-child parent switch for the AI guide; off when no row exists. Turning it on records the consenting parent and time (COPPA consent for sending the child''s messages to Anthropic).';

create index guide_access_family_id_idx on public.guide_access (family_id);
create index guide_access_changed_by_idx on public.guide_access (changed_by);

create table public.guide_conversations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  child_id uuid not null references public.profiles (id) on delete cascade,
  entry text not null check (entry in ('step', 'why', 'topic', 'home')),
  context_key text not null check (char_length(context_key) between 1 and 120),
  turns smallint not null default 0 check (turns between 0 and 12),
  flagged boolean not null default false,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

comment on table public.guide_conversations is 'One guide chat, opened from a step, an answer ("Why?"), a topic page or Home. At most 12 child turns.';
comment on column public.guide_conversations.context_key is 'What the chat is about, as content keys (e.g. mission/step), never free text.';

create index guide_conversations_child_idx on public.guide_conversations (child_id, last_message_at desc);
create index guide_conversations_family_id_idx on public.guide_conversations (family_id);

create table public.guide_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.guide_conversations (id) on delete cascade,
  child_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('child', 'guide', 'fixed_copy')),
  text text not null check (char_length(text) <= 2000),
  route text check (route in ('on_topic', 'off_topic', 'personal_info', 'safety', 'unsafe', 'jailbreak', 'blocked_output', 'unavailable')),
  flagged boolean not null default false,
  model text check (char_length(model) <= 60),
  main_input_tokens integer not null default 0 check (main_input_tokens >= 0),
  main_output_tokens integer not null default 0 check (main_output_tokens >= 0),
  main_cache_read_tokens integer not null default 0 check (main_cache_read_tokens >= 0),
  main_cache_write_tokens integer not null default 0 check (main_cache_write_tokens >= 0),
  screen_input_tokens integer not null default 0 check (screen_input_tokens >= 0),
  screen_output_tokens integer not null default 0 check (screen_output_tokens >= 0),
  latency_ms integer check (latency_ms >= 0),
  rating smallint check (rating in (-1, 1)),
  text_blanked_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.guide_messages is 'Guide transcript. Child text is scrubbed of contact details before it is stored or sent. Text is blanked after 30 days; metadata stays.';
comment on column public.guide_messages.route is 'Set on replies: how the pipeline routed the child''s message.';
comment on column public.guide_messages.rating is 'The child''s thumbs up (1) or down (-1) on a guide reply.';

create index guide_messages_conversation_idx on public.guide_messages (conversation_id, created_at);
create index guide_messages_child_id_idx on public.guide_messages (child_id);
create index guide_messages_created_at_idx on public.guide_messages (created_at);

-- ---------------------------------------------------------------------------
-- RLS: the child and the child's parents read; writes only through functions
-- ---------------------------------------------------------------------------

alter table public.guide_access enable row level security;
alter table public.guide_conversations enable row level security;
alter table public.guide_messages enable row level security;

-- authenticated keeps SELECT only (RLS does not cover TRUNCATE, REFERENCES, TRIGGER, MAINTAIN).
revoke all on public.guide_access, public.guide_conversations, public.guide_messages from anon, authenticated;
grant select on public.guide_access, public.guide_conversations, public.guide_messages to authenticated;

create policy "Guide access is viewable by the child and their parents"
  on public.guide_access for select to authenticated
  using (public.is_self(child_id) or public.is_parent_of(child_id));

create policy "Guide chats are viewable by the child and their parents"
  on public.guide_conversations for select to authenticated
  using (public.is_self(child_id) or public.is_parent_of(child_id));

create policy "Guide messages are viewable by the child and their parents"
  on public.guide_messages for select to authenticated
  using (public.is_self(child_id) or public.is_parent_of(child_id));

-- ---------------------------------------------------------------------------
-- Parent switch
-- ---------------------------------------------------------------------------

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
begin
  if v_uid is null then
    raise exception using errcode = 'JA401', message = 'Not signed in';
  end if;
  if p_child_id is null or not public.is_parent_of(p_child_id) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;
  if p_enabled is null then
    raise exception using errcode = '22023', message = 'Choose on or off';
  end if;

  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.profile_id = p_child_id and fm.role = 'child' and fm.status = 'approved';

  insert into public.guide_access as ga (child_id, family_id, enabled, changed_by, changed_at)
  values (p_child_id, v_family_id, p_enabled, v_uid, now())
  on conflict (child_id) do update
    set enabled = excluded.enabled, changed_by = excluded.changed_by, changed_at = excluded.changed_at
    where ga.enabled is distinct from excluded.enabled;

  insert into public.audit_log (family_id, actor_id, action, subject_id, details)
  values (v_family_id, v_uid, 'guide.access_changed', p_child_id, jsonb_build_object('enabled', p_enabled));
end;
$$;

comment on function public.set_guide_access(uuid, boolean) is 'Approved parent turns the AI guide on or off for their child; audited. JA401, JA403, 22023.';

-- ---------------------------------------------------------------------------
-- Server writes (service_role only, after the app's own checks)
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
  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.profile_id = p_child_id and fm.role = 'child' and fm.status = 'approved';
  if v_family_id is null then
    raise exception using errcode = 'JA403', message = 'Not an approved child';
  end if;
  if not exists (select 1 from public.guide_access ga where ga.child_id = p_child_id and ga.enabled) then
    raise exception using errcode = 'JA403', message = 'The guide is off for this child';
  end if;

  insert into public.guide_conversations (family_id, child_id, entry, context_key)
  values (v_family_id, p_child_id, p_entry, p_context_key)
  returning id into v_id;
  return v_id;
end;
$$;

comment on function public.guide_start_conversation(uuid, text, text) is 'Server only. Opens a chat for an approved child whose guide is on. JA403.';

create or replace function public.guide_record_turn(
  p_conversation_id uuid,
  p_child_id uuid,
  p_child_text text,
  p_reply_role text,
  p_reply_text text,
  p_route text,
  p_flagged boolean,
  p_model text,
  p_usage jsonb,
  p_latency_ms integer
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
begin
  select * into v_conversation from public.guide_conversations c where c.id = p_conversation_id for update;
  if not found or v_conversation.child_id <> p_child_id then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;
  if v_conversation.turns >= 12 then
    raise exception using errcode = 'JA409', message = 'This chat is full';
  end if;
  if p_reply_role not in ('guide', 'fixed_copy') then
    raise exception using errcode = '22023', message = 'Unknown reply role';
  end if;

  insert into public.guide_messages (conversation_id, child_id, role, text)
  values (p_conversation_id, p_child_id, 'child', p_child_text);

  insert into public.guide_messages (
    conversation_id, child_id, role, text, route, flagged, model,
    main_input_tokens, main_output_tokens, main_cache_read_tokens, main_cache_write_tokens,
    screen_input_tokens, screen_output_tokens, latency_ms
  ) values (
    p_conversation_id, p_child_id, p_reply_role, p_reply_text, p_route, coalesce(p_flagged, false), p_model,
    coalesce((v_usage ->> 'main_input')::integer, 0),
    coalesce((v_usage ->> 'main_output')::integer, 0),
    coalesce((v_usage ->> 'main_cache_read')::integer, 0),
    coalesce((v_usage ->> 'main_cache_write')::integer, 0),
    coalesce((v_usage ->> 'screen_input')::integer, 0),
    coalesce((v_usage ->> 'screen_output')::integer, 0),
    p_latency_ms
  )
  returning id into v_reply_id;

  update public.guide_conversations
    set turns = turns + 1,
        flagged = flagged or coalesce(p_flagged, false),
        last_message_at = now()
    where id = p_conversation_id;

  return v_reply_id;
end;
$$;

comment on function public.guide_record_turn(uuid, uuid, text, text, text, text, boolean, text, jsonb, integer) is
  'Server only. Stores the child''s (scrubbed) message and the reply in one transaction and counts the turn. JA403, JA409 (12 turns), 22023.';

-- Token totals since an instant, per kind, for the daily budget breaker.
create or replace function public.guide_usage_since(p_since timestamptz)
returns table (
  model text,
  main_input bigint,
  main_output bigint,
  main_cache_read bigint,
  main_cache_write bigint,
  screen_input bigint,
  screen_output bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.model,
         sum(m.main_input_tokens)::bigint,
         sum(m.main_output_tokens)::bigint,
         sum(m.main_cache_read_tokens)::bigint,
         sum(m.main_cache_write_tokens)::bigint,
         sum(m.screen_input_tokens)::bigint,
         sum(m.screen_output_tokens)::bigint
  from public.guide_messages m
  where m.created_at >= p_since and m.role <> 'child'
  group by m.model;
$$;

comment on function public.guide_usage_since(timestamptz) is 'Server only. Token totals per model since an instant, for the guide''s daily budget.';

-- ---------------------------------------------------------------------------
-- Child write: thumbs up or down on a guide reply
-- ---------------------------------------------------------------------------

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
    where id = p_message_id and child_id = v_uid and role = 'guide';
  if not found then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;
end;
$$;

comment on function public.rate_guide_message(uuid, smallint) is 'The child rates one of the guide''s replies to them. JA401, JA403, 22023.';

-- ---------------------------------------------------------------------------
-- Retention: blank message text after 30 days (published on /safety)
-- ---------------------------------------------------------------------------

create or replace function public.blank_old_guide_text()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.guide_messages
    set text = '', text_blanked_at = now()
    where created_at < now() - interval '30 days' and text_blanked_at is null;
  get diagnostics v_count = row_count;
  insert into public.job_runs (job, status, details)
  values ('blank-old-guide-text', 'ok', jsonb_build_object('blanked', v_count));
  return v_count;
end;
$$;

comment on function public.blank_old_guide_text() is 'Cron only. Blanks guide message text older than 30 days and records a job_runs row.';

-- ---------------------------------------------------------------------------
-- Grants: Supabase grants new functions to anon/authenticated/service_role by default
-- ---------------------------------------------------------------------------

revoke execute on function public.set_guide_access(uuid, boolean) from public, anon, service_role;
grant execute on function public.set_guide_access(uuid, boolean) to authenticated;

revoke execute on function public.rate_guide_message(uuid, smallint) from public, anon, service_role;
grant execute on function public.rate_guide_message(uuid, smallint) to authenticated;

revoke execute on function public.guide_start_conversation(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.guide_record_turn(uuid, uuid, text, text, text, text, boolean, text, jsonb, integer) from public, anon, authenticated;
revoke execute on function public.guide_usage_since(timestamptz) from public, anon, authenticated;
grant execute on function public.guide_start_conversation(uuid, text, text) to service_role;
grant execute on function public.guide_record_turn(uuid, uuid, text, text, text, text, boolean, text, jsonb, integer) to service_role;
grant execute on function public.guide_usage_since(timestamptz) to service_role;

revoke execute on function public.blank_old_guide_text() from public, anon, authenticated, service_role;

-- Daily at 03:17 UTC. Same pattern as generate-due-occurrences: skip with a warning where
-- pg_cron is unavailable.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'blank-old-guide-text',
      '17 3 * * *',
      $cmd$set local statement_timeout = '60s'; select public.blank_old_guide_text()$cmd$
    );
  else
    raise warning 'pg_cron not available: blank-old-guide-text not scheduled';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- remove_child: also delete guide chats and the switch (ADR 0007, data minimisation)
-- ---------------------------------------------------------------------------
-- Same as 20261030100000 plus the guide deletes. When the identity is deleted the rows cascade
-- anyway; when it is kept (money history) nobody can read them any more, so they go.

create or replace function public.remove_child(p_child_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_parent_family uuid;
  v_family_id uuid;
  v_status text;
  v_nickname text;
begin
  if v_uid is null then
    raise exception using errcode = 'JA401', message = 'Not signed in';
  end if;

  select fm.family_id
  into v_parent_family
  from public.family_members fm
  where fm.profile_id = v_uid
    and fm.role = 'parent'
    and fm.status = 'approved';

  -- Lock the child's row first, then decide on what it says now (not on an earlier read).
  select fm.family_id, fm.status, pr.nickname
  into v_family_id, v_status, v_nickname
  from public.family_members fm
  join public.profiles pr on pr.id = fm.profile_id
  where fm.profile_id = p_child_id
    and fm.role = 'child'
  for update of fm;

  if not found or v_parent_family is null or v_family_id <> v_parent_family then
    raise exception using errcode = 'JA403', message = 'Only the child''s parent can remove them';
  end if;

  if v_status = 'approved' then
    update public.family_members
    set status = 'removed',
        nickname_key = null,
        removed_at = now(),
        removed_by = v_uid
    where profile_id = p_child_id;

    update public.profiles set nickname = null where id = p_child_id;

    insert into public.audit_log (family_id, actor_id, action, subject_id, details)
    values (v_family_id, v_uid, 'child.removed', p_child_id, jsonb_build_object('nickname', v_nickname));
  elsif v_status <> 'removed' then
    raise exception using errcode = 'JA403', message = 'Only the child''s parent can remove them';
  end if;

  -- Idempotent from here: a parent whose first attempt failed after this commit (session
  -- revoke or identity delete) can run it again until the removal completes.
  delete from public.child_credentials c where c.profile_id = p_child_id;
  delete from public.child_pin_attempts a where a.child_id = p_child_id;
  delete from public.mission_attempts m where m.child_id = p_child_id; -- step_results cascade
  delete from public.skill_progress s where s.child_id = p_child_id;
  delete from public.review_items r where r.child_id = p_child_id;
  delete from public.practice_results r where r.child_id = p_child_id;
  delete from public.learning_checkins c where c.child_id = p_child_id;
  delete from public.guide_conversations g where g.child_id = p_child_id; -- messages cascade
  delete from public.guide_access g where g.child_id = p_child_id;

  -- The auth identity may be deleted only while the child has no money history (ADR 0007).
  -- Otherwise it is kept, disabled, and the ledger rows survive (ledger_entries.child_id is
  -- on delete restrict, so a delete would fail anyway).
  return not exists (select 1 from public.ledger_entries le where le.child_id = p_child_id);
end;
$$;

comment on function public.remove_child(uuid) is
  'Parent removes a child: membership removed, nickname freed, credentials, learning progress and guide chats deleted, audited; idempotent for an already-removed child of the same family. Returns true when the auth identity may be deleted (no ledger rows for the child), false when it must be kept. JA401/JA403.';
