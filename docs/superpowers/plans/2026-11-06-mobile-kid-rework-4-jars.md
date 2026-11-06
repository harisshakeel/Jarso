# Mobile Kid Rework, Plan 4: Jar pages and goal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the child app's line graph and goal staircase with pictures a child reads at a glance:

- a jar page per jar (`/(child)/jar/spend`, `/(child)/jar/save`): a big jar, 6 weekly bars with the amount on each bar, one sentence, and the jar's two actions
- a goal page: a big ring with the item, four milestone stars that light up with a cheer, "₹X to go · about N weeks", and a full celebration when the goal is reached, then "Ask Mum to buy it"
- `GoalCard` (on Home) keeps its props and becomes ring + bar + "₹X to go"
- `JarGraph` leaves the child app

**Architecture:** All arithmetic and copy is pure and lives in core. `packages/core/src/ledger/weekly.ts` buckets the existing `balanceHistory` (the same walk-back the graph used) into 6 family-local Monday weeks and writes the one-sentence week line. `packages/core/src/goals/milestones.ts` reuses `goalProgress`, `MILESTONES` and `milestoneCrossed` for the stars, and turns the allowance plan into "about N weeks". The phone reads nothing new from the server: `useHome`, the moved `useBalanceHistory`, `useGoal`, the allowance schedule (`findLatestSchedule`, already cached under `keys.schedule`) and `useProgress` / `useParentLabel` from plan 2. Celebrations go through `useCelebrate()` from plan 1. Sparks for milestones and goal reached are already awarded server-side (plan 2); the phone only shows the chip.

**Tech Stack:** Expo 58, React Native 0.88, NativeWind 4, react-native-svg 15, Reanimated 4.7, AsyncStorage, TanStack Query, Jest + RNTL (mobile), Vitest (core).

**Spec:** `docs/superpowers/specs/2026-11-06-mobile-kid-rework-design.md` ("Jars and goal", "Fun loop"). Mockups: `docs/superpowers/specs/mockups/2026-11-06-mobile-kid-rework.html` section 5 (J1 Save jar page, J2 Goal, J3 Goal reached). Contract: `/tmp/kid-rework/contract.md`.

## Roadmap (this is plan 4 of 10)

1. Foundation (merged). 2. Progress backend (merged). 3. Child shell and Home (parallel, `feat/mobile-kid-home`). **4. Jar pages and goal (this plan, `feat/mobile-kid-jars`, rebased onto 3 before its last task).** 5. Learn and daily check-in (parallel, rebased onto 4). 6–10 as in plan 1.

## Global Constraints

- **Commits ARE authorised** for this work (user asked for PRs). One focused Conventional Commit per task, subject ≤ 60 chars, imperative, NO AI attribution / Co-Authored-By lines. Commit identity is preset per worktree (noreply email); don't change git config.
- **No Docker, no `supabase db reset`, no `db push`.** This plan needs NO migration. If a task seems to need one, stop and say so.
- **File ownership is strict** (contract). Before Task 9 this plan touches only: `apps/mobile/src/features/jars/**`, `apps/mobile/src/features/goals/**` except `predict-step.tsx`, `apps/mobile/app/(child)/jar/[jar].tsx`, `app/(child)/goal.tsx`, `app/(child)/goal-sheet.tsx`, additions in `packages/core/src/ledger/` and `packages/core/src/goals/`, and the shared-additive files (core barrels, `apps/mobile/tests/setup.ts`, `apps/mobile/src/lib/query.ts` keys). Never edit Home (`features/home/**`), `(child)/_layout.tsx`, `(tabs)/**` or the money-flow sheets before Task 9.
- CLAUDE.md hard rules apply: feature modules and barrels, core purity (rule 18: no React/RN/`@/**`/platform globals in `packages/core`), money in integer minor units, Biome only, child copy rules.
- **Word budget:** labels 1–3 words, Jarso bubble ≤ 8 words, no paragraphs on the child side. Jar page ≈ 25 words, goal page ≈ 15 words (mockup).
- **Jarso is never sad.** No red anywhere on these pages; a week where Save went down is drawn calm (muted/blue), and its sentence is neutral. Never celebrate spending as such (Spend page copy is neutral, no "!").
- **Charts:** no line graphs in the child app. Bars carry their number.
- **Reduced motion** (`useReducedMotion()`): stars and ring appear in their final state, no scale-in; `celebrate()` already drops confetti.
- **Colours** from `@jarso/brand/tokens` / Tailwind tokens: Save = gold, Spend = teal, progress = gold ring. No raw hex.
- **Tests:** mobile in `apps/mobile/tests/` mirroring `src/`; core in `packages/core/tests/<module>/`.
- **Shared machine** (three parallel builds): targeted runs only, `pnpm --filter @jarso/mobile test -- <paths> --maxWorkers=2` and `pnpm --filter @jarso/core test -- <paths>`. Full `pnpm check` only in Task 8.
- Read `docs/design.md` (§2.5 money colours, §6 components, §8 motion: "never on first paint, never when money leaves" for quarter marks) and `docs/mobile.md` before UI work.

## Review Focus

1. **Negative weeks.** A week where the child used savings gives a negative Save total. The bar is a calm stub with "−₹30" on it (never red, never below the axis), it never counts as "Best week!", and the line is neutral ("You used some savings."). Task 1 and Task 4 tests.
2. **Empty or short history.** A brand-new child (all points 0), or a history that starts after the oldest of the 6 weeks: those weeks count as 0, never `NaN`, and the line is the first-time line. History still loading or failed: the bars card is hidden, the jar and actions still show. Tasks 1, 4, 5.
3. **Family-local week boundaries.** Weeks run Monday to Sunday on the family's local dates. A purchase at 00:30 Monday in Asia/Kolkata (Sunday 19:00 UTC) belongs to the new week. The current week runs from Monday to `context.today` only. Tasks 1 and 4 (`useBalanceHistory` keeps converting with `localDate(occurredAt, context.timezone)`).
4. **Goal overshoot.** Saved more than the target: ring and bar full (clamped), all four stars lit, no "to go" line, no negative amount, and the reached celebration shows exactly once (it marks `celebrated_at`). Tasks 3, 6, 7.
5. **Goal target lowered or raised.** Lowering the target can jump from 1 lit star to 3: exactly one cheer, for the highest star. Raising it unlights stars on screen but never re-cheers a star already cheered for that goal (the stored "seen" count only rises), and a new goal (new id) starts fresh and seeds silently on first sight (no cheer for progress made before the child looked). Tasks 3 and 6.

---

### Task 1: Core `weeklyTotals` over the balance history

**Files:**
- Create: `packages/core/src/ledger/weekly.ts`
- Modify: `packages/core/src/ledger/index.ts` (`export * from "./weekly"`)
- Test: `packages/core/tests/ledger/weekly.test.ts`

**Interfaces:**
- Consumes: `BalanceHistory`, `BalancePoint` (`./balance-history`), `Jar` (`./types`), `addDays`, `startOfWeek` from `@jarso/core/lib`.
- Produces:
  ```ts
  export const WEEKS_SHOWN = 6;
  /** One bar: how much the jar changed over one family-local Monday–Sunday week. */
  export type WeekTotal = {
    weekStart: string;     // Monday, ISO date
    label: string;         // "Oct 5", "12", "19", "26", "Nov 2", "This week"
    amountMinor: number;   // closing balance at min(Sunday, today) minus closing balance the Sunday before; may be negative
    current: boolean;      // the week that contains `today`
  };
  export function weeklyTotals(
    history: BalanceHistory, jar: Jar, today: string, weeks?: number,
  ): WeekTotal[]; // oldest first, always `weeks` long
  ```
  A day missing from the history (before its first point) reads as the first point's balance, so weeks before the history begins count as 0. Labels: the current week is "This week"; any other week shows `"Mon D"` when it is the first bar or its month differs from the bar before, otherwise just `D` (UTC formatting of the ISO date, as `showDate` does).

- [ ] **Step 1: Write the failing tests** in `weekly.test.ts`:
  - `returns six weeks oldest first ending with the current week` (today `2026-11-06`, a Friday: week starts `2026-09-28` … `2026-11-02`, last `current: true`).
  - `a week's total is its closing balance minus the Sunday before` (Save 1000 on Sun 2026-10-25, 3000 on Sun 2026-11-01 → week of Oct 26 = 2000).
  - `the current week runs to today only` (points up to Fri; no Saturday point needed).
  - `a week where savings went down is negative` (→ `-3000`).
  - `weeks before the history starts count as zero` (history beginning `2026-10-20` → the first three weeks are 0, no `NaN`).
  - `an empty history gives six zero weeks` (`{ points: [], movedOn: [] }`).
  - `a Monday belongs to the new week` (points 2026-11-01 Sun = 0, 2026-11-02 Mon = 500 → current week 500, previous 0). This pins the boundary; the timezone conversion itself is tested in Task 4.
  - `labels show the month on the first bar and when it changes` (→ `["Sep 28","Oct 5","12","19","26","This week"]` for today 2026-11-06; and a case where `Nov 2` is a non-current bar).
  - `spend and save are bucketed separately` (same history, `jar: "spend"` reads the spend track).
- [ ] **Step 2: Run them.** `pnpm --filter @jarso/core test -- tests/ledger/weekly.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `weekly.ts` with a `Map<date, BalancePoint>` lookup over `history.points`; no new walk-back (reuse what `balanceHistory` produced). Add the barrel export.
- [ ] **Step 4: Run again.** Same command, then `pnpm --filter @jarso/core test -- tests/ledger`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(core): weekly jar totals from the balance history`

### Task 2: Core week line, best week and jar page copy

**Files:**
- Modify: `packages/core/src/ledger/weekly.ts`, `packages/core/src/ledger/copy.ts`
- Test: `packages/core/tests/ledger/weekly.test.ts` (new `describe` blocks)

**Interfaces:**
- Consumes: `WeekTotal` (Task 1), `jarsoFill` from `@jarso/core/mascot`.
- Produces:
  ```ts
  /** The one sentence under the bars (≤ 8 words, never sad, never cheering spending). */
  export function weekLine(totals: WeekTotal[], jar: Jar, money: (minor: number) => string): string;
  /** True when this week is above zero and above every earlier week shown. */
  export function isBestWeek(totals: WeekTotal[]): boolean;
  /** How full the big jar looks, 0..1: Save as Jarso on Home (goal ratio, else share of both); Spend its share of both. */
  export function jarPageFill(jar: Jar, input: { spendMinor: number; saveMinor: number; goalTargetMinor: number | null }): number;
  export const jarPageCopy: {
    title: Record<Jar, string>;          // "Spend jar", "Save jar"
    barsHeading: Record<Jar, string>;    // "Each week", "Saved each week"
    bestWeek: string;                    // "Best week!"
    caption: { spend: string; save: (parent: string) => string }; // "Cash you have", "Mum keeps it safe" (first letter capitalised)
    actions: Record<Jar, readonly [{ label: string; hint: string; href: string }, { label: string; hint: string; href: string }]>;
    // spend: I bought something → /(child)/purchase, I got money → /(child)/received
    // save:  Save some → /(child)/put-in,  Use savings → /(child)/take-out
    barsLabel: (jar: Jar, totals: string) => string; // screen-reader summary of the six bars
  };
  ```
  `weekLine` rules (`cur` = current week, `prev` = the one before):
  - every week 0 → Save "Your first save shows here." / Spend "Nothing moved yet."
  - Save: `cur > prev` → `"₹50 more than last week!"`; `cur === prev` → "Same as last week. Steady!"; `cur < 0` → "You used some savings."; else → "Every coin counts. Keep going!"
  - Spend (neutral, no "!"): `cur > prev` → `"₹50 more than last week."`; `cur < prev` → `"₹50 less than last week."`; equal → "Same as last week."
  `jarPageFill("save", …)` is exactly `jarsoFill(…)`; `"spend"` is `jarsoFill({ saveMinor: spend, spendMinor: save, goalTargetMinor: null })` (one formula, swapped).

- [ ] **Step 1: Write the failing tests:**
  - `weekLine says how much more than last week` (Save 2000 → 7000, `money` = `£`) → `"£50 more than last week!"`.
  - `weekLine is calm when savings went down` → `"You used some savings."`, and contains no "less".
  - `weekLine for a quiet week after a big one keeps going` → `"Every coin counts. Keep going!"`.
  - `weekLine first time` for both jars.
  - `weekLine for spend never cheers` (no `!` across all branches).
  - `every week line is at most 8 words` (loop over all branches and both jars).
  - `isBestWeek needs a positive week above every earlier one` (ties → false, negative → false, all zero → false).
  - `jarPageFill save matches jarsoFill and spend is its share` (`{spend 300, save 100, goal null}` → save 0.25, spend 0.75; goal overshoot → 1; negatives → 0).
  - `jar actions link to the existing money routes` (exact hrefs above).
- [ ] **Step 2: Run them.** `pnpm --filter @jarso/core test -- tests/ledger/weekly.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** in `weekly.ts` (logic) and `copy.ts` (`jarPageCopy`). The action labels are the spec's money-action names; if plan 3 later exports the same names from core, Task 9 points `jarPageCopy.actions` at them.
- [ ] **Step 4: Run again,** plus `pnpm lint` (Biome purity). Expected: PASS.
- [ ] **Step 5: Commit.** `feat(core): week line and jar page copy`

### Task 3: Core goal milestones and "about N weeks"

**Files:**
- Create: `packages/core/src/goals/milestones.ts`
- Modify: `packages/core/src/goals/index.ts`, `packages/core/src/goals/copy.ts` (add `goalCopy.page` and `goalCopy.card.toGo`; existing strings unchanged, the web still uses them)
- Test: `packages/core/tests/goals/milestones.test.ts`

**Interfaces:**
- Consumes: `GoalProgress`, `goalProgress` (`./progress`), `MILESTONES`, `Milestone`, `milestoneCrossed` (`./staircase`), `Frequency` from `@jarso/core/allowance`, `SPARKS` from `@jarso/core/progress` (for the chip value only).
- Produces:
  ```ts
  /** Stars lit, 0..4: one per quarter mark reached; 4 only once the goal is reached. */
  export function starsLit(progress: Pick<GoalProgress, "fillRatio" | "reached">): 0 | 1 | 2 | 3 | 4;
  /**
   * The star to cheer now, or null. Null on first sight (`seen` null), when nothing new lit,
   * when stars went down (target raised, money left), and for the 4th star (goal reached has its own celebration).
   * Several new stars at once → the highest (reuses milestoneCrossed).
   */
  export function starToCheer(seen: number | null, lit: number): Milestone | null;
  /** About how many weeks to the goal at the plan: ceil(remaining × 52 / (plan × periods per year)); null without a positive plan, a frequency, or when reached. */
  export function weeksToGoal(input: { remainingMinor: number; planMinor: number | null; frequency: Frequency | null }): number | null;
  /** "₹110 to go · about 4 weeks", "₹110 to go · about 1 week", "₹110 to go"; null when reached. */
  export function toGoLine(progress: Pick<GoalProgress, "remainingMinor" | "reached">, weeks: number | null, money: (minor: number) => string): string | null;
  // goalCopy.page = {
  //   heading: "My goal", ofTarget: (saved, target) => `${saved} of ${target}`,
  //   stars: ["25%", "50%", "75%", "Got it!"], starsLabel: (lit: number) => `${lit} of 4 stars`,
  //   starTitle: (m: Milestone) => m === 0.5 ? "Halfway there!" : m === 0.25 ? "First star!" : "Almost there!",
  //   reachedTitle: "You did it!", reachedSub: (amount, name) => `${amount} saved for your ${name}`,
  //   askToBuy: (parent) => `Ask ${parent} to buy it`, keepSaving: "Keep saving", saveSome: "Save some",
  // }
  ```
  Periods per year: weekly 52, monthly 12, quarterly 4, annual 1 (so weekly equals `paymentsLeft`).

- [ ] **Step 1: Write the failing tests:**
  - `starsLit counts quarter marks` (0 → 0, 0.249 → 0, 0.25 → 1, 0.74 → 2, 0.99 → 3, reached → 4).
  - `starsLit is 4 when saved more than the target` (overshoot: fillRatio clamped 1, reached).
  - `starToCheer is silent on first sight` (`null, 2` → null).
  - `starToCheer cheers a new star` (`1, 2` → 0.5).
  - `starToCheer cheers once for the highest when the target is lowered` (`1, 3` → 0.75).
  - `starToCheer never cheers when stars go down` (`3, 1` → null) and `leaves the fourth star to the goal celebration` (`3, 4` → null).
  - `weeksToGoal weekly equals allowances to go` (compare with `goalProgress(...).paymentsLeft`).
  - `weeksToGoal monthly` (remaining 11000, plan 5000 monthly → ceil(11000·52/(5000·12)) = 10).
  - `weeksToGoal is null without a plan, a frequency, or when nothing is left`.
  - `toGoLine` exact strings (singular "week", null weeks, reached → null), with `money` producing `₹`.
  - `goal page copy stays within the word budget` (every label ≤ 3 words except the two sentences, each ≤ 8).
- [ ] **Step 2: Run them.** `pnpm --filter @jarso/core test -- tests/goals/milestones.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `milestones.ts` and the copy; barrel export.
- [ ] **Step 4: Run again,** then `pnpm --filter @jarso/core test -- tests/goals` (existing goal tests still pass) and `pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(core): goal stars and weeks to go`

### Task 4: Mobile `useBalanceHistory` moves out, `WeeklyBars`

**Files:**
- Create: `apps/mobile/src/features/jars/use-balance-history.ts` (moved verbatim from `jar-graph.tsx`; `JarGraph` imports it until Task 9 deletes the graph), `apps/mobile/src/features/jars/weekly-bars.tsx`
- Modify: `apps/mobile/src/features/jars/jar-graph.tsx` (import the hook), `apps/mobile/src/features/jars/index.ts`
- Test: `apps/mobile/tests/features/jars/weekly-bars.test.tsx`, `apps/mobile/tests/features/jars/use-balance-history.test.tsx`

**Interfaces:**
- Consumes: `weeklyTotals`, `isBestWeek`, `jarPageCopy`, `WeekTotal` (Tasks 1–2); `formatMoney`, `useTokens`, `cn` from `@/lib`; `Card` from `@/components/screen`.
- Produces:
  ```ts
  export function useBalanceHistory(jars: Jars, context: FamilyContext): { data: BalanceHistory | undefined; error: unknown };
  /** Six bars, number on top of each, week under it; the current week highlighted; "Best week!" chip. */
  export function WeeklyBars(props: { jar: Jar; totals: WeekTotal[]; currency: string }): JSX.Element;
  ```
  Bars are plain `View`s (no SVG needed): height = `|amount| / max(|amounts|, 1)` of the plot, min 3 %; positive bars gold (Save) / teal (Spend), the current one solid, earlier ones lighter; a negative bar is a muted stub with a signed label ("−₹30"). Bar labels use `formatMoney(…, { showMinor: "nonzero" })`. The group is one accessible element whose label is `jarPageCopy.barsLabel(jar, "Sep 28 ₹10, …, This week ₹70")`; the drawing is hidden from screen readers.

- [ ] **Step 1: Write the failing tests:**
  - `weekly-bars.test.tsx`:
    - `shows six bars each with its amount and week` (texts `£10`, …, `This week`).
    - `highlights this week and shows Best week when it is the best` (`testID="bar-current"`; chip `Best week!`).
    - `no Best week chip on a tie or a negative week`.
    - `a negative week is a calm stub with a minus sign` (label `−£30`; its className has no `destructive`/`red`).
    - `all zero weeks still draw six stubs, never NaN heights`.
    - `screen readers get one summary of the bars` (`getByLabelText` on the summary; bars hidden).
  - `use-balance-history.test.tsx`:
    - `counts a Monday 00:30 Kolkata purchase in the new week` (mock `listMovementsSince` with `occurredAt: "2026-11-01T19:00:00Z"`, context `{ timezone: "Asia/Kolkata", today: "2026-11-06" }`; feed `data` to `weeklyTotals` and expect it in the current week).
- [ ] **Step 2: Run them.** `pnpm --filter @jarso/mobile test -- tests/features/jars/weekly-bars.test.tsx tests/features/jars/use-balance-history.test.tsx --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.** Move the hook (keep `keys.balance` and the 90-day window: it covers the 6 weeks plus the Sunday before, at most 42 days, and `JarGraph` still shares the cache until Task 9). Build `WeeklyBars`.
- [ ] **Step 4: Run again,** plus `pnpm --filter @jarso/mobile test -- tests/features/jars --maxWorkers=2` (Home's test still green: `JarGraph` unchanged). Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): weekly bars for a jar`

### Task 5: Mobile jar page and `/(child)/jar/[jar]` route

**Files:**
- Create: `apps/mobile/src/features/jars/jar-screen.tsx`, `apps/mobile/app/(child)/jar/[jar].tsx`
- Modify: `apps/mobile/src/features/jars/index.ts`
- Test: `apps/mobile/tests/features/jars/jar-screen.test.tsx`

**Interfaces:**
- Consumes: `useHome` (jars + context), `useBalanceHistory`, `WeeklyBars` (Task 4); `useGoal` from `@/features/goals` (Save fill only; a cross-feature barrel import, goals does not import jars' screen); `useProgress`, `useParentLabel` from `@/features/progress`; `Jarso` from `@/components/brand`; `Button`, `Text` from `@/components/ui`; `weeklyTotals`, `weekLine`, `jarPageFill`, `jarPageCopy`.
- Produces:
  ```ts
  /** One jar's page: big jar + amount, six weekly bars, one sentence, the jar's two actions. */
  export function JarScreen({ jar }: { jar: Jar }): JSX.Element;
  // app/(child)/jar/[jar].tsx: reads `jar` with useLocalSearchParams; "spend" | "save" renders
  // <Stack.Screen options={{ title: jarPageCopy.title[jar] }} /> + <JarScreen jar={jar} />;
  // anything else → <Redirect href="/(child)/(tabs)" />.
  ```
  Layout (mockup J1): card with `<Jarso tint={jar} fill={jarPageFill(…)} look={progress.look} size={120} />` and the balance in `text-money-l` (gold-text for Save) with the caption ("Cash you have" / "Mum keeps it safe" via `useParentLabel()`); the bars card with `jarPageCopy.barsHeading[jar]`; a small `<Jarso mood="cheer" size={50} />` beside one bubble with `weekLine(...)` (mood `happy` for Spend and for a negative Save week); two keycaps (`keycap-gold` + `keycap-white` for Save, `keycap` + `keycap-white` for Spend) that `router.push` the hrefs from `jarPageCopy.actions[jar]`. Loading: `ActivityIndicator`; jars failing: the calm retry pattern `GoalScreen` uses (`toUserMessage`). History loading or failed: no bars card and no sentence; jar and actions still show.

- [ ] **Step 1: Write the failing tests** (mocks as in `goals.test.tsx`: `@jarso/data/ledger` `getJars` + `listMovementsSince`, `@jarso/data/family`, `@jarso/data/requests`, `@jarso/data/goals`, `@jarso/data/progress`, `expo-router`):
  - `save page shows the big jar, the amount and who keeps it` (`£20`, `Mum keeps it safe` when the label is "Mum"; `Your parent keeps it safe` on fallback).
  - `save page shows six weekly bars and the week line` (`Saved each week`, `£50 more than last week!`).
  - `save actions open Save some and Use savings` (`push("/(child)/put-in")`, `push("/(child)/take-out")`).
  - `spend page uses teal, neutral words and its own actions` (`Each week`, `I bought something` → `/(child)/purchase`, `I got money` → `/(child)/received`; no text ending in `!` from the week line).
  - `bars hide while history fails, the jar and actions stay`.
  - `a calm retry when the jars can't load` (never a raw error).
  - `route redirects an unknown jar` (render the route file with `jar: "piggy"` → `Redirect` to `/(child)/(tabs)`).
- [ ] **Step 2: Run them.** `pnpm --filter @jarso/mobile test -- tests/features/jars/jar-screen.test.tsx --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement** `JarScreen` and the route. Do not touch `(child)/_layout.tsx`: expo-router serves the file route already; Task 9 registers its header in PAGES.
- [ ] **Step 4: Run again,** plus `pnpm --filter @jarso/mobile typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): jar pages for Spend and Save`

### Task 6: Mobile goal ring, stars and goal moments

**Files:**
- Create: `apps/mobile/src/features/goals/goal-ring.tsx`, `apps/mobile/src/features/goals/milestone-stars.tsx`, `apps/mobile/src/features/goals/use-goal-moments.ts`
- Modify: `apps/mobile/src/features/goals/use-goal.ts` (add `useSavingPace`), `apps/mobile/src/features/goals/use-goal-mutations.ts` (`useMarkCelebrated` also writes `celebratedAt` into the cached goal so a second mount never re-celebrates), `apps/mobile/src/features/goals/index.ts`
- Test: `apps/mobile/tests/features/goals/goal-ring.test.tsx`, `apps/mobile/tests/features/goals/use-goal-moments.test.tsx`

**Interfaces:**
- Consumes: `starsLit`, `starToCheer`, `weeksToGoal`, `goalCopy.page` (Task 3); `SPARKS`, `BADGES` from `@jarso/core/progress`; `useCelebrate` from `@/components/celebrate`; `useProgress`, `useParentLabel` from `@/features/progress`; `findLatestSchedule` (same `keys.schedule` cache as `useAllowance`); AsyncStorage.
- Produces:
  ```ts
  /** The item's emoji in a gold progress ring (react-native-svg circle, strokeDasharray). */
  export function GoalRing(props: { emoji: string; value: number; size?: number; label?: string }): JSX.Element;
  // with `label` it is a progressbar (accessibilityValue {min 0, max 100, now}); without, decorative.
  export function MilestoneStars(props: { lit: number }): JSX.Element; // 3 stars + trophy, lit gold; a11y "2 of 4 stars"
  /** The goal's allowance pace for "about N weeks": the running schedule's frequency, or null. */
  export function useSavingPace(): { frequency: Frequency | null };
  /**
   * Fires the goal's moments once: a star cheer (sheet celebration, "+25" Sparks chip) when a new
   * quarter lights, and the full reached celebration (gold, Jarso cheering, "+100" and "Goal Getter"
   * chips, primary "Ask Mum to buy it" → /(child)/take-out, secondary "Keep saving"), then marks it celebrated.
   */
  export function useGoalMoments(view: GoalView, currency: string): void;
  ```
  Seen stars are stored per goal under `jarso.goalStars.<goalId>` (AsyncStorage, only ever raised). A module-level in-flight set keyed by goal id stops `GoalCard` and `GoalScreen` mounted together from cheering twice. Reached: `goal.reachedAt && !goal.celebratedAt`. Storage failure is logged with `logger.warn` and treated as "first sight" (no cheer, never a throw).

- [ ] **Step 1: Write the failing tests:**
  - `goal-ring.test.tsx`:
    - `ring with a label is a progressbar at the right value` (0.756 → now 76).
    - `ring clamps overshoot to 100`.
    - `ring without a label is hidden from screen readers`.
    - `stars light up to the count and the trophy lights at 4` (testIDs `star-1…3`, `trophy`; `accessibilityLabel` `2 of 4 stars`).
    - `stars appear without animation under reduced motion` (mock `useReducedMotion` → true; no `entering` prop).
  - `use-goal-moments.test.tsx` (render a probe component inside a test `CelebrationProvider`-free context: mock `@/components/celebrate` `useCelebrate` → `jest.fn()`):
    - `first sight stores the stars and does not cheer`.
    - `a new star cheers once with a Sparks chip` (stored 1, fill 0.5 → `celebrate` called once, chip `+25`, `sheet: true`).
    - `lowering the target cheers once for the highest star`.
    - `stars going down never cheer and never lower the stored count`.
    - `reached goal celebrates once, then marks it celebrated` (`callMarkCelebrated` once; rerender → no second celebration; primary label `Ask Mum to buy it`; its `onPress` pushes `/(child)/take-out`).
    - `an already celebrated goal does not celebrate`.
    - `storage that fails never throws and never cheers`.
    - `useSavingPace is null for a stopped schedule`.
- [ ] **Step 2: Run them.** `pnpm --filter @jarso/mobile test -- tests/features/goals/goal-ring.test.tsx tests/features/goals/use-goal-moments.test.tsx --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.** AsyncStorage is already mocked in `tests/setup.ts` (the official jest mock); clear it in `beforeEach`.
- [ ] **Step 4: Run again,** plus `pnpm --filter @jarso/mobile test -- tests/features/goals --maxWorkers=2` (the "reached goal marks celebrated once" test for `HomeStepCard` must stay green). Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): goal ring, stars and goal moments`

### Task 7: Mobile goal page and `GoalCard` restyle

**Files:**
- Modify: `apps/mobile/src/features/goals/goal-screen.tsx`, `apps/mobile/src/features/goals/goal-card.tsx`, `apps/mobile/src/features/goals/index.ts`, `apps/mobile/app/(child)/goal.tsx` (title "My goal" via `Stack.Screen` options), `apps/mobile/app/(child)/goal-sheet.tsx` (only if the close target changes; otherwise untouched)
- Delete: `apps/mobile/src/features/goals/goal-staircase.tsx` (only `GoalScreen` uses it; core `staircaseFor` stays for the web)
- Test: `apps/mobile/tests/features/goals/goals.test.tsx` (update), `apps/mobile/tests/features/goals/goal-screen.test.tsx` (new)

**Interfaces:**
- Consumes: Task 3 core, Task 6 components and hooks.
- Produces:
  - `GoalCard({ currency }: { currency: string })` (props unchanged, contract): a small decorative `GoalRing` (size 64) with the emoji, the name, `goalCopy.card.ofTarget`, the gold `ProgressBar` (stays the card's one progressbar, same a11y label) and `toGoLine(progress, null, money)` ("£25 to go"), or `goalCopy.page.reachedTitle` when reached; the whole card links to `/(child)/goal` ("See it" stays as the link label). No goal: unchanged invitation. Calls `useGoalMoments`.
  - `GoalScreen()`: mockup J2. Big `GoalRing` (size 200, labelled) with the emoji, the name (`text-h1`), "₹340 of ₹450", `MilestoneStars`, the gold chip with `toGoLine(progress, weeksToGoal({...}), money)`, and a `keycap-gold` "Save some" → `/(child)/put-in`; the pencil/“Change my goal” stays (`GoalSheetButton`). Reached: the ring full, all stars, and "Ask Mum to buy it" in place of "Save some". Calls `useGoalMoments`.

- [ ] **Step 1: Update and add the failing tests:**
  - `goals.test.tsx`: `shows the goal with a gold bar and what is left` now expects `£25 to go` instead of `About 5 allowances to go`; `reached fills the bar` expects `You did it!`; add `card has a decorative ring and still one progressbar`.
  - `goal-screen.test.tsx`:
    - `shows the ring, the item and how much of it is saved` (progressbar now 44, `⚽`, `Football boots`, `£20 of £45`).
    - `lights two stars at 50 percent`.
    - `says what is left and about how many weeks` (weekly schedule plan 500 → `£25 to go · about 5 weeks`; monthly → its weeks).
    - `without a plan says only what is left` (`£25 to go`).
    - `Save some opens put-in`.
    - `reached goal shows Ask Mum to buy it and celebrates once` (mock `useCelebrate`).
    - `overshoot shows no negative amount and no to-go line`.
    - `no goal shows the invitation`.
- [ ] **Step 2: Run them.** `pnpm --filter @jarso/mobile test -- tests/features/goals --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement** the two screens; delete `goal-staircase.tsx` and its barrel line; `grep -rn "GoalStaircase" apps/mobile` returns nothing.
- [ ] **Step 4: Run again,** plus `pnpm --filter @jarso/mobile test -- tests/features/goals tests/features/jars tests/features/requests --maxWorkers=2` (predict step in take-out still works) and `pnpm --filter @jarso/mobile typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): goal page with ring and stars`

### Task 8: Full verify

**Files:** none new (fixes only, inside this plan's ownership).

- [ ] **Step 1:** `pnpm check` (lint + typecheck + all unit tests). This is the plan's one full run.
- [ ] **Step 2:** Fix anything red inside owned files. If a failure is in a file owned by plan 3 or 5, do not edit it; note it for Task 9.
- [ ] **Step 3:** `grep -rn "graphCaption\|JarGraph" apps/mobile/src apps/mobile/app` lists only `features/jars/jar-graph.tsx`, its barrel line and Home (plan 3 removes Home's use).
- [ ] **Step 4: Commit** only if Step 2 changed something: `fix(mobile): green check for jar and goal pages`.

### Task 9: Integration (after rebase onto `feat/mobile-kid-home`)

Run only after the controller rebases this branch onto plan 3's branch. This is the only task that edits plan 3's files.

**Files:**
- Modify: `apps/mobile/app/(child)/_layout.tsx` (PAGES: add `{ name: "jar/[jar]", title: "Jar" }`; the route sets its own title), Home's tiles in `apps/mobile/src/features/home/**` (where plan 3 renders `JarTile`: pass `onPress={() => router.push("/(child)/jar/spend")}` and `…/save`)
- Delete: `apps/mobile/src/features/jars/jar-graph.tsx` and its barrel line, once `grep -rn "JarGraph" apps/mobile` shows no other user (the parent app does not use it today; re-check). Also `JarsCard` if plan 3's Home no longer imports it.
- Modify (only if plan 3 exported the money-action names from core): `packages/core/src/ledger/copy.ts` `jarPageCopy.actions` labels → plan 3's constants.
- Test: `apps/mobile/tests/features/home/*` (plan 3's Home tests: add `Spend tile opens the Spend jar page`, `Save tile opens the Save jar page`), `apps/mobile/tests/app/*` (layout test, if plan 3 has one listing PAGES)

**Interfaces:**
- Consumes: `JarTile` from `@/features/home` with `onPress?: () => void` (contract).
- Produces: Home → jar page navigation; the child app has no line graph.

- [ ] **Step 1: Write the failing tests** in plan 3's Home test file: `Spend tile opens the Spend jar page` (press tile labelled Spend → `push("/(child)/jar/spend")`), `Save tile opens the Save jar page`.
- [ ] **Step 2: Run them.** `pnpm --filter @jarso/mobile test -- tests/features/home --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Wire it.** Register PAGES, pass `onPress`, delete `jar-graph.tsx` (and `JarsCard` if unused), drop any child-app `JarGraph` import left over; keep `useBalanceHistory` (now its own file).
- [ ] **Step 4: Re-run targeted tests:** `pnpm --filter @jarso/mobile test -- tests/features/home tests/features/jars tests/features/goals tests/app --maxWorkers=2`, then `pnpm --filter @jarso/mobile typecheck` and `pnpm lint`. Expected: PASS. `grep -rn "JarGraph\|jar-graph" apps/mobile` returns nothing.
- [ ] **Step 5: Commit.** `feat(mobile): open jar pages from the Home tiles`
