# Slice 2 — Allowance, Gifts and Handover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A parent sets a recurring allowance (or a hidden one-time gift). Due items appear exactly once, and the parent hands each over with a Spend/Save split that posts to the ledger exactly once, or marks it not given. The parent can change, pause or stop the allowance, and the child sees jars, the allowance card and history.

**Architecture:** Two new feature modules. `ledger` owns `ledger_entries`, `balance()`, jar reads and history. `allowance` owns schedules, occurrences, gifts and handover. Every write is a `security definer` Postgres function. Allowance due dates are always computed from an anchor date and a period index (never chained), so day 29–31 clamps without drifting. Pause stores no windows: pause, resume and stop first catch the schedule up to family-today, and the generator ignores paused schedules except to auto-resume them.

**Tech Stack:** Next.js 16 App Router (Cache Components), Supabase Postgres (pg_cron, pgTAP via `supabase test db`), Zod, Vitest, Playwright, Biome, shadcn/ui (Base UI).

**Spec:** `docs/superpowers/specs/2026-10-29-slice-2-allowance-handover-design.md`, on top of `docs/superpowers/specs/2026-10-28-first-milestone-design.md` (D1, D4–D6, D11, §4, §7, §8). Also read `docs/architecture.md` §5, §7.2, §9, `docs/database.md`, `docs/design.md`, `docs/conventions.md`, and the slice 1 plan for established patterns (`docs/superpowers/plans/2026-10-28-slice-1-family-onboarding.md`).

Branch: `feat/allowance-handover` off `main` after the spec PR (`docs/slice-2-allowance-design`) merges.

## Global Constraints

- All CLAUDE.md hard rules apply (feature modules, barrels, server/client barrel split, layering, `requireRole`/`assertRole`/`assertParentOf` from `@/features/family/server`, Suspense for request-time reads, migrations-only schema, RLS on with per-operation policies in the same migration, Zod on every input, `AppError` via `toAppError`, `logger`, env only via `src/config/env.*`, Biome).
- Money is `bigint` minor units in SQL and `number` minor units in TS; display only through `formatMoney`. Minor units are always shown on parent confirmation screens and only when non-zero on child screens (design.md).
- Functions are `security definer set search_path = ''`, revoke execute from `public, anon`, grant to `authenticated` only where a user calls them. `generate_due_occurrences` is granted to no one but `postgres`/`service_role`.
- Functions raise the slice 1 SQLSTATEs: `JA401` unauthorized, `JA403` forbidden, `JA404` not found, `JA409` conflict, `22023` invalid input. Mapped by `src/lib/db-error.ts`.
- "Family today" = `(now() at time zone families.timezone)::date`. Only `generate_due_occurrences(p_now timestamptz default now())` takes a time parameter, and it isn't user-callable. Slice 6 swaps `now()` for `family_now()`.
- Notifications are slice 5. Every place a notice will be emitted gets the comment `-- slice 5: notify(<type>)` so slice 5 can grep for it.
- Text limits: pause message and gift note are optional, trimmed, 1–140 characters; empty means null.
- Dates entered by parents (first date, "Next one on", "Give on") must be ≥ family today. Checked in Zod against the browser date, and in SQL against the family date.
- Copy (verbatim from spec §5): "Allowance for <nickname>", "How often", "Weekly / Monthly / Every 3 months / Yearly / One time", "First one on", "Next one on", "Give on", "Note for <nickname> (optional)", "Save allowance", "Save gift", "Hand over to <nickname>", "Spend (cash to <nickname>)", "Save (you keep)", "Same split as last time. Drag or type to change.", "Confirm I handed it over", "Gave less? Enter what you gave. The rest is noted as short.", "Mark as not given", "Change amount or how often", "Pause", "Resume", "Stop allowance", "Message for <nickname> (optional)", "No allowance falls due while paused. Missed weeks aren't paid later. Anything already due stays due.", "Your allowance", "Next: <date>", "<amount> waiting for a parent", "Waiting money isn't in your jars yet.", "Paused", "Paused until <date>. Next one: <date>.", "Paused until a parent resumes it.", "Your allowance has stopped.", "Skipped".
- Public repo: no keys in code, seeds, fixtures or logs.

## Review Focus

1. **Gift leaks to the child through a side door.** A child session calling any new view, RPC or select, including `balance()`, history, due counts and `list_due_for_parent`, must never reveal a pending gift, its amount, note or date. Test in Task 6 (pgTAP, as the child) and Task 10 (e2e: child page HTML has no trace of the note).
2. **Month-end anchors.** Monthly from 31 Jan gives 28 Feb, 31 Mar and 30 Apr, never 28 Mar. Quarterly from 30 Nov gives 28 Feb (or 29 Feb in a leap year). Test in Task 3.
3. **Money typed loosely.** "5", "5.5", "5.50", " 5 ", "₹5" give 500 minor units for INR. "5.555", "-1", "abc" and "" are rejected with a friendly message. JPY "500" gives 500. Test in Task 1.
4. **Double tap / two tabs on Confirm.** Two parallel `confirm_handover` calls with different keys, or a handover racing "not given", produce exactly one outcome and at most one pair of ledger rows. The losing tab shows success or "already handled", not an error. Test in Task 5 (sequential pgTAP) and Task 11 (parallel calls via supabase-js).
5. **Timezone at midnight.** For a family in `Asia/Kolkata`, an allowance due 2 Nov becomes due at 00:00 IST, i.e. 18:30 UTC on 1 Nov, not at UTC midnight. Test in Task 4 by calling the generator with `p_now = '2026-11-01 18:31+00'`.

---

## File Structure

```
supabase/migrations/
  <ts>_ledger.sql                 # job_runs, ledger_entries, balance(), list_ledger_history()
  <ts>_allowance_schedules.sql    # allowance_schedules, allowance_occurrences, allowance_due_on(), family_today(),
                                  # generate_for_schedule(), create/change/pause/resume/stop functions
  <ts>_allowance_generation.sql   # generate_due_occurrences(), pg_cron job
  <ts>_handover.sql               # confirm_handover(), mark_not_given()
  <ts>_parent_gifts.sql           # parent_gifts, create/update/cancel_gift(), confirm_gift_handover(), list_due_for_parent()
supabase/tests/database/
  ledger.test.sql, allowance_schedules.test.sql, allowance_generation.test.sql,
  handover.test.sql, parent_gifts.test.sql
src/lib/money.ts (+ .test.ts)     # minorDigits, formatMoney, parseMoney — exported from @/lib
src/features/ledger/
  index.ts, types.ts
  components/jars.tsx, components/history-list.tsx
  server/{index,repository,service}.ts
src/features/allowance/
  index.ts, types.ts
  schemas.ts (+ .test.ts)         # Zod for every action
  describe.ts (+ .test.ts)        # describeSchedule, prefillSplit (pure)
  components/allowance-form.tsx, gift-form.tsx, allowance-summary.tsx, pause-sheet.tsx,
             handover-form.tsx, due-list.tsx, child-allowance-card.tsx
  server/{index,repository,service,actions}.ts (+ service.test.ts)
src/app/(app)/parent/children/[childId]/allowance/page.tsx
src/app/(app)/parent/children/[childId]/allowance/edit/page.tsx
src/app/(app)/parent/children/[childId]/gifts/new/page.tsx
src/app/(app)/parent/children/[childId]/gifts/[giftId]/edit/page.tsx
src/app/(app)/parent/children/[childId]/handover/[kind]/[id]/page.tsx   # kind = allowance | gift
src/app/(app)/parent/page.tsx     # modify: due badge per child, link to allowance page
src/app/(app)/child/page.tsx      # modify: jars, allowance card, history
src/config/site.ts                # modify: route helpers
tests/e2e/allowance.spec.ts, tests/e2e/handover-race.spec.ts
REQUIREMENTS.md, docs/domain.md, docs/architecture.md, docs/database.md
```

---

### Task 0: Docs follow the spec

**Files:**
- Modify: `REQUIREMENTS.md` (FR01, FR03, Decided for the pilot), `docs/domain.md` (glossary, invariants), `docs/architecture.md` (§5.1, §5.2, §5.4 note, §7.2)

- [ ] **Step 1:** In REQUIREMENTS.md FR01, add bullets for one-time gifts (S2–S5), pause/stop (S7–S9) and "not given" (S10). Move the practice-money bullet under "Later versions" as "Practice money with the learning section (FR05/FR06)". In FR03, mark "The child can plan and preview how each allowance should be split" as *deferred: the parent decides the split at handover in the pilot.* Add S1–S10 under "Decided for the pilot" with today's date and note that S10 refines D5.
- [ ] **Step 2:** In domain.md, add glossary rows "Gift (from a parent)" (parent-initiated, hidden until handed over, `parent_gift_in`) vs "Gift (from others)" (child-recorded, FR04), and "Paused / stopped allowance". Add an invariant: "A pending parent gift is invisible to the child: no row, count, total or date reaches a child session."
- [ ] **Step 3:** In architecture.md, apply spec §6. In §5.1 make these changes: `allowance_schedules.active` → `status`, add `anchor_on`, `next_index`, `paused_through`, `pause_message`, drop `planned_save_minor`. Add the `parent_gifts` entity. Add the `parent_gift_in` kind and the `parent_gift` source_type. Add `closed` = not given. Then update §5.2 (due now includes due gifts, parent only) and §7.2 (gift handover, not given, pause catch-up rule).
- [ ] **Step 4:** Verify: `grep -n "planned_save_minor\|closed unused\|bool active" docs/architecture.md` → no matches.
- [ ] **Step 5:** Commit: `docs: fold slice 2 decisions into requirements and architecture`.

---

### Task 1: Money helpers

**Files:**
- Create: `src/lib/money.ts`, `src/lib/money.test.ts`
- Modify: `src/lib/index.ts` (export)

**Interfaces:**
- Produces:
  - `minorDigits(currency: string): number` — `new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits`.
  - `formatMoney(minor: number, currency: string, opts?: { showMinor?: "always" | "nonzero"; locale?: string }): string` — default `"always"`.
  - `parseMoney(input: string, currency: string): number | null` — major-unit string to minor units; `null` when invalid, negative or too precise. Strips whitespace, the currency symbol and thousands commas.

- [ ] **Step 1:** Write tests with these cases. `parseMoney`: `"5"`, `"5.5"`, `"5.50"`, `" 5 "`, `"₹5"` and `"1,000"` with INR give 500, 550, 550, 500, 500 and 100000. `"5.555"`, `"-1"`, `"abc"`, `""` and `"0.001"` give `null`. JPY: `"500"` gives 500, `"5.5"` gives `null`. `formatMoney(50000, "INR", { showMinor: "nonzero" })` contains `"500"` and no `".00"`. `formatMoney(50050, "INR")` contains `"500.50"`. `formatMoney(500, "JPY")` contains `"500"`. `minorDigits("JPY") === 0` and `minorDigits("GBP") === 2`.
- [ ] **Step 2:** `pnpm test src/lib/money.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement in `src/lib/money.ts`. Do the integer conversion on the string (split on "."), never on floats.
- [ ] **Step 4:** `pnpm test src/lib/money.test.ts` → PASS.
- [ ] **Step 5:** Commit: `feat(lib): add money parse and format helpers`.

---

### Task 2: Ledger table and balance

**Files:**
- Create: `supabase/migrations/<ts>_ledger.sql` (`pnpm db:migration ledger`), `supabase/tests/database/ledger.test.sql`
- Modify: `src/types/database.types.ts` (regenerate), `docs/database.md` (current schema table)

**Interfaces:**
- Produces (SQL):
  - `job_runs(id uuid pk, job text not null, started_at timestamptz not null default now(), finished_at timestamptz, status text check in ('running','ok','error'), details jsonb)`. RLS on, no policies.
  - `ledger_entries` per architecture §5.1, with these differences. `kind` check includes `parent_gift_in`, and `source_type` check is in `('occurrence','parent_gift','request','diary')`. `mode` check is in `('recorded','practice')` with default `'recorded'`. `direction` check is in `('in','out')`. `amount_minor bigint check (amount_minor > 0)`. `idempotency_key text unique not null`. Index `(child_id, mode, jar, occurred_at desc)`. Check: `mode = 'recorded' or source_type not in ('occurrence','parent_gift','request')`.
  - RLS: select when `public.is_self(child_id) or public.is_parent_of(child_id)`. No insert, update or delete policies.
  - `public.balance(p_child_id uuid, p_jar text, p_mode text default 'recorded') returns bigint` — `security definer stable`. Raises `JA403` unless `is_self` or `is_parent_of`.
  - `public.list_ledger_history(p_child_id uuid, p_limit int default 50) returns table(id uuid, kind text, jar text, direction text, amount_minor bigint, label text, source_type text, source_id uuid, occurred_at timestamptz)` — recorded mode only, newest first, same authz as `balance`.

- [ ] **Step 1:** Write `ledger.test.sql` (use `\ir _helpers.psql`, two families like `family_core.test.sql`). The test inserts entries as `postgres`, then checks:
  - `balance` for spend and save equals in minus out.
  - The child sees their own rows.
  - The parent of the child sees them.
  - A parent in another family gets 0 rows and `JA403` from `balance`.
  - An insert as `authenticated` is denied.
  - A duplicate `idempotency_key` raises 23505.
  - A practice row with `source_type = 'occurrence'` raises 23514.
- [ ] **Step 2:** `pnpm db:reset && pnpm db:test` → FAIL (table missing).
- [ ] **Step 3:** Write the migration.
- [ ] **Step 4:** `pnpm db:reset && pnpm db:test` → PASS. `pnpm db:types`.
- [ ] **Step 5:** Commit: `feat(db): add ledger entries and balance`.

---

### Task 3: Allowance schedules

**Files:**
- Create: `supabase/migrations/<ts>_allowance_schedules.sql`, `supabase/tests/database/allowance_schedules.test.sql`
- Modify: `src/types/database.types.ts`, `docs/database.md`

**Interfaces:**
- Consumes: `audit_log`, `is_parent_of`, `is_self`, `families.timezone`.
- Produces (SQL):
  - `allowance_schedules(id, family_id, child_id, amount_minor bigint > 0, frequency text check in ('weekly','monthly','quarterly','annual'), anchor_on date not null, next_index int not null default 0, status text check in ('active','paused','stopped') default 'active', paused_through date, pause_message text check (char_length <= 140), created_by, created_at, updated_at)`. Partial unique index `(child_id) where status in ('active','paused')`.
  - `allowance_occurrences(id, schedule_id fk, family_id, child_id, period_key text not null, due_on date not null, amount_minor bigint > 0, status text check in ('due','confirmed','closed') default 'due', cash_minor bigint, saved_minor bigint, shortfall_minor bigint not null default 0, confirmed_by uuid, confirmed_at timestamptz, created_at)`, `unique (schedule_id, period_key)`, where `period_key = to_char(due_on,'YYYY-MM-DD')`.
  - RLS select on both: `is_self(child_id) or is_parent_of(child_id)`. No write policies.
  - `public.family_today(p_family_id uuid, p_now timestamptz default now()) returns date`.
  - `public.allowance_due_on(p_anchor date, p_frequency text, p_index int) returns date` — `immutable`. Weekly: `p_anchor + 7*p_index`. Monthly, quarterly and annual: `(p_anchor + make_interval(months => p_index * k))::date` with k = 1, 3 or 12. Postgres clamps month-end. Never chain from the previous date.
  - `public.generate_for_schedule(p_schedule_id uuid, p_today date) returns int` — internal, not granted. While `allowance_due_on(anchor_on, frequency, next_index) <= p_today`, it inserts an occurrence (on conflict do nothing) with the schedule's current `amount_minor` and increments `next_index`. It returns the number inserted and leaves a `-- slice 5: notify(due)` comment.
  - `public.allowance_next_due_on(p_schedule_id uuid) returns date` — `allowance_due_on(anchor_on, frequency, next_index)`, null when stopped; same authz as select.
  - Parent functions, which all lock the schedule, require `is_parent_of(child)` (else `JA403`), write `audit_log` (`allowance.created|changed|paused|resumed|stopped`) and return the schedule id:
    - `create_allowance(p_child_id uuid, p_amount_minor bigint, p_frequency text, p_first_on date)` — `JA409` if an active or paused schedule exists. `22023` if `p_first_on < family_today`.
    - `change_allowance(p_schedule_id uuid, p_amount_minor bigint, p_frequency text, p_next_on date)` — runs `generate_for_schedule(id, today)` first, then requires `p_next_on > ` the last generated `due_on` and `>= today` (`22023`). Sets `anchor_on = p_next_on`, `next_index = 0`. Not allowed when stopped (`JA409`).
    - `pause_allowance(p_schedule_id uuid, p_through date, p_message text)` — `p_through` is null or `>= today`. Catch up first, then `status = 'paused'`, `paused_through`, and `pause_message = nullif(btrim(p_message),'')`.
    - `resume_allowance(p_schedule_id uuid)` — only from paused. Sets `next_index` to the smallest index whose `allowance_due_on > today - 1`, i.e. `>= today`. Clears the pause fields and sets `status = 'active'`, then calls `generate_for_schedule` (today's period becomes due).
    - `stop_allowance(p_schedule_id uuid)` — catch up first, then `status = 'stopped'`. Already-due occurrences are untouched.

- [ ] **Step 1:** Write `allowance_schedules.test.sql`:
  - `allowance_due_on('2026-01-31','monthly', 1..3)` = `2026-02-28, 2026-03-31, 2026-04-30`.
  - `allowance_due_on('2026-11-30','quarterly',1)` = `2027-02-28`, and from `'2027-11-30'` it is `2028-02-29`.
  - Weekly from `2026-11-01`, index 2 = `2026-11-15`. Annual from `2028-02-29`, index 1 = `2029-02-28`.
  - Parent creates a schedule. A second create gives `JA409`. A child calling `create_allowance` gives `JA403`, and so does another family's parent.
  - A past first date gives `22023`.
  - Change after two generated occurrences keeps their `amount_minor` (D6). `change_allowance` with `p_next_on` ≤ the last generated due gives `22023`.
  - Pause then resume: no occurrence exists for the paused periods, and `next_index` points at the first period ≥ today.
  - Stop: an already-due occurrence still has `status = 'due'`.
  - The child selects their own schedule. Another family sees 0 rows.
  - Each change writes one `audit_log` row.
  - For tests that need "today" to move, call `generate_for_schedule(id, date)` as `postgres` with explicit dates, and seed `anchor_on` in the past directly as `postgres`.
- [ ] **Step 2:** `pnpm db:reset && pnpm db:test` → FAIL.
- [ ] **Step 3:** Write the migration.
- [ ] **Step 4:** `pnpm db:reset && pnpm db:test` → PASS. `pnpm db:types`.
- [ ] **Step 5:** Commit: `feat(db): add allowance schedules with pause and stop`.

---

### Task 4: Hourly generation

**Files:**
- Create: `supabase/migrations/<ts>_allowance_generation.sql`, `supabase/tests/database/allowance_generation.test.sql`
- Modify: `docs/database.md` (jobs section), `docs/architecture.md` §9 if names differ

**Interfaces:**
- Consumes: `generate_for_schedule`, `family_today`, `job_runs`.
- Produces:
  - `public.generate_due_occurrences(p_now timestamptz default now()) returns int` — inserts a `job_runs` row (running). For each paused schedule with `paused_through < family_today(family, p_now)`, it auto-resumes: `status = 'active'`, `next_index` = smallest index with due date `> paused_through`, and clears the pause fields. It then calls `generate_for_schedule` for every active schedule with that family's today, and finishes the `job_runs` row (`ok` + `{inserted: n}`, or `error`). Execute is revoked from `authenticated`, `anon` and `public`.
  - `create extension if not exists pg_cron;` and `cron.schedule('generate-due-occurrences', '5 * * * *', 'select public.generate_due_occurrences()')`.

- [ ] **Step 1:** Write `allowance_generation.test.sql`:
  - A weekly schedule anchored 3 weeks ago. Running the generator twice inserts 4 occurrences in total, once each.
  - A family in `Asia/Kolkata` with an anchor of `2026-11-02`: `p_now = '2026-11-01 18:29+00'` inserts 0 and `'2026-11-01 18:31+00'` inserts 1.
  - A weekly schedule anchored on `2026-11-01`, generated through 11-01, then paused (as `postgres`, status `paused`) with `paused_through = 2026-11-10`. Running the generator with `p_now` on 11-20 leaves no occurrence for 11-08, creates 11-15, and sets the status back to `active`.
  - A paused schedule with no `paused_through` gets no inserts.
  - A stopped schedule gets no inserts.
  - Each run writes a `job_runs` row with status `ok`.
  - `authenticated` calling it gets permission denied (42501).
- [ ] **Step 2:** `pnpm db:reset && pnpm db:test` → FAIL.
- [ ] **Step 3:** Write the migration. If `pg_cron` isn't available locally, guard `cron.schedule` with `if exists (select 1 from pg_available_extensions where name = 'pg_cron')` and note it in `docs/database.md`. Before merging, confirm pg_cron is enabled on the hosted project (milestone spec §10).
- [ ] **Step 4:** `pnpm db:reset && pnpm db:test` → PASS.
- [ ] **Step 5:** Commit: `feat(db): generate due allowances hourly`.

---

### Task 5: Handover and not given

**Files:**
- Create: `supabase/migrations/<ts>_handover.sql`, `supabase/tests/database/handover.test.sql`
- Modify: `src/types/database.types.ts`

**Interfaces:**
- Consumes: `allowance_occurrences`, `ledger_entries`.
- Produces:
  - `public.confirm_handover(p_occurrence_id uuid, p_cash_minor bigint, p_saved_minor bigint, p_idempotency_key text) returns text` (`'confirmed' | 'already_confirmed'`):
    1. Lock the row and require `is_parent_of(child)`.
    2. If its status is not `'due'`, return `'already_confirmed'` (covers confirmed and closed).
    3. Require `cash, saved >= 0`, `cash + saved > 0` and `cash + saved <= amount_minor` (`22023`).
    4. Insert `allowance_in` entries for each non-zero jar (spend = cash, save = saved), with keys `'occurrence:' || id || ':spend'` and `':save'` (derived from the row; `p_idempotency_key` must be non-blank but is not stored), `source_type 'occurrence'`, label `'Allowance'`, `created_by` the caller and `occurred_at now()`.
    5. Set `confirmed`, `cash_minor`, `saved_minor`, `shortfall_minor = amount − cash − saved`, `confirmed_by` and `confirmed_at`.
    6. Leave a `-- slice 5: notify(handover_done)` comment.
  - `public.mark_not_given(p_occurrence_id uuid) returns text` (`'closed' | 'already_handled'`) — locks the row and requires the parent. If due: set `closed`, `confirmed_by` and `confirmed_at`, write `audit_log('allowance.not_given')`. Posts no ledger rows.

- [ ] **Step 1:** Write `handover.test.sql`:
  - Confirm 300 + 200 on a 500 due creates 2 ledger rows. `balance` gives spend 300 and save 200. The status is `confirmed` with shortfall 0.
  - Confirm again with the same key returns `already_confirmed` and the row count stays 2. With a different key, also `already_confirmed`.
  - 300 + 100 gives shortfall 100.
  - 400 + 200 on a 500 due gives `22023`. 0 + 0 gives `22023`. -1 + 0 gives `22023`.
  - Due money is not in `balance` before confirmation.
  - `mark_not_given` gives closed with no ledger rows, and a later `confirm_handover` returns `already_confirmed`.
  - A child calling either function gets `JA403`, and so does another family's parent.
- [ ] **Step 2:** FAIL. **Step 3:** write the migration. **Step 4:** PASS, `pnpm db:types`.
- [ ] **Step 5:** Commit: `feat(db): confirm allowance handover exactly once`.

---

### Task 6: Parent gifts

**Files:**
- Create: `supabase/migrations/<ts>_parent_gifts.sql`, `supabase/tests/database/parent_gifts.test.sql`
- Modify: `src/types/database.types.ts`, `docs/database.md`

**Interfaces:**
- Produces:
  - `parent_gifts(id, family_id, child_id, amount_minor bigint > 0, give_on date not null, note text check (char_length <= 140), status text check in ('pending','given','cancelled') default 'pending', cash_minor, saved_minor, given_by, given_at, created_by, created_at, updated_at)`.
  - RLS select: `is_parent_of(child_id)` only; the child never reads the table and sees a given gift through its ledger rows. No write policies.
  - `create_gift(p_child_id uuid, p_amount_minor bigint, p_give_on date, p_note text) returns uuid` — `22023` when `give_on < family today`. Writes `audit_log('gift.created')`.
  - `update_gift(p_gift_id uuid, p_amount_minor bigint, p_give_on date, p_note text) returns uuid` and `cancel_gift(p_gift_id uuid) returns uuid` — `JA409` unless pending. Both are audited.
  - `confirm_gift_handover(p_gift_id uuid, p_cash_minor bigint, p_saved_minor bigint, p_idempotency_key text) returns text` (`'confirmed' | 'already_confirmed'`). Requirements: pending, `give_on <= family today` (else `JA409`), cash and saved ≥ 0, sum > 0 and sum ≤ 100 × amount (`22023`). It inserts `parent_gift_in` entries with `source_type 'parent_gift'` and `label` = the note, or `'Gift'` when there is none, and sets `given`. Leaves a `-- slice 5: notify(gift_given)` comment.
  - `list_due_for_parent(p_child_id uuid) returns table(kind text, id uuid, due_on date, amount_minor bigint, note text)` — due occurrences ∪ pending gifts with `give_on <= today`, oldest first. Raises `JA403` unless `is_parent_of` (this is the child-secrecy gate for aggregates).

- [ ] **Step 1:** Write `parent_gifts.test.sql`:
  - The parent creates a gift for today with the note "Great report card!".
  - As the child: `select count(*) from parent_gifts` = 0, `list_due_for_parent` gives `JA403`, `balance` is unchanged, and `list_ledger_history` has 0 rows.
  - The parent confirms 1500 against a planned 1000 → `confirmed`. The child still sees 0 gift rows, and one history row with `kind = 'parent_gift_in'` and label "Great report card!".
  - Confirming a future-dated gift gives `JA409`.
  - Editing or cancelling a given gift gives `JA409`.
  - A cancelled gift never appears to the child, and `confirm` on it returns `already_confirmed`.
  - 0 + 0 gives `22023`, and so does 100001 against a planned 1000.
  - Another family gets `JA403` on every function and 0 rows.
- [ ] **Step 2:** FAIL. **Step 3:** write the migration. **Step 4:** PASS, `pnpm db:types`.
- [ ] **Step 5:** Commit: `feat(db): add hidden parent gifts`.

---

### Task 7: Ledger and allowance server modules

**Files:**
- Create: `src/features/ledger/{index.ts,types.ts}`, `src/features/ledger/server/{index.ts,repository.ts,service.ts}`, `src/features/allowance/{index.ts,types.ts,schemas.ts,schemas.test.ts,describe.ts,describe.test.ts}`, `src/features/allowance/server/{index.ts,repository.ts,service.ts,service.test.ts,actions.ts}`
- Modify: `src/config/site.ts` (route helpers)

**Interfaces:**
- Consumes: SQL from Tasks 2–6, `assertParentOf`, `requireRole`, `getFamily` from `@/features/family/server`, `createAction` from `@/lib`, `toAppError`.
- Produces:
  - Types: `Frequency = "weekly" | "monthly" | "quarterly" | "annual"`. `Jars = { spend: number; save: number }`. `HistoryItem = { id; kind: "allowance" | "gift" | "skipped"; amountMinor: number | null; dueMinor: number | null; label: string; occurredOn: string }` (`dueMinor` is set only for an allowance with a shortfall, so the child sees "₹400 of ₹500"). `Schedule = { id; amountMinor; frequency; status: "active" | "paused" | "stopped"; nextDueOn: string | null; pausedThrough: string | null; pauseMessage: string | null }`. `DueItem = { kind: "allowance" | "gift"; id; dueOn; amountMinor; note: string | null }`. `Gift = { id; amountMinor; giveOn; note; status }`.
  - `ledger/server`: `getJars(childId: string): Promise<Jars>`, `getHistory(childId: string): Promise<HistoryItem[]>`. History merges two sources: ledger rows from `list_ledger_history` (spend and save rows of one source grouped into one item), and closed occurrences read from `allowance_occurrences` (RLS lets the child read them), shown as `kind "skipped"` with `amountMinor null`. Shortfall comes from the occurrence row.
  - `allowance/describe.ts`: `describeSchedule(frequency: Frequency, firstOn: string, locale?: string): string` → "Every Sunday from 2 Nov", "Every month on the 31st from 31 Jan", "Every 3 months from 30 Nov", "Every year from 2 Nov". And `prefillSplit(amountMinor: number, last: { cash: number; saved: number } | null): { cash: number; saved: number }` → `saved = floor(amount × last.saved / (last.cash + last.saved))`, `cash = amount − saved`, or all cash when `last` is null.
  - `allowance/schemas.ts` (Zod, money as a major-unit string parsed with `parseMoney` and the family currency passed in, so the schemas are factories: `allowanceSchema(currency)`, `giftSchema(currency)`, `handoverSchema(currency)`, plus `pauseSchema`, `idSchema`). Dates are ISO `YYYY-MM-DD` ≥ the `today` argument.
  - `allowance/server` services: `getSchedule(childId)`, `listDue(childId)`, `listGifts(childId)` (parent only, pending + future), `getLastSplit(childId)`, `createAllowance`, `changeAllowance`, `pauseAllowance`, `resumeAllowance`, `stopAllowance`, `createGift`, `updateGift`, `cancelGift`, `confirmHandover(input: { kind: "allowance" | "gift"; id; cashMinor; savedMinor; idempotencyKey }): Promise<"confirmed" | "already_confirmed">`, `markNotGiven(id)`. Each mutation calls `assertParentOf(childId)` first.
  - `actions.ts`: one `createAction` per mutation. Each calls `refresh()` (check `node_modules/next/dist/docs/` for the Next 16 cache-refresh API used in slice 1 actions and match it). The idempotency key is generated client-side once per form mount (`crypto.randomUUID()`) and sent as a hidden field.
  - Routes in `site.ts`: `parentAllowance(childId)`, `parentAllowanceEdit(childId)`, `parentGiftNew(childId)`, `parentGiftEdit(childId, giftId)`, `parentHandover(childId, kind, id)`.

- [ ] **Step 1:** Write `describe.test.ts` covering the four `describeSchedule` strings above (en-GB) and `prefillSplit`: `(500, null)` → `{500, 0}`, `(500, {300, 200})` → `{300, 200}`, `(1000, {300, 200})` → `{600, 400}`, `(333, {1, 1})` → `{167, 166}`. Write `schemas.test.ts`: past date rejected, note of 141 characters rejected, `"  "` note → null, `"5.555"` amount rejected with the friendly message, handover with `cash + saved = 0` rejected.
- [ ] **Step 2:** `pnpm test src/features/allowance` → FAIL.
- [ ] **Step 3:** Implement `describe.ts`, `schemas.ts`, then the repositories (the only files naming tables and RPCs), the services and the actions.
- [ ] **Step 4:** Write `service.test.ts` with the repository mocked, as in `src/features/family/server/service.test.ts`. Check that `confirmHandover` passes through `already_confirmed`, that every mutation rejects when `assertParentOf` throws, and that a `JA409` from the repository becomes `AppError("CONFLICT")`.
- [ ] **Step 5:** `pnpm check` → PASS.
- [ ] **Step 6:** Commit: `feat(allowance): add ledger and allowance services`.

---

### Task 8: Parent allowance and gift screens

**Files:**
- Create: `src/features/allowance/components/{allowance-form,gift-form,allowance-summary,pause-sheet,due-list}.tsx`, the parent route pages `allowance/page.tsx`, `allowance/edit/page.tsx`, `gifts/new/page.tsx`, `gifts/[giftId]/edit/page.tsx`
- Modify: `src/app/(app)/parent/page.tsx` (each child card shows a due count badge from `listDue` and links to `parentAllowance`), `src/features/allowance/index.ts`

**Interfaces:**
- Consumes: Task 7 services and actions, `ui` (`Card`, `Button`, `Input`, `Label`, `Badge`, `Sheet`), `formatMoney`, `describeSchedule`.
- Produces: `AllowanceForm({ childId, nickname, currency, today, initial?: Schedule })` handles both create and change. `GiftForm({ childId, nickname, currency, today, initial?: Gift })`. `PauseSheet({ scheduleId, nickname, today })`. `DueList({ childId, items: DueItem[], currency })`, where each row links to `parentHandover`.

Screens follow spec §5.1 and §5.3 and the copy list in Global Constraints. The chips are a radio group (accessible, keyboard-operable). Choosing "One time" on the create form navigates to the gift form with the amount kept. Stop asks for confirmation in a dialog ("Stop <nickname>'s allowance? Anything already due stays due."). Pages read params and data inside `<Suspense>`.

- [ ] **Step 1:** In `tests/e2e/allowance.spec.ts` add `test("parent sets up a weekly allowance and sees the summary")`. Sign up a parent and add a child using the slice 1 helpers, open the child's allowance page, enter 500, pick Weekly and a first date of the next Sunday, and save. Expect "Every Sunday from …" and "Next:" with that date.
- [ ] **Step 2:** `pnpm test:e2e tests/e2e/allowance.spec.ts` → FAIL.
- [ ] **Step 3:** Build the components and pages.
- [ ] **Step 4:** Add e2e cases:
  - Change the amount to 600 and see "600".
  - Pause until a date with the message "Paused while we're on holiday" and see the Paused state with a Resume button; resume and the Paused state is gone.
  - Stop, confirm, and see the set-up form again.
  - Create a gift for today with a note and see it under the due list.
- [ ] **Step 5:** `pnpm test:e2e tests/e2e/allowance.spec.ts` → PASS. `pnpm check` → PASS.
- [ ] **Step 6:** Commit: `feat(allowance): add parent allowance and gift screens`.

---

### Task 9: Handover screen

**Files:**
- Create: `src/features/allowance/components/handover-form.tsx`, `src/app/(app)/parent/children/[childId]/handover/[kind]/[id]/page.tsx`
- Modify: `src/components/ui/index.ts` (after `pnpm dlx shadcn add slider`)

**Interfaces:**
- Consumes: `confirmHandover`, `markNotGiven`, `getLastSplit`, `prefillSplit`, `listDue`.
- Produces: `HandoverForm({ kind, id, childId, nickname, currency, amountMinor, dueOn, note, prefill: { cash; saved } })`.

The layout follows spec §5.2. The slider sets the saved share of the due amount. The two inputs are editable, and for allowance the sum may be less than due, with a live line "<short> will be noted as short". Gifts have no shortfall line and may exceed the planned amount. On `confirmed` or `already_confirmed`, show a success toast and go to `parentAllowance`. "Mark as not given" is allowance only and uses a confirm dialog. A handover page for an item that is no longer due shows "Already handled" with a link back.

- [ ] **Step 1:** Add the e2e case `test("parent hands over a due allowance with a split")`. Seed a due occurrence by calling `generate_due_occurrences` through the local service-role client, as `local-supabase.ts` allows, with a schedule anchored today. Open the handover page, expect the prefill to be all Spend (first handover), set Save to 200, confirm, and expect the due list to be empty. On the next due occurrence the prefill is 300/200.
- [ ] **Step 2:** FAIL. **Step 3:** build. **Step 4:** add the e2e case for not given: mark it, confirm, and the item leaves the due list.
- [ ] **Step 5:** PASS, `pnpm check`.
- [ ] **Step 6:** Commit: `feat(allowance): add handover screen`.

---

### Task 10: Child home

**Files:**
- Create: `src/features/ledger/components/{jars,history-list}.tsx`, `src/features/allowance/components/child-allowance-card.tsx`
- Modify: `src/app/(app)/child/page.tsx` (replace `JarsComingSoon`), barrels

**Interfaces:**
- Consumes: `getJars`, `getHistory`, `getSchedule`, `listDueForChild(childId)`. The last is a new service over `allowance_occurrences` with status due, readable via RLS. It never touches gifts.
- Produces: `Jars({ jars, currency })`, `HistoryList({ items, currency })`, `ChildAllowanceCard({ schedule, dueTotalMinor, currency })`.

The child home follows spec §5.4, with the paused, stopped and due copy from Global Constraints. Child amounts use `showMinor: "nonzero"`. A gift history row shows 🎁, the note and the amount. A skipped row shows the date and "Skipped" with no amount. With no schedule, the card says "No allowance set up yet." (*plan's call*).

- [ ] **Step 1:** Add the e2e case `test("child sees jars, due badge and a revealed gift")`. Use two browser contexts.
  - With a due allowance, the child sees "waiting for a parent" and the jars at 0.
  - The parent creates a gift for today with the note "Great report card!", and the child page (reload) does not contain that text anywhere in `page.content()`.
  - The parent hands over both, and the child sees the jars updated, the history with "Great report card!" and no "waiting" badge.
  - The parent pauses with a message, and the child sees "Paused" and the message.
- [ ] **Step 2:** FAIL. **Step 3:** build. **Step 4:** PASS, `pnpm check`.
- [ ] **Step 5:** Commit: `feat(ledger): show jars, allowance and history to the child`.

---

### Task 11: Concurrency check and slice wrap-up

**Files:**
- Create: `tests/e2e/handover-race.spec.ts`
- Modify: `docs/database.md`, `docs/testing.md` (new tests), `.claude-logs/` (commit)

- [ ] **Step 1:** Write `handover-race.spec.ts` (a Playwright test with no browser, using supabase-js against local Supabase with a signed-in parent session, created the way `global-setup.ts` creates users):
  - `Promise.all` of 5 `confirm_handover` calls with different keys on one occurrence: exactly 1 `confirmed`, 4 `already_confirmed`, and 2 ledger rows.
  - `Promise.all([confirm_handover, mark_not_given])`: exactly one changes state, and the ledger rows are either 0 (closed) or 2 (confirmed).
  - The same for `confirm_gift_handover` × 5.
- [ ] **Step 2:** `pnpm test:e2e tests/e2e/handover-race.spec.ts` → PASS (if it fails, the row lock in Task 5/6 is wrong: fix it there).
- [ ] **Step 3:** Run the `verify` skill (Biome, typecheck, unit, build, e2e, `db:reset`, `db:test`). Every step must be green.
- [ ] **Step 4:** Dispatch the `code-reviewer`, `security-auditor` (RLS, gift secrecy) and `supabase-architect` (migrations) agents on the branch diff, and fix the blocking findings.
- [ ] **Step 5:** Commit: `test(e2e): prove handover is exactly once under races`. Then open the PR `feat(allowance): allowance, gifts and handover`.
