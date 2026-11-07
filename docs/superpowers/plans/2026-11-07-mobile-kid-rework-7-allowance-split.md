# Mobile Kid Rework, Plan 7: Allowance Spend/Save split Implementation Plan

> **Status: built, not committed** in worktree `agent-a0db1df847b5be557` (branch `worktree-agent-a0db1df847b5be557`). Commit steps record the intended split; nothing is committed until the user says so.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a parent sets an allowance (amount, how often, start), they also say how it divides into Spend and Save. Each due allowance carries that split, and the handover opens prefilled with it. The parent can still change both numbers at handover.

**Architecture:** ADR 0019. The schedule stores only the Save part (`allowance_schedules.save_minor`, nullable, `0..amount_minor`); Spend is always the rest, so the parts add up exactly. Generation copies it onto each occurrence (`allowance_occurrences.save_minor`, a snapshot like the amount). `create_allowance` / `change_allowance` take `p_save_minor bigint default null`; `list_due_for_parent` returns `save_minor`. Core adds the split rules (`saveForShare`, `shareOfSave`, `scheduleSplit`, `handoverPrefill`), the schema field and the editor copy. `@jarso/data/allowance` reads and writes it. The phone's `AllowanceForm` and the web's `AllowanceForm` get a split control inside the existing form. The handover (phone sheet, web page, card auto charge, in-app card payment) prefills from the planned split, else from the last handover as before. The child intro's `suggestedPlan` uses the planned Save.

**Tech Stack:** Zod 4, Vitest (core, data, web), Jest + RNTL (mobile), NativeWind 4, Next.js 16 Server Actions, Postgres plpgsql, pgTAP (CI only).

**Spec:** `docs/superpowers/specs/2026-11-06-mobile-kid-rework-design.md` ("Onboarding → Parent" step 5, "Data and backend implications → Allowance split", "Decided (2026-11-06)" item 2). ADR: `docs/adr/0019-allowance-split.md`.

## Roadmap (this is plan 7 of 10)

1. Foundation (merged). 2. Progress backend (merged). 3. Child shell and Home (merged). 4. Jar pages and goal (merged). 5. Learn and the daily check-in (merged). 6. Diary, Jarso tab, Me (merged). **7. Allowance split** (this plan). 8. Child onboarding (merged). 9. Parent sign-up and onboarding on the phone (in progress in another worktree). 10. Parent restyle (merged).

## Decisions

1. **Save is stored, Spend is the rest** (ADR 0019 §1). No percentage is stored. `scheduleSplit(amount, save)` = `{ cash: amount − save, saved: save }`, Save clamped to `0..amount`.
2. **Rounding.** A share preset's Save is `floor(amount × share / 100)` rounded down to a whole currency unit (`10^minorDigits`); Spend gets the rest. A typed Save is exact. Presets: 0 ("All Spend"), 10, 25, 50. A new allowance starts at 25 %. Amounts under one whole unit give Save 0 at any share.
3. **Null = no plan.** Old schedules and callers that don't send one (the AI guide's `change_allowance` draft) keep the old prefill. On change, null keeps the current Save if it still fits the new amount, else clears it.
4. **Snapshot per due item.** Like `amount_minor`, so a change never rewrites what is already due.
5. **Prefill, not a rule.** `handoverPrefill(item, last)` = the planned split when the item has one, else `prefillSplit(amount, last)`. It reports where it came from (`plan` / `last` / `none`) so the web form's hint line can say "The split you set." `checkSplit` and `confirm_handover` don't change.
6. **One function per name.** The old four-argument `create_allowance` / `change_allowance` are dropped and recreated with the new defaulted parameter, so PostgREST sees one candidate and older phone builds that send four named arguments keep working. `list_due_for_parent` changes its result, so it is dropped and recreated too. Grants are restated.
7. **Contract with plan 9.** Its parent onboarding step 5 renders the phone's `AllowanceForm` from the `@/features/allowance` barrel. The split control goes inside `AllowanceForm`; its name and props stay (new prop `initialSaveShare?` only); no file in that folder is renamed or moved. The new `split-field.tsx` is internal (not in the barrel).
8. **The child may read the plan** (column grant), and the intro's goal plan uses it: `suggestedPlan(allowance, currency, saveMinor?)` returns the planned Save when it is above 0, else the quarter as before.

## Global Constraints

- **Never commit until the user says so.** The "Commit" steps record the intended split: one focused Conventional Commit per task, subject ≤ 60 chars, no AI attribution.
- **No Docker, no `supabase db reset`, no `db push`, nothing against the linked project.** The migration is written and reviewed; pgTAP runs in PR CI.
- **Parallel worktree (plan 9).** Don't touch `apps/mobile/src/features/onboarding` beyond the `suggestedPlan` line, nor auth, sign-up or setup code.
- CLAUDE.md hard rules: money in integer minor units, the plan never posts to the ledger, barrels, core and data purity, Biome only. Parent copy calm and short.

## Review Focus

1. **The parts always add up.** Spend is derived; the DB check is `save_minor between 0 and amount_minor` on both tables; the form refuses Save over the amount (Task 1, Task 2 tests).
2. **Old callers keep working.** Four named arguments still resolve; a change without a Save keeps a fitting one and clears one that no longer fits (pgTAP).
3. **The prefill changes, the handover doesn't.** A due item with a plan opens with it; one without opens with last time's share; gifts never have a plan (Task 1, Task 4, Task 5 tests).
4. **Nothing reaches a balance.** No ledger row is written by create, change or generation (pgTAP).

---

### Task 1: Core split rules, schema field, types and copy

**Files:**
- Create: `packages/core/src/allowance/split.ts`
- Modify: `packages/core/src/allowance/{index,types,schemas,copy}.ts`
- Test: `packages/core/tests/allowance/split.test.ts`, `packages/core/tests/allowance/schemas.test.ts`

**Interfaces:**
```ts
// split.ts
export const SAVE_SHARES = [0, 10, 25, 50] as const;
export const DEFAULT_SAVE_SHARE = 25;
/** Save for a share of the amount, down to a whole currency unit; Spend gets the rest. */
export function saveForShare(amountMinor: number, share: number, currency: string): number;
/** The preset share that gives exactly this Save for this amount, or null (a typed amount). */
export function shareOfSave(amountMinor: number, saveMinor: number, currency: string): number | null;
/** The planned split: Save clamped to 0..amount, Spend the rest. */
export function scheduleSplit(amountMinor: number, saveMinor: number): Split;
export type PrefillSource = "plan" | "last" | "none";
/** Handover prefill: the due item's planned split, else last time's share, else all Spend. */
export function handoverPrefill(
  item: { amountMinor: number; plannedSaveMinor: number | null },
  last: Split | null,
): { split: Split; from: PrefillSource };
// types.ts
Schedule.saveMinor: number | null;      // planned Save; null = no plan
DueItem.plannedSaveMinor: number | null; // the split snapshot; null for gifts and items with no plan
// schemas.ts: allowanceSchema / changeAllowanceSchema gain optional `save`
//   (money, zero allowed, blank → null) → output `saveMinor: number | null`; Save over the amount
//   is a `save` field error (allowanceFormCopy.saveOver).
// copy.ts: allowanceFormCopy.{split, splitHint, save, shareLabel(share), splitLine(spend, save), saveOver}
//   allowanceSummaryCopy.split(spend, save); handoverCopy.hintPlanned
```

- [x] **Step 1: Write the failing tests** (`split.test.ts`): shares round Save down to a whole unit and Spend gets the rest (INR 50000 at 25 → 12500; GBP 500 at 25 → 100; JPY 1000 at 25 → 250; 0 → 0; 50 of 999 GBP-minor → 400); under one unit Save is 0; `shareOfSave` finds the preset or null; `scheduleSplit` always sums to the amount and clamps; `handoverPrefill` uses the plan, falls back to last, then all Spend, and never exceeds the amount. Schema tests: blank save → null; `"1.25"` → 125; save over the amount → field error on `save`; save 0 allowed; change schema the same.
- [x] **Step 2: Run.** `pnpm --filter @jarso/core test -- tests/allowance`. Expected: FAIL.
- [x] **Step 3: Implement** `split.ts`, the type fields, the schema field and the copy; export from the barrel.
- [x] **Step 4: Run again.** Expected: PASS. Snapshot of the copy (`__snapshots__`) updated if it covers the new keys.
- [ ] **Step 5: Commit.** `feat(core): allowance Spend/Save split rules and schema`

### Task 2: Migration, pgTAP and database types

**Files:**
- Create: `supabase/migrations/20261107120000_allowance_split.sql`
- Create: `supabase/tests/database/allowance_split.test.sql`
- Modify: `packages/db/src/database.types.ts` (by hand, in `supabase gen types` shape)

**Migration:**
- `allowance_schedules.save_minor bigint` + check `save_minor is null or save_minor between 0 and amount_minor`; same column and check on `allowance_occurrences`. Comments.
- Column grant: `grant select (save_minor) on public.allowance_schedules to authenticated` (the table uses column grants since `allowance_hide_auto_charge_from_child`).
- `generate_for_schedule`: insert copies `v_s.save_minor` (body otherwise unchanged).
- `drop function create_allowance(uuid, bigint, text, date)`; recreate with `p_save_minor bigint default null`: refuse `< 0` or `> p_amount_minor` (`22023`); store; `audit_log` details gain `save_minor`.
- `drop function change_allowance(uuid, bigint, text, date)`; recreate (latest body from `20261029163318`) with `p_save_minor bigint default null`: null keeps the current Save when it fits the new amount, else null; given → `0..amount` (`22023`). Audit gains `save_minor`, `previous_save_minor`.
- `drop function list_due_for_parent(uuid)`; recreate returning `save_minor` too (null for gifts).
- Revoke from `public, anon`; grant to `authenticated` for the three; comments.
- No new table, so no new RLS policy: both tables keep RLS on with their select policies; writes stay definer-only.

**pgTAP (`plan(16)`):** create with Save stores it; the due item generated today carries it; Save over the amount → `22023`; negative → `22023`; four named args (no Save) → null; change with a new Save stores it; change without Save keeps a fitting Save; change to a smaller amount without Save clears it; a change leaves the due item's snapshot alone; `list_due_for_parent` returns `save_minor` for the allowance and null for a gift; the column check refuses a Save over the amount on a direct update (as the table owner); the child can read `save_minor`; the child still can't read `auto_charge`; no ledger rows from any of it; anon can't call `create_allowance`; the audit row has `save_minor`.

- [x] **Step 1: Check the newest migration** (`ls supabase/migrations | tail -3`) so `20261107120000` sorts last; check no later migration redefines these functions.
- [x] **Step 2: Write the migration and the pgTAP file.**
- [x] **Step 3: Types by hand.** `save_minor` in Row/Insert/Update of both tables (alphabetical, before `saved_minor` / `status`); `create_allowance` and `change_allowance` Args gain `"p_save_minor"?: number`; `list_due_for_parent` Returns gains `"save_minor": number`.
- [x] **Step 4: Typecheck** `pnpm --filter @jarso/db typecheck` (if present) and `pnpm --filter @jarso/data typecheck`. pgTAP is not run here (no Docker); it runs in PR CI (`pnpm db:test`).
- [ ] **Step 5: Commit.** `feat(db): allowance schedules carry a Spend/Save split`

### Task 3: Data reads and writes

**Files:**
- Modify: `packages/data/src/allowance/{repository,reads,writes}.ts`
- Test: `packages/data/tests/allowance/{repository,reads,writes}.test.ts`

**Interfaces:**
```ts
findLatestSchedule(db, childId) → { amountMinor; frequency; status; saveMinor: number | null } | null
findScheduleRow → ScheduleRow & { saveMinor }       // so getParentSchedule's Schedule has it
listDueForParent → DueItem[] with plannedSaveMinor   // gifts null
insertSchedule / changeSchedule args gain saveMinor?: number | null  // sent as p_save_minor only when a number
createAllowance / changeAllowance input gains saveMinor?: number | null
findOccurrencePlannedSave(db, occurrenceId) → number | null
/** The handover prefill for one item, read with `db` (no auth; admin client from the auto charge). */
getHandoverPrefillWith(db, item: { kind; id; childId; amountMinor }) → Promise<Split>
```

- [x] **Step 1: Write the failing tests:** `findLatestSchedule` and `findScheduleRow` map `save_minor`; `listDueForParent` maps `save_minor` (gift → null); `createAllowance` sends `p_save_minor` when given and leaves it out when null; `changeAllowance` the same; `getHandoverPrefillWith` uses the occurrence's plan, falls back to the last split for a gift or no plan.
- [x] **Step 2: Run.** `pnpm --filter @jarso/data test -- tests/allowance`. Expected: FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run again** plus `pnpm --filter @jarso/data typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(data): read and write the allowance split`

### Task 4: Phone: split control in AllowanceForm, handover prefill, summary line

**Files:**
- Create: `apps/mobile/src/features/allowance/split-field.tsx` (internal; not in the barrel)
- Modify: `apps/mobile/src/features/allowance/{allowance-form,handover-form,allowance-card}.tsx`
- Test: `apps/mobile/tests/features/allowance/allowance-form.test.tsx`, `apps/mobile/tests/features/allowance/handover.test.tsx`

**Interfaces:**
```ts
// split-field.tsx
export function SplitField(props: {
  currency: string; amountMinor: number | null;
  share: number | null; saveText: string;
  onShare: (share: number) => void; onSaveText: (text: string) => void;
  errors?: string[];
}): JSX.Element; // card: "Spend and Save", the hint, radio chips (All Spend, 10 %, 25 %, 50 %), a "To Save" field, a two-colour bar and "₹375 to Spend · ₹125 to Save"
// AllowanceForm props unchanged plus optional `initialSaveShare?: number` (default DEFAULT_SAVE_SHARE)
```
- State: `share` (a preset, or null once Save is typed) and `saveText`. With a share and a parsable amount the field shows `saveForShare`; typing Save clears the share. Changing an allowance with a plan opens on its Save (and its preset when one matches); one with no plan opens on the default share.
- Submit sends `save` (the shown text) to the schema; a `save` field error lands on the field.
- `HandoverSheet` uses `handoverPrefill(item, last.data).split`.
- `AllowanceCard` shows `allowanceSummaryCopy.split(spend, save)` under the cadence when the schedule has a plan.

- [x] **Step 1: Write the failing tests:** `a new allowance starts at 25% and sends the Save` (amount 5 GBP → `saveMinor: 100`); `picking All Spend sends 0`; `typing Save sends it exactly`; `Save over the amount shows on the field and sends nothing`; `changing keeps the schedule's Save`; handover: `a due allowance with a plan opens on it` (cash/saved fields show the plan, not last time's); existing create/change expectations gain `saveMinor`.
- [x] **Step 2: Run.** `pnpm --filter @jarso/mobile test -- tests/features/allowance`. Expected: FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run again** plus `pnpm --filter @jarso/mobile typecheck`. Fix `Schedule`/`DueItem` fixtures elsewhere that now miss `saveMinor` / `plannedSaveMinor`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): set the Spend/Save split with the allowance`

### Task 5: Web: split control, services, handover page and card prefill

**Files:**
- Create: `apps/web/src/features/allowance/components/split-field.tsx`
- Modify: `apps/web/src/features/allowance/components/{allowance-form,allowance-summary,handover-form}.tsx`, `apps/web/src/features/allowance/server/{service,repository,index}.ts`, `apps/web/src/app/(app)/parent/children/[childId]/handover/[kind]/[id]/page.tsx`, `apps/web/src/features/payments/server/{auto-charge,service}.ts`
- Test: `apps/web/tests/features/allowance/**`, `apps/web/tests/features/payments/server/{auto-charge,in-app}.test.ts`

- `SplitField` (web): the same parts with `ChoiceChips` (`name="share"`, ignored by the schema) and `AmountField` (`id="save"`, label "To Save"), the bar and the line.
- Services `createAllowance` / `changeAllowance` accept `saveMinor?: number | null` and pass it on.
- Handover page: `handoverPrefill(item, last)`; the form's `hasPrevious` becomes `prefillFrom: PrefillSource` (hint: plan → `hintPlanned`, last → `hintPrevious`, none → `hint`).
- Auto charge and `startInAppPayment` use `getHandoverPrefillWith(db, …)` instead of `prefillSplit(…, getLastSplitWith(…))`.

- [x] **Step 1: Write the failing tests:** service passes `saveMinor`; auto charge and in-app use the planned split; the form test (if present) sends `save`.
- [x] **Step 2: Run.** `pnpm --filter @jarso/web test -- tests/features/allowance tests/features/payments`. Expected: FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run again** plus `pnpm --filter @jarso/web typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(web): set the Spend/Save split with the allowance`

### Task 6: The intro's goal plan uses the Save split

**Files:**
- Modify: `packages/core/src/onboarding/practice.ts` (`suggestedPlan(allowanceMinor, currency, saveMinor?)`), `packages/core/tests/onboarding/onboarding.test.ts`
- Modify: `apps/mobile/src/features/goals/use-goal.ts` (`useAllowanceSave()`: a running schedule's `saveMinor`, sharing `useAllowance`'s cache), `apps/mobile/src/features/onboarding/goal-step.tsx` (the `suggestedPlan` line only)
- Test: `apps/mobile/tests/features/onboarding/goal-step.test.tsx`

- [x] **Step 1: Write the failing tests:** core: `the plan is the Save split when there is one` (12000, INR, 4000 → 4000; save 0 → the quarter; save null → the quarter). Mobile: `with a Save split the weeks line uses it` (weekly 12000 with save 4500 → "With ₹45 a week").
- [x] **Step 2: Run.** Expected: FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): intro goal plan uses the Save split`

### Task 7: Docs, ADR and verification

- [x] **Step 1: Docs.** ADR 0019 and the index; `docs/database.md` (both columns, the three functions, generation copies it); `docs/api.md` (the `save` field on the two allowance actions and the RPC parameter); `docs/domain.md` (the Planned split row and an invariant: the plan always sums to the amount and never counts as money); `docs/mobile.md` (a "Allowance split (plan 7)" paragraph).
- [x] **Step 2: Run** `pnpm check`. Fix this plan's failures; report others.
- [ ] **Step 3: Commit.** `docs: allowance Spend/Save split (ADR 0019)`

## Open issues

- The migration must be pushed (by the user, after `supabase migration list --linked`) before the split is stored; until then the new clients send `p_save_minor`, which the old four-argument function doesn't accept, so **push the migration before shipping the clients** (web deploy and phone build).
- Plan 9's onboarding step 5 renders `AllowanceForm`; it now shows the split card and sends `saveMinor` (25 % by default). Tests there that assert the exact `createAllowance` arguments need `saveMinor`.
- The child doesn't see the plan yet (e.g. "₹125 goes to Save" on the allowance moment card). The data is readable; a later child plan can show it.

## Execution notes (deviations)

- **No `split-field.tsx` on either platform.** `SplitField` is a local function inside `allowance-form.tsx` (phone and web), so the folder plan 9 imports from gains no file and the barrel is unchanged. `AllowanceForm`'s name and props are unchanged apart from the optional `initialSaveShare` (phone).
- The split line also shows on the phone's allowance page summary (`allowance-screen.tsx`) and the web `AllowanceSummary`, not only on the hub's `AllowanceCard`.
- `handoverPrefill` treats a plan as present only when `plannedSaveMinor` is a number (`typeof`), so a due item built without the field (older mocks, untyped callers) reads as no plan instead of `NaN`.
- pgTAP has 19 assertions (the plan said 16): it also checks the audit row, the negative Save and the gift row separately.
- The web had no `AllowanceForm` test; a new `apps/web/tests/features/allowance/components/allowance-form.test.tsx` covers the default share, All Spend and a typed Save. The web handover form's `hasPrevious` prop became `prefillFrom` (`plan` / `last` / `none`), tested in `handover-form.test.tsx`.
- `Schedule.saveMinor` and `DueItem.plannedSaveMinor` are required fields, so test fixtures across core, data, web and mobile gained `saveMinor: null` / `plannedSaveMinor: null` (no behaviour change).
- The phone's form tests wait for the typed amount to show before asserting (the screen re-renders once its reads settle).
- The web allowance repository also re-exports `findOccurrencePlannedSave`; the server barrel exports `getHandoverPrefillWith`, which the payments auto charge and `startInAppPayment` now use instead of `prefillSplit(…, getLastSplitWith(…))`.
- pgTAP is written, not run (no Docker); it runs in PR CI.
- `pnpm check` (TURBO_CONCURRENCY=2): lint (22 warnings, none in this plan's files), typecheck and the core, data, web and brand tests pass. The mobile jest run hit a JavaScript heap OOM (exit 134) under machine load; re-run alone with `--maxWorkers=2`, all 106 suites and 888 tests pass.
