# Slices 3 and 4 — Purchases, Money Rules, Withdrawals and Deposits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The child records purchases (with undo for 24 hours) and asks to move money out of or into Save. The parent sets flexible per-child money rules (spending limit, withdrawal cap, auto-approve, auto-confirm; each per item, week or month) and an overspend switch. Every money move posts exactly once, and notices land as rows for slice 5's inbox.

**Architecture:** Three new feature modules: `rules` (child settings and money rules), `diary` (purchases and undo) and `requests` (withdrawals and deposits). `ledger` gains purchase, withdrawal and deposit history lines, and `notifications` gains its table. Every write is a `security definer` Postgres function that follows slice 2's lock order. Business refusals (not enough money, over a cap) are **returned as a status**, not raised, so the UI can show specific friendly copy. Rule counting lives in one SQL helper per window so every caller counts the same way.

**Tech Stack:** Next.js 16 App Router (Cache Components), Supabase Postgres (pgTAP via `supabase test db`), Zod, Vitest, Playwright, Biome, shadcn/ui (Base UI).

**Spec:** `docs/superpowers/specs/2026-10-29-slices-3-4-purchases-requests-design.md`, on top of the milestone spec (`2026-10-28-first-milestone-design.md` D2, D3, D10, D11, §7, §8) and the slice 2 spec. Read `docs/database.md` (current functions and **Lock order**), `docs/design.md`, `docs/conventions.md`, and the slice 2 plan (`docs/superpowers/plans/2026-10-29-slice-2-allowance-handover.md`) for established patterns.

**Branches and PRs:**
- PR A `feat/purchases-limits` (Tasks 0–7) off `main` **after PR #23 merges** (it adds `MAX_AMOUNT_MINOR` to `@/lib/money` and changes handover results). Title `feat(diary): purchases, money rules and overspending`.
- PR B `feat/savings-requests` (Tasks 8–14) off `main` after PR A merges. Title `feat(requests): savings withdrawals and deposits`.

## Global Constraints

- All CLAUDE.md hard rules (feature modules, barrels, server/client split, layering, `assertRole` / `assertParentOf` / `assertSelfOrParentOf` / `requireRole` from `@/features/family/server`, Suspense for request-time reads, migrations-only schema with RLS and per-operation policies in the same migration, Zod on every input, `AppError` via `toAppError`, `logger`, Biome).
- Money: `bigint` minor units in SQL, `number` minor units in TS, amounts 1..`MAX_AMOUNT_MINOR` (100000000000). Parse with `parseMoney`, show with `formatMoney`.
- Functions are `security definer set search_path = ''`. Revoke execute from `public, anon`; grant to `authenticated` only for user-called functions. Internal helpers get no grants.
- **No caller-supplied time.** User-callable functions use `now()`. Windows and the 24-hour undo are computed in SQL.
- **Lock order** (database.md): source row `for update` first (if one exists), then `pg_advisory_xact_lock(hashtextextended('ledger:' || child_id, 0))`, then balance checks and inserts. Create functions with no source row take the advisory lock only.
- Windows: week = ISO week (Monday start) and month = calendar month, in `families.timezone`. `item` has no window.
- SQLSTATEs as slice 1/2: `JA403`, `JA404`, `JA409`, `22023`. Business refusals return statuses (Interfaces below), never errors.
- Ledger keys: purchase `purchase:<child_id>:<idempotency_key>`, undo `reversal:<entry_id>`, request `request:<id>:out` / `request:<id>:in`.
- Notices: inserted only by definer functions, in the same transaction as the record change (ADR 0006). None for auto-approved withdrawals, auto-confirmed deposits, handovers or cancellations.
- Label (purchase "what for") and request reason / decision note: trimmed, empty → null, max 60 / 140 / 140 chars.
- Copy (verbatim from spec §5): "Spent something?", "What for? (optional)", "Save", "That's more than you have in Spend (<amount>). Record money you got first, or ask a parent.", "Undo", "Undone", "Take out", "Put in", "You can take out up to <amount>", "What's it for?", "Ask", "Sent to your parent", "Approved, your parent will hand it over", "Spend has <amount>", "Waiting for your parent to confirm", "Added to Save", "<amount> waiting to come out", "<amount> waiting to go into Save", status chips "Waiting / Approved / Done / Not approved / Cancelled", "Let <nickname>'s Spend go below zero", "Tell me when <nickname> spends more than [amount] [period]", "<nickname> can take out at most [amount] [period]", "<nickname> can take out up to [amount] [period] without asking me", "Add deposits up to [amount] [period] without me confirming", "Deposits will count before you get the cash", section titles "Spending", "Taking money out of Save", "Putting money into Save", parent items "Hand over <amount> to <nickname>", "<nickname> gave you <amount>?", buttons "Approve", "Not now", "Confirm", "Didn't get it". Period chips: "per time" (item), "a week", "a month".
- Public repo: no keys in code, seeds, fixtures or logs.

## Review Focus

1. **Window edge in a non-UTC family.** For an `Asia/Kolkata` family, a purchase at 2026-11-01 19:00 UTC (Mon 00:30 IST) is in the *new* week. The week limit must not count Sunday's spend. Test in Task 2 (`rule_window_start`) and Task 3 (notice fires again in the new week).
2. **Double tap on Save / Ask / Put in.** The same idempotency key twice gives one ledger row (or one request) and one notice. The second call returns the first result. Test in Task 3 (purchase) and Tasks 9 and 10 (requests).
3. **Two parents act at once.** Five parallel `complete_request` calls post one pair of rows. Parallel approve of two withdrawals that together exceed unreserved Save gives exactly one approval. Test in Task 14 (e2e race spec).
4. **Pending deposit then a purchase.** With £5 in Spend and a pending £5 deposit, a £3 purchase is `not_enough_spend` even with overspend on. The parent can then still confirm the deposit. Test in Task 10.
5. **Rules changed mid-flight.** An approved withdrawal still hands over after the parent lowers the cap to below it. Only `available_save` is re-checked. Test in Task 9.

---

## File Structure

```
supabase/migrations/
  <ts>_notifications.sql        # notifications table, notify_parents(), notify_child()      (PR A)
  <ts>_money_rules.sql          # child_settings, money_rules, setters, rule_window_start()  (PR A)
  <ts>_purchases.sql            # held_spend() stub, record_purchase(), undo_purchase(), spend-limit notices,
                                # list_ledger_history v2 (reversal fields)                     (PR A)
  <ts>_requests.sql             # requests, reserved_save(), held_spend() real, available_*() (PR B)
  <ts>_request_functions.sql    # create_withdrawal/deposit, decide_*, cancel_request, complete_request (PR B)
supabase/tests/database/
  notifications.test.sql, money_rules.test.sql, purchases.test.sql,
  requests.test.sql, withdrawals.test.sql, deposits.test.sql
src/features/rules/      index.ts, types.ts, schemas.ts(+test), describe.ts(+test),
                         components/{rules-form,rule-row,overspend-switch}.tsx,
                         server/{index,repository,service,actions}.ts (+service.test.ts)
src/features/diary/      index.ts, types.ts, schemas.ts(+test),
                         components/{purchase-sheet,undo-button}.tsx,
                         server/{index,repository,service,actions}.ts (+service.test.ts)
src/features/requests/   index.ts, types.ts, schemas.ts(+test), describe.ts(+test),
                         components/{take-out-sheet,put-in-sheet,request-list,parent-request-items}.tsx,
                         server/{index,repository,service,actions}.ts (+service.test.ts)
src/features/ledger/     types.ts, server/{repository,service}.ts, components/history-list.tsx (modify)
src/features/notifications/types.ts (modify: NoticeKind)
src/app/(app)/parent/children/[childId]/rules/page.tsx                  (PR A, sections added in PR B)
src/app/(app)/child/page.tsx, src/app/(app)/child/requests/page.tsx     (modify / create)
src/app/(app)/parent/page.tsx, parent/children/[childId]/page.tsx       (modify: rules link, request items)
src/config/site.ts (routes), src/lib/db-error.ts (unchanged)
tests/e2e/purchases.spec.ts, tests/e2e/requests.spec.ts, tests/e2e/requests-race.spec.ts
REQUIREMENTS.md, docs/domain.md, docs/database.md, docs/fr-audit.md, milestone spec D3
```

---

# PR A — Slice 3

### Task 0: Spec and docs follow the decisions

**Files:**
- Add: `docs/superpowers/specs/2026-10-29-slices-3-4-purchases-requests-design.md`, this plan
- Modify: `REQUIREMENTS.md` (FR03, FR14, "Decided for the pilot"), `docs/domain.md`, `docs/superpowers/specs/2026-10-28-first-milestone-design.md` (D3 row)

- [ ] **Step 1:** REQUIREMENTS.md FR14:
  - Add money rules (P4): four kinds, per item / week / month, any combination, parent-set per child, all off by default.
  - Add auto-approve (P5): approval skipped, handover still required.
  - Add auto-confirm (P6), marked as a parent-chosen exception to "counts only after confirmation".
  - Add undo within 24 hours (P8).
  - Add that pending deposits hold Spend.
  - Add P1–P8 under "Decided for the pilot", dated 2026-10-29.
- [ ] **Step 2:** domain.md:
  - Glossary rows: "Money rule", "Auto-approve", "Auto-confirm", "Held (Spend)".
  - Invariant 3: append "except a deposit the parent's auto-confirm rule covers (P6)".
  - Invariant 7: add "a pending deposit holds its amount in Spend".
- [ ] **Step 3:** Milestone spec D3 row: append "Extended by slices 3–4 design P4 to four rule kinds."
- [ ] **Step 4:** Commit: `docs: plan purchases, money rules and savings requests`.

---

### Task 1: Notifications table

**Files:**
- Create: `supabase/migrations/<ts>_notifications.sql` (`pnpm db:migration notifications`), `supabase/tests/database/notifications.test.sql`
- Modify: `src/types/database.types.ts`, `src/features/notifications/types.ts`, `docs/database.md`

**Interfaces:**
- Produces (SQL):
  - Table `notifications`: `id uuid pk`, `family_id`, `recipient_id → profiles`, `child_id → profiles`, `kind text check in ('limit_exceeded','withdrawal_requested','withdrawal_decided','deposit_requested','deposit_decided')`, `source_type text check in ('ledger_entry','request')`, `source_id uuid not null`, `window_key text`, `payload jsonb not null default '{}'`, `created_at`, `read_at`.
    - Unique index `(recipient_id, kind, child_id, window_key) where window_key is not null`.
    - Index `(recipient_id, created_at desc)`.
    - FKs `on delete cascade` (same pattern as `ledger_entries`).
  - RLS: select where `recipient_id = auth.uid()`. No insert, update or delete policies; revoke writes from `authenticated`.
  - `notify_parents(p_child_id uuid, p_kind text, p_source_type text, p_source_id uuid, p_window_key text, p_payload jsonb) returns void`: one row per approved parent in the child's family, `on conflict do nothing`. **Internal, no grants.**
  - `notify_child(...)`: same signature, one row to the child. Internal.
- Produces (TS): `NoticeKind` union matching the check list, exported from `@/features/notifications`.

- [ ] **Step 1:** Write `notifications.test.sql`:
  - Call `notify_parents` as `postgres` for a family with two parents: 2 rows.
  - Same call with the same `window_key`: still 2.
  - Each parent selects only their own row.
  - The child selects 0.
  - Another family's parent selects 0.
  - Insert as `authenticated`: denied.
  - `authenticated` executing `notify_parents`: `42501`.
- [ ] **Step 2:** `pnpm db:reset && pnpm db:test` → FAIL.
- [ ] **Step 3:** Write the migration.
- [ ] **Step 4:** PASS. `pnpm db:types`. Add the table to database.md.
- [ ] **Step 5:** Commit: `feat(db): add notifications table`.

---

### Task 2: Child settings and money rules

**Files:**
- Create: `supabase/migrations/<ts>_money_rules.sql`, `supabase/tests/database/money_rules.test.sql`
- Modify: `src/types/database.types.ts`, `docs/database.md`

**Interfaces:**
- Produces (SQL):
  - `child_settings(child_id pk → profiles, family_id, allow_negative_spend bool not null default false, updated_by, updated_at)`. Select: `is_self(child_id) or is_parent_of(child_id)`. No write policies.
  - `money_rules(id, family_id, child_id, kind text check in ('spend_limit','withdrawal_cap','withdrawal_auto_approve','deposit_auto_confirm'), period text check in ('item','week','month'), amount_minor bigint check 1..100000000000, created_by, updated_by, created_at, updated_at, unique (child_id, kind, period))`. Same select policy, no write policies.
  - `set_allow_negative_spend(p_child_id uuid, p_allowed boolean) returns void`: parent only (`JA403`). Upserts and audits `settings.overspend` with `{allowed}`.
  - `set_money_rule(p_child_id uuid, p_kind text, p_period text, p_amount_minor bigint) returns void`: parent only. Null amount deletes the row; otherwise upsert. Bad kind, period or amount → `22023`. Audits `rule.set` / `rule.cleared` with `{kind, period, amount_minor}`.
  - `rule_window_start(p_family_id uuid, p_period text, p_at timestamptz) returns timestamptz`: start of the week or month containing `p_at` in the family timezone (`date_trunc('week'|'month', p_at at time zone tz) at time zone tz`). Null for `item`. Internal, no grants.

- [ ] **Step 1:** Write `money_rules.test.sql`:
  - The parent sets `spend_limit/week = 1000`, then `spend_limit/month = 3000`: two rows.
  - Setting `spend_limit/week = 500`: still one week row, now 500.
  - `null` deletes it.
  - The child calling `set_money_rule` or `set_allow_negative_spend`: `JA403`. Another family's parent: `JA403`.
  - `period = 'day'`: `22023`. `amount = 0`: `22023`.
  - The child can select their own rules and settings.
  - Audit rows exist.
  - `rule_window_start` for `Asia/Kolkata`:
    - `('week', '2026-11-01 19:00+00')` = `'2026-11-01 18:30+00'` (Mon 2 Nov 00:00 IST).
    - `('week', '2026-11-01 18:00+00')` = `'2026-10-25 18:30+00'`.
    - `('month', '2026-10-31 19:00+00')` = `'2026-10-31 18:30+00'` (1 Nov IST).
- [ ] **Step 2:** FAIL. **Step 3:** Write the migration.
- [ ] **Step 4:** PASS. `pnpm db:types`. Update database.md.
- [ ] **Step 5:** Commit: `feat(db): add money rules and overspend setting`.

---

### Task 3: Record and undo purchases

**Files:**
- Create: `supabase/migrations/<ts>_purchases.sql`, `supabase/tests/database/purchases.test.sql`
- Modify: `src/types/database.types.ts`, `docs/database.md`

**Interfaces:**
- Consumes: Task 1 `notify_parents`, Task 2 tables and `rule_window_start`, slice 2 `balance`, `ledger_entries`.
- Produces (SQL):
  - `held_spend(p_child_id uuid) returns bigint`: returns 0 in this PR. Task 8 replaces the body. Same authz as `balance`. Granted to `authenticated`.
  - `record_purchase(p_child_id uuid, p_amount_minor bigint, p_label text, p_idempotency_key text) returns jsonb`:
    - Returns `{status: 'recorded', entry_id, notices: int}` or `{status: 'not_enough_spend', free_minor}`.
    - Caller must be `is_self(p_child_id)` (`JA403`). Amount and label are validated (`22023`).
    - If an entry with key `purchase:<child>:<key>` exists, return `recorded` with its id (no new notice).
    - Otherwise take the ledger advisory lock and compute `free = balance(spend) − held_spend`.
    - Refuse when `amount > free` and overspend is off, or when `balance(spend) − amount < held_spend` and overspend is on.
    - Insert the `purchase` row (`jar spend`, `direction out`, `source_type diary`, `created_by` caller), then evaluate spend limits.
  - Spend-limit evaluation (one internal function, `evaluate_spend_limits(p_entry_id uuid) returns int`). For each `spend_limit` rule:
    - `item`: notice when `amount > limit`, with `window_key = 'spend_limit:item:' || entry_id`.
    - `week` / `month`: compute the `after` and `before` totals and notify when `before <= limit and after > limit`, with `window_key = 'spend_limit:<period>:' || window_start::date`.
      - `after` = sum of non-reversed purchases with `occurred_at >= window_start`, this one included.
      - `before = after − amount`.
    - Payload `{amount_minor, limit_minor, period, total_minor}`. Kind `limit_exceeded`, source `('ledger_entry', entry_id)`.
  - `undo_purchase(p_entry_id uuid) returns text`: returns `'undone' | 'already_undone' | 'too_late'`.
    - Caller must be the entry's child (`JA403`). A non-purchase entry → `22023`.
    - Locks the entry `for update`, then the advisory lock.
    - Already reversed → `already_undone`. `occurred_at < now() − interval '24 hours'` → `too_late`.
    - Otherwise insert a `reversal` (`direction in`, `jar spend`, key `reversal:<entry_id>`, `reverses_entry_id`).
  - `list_ledger_history` v2: drop and recreate with extra columns `reverses_entry_id uuid` and `reversed boolean` (an entry exists reversing this row). Keep the existing signature `(p_child_id, p_limit, p_before)` per database.md, and re-grant.

- [ ] **Step 1:** Write `purchases.test.sql` (seed Spend 1000 via a confirmed handover as in `handover.test.sql`):
  - Purchase 300: `recorded`, Spend 700.
  - Same key again: same `entry_id`, one row.
  - Purchase 800 with overspend off: `not_enough_spend` with `free_minor 700`, no row.
  - Overspend on, purchase 800: `recorded`, Spend −100.
  - The parent calling `record_purchase`: `JA403`.
  - Limits, with `spend_limit/week 500`:
    - Purchases of 300 then 300: one `limit_exceeded` per parent, on the second.
    - A third purchase in the same week: no new notice.
    - With `item 250`: a purchase of 300 gives an item notice; 200 does not.
    - Family in `Asia/Kolkata`: `record_purchase_at(..., p_now)` at Sun 23:00 IST and Mon 00:30 IST, each crossing on its own, gives two week notices.
  - Undo:
    - Undo a purchase: `undone`, Spend restored, history row `reversed = true`.
    - Undo again: `already_undone`.
    - A purchase recorded via `record_purchase_at(..., now() − 25 h)`: `too_late`.
    - The parent undoing: `JA403`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Write the migration. `record_purchase` is a thin wrapper over internal `record_purchase_at(p_child_id, p_amount_minor, p_label, p_idempotency_key, p_now timestamptz)` (no grants; it sets `occurred_at = p_now` and computes windows from it). pgTAP sets `request.jwt.claims` to the child for authz and calls the internal one as `postgres` for time cases. Slice 6's demo clock reuses the same seam.
- [ ] **Step 4:** PASS. `pnpm db:types`. Update database.md.
- [ ] **Step 5:** Commit: `feat(db): record and undo purchases with limit notices`.

---

### Task 4: Rules and diary server modules

**Files:**
- Create: `src/features/rules/{index.ts,types.ts,schemas.ts,schemas.test.ts,describe.ts,describe.test.ts}`, `src/features/rules/server/{index.ts,repository.ts,service.ts,service.test.ts,actions.ts}`, `src/features/diary/{index.ts,types.ts,schemas.ts,schemas.test.ts}`, `src/features/diary/server/{index.ts,repository.ts,service.ts,service.test.ts,actions.ts}`
- Modify: `src/config/site.ts`

**Interfaces:**
- Consumes: Tasks 2–3 SQL; `parseMoney`, `MAX_AMOUNT_MINOR`, `createAction`, `toAppError` from `@/lib`; `getFamilyContext` pattern from `allowance/server/service.ts`.
- Produces:
  - `rules/types.ts`:
    - `RuleKind = "spend_limit" | "withdrawal_cap" | "withdrawal_auto_approve" | "deposit_auto_confirm"`
    - `Period = "item" | "week" | "month"`
    - `MoneyRule = { kind: RuleKind; period: Period; amountMinor: number }`
    - `ChildRules = { allowNegativeSpend: boolean; rules: MoneyRule[] }`
  - `rules/describe.ts`:
    - `describeRule(rule: MoneyRule, nickname: string, currency: string): string`, e.g. "Tell me when Maya spends more than £10 a week".
    - `describeRuleForChild(rule: MoneyRule, currency: string): string`, e.g. "You can take out up to £5 per time without asking".
    - `summarise(rules: MoneyRule[], kind: "withdrawal" | "deposit", currency: string): string`, e.g. "Withdrawals over £5 come to you for approval" or "Every withdrawal comes to you for approval".
  - `rules/schemas.ts`:
    - `setRuleSchema(currency)` → `{ childId: uuid; kind; period; amount: string | "" }`. Empty means off; money is parsed with `parseMoney`.
    - `overspendSchema` → `{ childId; allowed: boolean }`.
  - `rules/server`: `getChildRules(childId): Promise<ChildRules>` (self or parent), `setRule(input)`, `setOverspend(input)` (parent, `assertParentOf` first). Actions `setRuleAction` and `setOverspendAction` call `refresh()`.
  - `diary/types.ts`: `PurchaseResult = { status: "recorded"; entryId: string } | { status: "not_enough_spend"; freeMinor: number }`, `UndoResult = "undone" | "already_undone" | "too_late"`.
  - `diary/schemas.ts`: `purchaseSchema(currency)` → `{ amount; label?: string ≤ 60; idempotencyKey: uuid }`, and `undoSchema` → `{ entryId: uuid }`.
  - `diary/server`:
    - `recordPurchase(input): Promise<PurchaseResult>` resolves the child as the caller (`assertRole("child")`).
    - `undoPurchase(entryId): Promise<UndoResult>`. `too_late` maps to an `AppError("CONFLICT", "You can only undo a purchase within a day.")` in the action result.
    - Actions `recordPurchaseAction`, `undoPurchaseAction`.
  - `site.ts`: `parentRules(childId)` → `/parent/children/${childId}/rules`.

- [ ] **Step 1:** Write the tests.
  - `describe.test.ts`, one sentence per kind × period, en-GB, GBP, nickname "Maya":
    - "Tell me when Maya spends more than £10 per time"
    - "Maya can take out at most £30 a month"
    - "Maya can take out up to £5 per time without asking me"
    - "Add deposits up to £10 a week without me confirming"
    - The `summarise` empty-list strings.
  - `schemas.test.ts`: `""` → off, `"5.555"` rejected, label of 61 chars rejected, `"  "` label → undefined.
- [ ] **Step 2:** `pnpm test src/features/rules src/features/diary` → FAIL.
- [ ] **Step 3:** Implement the types, describe and schemas, then the repositories (the only files naming tables and RPCs), the services and the actions.
- [ ] **Step 4:** Write `service.test.ts` for both modules with the repository mocked, like `allowance/server/service.test.ts`:
  - `setRule` rejects when `assertParentOf` throws.
  - `recordPurchase` passes `not_enough_spend` through.
  - `undoPurchase` `too_late` → CONFLICT.
- [ ] **Step 5:** `pnpm check` → PASS.
- [ ] **Step 6:** Commit: `feat(rules): add money rules and purchase services`.

---

### Task 5: History shows purchases and undo

**Files:**
- Modify: `src/features/ledger/types.ts`, `src/features/ledger/server/{repository,service}.ts`, `src/features/ledger/server/service.test.ts`, `src/features/ledger/components/history-list.tsx`

**Interfaces:**
- Produces:
  - `HistoryItem.kind` gains `"purchase"` (and in PR B `"withdrawal" | "deposit"`).
  - New fields `undone: boolean` and `entryId: string | null` (the purchase entry, for the undo button).
  - `canUndo: boolean` is `kind === "purchase" && !undone && occurredAt within 24 h`. The server computes it from `occurred_at` with `now`, so client clocks don't matter.
  - Reversal rows are not shown as their own lines.

- [ ] **Step 1:** Extend `service.test.ts`:
  - A purchase row plus its reversal → one item, `kind "purchase"`, `undone true`, `canUndo false`.
  - A purchase 2 h old → `canUndo true`. One 25 h old → `canUndo false`.
  - Label null → "Purchase".
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat(ledger): show purchases and undone lines in history`.

---

### Task 6: Screens — purchase sheet and rules page

**Files:**
- Create: `src/features/diary/components/{purchase-sheet,undo-button}.tsx`, `src/features/rules/components/{rules-form,rule-row,overspend-switch}.tsx`, `src/app/(app)/parent/children/[childId]/rules/page.tsx`
- Modify: `src/app/(app)/child/page.tsx` (primary action "Spent something?" opens the sheet; history renders `undo-button` when `canUndo`), `src/app/(app)/parent/children/[childId]/page.tsx` (link "Money rules"), feature barrels

**Interfaces:**
- Consumes: Task 4 actions and `getChildRules`, Task 5 `HistoryItem`.
- `purchase-sheet.tsx` (client):
  - `useActionState(recordPurchaseAction)`, an `amount-field` (reuse `allowance/components/amount-field.tsx` through the allowance barrel, or move it to `@/components` if it isn't exported), and a "What for? (optional)" input.
  - `idempotencyKey = crypto.randomUUID()` once per sheet open.
  - On `not_enough_spend`, show the D2 copy with `formatMoney(freeMinor)`. On `recorded`, close.
- Rules page:
  - Section "Spending": three `rule-row`s (item / week / month) for `spend_limit`, the `overspend-switch`, and the summary line.
  - Each `rule-row`:
    - The sentence from `describeRule`, an inline amount input and a switch.
    - The switch submits `setRuleAction` with an empty amount to turn the rule off.
  - `withdrawal_*` and `deposit_*` rows come in Task 12.
  - The page reads inside `<Suspense>`, as the allowance pages do.

- [ ] **Step 1:** Component test `purchase-sheet.test.tsx` (pattern: `handover-form.test.tsx`):
  - Submits the amount in minor units.
  - Shows "That's more than you have in Spend (£7.00). Record money you got first, or ask a parent." for `{status: "not_enough_spend", freeMinor: 700}`.
  - Keeps the same idempotency key across a resubmit.
- [ ] **Step 2:** FAIL. **Step 3:** Build the components and pages per design.md (teal Spend, plain sentences). **Step 4:** PASS. `pnpm check`.
- [ ] **Step 5:** Commit: `feat(diary): add purchase sheet and money rules page`.

---

### Task 7: E2E and PR A wrap-up

**Files:**
- Create: `tests/e2e/purchases.spec.ts`
- Modify: `docs/testing.md`, `docs/fr-audit.md` (FR01, FR03 Built; FR14 purchases Built), `tasks/todo.md`, `.claude-logs/`

- [ ] **Step 1:** Write `purchases.spec.ts` (two contexts, setup helpers from `helpers.ts`):
  1. The parent hands over 1000 to Spend and sets "a week" spend limit 500.
  2. The child records 300, then 300. History shows both lines.
  3. A `limit_exceeded` row exists for the parent (query with the parent session).
  4. The child records 1000: sees the D2 copy, and no row is added.
  5. The parent turns overspend on. The child records 500 and Spend shows a negative amount.
  6. The child taps Undo on the last purchase: the line shows "Undone" and Spend is restored.
- [ ] **Step 2:** `pnpm test:e2e tests/e2e/purchases.spec.ts` → PASS.
- [ ] **Step 3:** Run the `verify` skill (Biome, typecheck, unit, build, e2e, `db:reset`, `db:test`). All green.
- [ ] **Step 4:** Dispatch `code-reviewer`, `security-auditor` (RLS on the three tables, child can't write rules, no `p_now` grant) and `supabase-architect` on the branch diff. Fix blocking findings.
- [ ] **Step 5:** Commit: `test(e2e): cover purchases, limits and undo`. Open PR A.

---

# PR B — Slice 4

### Task 8: Requests table and availability

**Files:**
- Create: `supabase/migrations/<ts>_requests.sql`, `supabase/tests/database/requests.test.sql`
- Modify: `src/types/database.types.ts`, `docs/database.md`

**Interfaces:**
- Produces (SQL):
  - Table `requests`:
    - Identity: `id`, `family_id`, `child_id`, `kind text check in ('withdrawal','deposit')` (`emergency` later).
    - Lifecycle: `status text check in ('pending','approved','handed_over','confirmed','rejected','cancelled')` and `amount_minor bigint` 1..100000000000.
    - Text: `reason text` (≤ 140), `decision_note text` (≤ 140).
    - Actors and times: `auto boolean not null default false`, `decided_by`, `decided_at`, `completed_by`, `completed_at`, `occurred_at timestamptz not null default now()`, `created_at`, `updated_at`.
    - Idempotency: `idempotency_key text not null` with unique `(child_id, idempotency_key)`.
    - Checks: a withdrawal never has status `confirmed`; a deposit never has `approved` or `handed_over`.
    - Index `(child_id, status)`.
  - RLS: select for `is_self(child_id) or is_parent_of(child_id)`. No write policies.
  - `reserved_save(p_child_id) returns bigint`: sum of withdrawals `pending` or `approved`.
  - `held_spend(p_child_id) returns bigint`: replaces the Task 3 body; sum of deposits `pending`.
  - `available_save(p_child_id) = balance(save) − reserved_save` and `available_spend(p_child_id) = balance(spend) − held_spend`.
  - All four functions: `JA403` unless self or parent; granted to `authenticated`.
  - `request_window_total(p_child_id, p_kind text, p_statuses text[], p_window_start timestamptz) returns bigint`: sum of `amount_minor` where `occurred_at >= window_start` (all time when null) and status is in the list. Internal, no grants. This is the single counter for caps, auto-approve and auto-confirm (spec §3).

- [ ] **Step 1:** Write `requests.test.sql`, with rows inserted as `postgres`:
  - `reserved_save` counts pending + approved withdrawals only.
  - `held_spend` counts pending deposits only.
  - `available_save` = Save − reserved.
  - The child and parent can select; another family gets 0 rows and `JA403`.
  - Insert as `authenticated`: denied.
  - A deposit with status `approved`: `23514`.
  - `request_window_total` with a week start excludes last week's row.
- [ ] **Step 2:** FAIL. **Step 3:** Write the migration. **Step 4:** PASS. `pnpm db:types`.
- [ ] **Step 5:** Commit: `feat(db): add savings requests and reserved amounts`.

---

### Task 9: Withdrawal functions

**Files:**
- Create: `supabase/migrations/<ts>_request_functions.sql` (withdrawal part), `supabase/tests/database/withdrawals.test.sql`

**Interfaces:**
- Consumes: Task 8, Task 2 `money_rules`, `rule_window_start`, Task 1 notify helpers.
- Produces:
  - `create_withdrawal(p_child_id, p_amount_minor, p_reason, p_idempotency_key) returns jsonb`:
    - Returns `{status: 'pending' | 'approved', request_id}`, `{status: 'over_available', available_minor}` or `{status: 'over_cap', period, cap_minor, used_minor}`.
    - Child only. An existing `(child, key)` returns that request's current status and id.
    - Advisory lock, then the checks:
      - `amount > available_save` → `over_available`.
      - Each `withdrawal_cap` rule: `request_window_total(withdrawal, {pending,approved,handed_over}, window_start) + amount > cap` (item: `amount > cap`) → `over_cap`, using the first rule broken in order item, week, month.
    - Insert as `pending`. If at least one `withdrawal_auto_approve` rule exists and every one passes (`total over {approved,handed_over}` + amount ≤ limit; item: amount ≤ limit), set `approved, auto = true`. Otherwise `notify_parents('withdrawal_requested')`.
  - `decide_withdrawal(p_request_id, p_approve boolean, p_note text) returns text`:
    - Returns `'approved' | 'rejected' | 'already_decided' | 'over_available'`.
    - Parent only. Lock the request, then the advisory lock. Not `pending` → `already_decided`.
    - Approve re-checks `amount <= balance(save) − reserved_save + amount` (this request is already in reserved); failing that returns `over_available`.
    - Sets `decided_by`, `decided_at`, `decision_note`, and calls `notify_child('withdrawal_decided', payload {approved})`.
  - `complete_request(p_request_id, p_idempotency_key) returns text`, withdrawal branch:
    - Returns `'completed' | 'already_completed' | 'not_approved' | 'over_available'`.
    - Parent only. Lock the request, then the advisory lock. `handed_over` → `already_completed`; anything other than `approved` → `not_approved`.
    - Re-check `amount <= balance(save) − (reserved_save − amount)`. No rule re-check.
    - Insert `withdrawal_out` (save) and `withdrawal_in` (spend) with keys `request:<id>:out` / `:in`, `source_type request`, label = reason or `'Taken out of Save'`. Set `handed_over`, `completed_by`, `completed_at`.
    - **This is the only posting path** (provider seam); keep posting in an internal `post_request(p_request_id, p_actor uuid)` that `complete_request` calls.
  - `cancel_request(p_request_id) returns text`: returns `'cancelled' | 'already_closed'`.
    - The child may cancel their own `pending` request.
    - A parent may cancel a `pending` or `approved` withdrawal (and `pending` deposits via `decide_deposit`, Task 10).
    - Lock the row. Posts nothing.

- [ ] **Step 1:** Write `withdrawals.test.sql` (seed Save 2000):
  - Basic flow:
    - Request 500: `pending`, one parent notice, `reserved_save 500`, `available_save 1500`.
    - Same key: same id, still one notice.
    - Request 1600: `over_available` with `available_minor 1500`.
  - Caps:
    - `withdrawal_cap/week 800`, with 500 pending: request 400 → `over_cap` (`period week`, `cap 800`, `used 500`).
    - After that request is rejected, request 400 succeeds.
    - `withdrawal_cap/item 300`: a request of 301 → `over_cap item`.
  - Auto-approve:
    - `withdrawal_auto_approve/item 500` only: request 400 → `approved`, `auto true`, no notice.
    - Add `week 600` with 400 already approved this week: request 300 → `pending` and notified.
  - Decide and complete:
    - Approve → the child gets a notice.
    - Complete → Save −500, Spend +500, status `handed_over`. Complete again → `already_completed`, still 2 rows.
    - Reject → no ledger rows.
    - Complete a pending request → `not_approved`.
  - Rule changed after approval: approve 500, then set `withdrawal_cap/item 100`. Complete → `completed` (Review Focus 5).
  - Cancel: the child cancels a pending request → `cancelled` and the reservation is released. The parent cancels an approved one → `cancelled`.
  - Authz: the child calling `decide_withdrawal` or `complete_request` → `JA403`. Another family's parent → `JA403`.
- [ ] **Step 2:** FAIL. **Step 3:** Write the functions. **Step 4:** PASS. `pnpm db:types`.
- [ ] **Step 5:** Commit: `feat(db): withdrawals with caps and auto-approve`.

---

### Task 10: Deposit functions

**Files:**
- Modify: `supabase/migrations/<ts>_request_functions.sql` (same migration, as long as PR B is unmerged), `src/types/database.types.ts`, `docs/database.md`
- Create: `supabase/tests/database/deposits.test.sql`

**Interfaces:**
- Produces:
  - `create_deposit(p_child_id, p_amount_minor, p_idempotency_key) returns jsonb`:
    - Returns `{status: 'pending' | 'confirmed', request_id}` or `{status: 'over_available', available_minor}`.
    - Child only. Idempotent per key. Advisory lock. `amount > available_spend` → `over_available`.
    - Insert as `pending`. If at least one `deposit_auto_confirm` rule exists and every one passes (`request_window_total(deposit, {confirmed})` + amount ≤ limit; item: amount ≤ limit), call `post_request` in the same transaction and set `confirmed, auto = true` (no notice). Otherwise `notify_parents('deposit_requested')`.
  - `complete_request`, deposit branch: `pending` → re-check `amount <= balance(spend) − (held_spend − amount)`, then `post_request` (`deposit_out` spend, `deposit_in` save, label `'Put into Save'`), `confirmed`. `confirmed` → `already_completed`; other statuses → `not_approved`.
  - `decide_deposit(p_request_id, p_note text) returns text`: returns `'rejected' | 'already_decided'`. Parent only, reject only (the "Didn't get it" action). Notifies the child with `deposit_decided`.

- [ ] **Step 1:** Write `deposits.test.sql` (seed Spend 1000):
  - Deposit 500: `pending`, parent notice, `held_spend 500`, `available_spend 500`.
  - Deposit 600: `over_available`.
  - Review Focus 4, on a second child with Spend 500 and a pending deposit of 500 (free = 0):
    - Purchase 300 with overspend off → `not_enough_spend`, `free_minor 0`.
    - Purchase 300 with overspend **on** → `not_enough_spend` (Spend would drop below held).
    - Confirm the deposit → `completed`.
  - Confirm twice → `already_completed`, still 2 rows.
  - Reject → nothing posted, hold released, child notice.
  - Auto-confirm:
    - `deposit_auto_confirm/week 300`: deposit 200 → `confirmed`, rows posted, no notice. Deposit 200 again → `pending`.
    - Item rule 100 alongside the week rule: deposit 150 → `pending`.
  - The parent calling `create_deposit`: `JA403`.
- [ ] **Step 2:** FAIL. **Step 3:** Write the functions. **Step 4:** PASS. `pnpm db:types`. Update database.md.
- [ ] **Step 5:** Commit: `feat(db): deposits with receipt and auto-confirm`.

---

### Task 11: Requests server module

**Files:**
- Create: `src/features/requests/{index.ts,types.ts,schemas.ts,schemas.test.ts,describe.ts,describe.test.ts}`, `src/features/requests/server/{index.ts,repository.ts,service.ts,service.test.ts,actions.ts}`
- Modify: `src/features/ledger/server/service.ts` + test (history kinds `withdrawal`, `deposit`; one line per request, grouping the out/in pair), `src/config/site.ts` (`childRequests: "/child/requests"`)

**Interfaces:**
- Produces:
  - `types.ts`:
    - `RequestKind = "withdrawal" | "deposit"`.
    - `RequestStatus` (the six statuses).
    - `SavingsRequest = { id; kind; status; amountMinor; reason: string | null; auto: boolean; occurredAt: string }`.
    - `Availability = { spendMinor; saveMinor; reservedSaveMinor; heldSpendMinor; availableSaveMinor; availableSpendMinor; takeOutLimitMinor: number | null }`. `takeOutLimitMinor` is the smallest remaining withdrawal cap, or null when there is none.
    - Result unions mirroring the SQL jsonb results (camelCase).
  - `describe.ts`:
    - `statusLabel(kind, status): "Waiting" | "Approved" | "Done" | "Not approved" | "Cancelled"`.
    - `overCapMessage(period, capMinor, usedMinor, currency)` → "You can take out up to £15 a week. £10 is already taken out or waiting."
  - `schemas.ts`:
    - `withdrawalSchema(currency)` → `{ amount; reason?: ≤140; idempotencyKey }`.
    - `depositSchema(currency)`.
    - `decideSchema` → `{ requestId; approve: boolean; note?: ≤140 }`.
    - `requestIdSchema`, plus `completeSchema` (`{ requestId; idempotencyKey }`).
  - `server`:
    - Readers: `getAvailability(childId)`, `listRequests(childId)` (self or parent), `listRequestsNeedingParent(childId)` (pending withdrawals, approved withdrawals, pending deposits; parent only).
    - Mutations: `createWithdrawal`, `createDeposit` (child), `decideWithdrawal`, `rejectDeposit`, `completeRequest` (parent), `cancelRequest` (either).
    - `already_*` results show as success. `not_approved` and `over_available` at completion map to `AppError("CONFLICT", "This request changed. Refresh to see where it is.")`.
    - One `createAction` per mutation, each calling `refresh()`.

- [ ] **Step 1:** Write the unit tests.
  - `describe.test.ts`: `statusLabel` for all kind × status pairs, and the `overCapMessage` example.
  - `schemas.test.ts`: reason of 141 chars rejected, amount `"0"` rejected.
  - `service.test.ts` (repo mocked):
    - Parent mutations reject when `assertParentOf` throws.
    - `completeRequest` `already_completed` → success.
    - `not_approved` → CONFLICT.
    - `getAvailability` computes `takeOutLimitMinor` as min(available Save, each cap − used).
  - Ledger `service.test.ts`: a request's out/in pair → one `"withdrawal"` item with `amountMinor 500`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. `pnpm check`.
- [ ] **Step 5:** Commit: `feat(requests): add withdrawal and deposit services`.

---

### Task 12: Screens — child sheets, request list, parent items, rules sections

**Files:**
- Create: `src/features/requests/components/{take-out-sheet,put-in-sheet,request-list,parent-request-items}.tsx`, `src/app/(app)/child/requests/page.tsx`
- Modify:
  - `src/app/(app)/child/page.tsx`: Save jar gets "Take out" / "Put in" and the line "<amount> waiting to come out"; Spend jar gets "<amount> waiting to go into Save".
  - `src/app/(app)/parent/page.tsx` and `parent/children/[childId]/page.tsx`: render `parent-request-items` next to the existing `needs-you` list.
  - `src/features/rules/components/rules-form.tsx`: sections "Taking money out of Save" (cap and auto-approve rows) and "Putting money into Save" (auto-confirm rows, with the warning "Deposits will count before you get the cash"), each with its `summarise` line.
  - `purchase-sheet.tsx`: free amount is `availableSpendMinor`.

**Interfaces:**
- Consumes: Task 11.
- `take-out-sheet`:
  - Shows "You can take out up to <amount>" (`min(availableSaveMinor, takeOutLimitMinor)`), an amount field, "What's it for?" and "Ask".
  - Result: `pending` → "Sent to your parent"; `approved` → "Approved, your parent will hand it over"; `over_cap` → `overCapMessage`; `over_available` → "You can take out up to <amount>".
- `take-out-sheet` and `put-in-sheet` also list the child's active rules of their kind in plain words, via a child-voice variant `describeRuleForChild(rule, currency)` in `rules/describe.ts` (e.g. "You can take out up to £5 per time without asking"; add the test case to Task 4's `describe.test.ts`).
- `request-list`: rows with status chips; "Cancel" on Waiting.
- `put-in-sheet`: "Spend has <availableSpend>", amount, "Put in". Result: "Waiting for your parent to confirm" or "Added to Save".
- `parent-request-items`:
  - Pending withdrawal: "<nickname> wants <amount>: <reason>", with Approve / Not now.
  - Approved withdrawal: "Hand over <amount> to <nickname>", with Confirm and a quiet "Didn't hand it over" (→ `cancelRequest`, with a confirm step).
  - Pending deposit: "<nickname> gave you <amount>?", with Confirm / Didn't get it.
  - Each form carries its own idempotency key.

- [ ] **Step 1:** Write component tests:
  - `take-out-sheet.test.tsx` shows each result message for the four statuses.
  - `parent-request-items.test.tsx` renders the right buttons per status.
- [ ] **Step 2:** FAIL. **Step 3:** Build. **Step 4:** PASS. `pnpm check`.
- [ ] **Step 5:** Commit: `feat(requests): add take out, put in and parent request screens`.

---

### Task 13: E2E happy paths

**Files:**
- Create: `tests/e2e/requests.spec.ts`

- [ ] **Step 1:** Write the spec (two contexts; seed Save 2000 and Spend 1000 via handover):
  1. The child takes out 500 and sees "Sent to your parent". The parent sees the item, approves, then confirms the handover. Both see Save 1500 / Spend 1500, and history shows the withdrawal line.
  2. The parent sets auto-approve "per time" 300. The child takes out 200 and sees "Approved, your parent will hand it over". The parent's item reads "Hand over £2.00 to <nickname>".
  3. The child puts in 300, the parent taps Confirm, and Save rises by 300.
  4. The parent sets auto-confirm "a week" 500. The child puts in 200 and sees "Added to Save" at once.
  5. The child asks for more than available and sees the "You can take out up to" message.
- [ ] **Step 2:** `pnpm test:e2e tests/e2e/requests.spec.ts` → PASS.
- [ ] **Step 3:** Commit: `test(e2e): cover withdrawals and deposits`.

---

### Task 14: Concurrency and PR B wrap-up

**Files:**
- Create: `tests/e2e/requests-race.spec.ts`
- Modify: `docs/database.md`, `docs/testing.md`, `docs/fr-audit.md` (FR14 Built), `REQUIREMENTS.md` acceptance checklist notes, `tasks/todo.md`, `.claude-logs/`

- [ ] **Step 1:** Write `requests-race.spec.ts` (no browser, supabase-js sessions, as in `handover-race.spec.ts`):
  - 5 parallel `complete_request` on one approved withdrawal: exactly 1 `completed` and 2 ledger rows.
  - Save 1000 with two pending withdrawals of 600, two parents approving in parallel: exactly 1 `approved`, 1 `over_available`.
  - 5 parallel `create_withdrawal` with the same key: 1 request.
  - Parallel `complete_request` on a deposit and `record_purchase` for the held amount: the deposit always completes.
- [ ] **Step 2:** `pnpm test:e2e tests/e2e/requests-race.spec.ts` → PASS. If it fails, fix the lock order in Tasks 9–10.
- [ ] **Step 3:** Run the `verify` skill. All green.
- [ ] **Step 4:** Dispatch `code-reviewer`, `security-auditor` (RLS on `requests`, child can't decide or complete, `post_request` has no grants, auto-confirm only via rules) and `supabase-architect`. Fix blocking findings.
- [ ] **Step 5:** Commit: `test(e2e): prove requests post once under races`. Open PR B.
