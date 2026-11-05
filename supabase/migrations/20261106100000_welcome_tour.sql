-- The child's welcome tour (2026-11-06, demo 3 feedback): the buddy they picked (one of the four
-- coach kids, who also coaches their lessons) and when they finished or skipped the tour, so it
-- shows once per child on any device. Child-owned, unlike child_settings (parent-controlled):
-- written only by save_welcome_tour, which touches the signed-in child's own row.

create table public.child_tours (
  child_id uuid primary key references public.profiles (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  buddy text check (buddy in ('pip', 'bo', 'zuzu', 'nell')),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.child_tours is 'Per-child welcome tour: the picked buddy and when the tour was finished or skipped. A missing row means not started. Written only by save_welcome_tour.';
comment on column public.child_tours.buddy is 'The coach kid the child picked (pip, bo, zuzu, nell); also their lesson coach. Null before they pick.';
comment on column public.child_tours.finished_at is 'When the child finished or skipped the tour; null means it shows on their next visit.';

create index child_tours_family_id_idx on public.child_tours (family_id);

create trigger child_tours_set_updated_at
  before update on public.child_tours
  for each row execute function public.set_updated_at();

alter table public.child_tours enable row level security;

revoke all on public.child_tours from anon;
revoke insert, update, delete, truncate on public.child_tours from authenticated;

create policy "Tours are viewable by the child and their parents"
  on public.child_tours for select
  to authenticated
  using ((select public.is_self(child_id)) or (select public.is_parent_of(child_id)));

-- No insert, update or delete policies: rows change only through save_welcome_tour below.

create or replace function public.save_welcome_tour(p_buddy text, p_finished boolean)
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
  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.profile_id = v_uid
    and fm.role = 'child'
    and fm.status = 'approved';
  if v_family_id is null then
    raise exception using errcode = 'JA403', message = 'Not allowed';
  end if;

  if p_buddy is not null and p_buddy not in ('pip', 'bo', 'zuzu', 'nell') then
    raise exception using errcode = '22023', message = 'Unknown buddy';
  end if;

  insert into public.child_tours (child_id, family_id, buddy, finished_at)
  values (v_uid, v_family_id, p_buddy, case when p_finished then now() end)
  on conflict (child_id) do update
    set buddy = coalesce(excluded.buddy, public.child_tours.buddy),
        finished_at = case
          when p_finished then now()
          else public.child_tours.finished_at
        end;
end;
$$;

comment on function public.save_welcome_tour(text, boolean) is 'The signed-in child saves their buddy (null leaves it) and, when p_finished, that they finished or skipped the welcome tour.';

revoke execute on function public.save_welcome_tour(text, boolean) from public, anon;
grant execute on function public.save_welcome_tour(text, boolean) to authenticated;
