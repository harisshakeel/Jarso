begin;
\ir _helpers.psql
select plan(19);

-- Child quiet hours (mobile wave 3): a child's notices are not claimed for push while it is
-- 21:00-07:00 in the family's timezone; the first sweep at or after 07:00 claims them, marked
-- overnight so the dispatcher can send two or more as one summary. Parents are never held.

-- The window itself, in a +05:30 zone
select is(public.is_child_quiet_hour('2026-11-03 16:30+00', 'Asia/Kolkata'), true, '22:00 IST is quiet');
select is(public.is_child_quiet_hour('2026-11-03 15:29+00', 'Asia/Kolkata'), false, '20:59 IST is not quiet');
select is(public.is_child_quiet_hour('2026-11-03 15:30+00', 'Asia/Kolkata'), true, '21:00 IST is quiet');
select is(public.is_child_quiet_hour('2026-11-03 01:29+00', 'Asia/Kolkata'), true, '06:59 IST is quiet');
select is(public.is_child_quiet_hour('2026-11-03 01:30+00', 'Asia/Kolkata'), false, '07:00 IST is not quiet');

-- DST: London springs forward at 01:00 UTC on 2026-03-29, so 05:59 UTC is 06:59 BST
select is(public.is_child_quiet_hour('2026-03-29 05:59+00', 'Europe/London'), true,
  '06:59 BST on the spring-forward day is quiet');
select is(public.is_child_quiet_hour('2026-03-29 06:00+00', 'Europe/London'), false,
  '07:00 BST on the spring-forward day is not quiet');

-- A family in India with a parent and a child
select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('c1@example.com', 'child') as c1 \gset
select tests.authenticate_as(:'pa'::uuid);
select public.create_family('INR', 'Asia/Kolkata') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select tests.clear_auth();

-- t22: the most recent 22:00 IST at or before now()
select case when t > now() then t - interval '1 day' else t end as t22
from (
  select ((date_trunc('day', now() at time zone 'Asia/Kolkata') + interval '22 hours')
          at time zone 'Asia/Kolkata') as t
) x \gset

select gen_random_uuid() as src \gset
insert into public.notifications (family_id, recipient_id, child_id, kind, source_type, source_id, created_at)
values
  (:'fa'::uuid, :'c1'::uuid, :'c1'::uuid, 'withdrawal_decided', 'request', :'src'::uuid, :'t22'::timestamptz),
  (:'fa'::uuid, :'pa'::uuid, :'c1'::uuid, 'withdrawal_requested', 'request', :'src'::uuid, :'t22'::timestamptz);

set local role service_role;
select results_eq(
  format($$ select recipient_id, overnight
            from public.claim_unpushed_notifications(10, %L::timestamptz + interval '30 minutes') $$, :'t22'),
  format($$ values (%L::uuid, false) $$, :'pa'),
  'a parent at 22:00 is claimed'
);
reset role;
select ok(
  (select pushed_at is null from public.notifications where recipient_id = :'c1'::uuid),
  'a child notice at 22:00 is not claimed at 22:30'
);

set local role service_role;
select is(
  (select count(*)::int
   from public.claim_unpushed_notifications(10, :'t22'::timestamptz + interval '8 hours 59 minutes')),
  0,
  'nothing is claimed for the child at 06:59'
);
select results_eq(
  format($$ select recipient_id, overnight
            from public.claim_unpushed_notifications(10, %L::timestamptz + interval '9 hours') $$, :'t22'),
  format($$ values (%L::uuid, true) $$, :'c1'),
  'a child notice at 22:00 is claimed at 07:00'
);
reset role;
select ok(
  (select pushed_at is not null from public.notifications where recipient_id = :'c1'::uuid),
  'the held notice is now marked pushed'
);
select ok(
  (select read_at is null from public.notifications where recipient_id = :'c1'::uuid),
  'the held notice stays unread in the inbox'
);

-- A daytime child notice is pushed at once and is not overnight (15:00 IST the same day)
insert into public.notifications (family_id, recipient_id, child_id, kind, source_type, source_id, created_at)
values (:'fa'::uuid, :'c1'::uuid, :'c1'::uuid, 'deposit_decided', 'request', :'src'::uuid,
        :'t22'::timestamptz - interval '7 hours');
set local role service_role;
select results_eq(
  format($$ select recipient_id, overnight
            from public.claim_unpushed_notifications(10, %L::timestamptz - interval '6 hours 55 minutes') $$, :'t22'),
  format($$ values (%L::uuid, false) $$, :'c1'),
  'a child notice at 15:00 is claimed at 15:05 and is not overnight'
);
reset role;

-- Grants after the drop and recreate
select hasnt_function('public', 'claim_unpushed_notifications', array['integer'],
  'the one-argument claim is gone');
select ok(not has_function_privilege('authenticated', 'public.claim_unpushed_notifications(integer, timestamptz)', 'execute'),
  'a signed-in user cannot claim notices');
select ok(not has_function_privilege('anon', 'public.claim_unpushed_notifications(integer, timestamptz)', 'execute'),
  'anon cannot claim notices');
select ok(has_function_privilege('service_role', 'public.claim_unpushed_notifications(integer, timestamptz)', 'execute'),
  'the server can claim notices');
select ok(not has_function_privilege('authenticated', 'public.is_child_quiet_hour(timestamptz, text)', 'execute'),
  'is_child_quiet_hour is not callable by signed-in users');

select * from finish();
rollback;
