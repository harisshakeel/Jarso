# Demo clock (D11), slice 6 — design

Implements D11 from `2026-10-28-first-milestone-design.md` (§3 D11, §4, slice 6). Decided 2026-11-02: forward only, no reset (a reset is a re-seed); auto charge never runs for a family whose clock has moved.

## Idea

Callers keep passing **real time** (`p_now`, `now()`). The family's offset is added at three leaf points, so no wrapper or `*_at` seam changes and existing pgTAP/e2e keep working (offset defaults to 0):

1. `family_today(family_id, p_now)` adds the offset when computing the family's day.
2. Triggers add the offset when a business timestamp is written.
3. `family_now(family_id)` supplies it where "now" is compared with a stored business time (money-rule windows).

## Schema (`20261102200000_demo_clock.sql`)

- `families.clock_offset interval not null default '0' check (clock_offset >= '0')`, `families.demo_clock_enabled boolean not null default false`. Column privileges: `authenticated` may select only the existing columns (pattern of `20261101230000`); nobody writes them except the seed or an admin.
- `family_clock_offset(uuid) returns interval`: security definer, `search_path ''`, stable. The offset when the caller is a service job (`auth.uid()` null) or an approved member, else `'0'`.
- `family_now(uuid)`: `now() + family_clock_offset(id)`.
- `family_today(uuid, timestamptz)`: same signature, body `((p_now + family_clock_offset(f.id)) at time zone f.timezone)::date`. Covers allowance create/change/pause/resume/stop, generation, reminders, `list_due_for_parent`, gifts, missions/practice and auto-charge dates.
- `generate_due_occurrences` and `send_handover_reminders`: dropped and recreated with `p_family_id uuid default null` (a filter), cron calls unchanged.
- Money-rule windows in `create_withdrawal`, `create_deposit`, `withdrawal_cap_remaining`: `rule_window_start(..., family_now(v_family_id))`.
- `due_auto_charges`: skips families with `clock_offset <> '0'`.
- Triggers (shift by the family offset):
  - `ledger_entries.occurred_at` on insert, except reversals and corrections (they copy a time already shifted).
  - `requests.occurred_at` on insert; `decided_at`, `completed_at` when set.
  - `allowance_occurrences.confirmed_at`, `parent_gifts.given_at` when set.
  - `mission_attempts.completed_at` when set. **Not** `started_at` (the 40-per-24h limit compares it with real time).
- `advance_family_clock(p_family_id, p_days int) returns jsonb`: security definer. 1..60 days (22023); caller an approved parent of the family (JA403); `demo_clock_enabled` (JA409); total offset at most 366 days; locks the family row; adds the days; runs `generate_due_occurrences(now(), id)` once, then `send_handover_reminders(now() - k days, id)` for k = days-1 … 0 so skipped days' notices land; audit row `family.clock_advanced`; returns offset, family today and counts.

## Stays on real time

`created_at` everywhere; the diary undo/fix windows and `canUndo` (they follow the first line's `created_at`); `resolve_occurred_at` input; PIN lockout, invitations, rate limits, guide, `job_runs`, push, payments in-progress and checkout expiry; inbox "time ago".

## App

- `FEATURE_DEMO_CLOCK` (server env, default off). The action and the parent settings "Demo clock" card exist only when it is on.
- `getFamilyNow(familyId)` (server, `cache()`d, rpc `family_now`) is always used for the family's "today" (`familyToday(tz, now)`) in allowance, payments, learning, review and guide services, flag or not, so app and database agree.
- Seed: `pnpm db:seed:demo` creates one demo family (parent and two children, allowance, goal, some history) with `demo_clock_enabled = true`. History is inserted before any advance.

## Known limits

- One jump of N days replays every skipped day's reminders at once.
- The weekly review reads `skills.updated_at` (real time), so after a jump "this week" may look empty for learning.
- Turning the flag off leaves offsets in place; clearing them is an admin SQL or a re-seed.
