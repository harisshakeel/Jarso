# Inbox, Savings Goal and Jar Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the in-app inbox with handover reminders, one savings goal per child, and a child Home and parent Home built around the Spend and Save jars, with history moved to a Diary tab.

**Architecture:**
- Three PRs, in this order:
  - **PR C, inbox:** new notice kinds and reminders in SQL; a `notifications` server module; inbox pages and badge.
  - **PR D, goal:** a `goals` table with `security definer` writers, and a new `goals` feature with one pure progress function.
  - **PR E, jar Home:** a `JarIllustration` component, a pure jar-scale function, the composed next step, and rebuilt child and parent Homes plus a Diary tab.
- Precondition: Slice 4 (`requests`, `reserved_save`, request sheets, plan `2026-10-29-slices-3-4-purchases-requests.md` PR B) is merged before PR D. PR C can start before it.

**Tech Stack:**
- Next.js 16 App Router with Cache Components;
- Supabase Postgres, with pgTAP tests in `supabase/tests/database`;
- TypeScript strict, Zod, Tailwind v4 + shadcn/ui;
- Vitest and Playwright.

**Spec:** `docs/superpowers/specs/2026-10-30-inbox-goal-jar-home-design.md` (mockup `docs/superpowers/specs/mockups/2026-10-30-jar-home.html`).

## Global Constraints

- **Rules that apply throughout:** the CLAUDE.md hard rules (feature modules, barrels, layering, `requireRole`/`assertUser`, `<Suspense>` around session reads, migrations only, RLS per operation, `createAction`, `AppError`, `logger`), plus `docs/design.md` §8–11.
- **SQL writes:** app code never inserts into `notifications` or writes `goals` directly. Every write is a `security definer` function with `set search_path = ''`. Error code `JA403` when the caller is not allowed.
- **Money** is integer minor units only. Use `formatMoney(minor, currency, { showMinor: "nonzero" })` on child screens.
- **Goal progress:** counted = Save balance − `reserved_save`, never below 0. Due and pending money is never counted.
- **No email in this plan.** Add no Resend calls, no `notification_deliveries` table and no `/api/cron` route.
- **Gamification limits:** no streaks, no day grid on Home, no confetti, nothing compared between children, and no learning numbers on the parent's child card.
- **Copy rules:**
  - Second person and sentence case, no exclamation marks in errors.
  - Plan wording is always "each time" or "each allowance", never "a week".
  - Child due notice: "Your {amount} allowance is due. Your parent will hand it over."
  - Child goal reached: "Saved up. {emoji} {name}."
  - Copy as given in spec §6.1.
- **Gifts:** `parent_gifts` never produce notices and never reach child Home (invariant 17).
- **Commits:** Conventional Commits, one per task. Run `pnpm check` before each PR, and keep `.claude-logs/` in the commits.

## Review Focus

1. **The parent hands over between reminder runs.** No reminder may fire for an occurrence whose status isn't `due`. Test in Task 1.
2. **Two parents in one family, one reads a notice.** The other parent's unread state is unchanged. Test in Task 1.
3. **A goal target below what's already saved** (the child edits the price down). The jar shows as full, with "Goal reached", "to go" is 0 and payments left is 0, and nothing errors. Test in Task 5.
4. **A JPY family (no minor digits).** The jar floor is 20 major units = 20 minor units, not 2000. Test in Task 9.
5. **A child with an allowance of 0 or no schedule, and no goal.** The jar scale falls back to the floor, and the plan validation allows any value up to the target. Test in Tasks 5 and 9.

---

# PR C — In-app inbox and reminders

### Task 1: Notice kinds, reminders and read state (SQL)

**Files:**
- Create: `supabase/migrations/<ts>_inbox_reminders.sql`, `supabase/tests/database/inbox_reminders.test.sql`
- Modify: `src/types/database.types.ts`, `docs/database.md`

**Interfaces:**
- Consumes: `notify_parents` and `notify_child` (migration `20261029181907`), `family_today(family_id, p_now)`, and `allowance_occurrences (status 'due'|'confirmed'|'closed', due_on, amount_minor, child_id, family_id)`.
- Produces (SQL):
  - The `notifications.kind` check gains `allowance_due` and `handover_reminder`, and `source_type` gains `allowance_occurrence`.
  - `send_handover_reminders(p_now timestamptz default now()) returns int`:
    - Internal; granted to nothing but the owner and `service_role`.
    - For each occurrence with `status = 'due'`, let `d = family_today(family_id, p_now) - due_on`:
      - `d = 0` → `notify_parents('allowance_due', 'allowance_occurrence', id, id||':due', payload)` and `notify_child('allowance_due', …, id||':due', payload)`;
      - `d > 0 and d % 3 = 0` → `notify_parents('handover_reminder', …, id||':'||today, payload)`.
    - Payload `{amount_minor, due_on, days_overdue}`.
    - Returns the rows inserted.
    - An occurrence first seen late (d not 0 and not a multiple of 3) waits for its next 3-day mark.
  - pg_cron job `send-handover-reminders` at `'7 * * * *'`, guarded like `generate-due-occurrences`.
  - `mark_notifications_read(p_ids uuid[] default null) returns int`:
    - Granted to `authenticated`.
    - Sets `read_at = now()` where `recipient_id = auth.uid() and read_at is null` and (`p_ids is null` or `id = any(p_ids)`).
    - Returns the count.
  - `unread_notification_count() returns int`: granted to `authenticated`, own rows only.

- [ ] **Step 1: Write `inbox_reminders.test.sql`.** Family GBP/UTC, two approved parents, one child. Weekly schedule with an occurrence due on `2026-11-02`. Call `send_handover_reminders` with fixed `p_now` values. Assert:
  - On `2026-11-02 10:00Z`: 2 parent `allowance_due` rows and 1 child row. Running it again gives 0 new rows.
  - On `2026-11-03` and `2026-11-04`: 0 rows.
  - On `2026-11-05`: 2 `handover_reminder` rows, and none for the child.
  - On `2026-11-08`: 2 more.
  - After setting the occurrence `status = 'confirmed'`, `2026-11-11` gives 0 rows (Review Focus 1).
  - An occurrence created with `due_on = 2026-10-31` and first run on `2026-11-02` (d = 2): 0 rows. The same occurrence on `2026-11-03` (d = 3): a reminder.
  - Paused schedule with an old `due` occurrence: reminders still fire.
  - No row ever has `source_type = 'allowance_occurrence'` for a `parent_gifts` id (gifts are untouched).
  - As parent A, `mark_notifications_read(array[<A's row>])` returns 1. Parent B's matching row still has `read_at is null` (Review Focus 2).
  - As parent A, `mark_notifications_read(array[<B's row>])` returns 0.
  - `mark_notifications_read(null)` marks all of A's rows.
  - `unread_notification_count()` before and after.
  - A direct `update public.notifications` as `authenticated`: permission denied.
- [ ] **Step 2:** Run `pnpm db:test` (or `supabase test db`). Expected: FAIL, the functions don't exist.
- [ ] **Step 3:** Write the migration. Alter the check constraints (drop and recreate), and add the functions, grants and cron job.
- [ ] **Step 4:** Run `pnpm db:reset && pnpm db:test`. Expected: PASS. Then run `pnpm db:types`.
- [ ] **Step 5:** Commit: `feat(db): handover reminders and notice read state`.

### Task 2: Notifications server module

**Files:**
- Create: `src/features/notifications/server/repository.ts`, `src/features/notifications/server/service.ts`, `src/features/notifications/server/service.test.ts`, `src/features/notifications/server/actions.ts`, `src/features/notifications/schemas.ts`, `src/features/notifications/links.ts`, `src/features/notifications/links.test.ts`
- Modify: `src/features/notifications/types.ts`, `src/features/notifications/index.ts`, `src/features/notifications/server/index.ts` (keep `sendEmail` exported, unused)

**Interfaces:**
- Consumes: Task 1 SQL.
- Produces:
  - `NoticeKind` gains `"allowance_due" | "handover_reminder"`.
  - `type Notice = { id: string; kind: NoticeKind; childId: string; childName: string; sourceType: "ledger_entry" | "request" | "allowance_occurrence"; sourceId: string; payload: Record<string, unknown>; createdAt: string; read: boolean }`.
  - `noticeHref(notice: Notice, role: "parent" | "child"): Route` in `links.ts`, a pure function:
    - parent + `allowance_occurrence` → `routes.parentHandover(childId, "allowance", sourceId)`;
    - parent + `request` → `routes.parentChild(childId)`;
    - parent + `ledger_entry` → `routes.parentChildHistory(childId)`;
    - child + `request` or `allowance_occurrence` → `routes.child`;
    - child + `ledger_entry` → `routes.childDiary`.
  - `noticeText(notice: Notice, role, currency): { title: string; detail: string }`, a pure function in `links.ts`, with copy per spec §4.2.
  - Server functions:
    - `listNotices(limit?: number, before?: string): Promise<{ items: Notice[]; nextBefore: string | null }>`, page size 20;
    - `getUnreadCount(): Promise<number>`;
    - `markRead(ids: string[] | null): Promise<number>`.
  - Server action `markNoticesReadAction` via `createAction`, with Zod `{ ids: z.array(z.uuid()).max(100).nullable() }`. It calls `revalidatePath` for both inbox routes.
  - `routes.childInbox = "/child/inbox"`, `routes.parentInbox = "/parent/inbox"` and `routes.childDiary = "/child/diary"`, added to `src/config/site.ts`.

- [ ] **Step 1:** Write `links.test.ts`:
  - each of the 5 `noticeHref` cases above;
  - `noticeText` for a child `allowance_due` of 500 GBP gives the title "Your £5 allowance is due" and the detail "Your parent will hand it over.";
  - a parent `handover_reminder` with `days_overdue: 6` gives "Still due: Maya's £5 allowance" and "6 days".
- [ ] **Step 2:** Run `pnpm vitest run src/features/notifications`. Expected: FAIL.
- [ ] **Step 3:** Implement `links.ts`, the types and routes. Then write the repository: the select joins the child nickname, and `rpc('mark_notifications_read')` and `rpc('unread_notification_count')` are called there. Then the service and the action.
- [ ] **Step 4:** Write `service.test.ts`, mocking the repository as the other services do. Assert that `listNotices` maps rows to `Notice` and returns `nextBefore` when 20 rows come back. Then run it. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(notifications): inbox service and notice links`.

### Task 3: Inbox pages and unread badge

**Files:**
- Create: `src/features/notifications/components/inbox-list.tsx`, `src/features/notifications/components/inbox-item.tsx`, `src/features/notifications/components/inbox-item.test.tsx`, `src/app/(app)/child/inbox/page.tsx`, `src/app/(app)/parent/inbox/page.tsx`, `tests/e2e/inbox.spec.ts`
- Modify: `src/components/shell/child-nav.tsx`, `src/components/shell/parent-nav.tsx`, the layouts that render them (pass `count`), `src/features/notifications/index.ts`

**Interfaces:**
- Consumes: Task 2 (`listNotices`, `getUnreadCount`, `markNoticesReadAction`, `noticeHref`, `noticeText`). `BottomNavItem.count` already exists (see `bottom-nav.test.tsx`).
- Produces: `<InboxList items currency role />` (client, so it can call the action); `<InboxItem notice href title detail />`.

- [ ] **Step 1:** Write `inbox-item.test.tsx`:
  - an unread item has a `data-unread="true"` attribute and the teal-100 class;
  - it renders a link to `href`;
  - clicking it calls the passed `onOpen(id)`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Build the components.
  - `InboxItem`: an icon in a tinted circle (per kind, per design.md §2.5), a title, a detail, a relative time and a chevron.
  - `InboxList`: newest first, a "Mark all as read" button (outline pill, calls the action with `null`), "Show more" (`nextBefore`), and an empty state ("Nothing here yet.").
  - On open, it fires `markNoticesReadAction({ ids: [id] })` and then navigates.
  - Pages: `requireRole("child"|"parent")`, with the data read inside `<Suspense>`.
  - Nav: add Inbox (`InboxIcon`) to both. The child nav becomes Home, Diary, Learn, Inbox (Diary is added in Task 11; add only Inbox now). The parent nav becomes Home, Allowance, Inbox. The count comes from `getUnreadCount()` read in a Suspense child of the layout, so the layout never awaits the session at its top level.
- [ ] **Step 4:** Write `tests/e2e/inbox.spec.ts`, using the existing helpers and `generate_for_schedule` fast-forward as `allowance.spec.ts` does:
  - The parent creates a schedule due today. Call `send_handover_reminders` through the service-role helper.
  - The parent's Inbox tab shows badge "1". Opening the notice lands on the handover screen, and the badge is gone.
  - The child's inbox shows "Your £5 allowance is due".
  - After the handover, opening the parent's notice shows the handed-over state.
- [ ] **Step 5:** Run `pnpm vitest run` and `pnpm test:e2e inbox`. Expected: PASS.
- [ ] **Step 6:** Commit: `feat(notifications): inbox pages and unread badge`.

### Task 4: Docs for PR C

**Files:** Modify `docs/roadmap.md`, `docs/fr-audit.md`, `docs/superpowers/specs/2026-10-28-first-milestone-design.md` (slice 5 and D13: no email), and `docs/api.md` (no `/api/cron` yet).

- [ ] **Step 1:** Edit these files per spec §4.1 "Docs to update". Roadmap slice 2 changes to "Inbox and reminders, in-app only; email moves to the final demo with web push".
- [ ] **Step 2:** Run `pnpm check`. Expected: green.
- [ ] **Step 3:** Commit: `docs: in-app only inbox for Demo 2`. Open PR C.

---

# PR D — Savings goal

### Task 5: Goals table, writers and progress (SQL + pure function)

**Files:**
- Create: `supabase/migrations/<ts>_goals.sql`, `supabase/tests/database/goals.test.sql`, `src/features/goals/progress.ts`, `src/features/goals/progress.test.ts`, `src/features/goals/emoji.ts`
- Modify: `src/types/database.types.ts`, `docs/database.md`, `docs/domain.md` (the `goals` row)

**Interfaces:**
- Consumes: `is_self`, `is_parent_of`, `balance(child, 'save')`, `reserved_save(child)` (slice 4), `allowance_schedules`.
- Produces (SQL):
  - Table `goals`:
    - `id`, `family_id`, `child_id`;
    - `name text` 1..40 after trim;
    - `emoji text not null` (1..16 bytes);
    - `target_minor bigint` 1..1000000;
    - `plan_minor bigint null` ≥ 0;
    - `status text check in ('active','archived') default 'active'`;
    - `reached_at`, `celebrated_at`, `created_at`, `updated_at`.
  - Unique index `goals_one_active on goals (child_id) where status = 'active'`.
  - RLS: select for `is_self(child_id) or is_parent_of(child_id)`. Revoke insert, update and delete from `authenticated`.
  - Functions, all child-only (`is_self`, else `JA403`):
    - `save_goal(p_name text, p_emoji text, p_target_minor bigint, p_plan_minor bigint) returns uuid`:
      - Upserts the caller's active goal.
      - When the child has an active schedule, a plan greater than the schedule's `amount_minor` raises `22023` with message `plan_over_allowance` (the repo's validation code).
      - Otherwise the plan must be ≤ target.
    - `archive_goal(p_goal_id uuid) returns void`.
    - `mark_goal_celebrated(p_goal_id uuid) returns void`: sets `celebrated_at` only if `reached_at` is not null and `celebrated_at` is null.
  - `goal_progress(p_child_id uuid) returns table(goal_id uuid, counted_minor bigint, reached boolean)`:
    - Callable by self or parent.
    - Computes counted = `greatest(balance(save) − reserved_save, 0)`.
    - Sets `reached_at = now()` the first time counted ≥ target, idempotently.
    - Returns the result.
- Produces (TS):
  - `type GoalProgress = { countedMinor: number; remainingMinor: number; paymentsLeft: number | null; reached: boolean; fillRatio: number }`.
  - `goalProgress(input: { saveMinor: number; reservedMinor: number; targetMinor: number; planMinor: number | null }): GoalProgress`, the only place this maths lives:
    - counted = max(save − reserved, 0);
    - remaining = max(target − counted, 0);
    - paymentsLeft = plan > 0 ? ceil(remaining / plan) : null (0 when remaining is 0);
    - fillRatio = min(counted / target, 1).
  - `GOAL_EMOJI: readonly string[]` with 24 entries: objects and activities only, no flags, no people.

- [ ] **Step 1:** Write `progress.test.ts`:
  - save 3100, reserved 500, target 4500, plan 400 → counted 2600, remaining 1900, paymentsLeft 5, reached false, fillRatio ≈ 0.578;
  - plan 0 → paymentsLeft null; plan null → null;
  - save 5000, reserved 0, target 4500 → remaining 0, paymentsLeft 0, reached true, fillRatio 1 (Review Focus 3);
  - reserved > save → counted 0.
- [ ] **Step 2:** Write `goals.test.sql`:
  - The child saves a goal; saving again updates the same row (count 1).
  - A second active row inserted as `postgres` → `23505`.
  - A parent calling `save_goal` → `JA403`; a parent can select.
  - Another family selects 0 rows.
  - With a schedule of 500, a plan of 600 → `22023 plan_over_allowance`. Without a schedule, a plan of 4000 for a target of 4500 is accepted, and 4600 is rejected (Review Focus 5).
  - `goal_progress` with Save 3100 and a 500 withdrawal pending → counted 2600, reached false.
  - After Save ≥ target, `reached_at` is set; calling it again leaves `reached_at` unchanged.
  - `mark_goal_celebrated` only sets the column once `reached_at` exists.
  - Archiving and then saving a new goal → the old one stays `archived` and the new one is `active`.
- [ ] **Step 3:** Run both. Expected: FAIL.
- [ ] **Step 4:** Write the migration and `progress.ts`, then run both again. Expected: PASS. Then run `pnpm db:types`.
- [ ] **Step 5:** Commit: `feat(goals): goals table, writers and progress maths`.

### Task 6: Goals feature module

**Files:**
- Create: `src/features/goals/{index.ts,types.ts,schemas.ts,schemas.test.ts}`, `src/features/goals/server/{index.ts,repository.ts,service.ts,service.test.ts,actions.ts}`

**Interfaces:**
- Consumes: Task 5.
- Produces:
  - `type Goal = { id: string; name: string; emoji: string; targetMinor: number; planMinor: number | null; reachedAt: string | null; celebratedAt: string | null }`.
  - `type GoalView = { goal: Goal; progress: GoalProgress } | null`.
  - `goalInputSchema`, a Zod schema:
    - `name`: trim, 1–40;
    - `emoji`: one of `GOAL_EMOJI`;
    - `target`: a major-unit string parsed with the existing money parser to minor, 1..1000000;
    - `plan`: optional and parsed the same way.
  - Server functions:
    - `getGoalView(childId: string): Promise<GoalView>` (React `cache`; calls `goal_progress` plus the select);
    - `saveGoal(input)`;
    - `archiveGoal(goalId)`;
    - `markCelebrated(goalId)`.
  - Actions:
    - `saveGoalAction` maps `22023` + `plan_over_allowance` to the field error "That's more than your allowance. Try a smaller amount.";
    - `archiveGoalAction`;
    - `markCelebratedAction`.
  - All of them revalidate `routes.child`.

- [ ] **Step 1:** Write `schemas.test.ts` (an emoji outside the set is rejected, a 41-character name is rejected, "45" in GBP gives 4500) and `service.test.ts` (with a mocked repository, `getGoalView` returns null with no active goal and combines the row with `goalProgress`).
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement the module with the barrels: client-safe in `index.ts`, server in `server/index.ts` with `import "server-only"`.
- [ ] **Step 4:** Run them again. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(goals): goal service and actions`.

### Task 7: Goal sheet, and the plan note on the parent side

**Files:**
- Create: `src/features/goals/components/goal-sheet.tsx`, `src/features/goals/components/goal-sheet.test.tsx`
- Modify: the handover sheet component in `src/features/allowance/components/` (one note line), `src/app/(app)/parent/children/[childId]/handover/[kind]/[id]/page.tsx` (read `getGoalView`)

**Interfaces:**
- Consumes: Task 6.
- Produces: `<GoalSheet goal={Goal | null} currency allowanceMinor={number | null} trigger />`, a sheet with:
  - fields for name, an emoji grid (radio group), price, and "How much will you save each time?";
  - a live preview "About {n} more allowances" (from `goalProgress` with the current Save, passed in as `saveMinor` and `reservedMinor` props), or "Set how much you'll save each time to see how long it'll take";
  - a "Save my goal" keycap;
  - a "Start a new goal" outline button with a confirm dialog that calls `archiveGoalAction`.

- [ ] **Step 1:** Write `goal-sheet.test.tsx`:
  - typing price 45 and plan 4 with Save 2600 counted shows "About 5 more allowances";
  - clearing the plan shows the no-plan line;
  - submitting calls the action with a payload;
  - the field error for `plan_over_allowance` renders under the plan with `aria-invalid`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Build the sheet, then the handover note: "{child} plans to save {plan} each time toward {emoji} {name}", shown only when a goal with a plan exists. It doesn't change the prefill, which stays `prefillSplit(amount, last)`.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(goals): goal sheet and plan note on handover`. Run `pnpm check` and open PR D.

---

# PR E — Jar Home

### Task 8: JarIllustration

**Files:**
- Create: `src/components/jar/jar-illustration.tsx`, `src/components/jar/jar-illustration.test.tsx`, `src/components/jar/index.ts`
- Modify: `src/components/index.ts` (if there is a components barrel; otherwise import via `@/components/jar`)

**Interfaces:**
- Produces: `<JarIllustration jar={"spend"|"save"} capacityMinor filledMinor reservedMinor={0} goal={{ emoji: string } | null} dueCoin={string | null} size={"sm"|"lg"} />`:
  - an inline SVG, `aria-hidden`, drawn from the mockup paths;
  - a cyan lid; the outline is teal-600 in light mode and teal-300 in dark;
  - Spend fills teal-500 and Save fills brand gold, with a hatched pattern for the reserved band;
  - a dashed goal line plus the emoji when `goal` is set;
  - the dashed coin with its text when `dueCoin` is set;
  - the fill height is `min(filled / capacity, 1)`, and the reserved band is stacked above it and clipped to the jar.
- Motion: a `--fill` CSS variable with a 500 ms transition, and none under `prefers-reduced-motion`.
- Pattern ids are unique per instance (`useId`).

- [ ] **Step 1:** Write the tests:
  - with capacity 4500, filled 2600 and reserved 500, the fill rect `data-ratio="0.578"` and the reserved rect `data-ratio="0.111"`;
  - with filled > capacity, the ratio is 1;
  - `goal` null → no `[data-goal-line]`;
  - two instances on one page have different pattern ids;
  - the root has `aria-hidden="true"`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Build the component.
- [ ] **Step 4:** Run them again. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(ui): jar illustration`.

### Task 9: Jar scale and Home next step (pure functions)

**Files:**
- Create: `src/features/ledger/jar-scale.ts`, `src/features/ledger/jar-scale.test.ts`, `src/features/learning/home-step.ts`, `src/features/learning/home-step.test.ts`
- Modify: the `src/features/ledger/index.ts` and `src/features/learning/index.ts` barrels

**Interfaces:**
- Consumes: `minorDigits` (`@/lib`), `NextStep` (learning), `GoalView` (goals), and the request type from slice 4 (`{ id, kind, status, amountMinor }`).
- Produces:
  - `jarCapacity(input: { spendMinor: number; saveMinor: number; allowanceMinor: number | null; currency: string }): number` = max(spend, save, 4 × allowance, 20 × 10^minorDigits(currency)).
  - `type HomeStep = { kind: "goal-reached"; goalId: string; name: string; emoji: string } | { kind: "withdrawal-approved"; amountMinor: number } | { kind: "learning"; step: NextStep } | { kind: "set-goal" } | { kind: "all-done" }`.
  - `chooseHomeStep(input: { goal: GoalView; approvedWithdrawal: { amountMinor: number } | null; learning: NextStep }): HomeStep` (spec §6.1 order):
    1. goal reached and not celebrated;
    2. an approved withdrawal;
    3. learning when `learning.kind !== "done"`;
    4. `set-goal` when `goal` is null;
    5. `all-done`.

- [ ] **Step 1:** Write the tests.
  - `jarCapacity`:
    - GBP, spend 800, save 3100, allowance 500 → 3100;
    - GBP, everything 0, no allowance → 2000;
    - JPY, everything 0 → 20 (Review Focus 4);
    - allowance 0 → the floor (Review Focus 5).
  - `chooseHomeStep`: one case per rung, plus "reached and already celebrated with learning done and a goal present" → `all-done`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement them.
- [ ] **Step 4:** Run them again. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(home): jar scale and home next step`.

### Task 10: Child Home rebuilt around the jars

**Files:**
- Create: `src/features/ledger/components/jar-shelf.tsx`, `src/features/ledger/components/jar-shelf.test.tsx`, `src/features/learning/components/home-step-card.tsx`, `src/features/learning/components/skills-strip.tsx`
- Modify: `src/app/(app)/child/page.tsx`, `tests/e2e/child-home.spec.ts`

**Interfaces:**
- Consumes:
  - Tasks 6–9;
  - `getJars`, `getSchedule`, `listDueForChild` (allowance occurrences only, never gifts);
  - `getLearningOverview` (`skills`, `nextStep`);
  - `getGuideState` / `GuideSheet`;
  - `PendingPurchases`, `PurchaseSheet`;
  - from slice 4: the child request list, the withdrawal and deposit sheets, and `reserved_save`.
- Produces:
  - `<JarShelf jars reservedMinor goal currency capacityMinor due={{ amountMinor; dueOn } | null} pendingRequests schedule />`:
    - Two `JarIllustration`s side by side at every width.
    - Under Spend: the balance, "Cash you have", and the buttons "Record a purchase" (`PurchaseSheet`) and "Move to Save" (the deposit sheet).
    - Under Save: the balance and "Kept by your parent".
      - With a goal: "{emoji} {name}, {target}. {remaining} to go · about {n} more allowances at {plan} each", or "Goal reached" when remaining is 0.
      - Buttons: "Take some out" (the withdrawal sheet) and "Change my goal" or "Set a goal" (`GoalSheet`).
    - Pending request chips under their jar, worded as in spec §6.1.
    - A due coin with "{amount} on its way · due {weekday}" between the jars.
    - A key under the shelf, in words.
    - A schedule line: "{amount} every {weekday}", or the existing pause copy from `ChildAllowanceCard`.
  - `<HomeStepCard step={HomeStep} />` renders each rung:
    - learning delegates to the existing `NextStepCard`;
    - goal-reached shows "Saved up. {emoji} {name}." with the gold keycap "Ask to use my savings" (opens the withdrawal sheet), an outline "Set a new goal", and calls `markCelebratedAction` on mount.
  - `<SkillsStrip skills />`: chips with "Got it" first, a "{n} skills learned" count, and a link to Learn.
- Page layout: the guide button sits in the header (only when the guide is on), the `PendingPurchases` banner sits above the shelf, and `HistoryList` is removed from Home.

- [ ] **Step 1:** Write `jar-shelf.test.tsx`:
  - with a goal, it shows "£19 to go · about 5 more allowances at £4 each";
  - with no goal, "Set a goal";
  - with a due allowance, "£5 on its way";
  - with a pending withdrawal, the chip "£5 asked from Save · waiting for your parent";
  - with remaining 0, "Goal reached";
  - every amount appears as text (no meaning only in the SVG).
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Build the components and recompose `child/page.tsx`. Every Supabase read goes in its own `<Suspense>` with a shimmer skeleton.
- [ ] **Step 4:** Update `child-home.spec.ts`:
  - after a handover of 500 (with a 400 saved split), the Save jar text reads £4;
  - the child sets the goal "Football boots" at 45 with a plan of 4, and the shelf shows the goal line text;
  - a withdrawal request of 1 shows its chip and leaves "to go" unchanged;
  - run an axe check in light and dark.
- [ ] **Step 5:** Run `pnpm vitest run` and `pnpm test:e2e child-home`. Expected: PASS.
- [ ] **Step 6:** Commit: `feat(home): child Home built around the jars`.

### Task 11: Diary tab

**Files:**
- Create: `src/app/(app)/child/diary/page.tsx`, `tests/e2e/diary.spec.ts`
- Modify: `src/components/shell/child-nav.tsx` (Home, Diary with `NotebookPenIcon`, Learn, Inbox), `tests/e2e/purchases.spec.ts` (undo now happens on Diary)

**Interfaces:**
- Consumes: `getHistory`/`getHistoryPage`, `HistoryList`, `UndoButton`, `PurchaseSheet`, `PendingPurchases`, and `routes.childDiary` (Task 2).

- [ ] **Step 1:** Write `diary.spec.ts`: the child records a purchase from the Spend jar, opens Diary, sees the line and undoes it, and the line shows as Undone.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Build the page: the title "Diary", the "Record a purchase" keycap, `PendingPurchases`, and `HistoryList` with Undo, paged as on the parent history page. Update the nav.
- [ ] **Step 4:** Run `pnpm test:e2e diary purchases offline-purchase`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(diary): diary tab with history and undo`.

### Task 12: Parent Home with mini jars

**Files:**
- Modify: `src/app/(app)/parent/page.tsx` (`NeedsYouSection` and `ChildCard`), and the `NeedsYouSection` / `ChildCard` components wherever they live (`src/features/family/components/` or the page file)
- Test: `src/features/family/components/child-card.test.tsx` (create if absent), `tests/e2e/allowance.spec.ts` (Needs you rows)

**Interfaces:**
- Consumes: `JarIllustration` (size `sm`), `jarCapacity`, `getGoalView`, slice 4 pending requests, unread `limit_exceeded` notices for the parent (from `listNotices` filtered by kind, read and unread both shown until read).
- Produces:
  - **Needs you**, in this order: due handovers (Hand over), pending withdrawals (Say yes / Say no), pending deposits (Confirm received), unread limit notices (View, which marks the notice read). Empty state: "All caught up."
  - **ChildCard:**
    - the name, "Weekly {amount}" and two mini jars;
    - the goal line "{emoji} {name} · {counted} of {target} · plans {plan} each allowance", or "No goal yet";
    - a link to the child's page;
    - no learning numbers on the card.

- [ ] **Step 1:** Write `child-card.test.tsx`: with a goal, the card shows "⚽ Football boots · £26 of £45 · plans £4 each allowance"; without one, "No goal yet"; and the card contains no "skill" or "mission" text.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement it. Drop the parent Requests tab if slice 4 added one, so the nav stays Home, Allowance, Inbox.
- [ ] **Step 4:** Run the unit tests and `pnpm test:e2e allowance`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(home): parent Home with needs-you and mini jars`.

### Task 13: Design docs and wrap-up

**Files:** Modify `docs/design.md` (§5 nav, §6 Progress, Handover sheet, Jar card, §7 `JarIllustration` props), `docs/roadmap.md` (slice 5 is the jar Home with no Figma step; FR04 Demo 2 gets "Diary tab with history and Undo"), `docs/fr-audit.md` (FR02, FR03, FR12, FR16 status), `tasks/todo.md` (a review section).

- [ ] **Step 1:** Edit the docs per spec §4.1 "Docs to update".
- [ ] **Step 2:** Run the `verify` skill: Biome, typecheck, unit tests, build, e2e, DB reset. Expected: all green, reported honestly.
- [ ] **Step 3:** Commit: `docs: jar Home, goal and inbox in design and roadmap`. Open PR E.
