-- FR02: one personal savings goal per child. Written only by the child, through the functions
-- below; parents can read it. Progress is computed, never stored (counted = Save − reserved).

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  child_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40 and name = pg_catalog.btrim(name)),
  emoji text not null check (octet_length(emoji) between 1 and 16),
  target_minor bigint not null check (target_minor between 1 and 1000000),
  plan_minor bigint check (plan_minor >= 0),
  status text not null default 'active' check (status in ('active', 'archived')),
  reached_at timestamptz,
  celebrated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goals_celebrated_after_reached check (celebrated_at is null or reached_at is not null)
);

comment on table public.goals is 'A child''s savings goal (FR02). At most one active per child. Written only by save_goal / archive_goal / mark_goal_celebrated / goal_progress.';
comment on column public.goals.plan_minor is 'How much the child plans to save from each allowance. An estimate only; it never changes the handover.';
comment on column public.goals.reached_at is 'First time counted Save covered the target. Stays set if the balance later drops.';

create unique index goals_one_active on public.goals (child_id) where status = 'active';
create index goals_family_id_idx on public.goals (family_id);

create trigger goals_set_updated_at
  before update on public.goals
  for each row execute function public.set_updated_at();

alter table public.goals enable row level security;

revoke all on public.goals from anon;
revoke insert, update, delete, truncate on public.goals from authenticated;

create policy "Goals are viewable by the child and their parents"
  on public.goals for select
  to authenticated
  using ((select public.is_self(child_id)) or (select public.is_parent_of(child_id)));

create policy "Goals are not inserted directly"
  on public.goals for insert
  to authenticated
  with check (false);

create policy "Goals are not updated directly"
  on public.goals for update
  to authenticated
  using (false)
  with check (false);

create policy "Goals are not deleted directly"
  on public.goals for delete
  to authenticated
  using (false);

-- ---------------------------------------------------------------------------
-- Internal: the caller's family as an approved child, or JA403.
-- ---------------------------------------------------------------------------

create or replace function public.goal_child_family()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_family_id uuid;
begin
  select m.family_id into v_family_id
  from public.family_members m
  where m.profile_id = auth.uid()
    and m.role = 'child'
    and m.status = 'approved';
  if v_family_id is null then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;
  return v_family_id;
end;
$$;

comment on function public.goal_child_family() is 'Internal, no grants. The calling child''s family, or JA403.';

-- ---------------------------------------------------------------------------
-- save_goal / archive_goal / mark_goal_celebrated
-- ---------------------------------------------------------------------------

create or replace function public.save_goal(
  p_name text,
  p_emoji text,
  p_target_minor bigint,
  p_plan_minor bigint
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_family_id uuid := public.goal_child_family();
  v_child_id uuid := auth.uid();
  v_name text := pg_catalog.btrim(coalesce(p_name, ''));
  v_allowance bigint;
  v_id uuid;
begin
  if char_length(v_name) not between 1 and 40
     or p_emoji is null or octet_length(p_emoji) not between 1 and 16
     or p_target_minor is null or p_target_minor not between 1 and 1000000
     or (p_plan_minor is not null and p_plan_minor < 0) then
    raise exception using errcode = '22023', message = 'Invalid goal';
  end if;

  -- A schedule that is not stopped still has an amount the plan comes out of.
  select pg_catalog.max(s.amount_minor) into v_allowance
  from public.allowance_schedules s
  where s.child_id = v_child_id and s.status <> 'stopped';

  if p_plan_minor is not null then
    if v_allowance is not null and p_plan_minor > v_allowance then
      raise exception using errcode = '22023', message = 'plan_over_allowance';
    end if;
    if v_allowance is null and p_plan_minor > p_target_minor then
      raise exception using errcode = '22023', message = 'plan_over_target';
    end if;
  end if;

  update public.goals g
  set name = v_name, emoji = p_emoji, target_minor = p_target_minor, plan_minor = p_plan_minor
  where g.child_id = v_child_id and g.status = 'active'
  returning g.id into v_id;

  if v_id is null then
    insert into public.goals (family_id, child_id, name, emoji, target_minor, plan_minor)
    values (v_family_id, v_child_id, v_name, p_emoji, p_target_minor, p_plan_minor)
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

comment on function public.save_goal(text, text, bigint, bigint) is 'Child only. Creates or updates the caller''s active goal and returns its id. Name trimmed, 1..40; target 1..1000000; plan ≥ 0 and ≤ the allowance when the child has a schedule (22023 plan_over_allowance), else ≤ the target (22023 plan_over_target). JA403.';

create or replace function public.archive_goal(p_goal_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.goal_child_family();
  update public.goals g
  set status = 'archived'
  where g.id = p_goal_id and g.child_id = auth.uid() and g.status = 'active';
end;
$$;

comment on function public.archive_goal(uuid) is 'Child only. Archives the caller''s active goal; a no-op for any other id. JA403.';

create or replace function public.mark_goal_celebrated(p_goal_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.goal_child_family();
  update public.goals g
  set celebrated_at = now()
  where g.id = p_goal_id
    and g.child_id = auth.uid()
    and g.reached_at is not null
    and g.celebrated_at is null;
end;
$$;

comment on function public.mark_goal_celebrated(uuid) is 'Child only. Records that the goal-reached moment was shown, once, and only after reached_at is set. JA403.';

-- ---------------------------------------------------------------------------
-- goal_progress
-- ---------------------------------------------------------------------------

create or replace function public.goal_progress(p_child_id uuid)
returns table (goal_id uuid, counted_minor bigint, reached boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_goal public.goals;
  v_counted bigint;
begin
  if not (public.is_self(p_child_id) or public.is_parent_of(p_child_id)) then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  select * into v_goal from public.goals g where g.child_id = p_child_id and g.status = 'active';
  if v_goal.id is null then
    return;
  end if;

  v_counted := greatest(
    public.balance(p_child_id, 'save') - public.reserved_save(p_child_id), 0);

  if v_counted >= v_goal.target_minor and v_goal.reached_at is null then
    update public.goals g set reached_at = now() where g.id = v_goal.id and g.reached_at is null;
  end if;

  goal_id := v_goal.id;
  counted_minor := v_counted;
  reached := v_counted >= v_goal.target_minor;
  return next;
end;
$$;

comment on function public.goal_progress(uuid) is 'The child''s active goal with counted Save (Save − reserved, never below 0) and whether it covers the target; records reached_at the first time. No row without an active goal. Child or their parent. JA403.';

revoke execute on function public.goal_child_family() from public, anon, authenticated;
revoke execute on function public.save_goal(text, text, bigint, bigint) from public, anon;
revoke execute on function public.archive_goal(uuid) from public, anon;
revoke execute on function public.mark_goal_celebrated(uuid) from public, anon;
revoke execute on function public.goal_progress(uuid) from public, anon;
grant execute on function public.save_goal(text, text, bigint, bigint) to authenticated;
grant execute on function public.archive_goal(uuid) to authenticated;
grant execute on function public.mark_goal_celebrated(uuid) to authenticated;
grant execute on function public.goal_progress(uuid) to authenticated;
