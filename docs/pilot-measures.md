# Pilot measures

The evaluation measures from `REQUIREMENTS.md` ("Pilot evaluation"), as SQL to paste into the Supabase SQL editor (it runs as the service role, past RLS). There is no in-app page: a handful of families does not need one, and these queries read personal data only in aggregate.

Every query starts with the same `pilot` line. Edit the date there to the day the pilot opened; nothing before it counts. The period and the success thresholds are open decisions in `REQUIREMENTS.md`; until they are agreed, the numbers are read, not judged.

Run them from the dashboard only. Never paste their output, which can include family ids, into chat, a commit or a log.

## 1. Families completing the first parent–child flow

A family counts once a parent has confirmed a handover to an approved child.

```sql
with pilot as (select date '2026-11-01' as start)
select
  count(distinct f.id) as families,
  count(distinct f.id) filter (where fm.profile_id is not null) as with_a_child,
  count(distinct f.id) filter (where o.id is not null) as with_a_handover
from public.families f
left join public.family_members fm
  on fm.family_id = f.id and fm.role = 'child' and fm.status = 'approved'
left join public.allowance_schedules s on s.child_id = fm.profile_id
left join public.allowance_occurrences o
  on o.schedule_id = s.id and o.status = 'confirmed'
where f.created_at >= (select start from pilot);
```

## 2. Families returning weekly

A family is active in a week when any member wrote a money record, answered a learning step or a practice question in it. Each timestamp is filtered against the start before it is put into a week, so the first partial week is kept.

```sql
with pilot as (select date '2026-11-01' as start),
events as (
  select fm.family_id, e.created_at as at
  from public.ledger_entries e
  join public.family_members fm on fm.profile_id = e.child_id
  where e.mode = 'recorded'
  union all
  select fm.family_id, r.answered_at
  from public.step_results r
  join public.family_members fm on fm.profile_id = r.child_id
  union all
  select fm.family_id, p.answered_at
  from public.practice_results p
  join public.family_members fm on fm.profile_id = p.child_id
)
select date_trunc('week', at)::date as week, count(distinct family_id) as active_families
from events
where at >= (select start from pilot)
group by 1
order by 1;
```

Read it against the number of families onboarded by that week (query 1).

## 3. Time from due to handover, and allowances left unconfirmed

```sql
with pilot as (select date '2026-11-01' as start)
select
  count(*) filter (where o.status = 'confirmed') as confirmed,
  count(*) filter (where o.status = 'due') as still_due,
  percentile_cont(0.5) within group (order by o.confirmed_at::date - o.due_on)
    filter (where o.status = 'confirmed') as median_days_to_handover,
  percentile_cont(0.9) within group (order by o.confirmed_at::date - o.due_on)
    filter (where o.status = 'confirmed') as p90_days_to_handover,
  count(*) filter (where o.status = 'due' and o.due_on < current_date - 7) as due_over_a_week
from public.allowance_occurrences o
where o.due_on >= (select start from pilot);
```

## 4. Children completing the seven-day journey

The journey is the seven missions in the learning content. A child has started once any attempt exists; they have finished when all seven missions have a completed attempt.

```sql
with pilot as (select date '2026-11-01' as start),
per_child as (
  select
    a.child_id,
    count(distinct a.mission_key) filter (where a.status = 'completed') as missions_done
  from public.mission_attempts a
  where a.started_at >= (select start from pilot)
  group by a.child_id
)
select
  count(*) as children_who_started,
  count(*) filter (where missions_done >= 7) as children_who_finished,
  count(*) filter (where missions_done <= 3) as children_at_three_or_fewer
from per_child;
```

## 5. Understanding, apart from completion

Completion is query 4. Understanding is read from `skill_progress`, which moves only on evidence (first-try answers, reasons, passed reviews; level 3 is "Got it": right without hints in a review), and from practice on the review pool after the first try at an item.

```sql
with pilot as (select date '2026-11-01' as start)
select
  sp.skill_key,
  count(*) as children,
  count(*) filter (where sp.level >= 3) as got_it,
  count(*) filter (where sp.level = 2) as practised,
  round(avg(sp.first_try_correct), 1) as avg_first_try_correct,
  round(avg(sp.reviews_passed), 1) as avg_reviews_passed
from public.skill_progress sp
where sp.updated_at >= (select start from pilot)
group by sp.skill_key
order by sp.skill_key;

-- Practice accuracy by week, leaving out each child's first try at an item.
with pilot as (select date '2026-11-01' as start),
ranked as (
  select
    p.answered_at, p.correct, p.hints_used,
    row_number() over (partition by p.child_id, p.item_key order by p.answered_at) as try_no
  from public.practice_results p
  where p.answered_at >= (select start from pilot)
)
select
  date_trunc('week', answered_at)::date as week,
  count(*) as answers,
  round(100.0 * count(*) filter (where correct and hints_used = 0) / count(*), 0) as pct_right_without_hints
from ranked
where try_no > 1
group by 1
order by 1;
```

## 6. Requests left unanswered

```sql
with pilot as (select date '2026-11-01' as start)
select
  r.kind,
  count(*) as requests,
  count(*) filter (where r.status = 'pending') as pending_now,
  count(*) filter (where r.status = 'pending' and r.created_at < now() - interval '3 days') as pending_over_3_days,
  percentile_cont(0.5) within group (order by extract(epoch from r.decided_at - r.created_at) / 3600)
    filter (where r.decided_at is not null and not r.auto) as median_hours_to_answer
from public.requests r
where r.created_at >= (select start from pilot)
group by r.kind
order by r.kind;
```

## 7. Balance errors and duplicate postings

Both should return no rows. A jar balance is the sum of its ledger: Save can never be negative, and Spend can only be negative for a child whose parent allowed overspending (`child_settings.allow_negative_spend`). The duplicate check looks for two recorded entries posted from the same source in the same jar and direction; purchases have no source id and are deduplicated by their idempotency key instead, which is unique by constraint.

```sql
select e.child_id, e.jar, public.balance(e.child_id, e.jar) as balance_minor
from (select distinct child_id, jar from public.ledger_entries where mode = 'recorded') e
left join public.child_settings cs on cs.child_id = e.child_id
where public.balance(e.child_id, e.jar) < 0
  and (e.jar = 'save' or not coalesce(cs.allow_negative_spend, false));

select a.child_id, a.jar, a.source_type, a.source_id, a.direction, count(*)
from public.ledger_entries a
where a.mode = 'recorded' and a.source_id is not null
group by a.child_id, a.jar, a.source_type, a.source_id, a.direction
having count(*) > 1;
```

## Operations alongside

- `/api/health?deep=1` for the uptime monitor (`docs/deploy.md`).
- `job_runs`: `select * from public.job_runs where status <> 'ok' and started_at > now() - interval '7 days'`.
- Push: the cron route's counts (`claimed`, `sent`, `dropped`, `failed`) are in the Vercel function logs for `/api/cron/push`.
