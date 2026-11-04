-- Per-phone notification settings (mobile wave 3, from the user: "they should control their own
-- device"). Each phone mutes groups of notices (requests, money, learning, notes) or pauses all
-- of them; the dispatcher skips a phone for what it muted. The inbox is unchanged, and web push
-- is unchanged. The groups are mapped from notice kinds in @jarso/core (noticeGroup).
--
-- A token that moves to another account is deleted and re-inserted by
-- register_device_push_token, so the new owner starts from the defaults; unregistering deletes
-- the settings with the row.

alter table public.device_push_tokens
  add column muted_groups text[] not null default '{}'
    check (muted_groups <@ array['requests', 'money', 'learning', 'notes']::text[]),
  add column paused boolean not null default false;

comment on column public.device_push_tokens.muted_groups is 'Notice groups this phone is not pushed (requests, money, learning, notes). Written only by set_device_push_prefs.';
comment on column public.device_push_tokens.paused is 'True: this phone is pushed nothing. Written only by set_device_push_prefs.';

create or replace function public.set_device_push_prefs(
  p_token text,
  p_muted_groups text[],
  p_paused boolean
)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  with changed as (
    update public.device_push_tokens t
      set muted_groups = coalesce(p_muted_groups, '{}'),
          paused = coalesce(p_paused, false)
      where t.token = p_token and t.profile_id = auth.uid()
      returning t.id
  )
  select exists (select 1 from changed);
$$;

comment on function public.set_device_push_prefs(text, text[], boolean) is 'Sets which notice groups the caller''s phone (by token) is not pushed, and whether all pushes to it are paused. Only the caller''s own row; false when there is none. Unknown groups fail the table check (23514).';

revoke execute on function public.set_device_push_prefs(text, text[], boolean) from public, anon;
grant execute on function public.set_device_push_prefs(text, text[], boolean) to authenticated;

-- The dispatcher's read gains the settings; the return type changes, so drop and recreate.
drop function public.device_push_tokens_for(uuid[]);

create function public.device_push_tokens_for(p_recipient_ids uuid[])
returns table (id uuid, profile_id uuid, token text, muted_groups text[], paused boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.profile_id, t.token, t.muted_groups, t.paused
  from public.device_push_tokens t
  where t.profile_id = any (p_recipient_ids);
$$;

comment on function public.device_push_tokens_for(uuid[]) is 'Server only. The Expo push tokens of these recipients with each phone''s muted groups and pause, for the dispatcher.';

revoke execute on function public.device_push_tokens_for(uuid[]) from public, anon, authenticated;
grant execute on function public.device_push_tokens_for(uuid[]) to service_role;
