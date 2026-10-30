-- Device action time for queued child actions. A purchase, a practice answer or a mission
-- completion made offline is sent later from the device's outbox with the time the child did it.
-- record_purchase, record_practice_result and complete_mission take an optional p_occurred_at;
-- resolve_occurred_at checks it against the server clock. Online callers send nothing (now()).
-- No new tables, so RLS is unchanged; the new signatures repeat their grants.

-- ---------------------------------------------------------------------------
-- resolve_occurred_at: the device time, checked against the server clock
-- ---------------------------------------------------------------------------

create function public.resolve_occurred_at(p timestamptz)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if p is null then
    return pg_catalog.now();
  end if;
  -- A clock far ahead or a week behind is wrong, not late: refuse rather than guess.
  if p > pg_catalog.now() + interval '60 seconds' or p < pg_catalog.now() - interval '7 days' then
    raise exception using errcode = '22023', message = 'Check the time on this device';
  end if;
  -- A little ahead is clock drift: never store a time in the future.
  return least(p, pg_catalog.now());
end;
$$;

comment on function public.resolve_occurred_at(timestamptz) is
  'Internal, no grants. When a child action happened: null is now(); up to 60 seconds ahead is now(); within the last 7 days is kept as sent. Further ahead or older raises 22023.';

revoke execute on function public.resolve_occurred_at(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- record_purchase(…, p_occurred_at)
-- ---------------------------------------------------------------------------
-- record_purchase_at (the clock seam) stamps occurred_at with p_now, so the diary day, the
-- spending-limit window and the 24-hour undo window follow the action time. The Spend check
-- still reads the current balance.

drop function public.record_purchase(uuid, bigint, text, text);

create function public.record_purchase(
  p_child_id uuid,
  p_amount_minor bigint,
  p_label text,
  p_idempotency_key text,
  p_occurred_at timestamptz default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_entry_id uuid;
begin
  -- A replay always wins, even when its device time has since gone out of range: refusing it
  -- could make the child enter the purchase again and debit Spend twice. Same gate and reply
  -- as the replay inside record_purchase_at; a new key goes through the time check and the lock.
  if public.is_self(p_child_id) and exists (
    select 1 from public.family_members fm
    where fm.profile_id = p_child_id and fm.role = 'child' and fm.status = 'approved'
  ) then
    select le.id into v_entry_id
    from public.ledger_entries le
    where le.idempotency_key = 'purchase:' || p_child_id::text || ':' || p_idempotency_key;
    if found then
      return pg_catalog.jsonb_build_object('status', 'recorded', 'entry_id', v_entry_id, 'notices', 0);
    end if;
  end if;

  return public.record_purchase_at(
    p_child_id, p_amount_minor, p_label, p_idempotency_key, public.resolve_occurred_at(p_occurred_at)
  );
end;
$$;

comment on function public.record_purchase(uuid, bigint, text, text, timestamptz) is
  'Child records a purchase from Spend (key purchase:<child>:<key>) at p_occurred_at (device time via resolve_occurred_at; null is now). Returns {status: recorded, entry_id, notices} or {status: not_enough_spend, free_minor}; a repeated key returns the original entry, checked before the device time. Overspend off refuses amount > balance(spend) - held_spend; on refuses only going below held_spend. Then evaluates spending limits. JA403 (not the child), 22023 (amount outside 1..100000000000, label over 60, blank key or key over 200, device time over 60 s ahead or over 7 days old).';

revoke execute on function public.record_purchase(uuid, bigint, text, text, timestamptz) from public, anon;
grant execute on function public.record_purchase(uuid, bigint, text, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- complete_mission(p_attempt_id, p_occurred_at)
-- ---------------------------------------------------------------------------
-- Same as 20261030100000 except completed_at and the review day use the resolved time.

drop function public.complete_mission(uuid);

create function public.complete_mission(p_attempt_id uuid, p_occurred_at timestamptz default null)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_family_id uuid := public.learning_child_family();
  v_at timestamptz := public.resolve_occurred_at(p_occurred_at);
  v_attempt public.mission_attempts;
  v_today date;
begin
  select * into v_attempt from public.mission_attempts a where a.id = p_attempt_id for update;
  if not found or v_attempt.child_id <> v_uid then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;
  if v_attempt.status = 'completed' then
    return false;
  end if;
  if v_attempt.status = 'abandoned' then
    raise exception using errcode = 'JA409', message = 'This mission was restarted';
  end if;
  if not exists (select 1 from public.step_results r where r.attempt_id = p_attempt_id) then
    raise exception using errcode = '22023', message = 'Answer the mission first';
  end if;

  -- A device clock behind the server never finishes an attempt before it started.
  v_at := greatest(v_at, v_attempt.started_at);
  update public.mission_attempts set status = 'completed', completed_at = v_at where id = p_attempt_id;

  -- Every skill the mission touched gets a review the day after (box 1), unless it has one already.
  v_today := public.family_today(v_family_id, v_at);
  insert into public.review_items (child_id, skill_key, box, due_on)
  select distinct v_uid, r.skill_key, 1, v_today + 1
  from public.step_results r
  where r.attempt_id = p_attempt_id
  on conflict (child_id, skill_key) do nothing;

  return true;
end;
$$;

comment on function public.complete_mission(uuid, timestamptz) is
  'Approved child finishes their open attempt at p_occurred_at (device time via resolve_occurred_at, never before the start; null is now); schedules a first review the family day after for each skill it touched that has none. False when already completed. JA403, JA409 (restarted), 22023 (nothing answered, device time out of range).';

revoke execute on function public.complete_mission(uuid, timestamptz) from public, anon;
grant execute on function public.complete_mission(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- record_practice_result(…, p_occurred_at)
-- ---------------------------------------------------------------------------
-- Same as 20261030100000 except the family day (uniqueness, daily cap, review ladder) and
-- answered_at use the resolved time.

drop function public.record_practice_result(text, text, boolean, integer, integer);

create function public.record_practice_result(
  p_item_key text,
  p_skill_key text,
  p_correct boolean,
  p_hints_used integer,
  p_tries integer,
  p_occurred_at timestamptz default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_family_id uuid := public.learning_child_family();
  v_at timestamptz := public.resolve_occurred_at(p_occurred_at);
  v_today date := public.family_today(v_family_id, v_at);
  v_item public.review_items;
  v_box smallint;
begin
  if p_item_key is null or p_item_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_item_key) > 40
     or p_skill_key is null or p_skill_key !~ '^[a-z_]+\.[a-z_]+$' or char_length(p_skill_key) > 40
     or p_correct is null
     or p_hints_used is null or p_hints_used not between 0 and 2
     or p_tries is null or p_tries not between 1 and 2 then
    raise exception using errcode = '22023', message = 'Invalid practice result';
  end if;

  -- Serialises this child's practice writes, so the daily cap and the duplicate check hold.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('learning:' || v_uid::text, 0));

  if exists (
    select 1 from public.practice_results r
    where r.child_id = v_uid and r.item_key = p_item_key and r.answered_on = v_today
  ) then
    return false;
  end if;
  if (select count(*) from public.practice_results r
      where r.child_id = v_uid and r.answered_on = v_today) >= 60 then
    raise exception using errcode = 'JA429', message = 'Too much practice for one day';
  end if;

  insert into public.practice_results (child_id, item_key, skill_key, answered_on, correct, hints_used, tries, answered_at)
  values (v_uid, p_item_key, p_skill_key, v_today, p_correct, p_hints_used, p_tries, v_at);

  select * into v_item
  from public.review_items ri
  where ri.child_id = v_uid and ri.skill_key = p_skill_key
  for update;

  -- Only a review that is due moves its box; extra practice is recorded but changes nothing.
  if found and v_item.due_on <= v_today then
    if p_correct and p_hints_used = 0 and p_tries = 1 then
      v_box := case v_item.box when 1 then 3 when 3 then 7 else 14 end;
      update public.review_items
        set box = v_box, due_on = v_today + v_box, last_result = 'correct', last_reviewed_on = v_today
        where child_id = v_uid and skill_key = p_skill_key;
      insert into public.skill_progress as sp (child_id, skill_key, level, reviews_passed)
      values (v_uid, p_skill_key, 3, 1)
      on conflict (child_id, skill_key) do update
        set level = 3, reviews_passed = sp.reviews_passed + 1, updated_at = now();
    elsif p_correct then
      update public.review_items
        set due_on = v_today + v_item.box, last_result = 'correct_with_help', last_reviewed_on = v_today
        where child_id = v_uid and skill_key = p_skill_key;
    else
      update public.review_items
        set box = 1, due_on = v_today + 1, last_result = 'wrong', last_reviewed_on = v_today
        where child_id = v_uid and skill_key = p_skill_key;
    end if;
  end if;

  return true;
end;
$$;

comment on function public.record_practice_result(text, text, boolean, integer, integer, timestamptz) is
  'Approved child records a practice answer made at p_occurred_at (device time via resolve_occurred_at; null is now), counted on that family day; a due review moves up a box (right first try, no hints), stays (right with help) or drops to box 1 (wrong). One result per item per family day (false on repeat), at most 60 a day. JA403, JA429, 22023 (also device time out of range).';

revoke execute on function public.record_practice_result(text, text, boolean, integer, integer, timestamptz) from public, anon;
grant execute on function public.record_practice_result(text, text, boolean, integer, integer, timestamptz) to authenticated;
