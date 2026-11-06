-- The child's intro on the phone (mobile kid rework, plan 8): finishing it marks the welcome tour
-- done (the child_tours row the web tour reads, so a child is welcomed once on any device) and
-- pays the welcome reward once for life: 50 Sparks (spark kind 'welcome', key 'welcome') and the
-- jar_starter badge. Values mirror ONBOARDING_REWARD in @jarso/core/onboarding.
--
-- Sparks are never money: nothing here touches ledger_entries. The intro is not a habit, so the
-- day is not marked active for the streak. Lock order follows docs/database.md: the tour row
-- first, then progress_lock on child_progress last.

alter table public.spark_events drop constraint spark_events_kind_check;
alter table public.spark_events add constraint spark_events_kind_check
  check (kind in ('log', 'checkin', 'step', 'save', 'goal_milestone', 'goal_reached', 'welcome'));

comment on table public.spark_events is 'Sparks awarded to a child. source_key (unique per child) makes every award happen once for life. amount 0 marks a silenced award (a goal milestone already passed, or a goal reached inside the 7-day cap). Kind welcome (key welcome) is the one-off intro reward from complete_child_onboarding.';

comment on table public.child_badges is 'Badges a child has earned (keys from @jarso/core/progress). Granted once by progress_check_badges, and jar_starter by complete_child_onboarding; never taken away.';

create or replace function public.complete_child_onboarding()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_family_id uuid;
  v_row public.child_progress;
  v_day date;
  v_paid int := 0;
  v_badge int := 0;
begin
  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.profile_id = v_uid
    and fm.role = 'child'
    and fm.status = 'approved';
  if v_family_id is null then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  -- The tour is done (as save_welcome_tour(null, true)): the buddy, if any, is kept.
  insert into public.child_tours (child_id, family_id, finished_at)
  values (v_uid, v_family_id, now())
  on conflict (child_id) do update
    set finished_at = now();

  v_row := public.progress_lock(v_uid);
  if v_row.child_id is null then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;
  v_day := public.family_today(v_row.family_id);

  -- Once for life: the (child_id, source_key) unique key makes a replay pay nothing.
  insert into public.spark_events (child_id, family_id, kind, amount, source_key, day)
  values (v_uid, v_row.family_id, 'welcome', 50, 'welcome', v_day)
  on conflict (child_id, source_key) do nothing;
  get diagnostics v_paid = row_count;

  if v_paid > 0 then
    update public.child_progress cp
    set sparks = cp.sparks + 50,
        level = greatest(cp.level, public.progress_level(cp.sparks + 50))
    where cp.child_id = v_uid;
  end if;

  insert into public.child_badges (child_id, family_id, badge_key)
  values (v_uid, v_row.family_id, 'jar_starter')
  on conflict (child_id, badge_key) do nothing;
  get diagnostics v_badge = row_count;

  -- 50 Sparks can lift a level; any badge that follows from it is granted as usual.
  perform public.progress_check_badges(v_uid, v_day);

  return pg_catalog.jsonb_build_object(
    'sparks', case when v_paid > 0 then 50 else 0 end,
    'badge', case when v_badge > 0 then 'jar_starter' end
  );
end;
$$;

comment on function public.complete_child_onboarding() is 'The signed-in child finished (or replayed) the phone intro: marks child_tours finished and, once for life, pays 50 Sparks (kind welcome, key welcome) and the jar_starter badge. Returns {sparks, badge}: what this call paid (0 and null on a replay). JA403 for anyone but an approved child. Never writes the ledger.';

revoke execute on function public.complete_child_onboarding() from public, anon;
grant execute on function public.complete_child_onboarding() to authenticated;
