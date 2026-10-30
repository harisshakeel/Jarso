-- Notifications: in-app notices for parents and children.
-- Written only by the internal notify_* functions, called from other security definer functions in the same transaction.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  child_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in (
    'limit_exceeded', 'withdrawal_requested', 'withdrawal_decided',
    'deposit_requested', 'deposit_decided'
  )),
  source_type text not null check (source_type in ('ledger_entry', 'request')),
  source_id uuid not null,
  window_key text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

comment on table public.notifications is 'In-app notice for one recipient. Written only by notify_parents / notify_child; read by the recipient while they are an approved member of the family.';
comment on column public.notifications.window_key is 'Dedupe key (for example a limit window). Null means never deduplicated.';
comment on column public.notifications.source_id is 'Originating ledger entry or request; polymorphic, no FK.';

create unique index notifications_dedupe_key
  on public.notifications (recipient_id, kind, child_id, window_key)
  where window_key is not null;
create index notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);
create index notifications_family_id_idx on public.notifications (family_id);
create index notifications_child_id_idx on public.notifications (child_id);

alter table public.notifications enable row level security;

revoke all on public.notifications from anon;
revoke insert, update, delete, truncate on public.notifications from authenticated;

create policy "Notifications are viewable by their recipient while an approved member"
  on public.notifications for select
  to authenticated
  using (recipient_id = (select auth.uid()) and public.is_approved_member(family_id));

-- ---------------------------------------------------------------------------
-- Internal writers (no grants)
-- ---------------------------------------------------------------------------

create or replace function public.notify_parents(
  p_child_id uuid,
  p_kind text,
  p_source_type text,
  p_source_id uuid,
  p_window_key text,
  p_payload jsonb
)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_inserted int;
begin
  insert into public.notifications (family_id, recipient_id, child_id, kind, source_type, source_id, window_key, payload)
  select p.family_id, p.profile_id, p_child_id, p_kind, p_source_type, p_source_id, p_window_key,
         coalesce(p_payload, '{}'::jsonb)
  from public.family_members c
  join public.family_members p on p.family_id = c.family_id
  where c.profile_id = p_child_id
    and c.role = 'child'
    and c.status = 'approved'
    and p.role = 'parent'
    and p.status = 'approved'
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

comment on function public.notify_parents(uuid, text, text, uuid, text, jsonb) is
  'Internal, no grants. One notification per approved parent of the child''s family; a repeat of the same window_key is a no-op. Returns the number of rows inserted.';

create or replace function public.notify_child(
  p_child_id uuid,
  p_kind text,
  p_source_type text,
  p_source_id uuid,
  p_window_key text,
  p_payload jsonb
)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_inserted int;
begin
  insert into public.notifications (family_id, recipient_id, child_id, kind, source_type, source_id, window_key, payload)
  select c.family_id, c.profile_id, c.profile_id, p_kind, p_source_type, p_source_id, p_window_key,
         coalesce(p_payload, '{}'::jsonb)
  from public.family_members c
  where c.profile_id = p_child_id
    and c.role = 'child'
    and c.status = 'approved'
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

comment on function public.notify_child(uuid, text, text, uuid, text, jsonb) is
  'Internal, no grants. One notification to the approved child; a repeat of the same window_key is a no-op. Returns the number of rows inserted.';

revoke execute on function public.notify_parents(uuid, text, text, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.notify_child(uuid, text, text, uuid, text, jsonb) from public, anon, authenticated;
