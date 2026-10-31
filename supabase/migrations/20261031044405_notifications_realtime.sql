-- Live inbox: stream notification inserts and read-state updates to the recipient's browser.
-- Realtime checks each change against the existing select policy, so a subscriber only
-- receives their own notices while an approved member. No new grants or policies.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  else
    raise warning 'supabase_realtime publication not found: notifications not streamed';
  end if;
end;
$$;
