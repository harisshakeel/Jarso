-- Jarso's memory (ADR 0011, roadmap slice 8): short typed facts about a child that Jarso keeps
-- between chats, so it can say "like the bike you're saving for" without being told again.
--
-- Facts are structured, not free text about the child: a kind, at most 140 characters, 90 days.
-- At most 20 per child (the oldest goes). Written only by the server (service_role) after the
-- scrub and a personal-details check, and only on a turn the input screen passed. Read by the
-- child and their parents, who can each delete any fact. Never a balance or a goal figure: those
-- are always looked up fresh.

create table public.guide_memories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  child_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('interest', 'thinking_about', 'finds_tricky', 'prefers')),
  text text not null check (char_length(btrim(text)) between 1 and 140),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days'
);

comment on table public.guide_memories is 'Jarso''s memory: short typed facts a child told it (an interest, something they are thinking about, something they find tricky, a preference). At most 20 per child, 90 days. Written only by the server; the child and their parents can delete any.';

create index guide_memories_child_idx on public.guide_memories (child_id, created_at desc);
create index guide_memories_family_id_idx on public.guide_memories (family_id);
create index guide_memories_expires_idx on public.guide_memories (expires_at);

alter table public.guide_memories enable row level security;
revoke all on public.guide_memories from anon, authenticated;
grant select, delete on public.guide_memories to authenticated;

create policy "Memories are viewable by the child and their parents"
  on public.guide_memories for select to authenticated
  using (public.is_self(child_id) or public.is_parent_of(child_id));

create policy "The child and their parents can forget a memory"
  on public.guide_memories for delete to authenticated
  using (public.is_self(child_id) or public.is_parent_of(child_id));

-- ---------------------------------------------------------------------------
-- Server write: one fact, keeping the newest 20
-- ---------------------------------------------------------------------------

create or replace function public.guide_remember(p_child_id uuid, p_kind text, p_text text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_family_id uuid;
  v_text text := pg_catalog.btrim(p_text);
  v_id uuid;
begin
  if p_kind is null or p_kind not in ('interest', 'thinking_about', 'finds_tricky', 'prefers')
     or v_text is null or pg_catalog.char_length(v_text) not between 1 and 140 then
    raise exception using errcode = '22023', message = 'Invalid memory';
  end if;

  -- Membership first (as in remove_child), and Jarso must be on for this child.
  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.profile_id = p_child_id and fm.role = 'child' and fm.status = 'approved'
  for share;
  if v_family_id is null then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;
  if exists (select 1 from public.guide_access ga where ga.child_id = p_child_id and not ga.enabled) then
    raise exception using errcode = 'JA403', message = 'Jarso is off for this child';
  end if;

  -- One writer per child at a time, so a repeated fact refreshes instead of doubling and the
  -- trim to 20 sees every committed row.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('memory:' || p_child_id::text, 0));

  -- The same fact again just refreshes its date. clock_timestamp, so facts kept in one
  -- transaction still order newest first (now() is fixed for the whole transaction).
  update public.guide_memories
    set created_at = pg_catalog.clock_timestamp(),
        expires_at = pg_catalog.clock_timestamp() + interval '90 days'
    where child_id = p_child_id and kind = p_kind and lower(text) = lower(v_text)
    returning id into v_id;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.guide_memories (family_id, child_id, kind, text, created_at, expires_at)
  values (v_family_id, p_child_id, p_kind, v_text, pg_catalog.clock_timestamp(),
          pg_catalog.clock_timestamp() + interval '90 days')
  returning id into v_id;

  -- Keep the newest 20.
  delete from public.guide_memories m
  where m.child_id = p_child_id
    and m.id in (
      select id from public.guide_memories
      where child_id = p_child_id
      order by created_at desc
      offset 20
    );

  return v_id;
end;
$$;

comment on function public.guide_remember(uuid, text, text) is 'Server only. Keeps one short fact about a child for Jarso (refreshing a repeat), and trims to the newest 20. JA403 (not an approved child, or Jarso off), 22023 (bad kind or text).';

revoke execute on function public.guide_remember(uuid, text, text) from public, anon, authenticated;
grant execute on function public.guide_remember(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Expiry: folded into the daily guide retention job
-- ---------------------------------------------------------------------------
-- Same as 20261031000000 plus the memory sweep.

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
  v_forgot integer;
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
  delete from public.guide_memories where expires_at < now();
  get diagnostics v_forgot = row_count;
  update public.job_runs
    set finished_at = pg_catalog.clock_timestamp(), status = 'ok',
        details = jsonb_build_object('blanked', v_count, 'forgotten', v_forgot)
    where id = v_run_id;
  return v_count;
end;
$$;

comment on function public.blank_old_guide_text() is 'Cron only. Blanks guide message text older than 30 days, keeps only the names of a reply''s look-ups, forgets expired memories, and records a job_runs row.';

-- ---------------------------------------------------------------------------
-- remove_child: memories go with the chats (ADR 0007)
-- ---------------------------------------------------------------------------
-- Same as 20261030120000 plus the memories delete.

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

  delete from public.child_credentials c where c.profile_id = p_child_id;
  delete from public.child_pin_attempts a where a.child_id = p_child_id;
  delete from public.mission_attempts m where m.child_id = p_child_id;
  delete from public.skill_progress s where s.child_id = p_child_id;
  delete from public.review_items r where r.child_id = p_child_id;
  delete from public.practice_results r where r.child_id = p_child_id;
  delete from public.learning_checkins c where c.child_id = p_child_id;
  delete from public.guide_conversations g where g.child_id = p_child_id;
  delete from public.guide_memories g where g.child_id = p_child_id;
  delete from public.guide_access g where g.child_id = p_child_id;

  return not exists (select 1 from public.ledger_entries le where le.child_id = p_child_id);
end;
$$;

comment on function public.remove_child(uuid) is
  'Parent removes a child: membership removed, nickname freed, credentials, learning progress, guide chats and memories deleted, audited; idempotent for an already-removed child of the same family. Returns true when the auth identity may be deleted (no ledger rows for the child), false when it must be kept. JA401/JA403.';
