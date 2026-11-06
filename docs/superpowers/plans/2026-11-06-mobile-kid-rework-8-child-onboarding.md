# Mobile Kid Rework, Plan 8: Child onboarding (practice coins, goal pick, make Jarso yours, replay from Me) Implementation Plan

> **Status: built, not committed** on `feat/mobile-kid-rework-6-8-10` (built alongside plans 6 and 10 in the same tree). Commit steps record the intended split; nothing is committed until the user says so.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A first-open intro for the child on the phone, about 2 minutes, skippable, replayable from Me, that teaches the jars by doing them:

- meet Jarso
- "This is Spend": tap a snack, the PRACTICE ₹100 ticks down to ₹80
- "This is Save": drag a coin into Save; it says once that for real you hand the cash to your parent
- pick a real goal (saved through the existing `save_goal`), with "about N weeks"
- make Jarso yours (plan 6's `LookPicker`)
- a celebration: the first badge (Jar Starter) and +50 Sparks, awarded by the server once for life

**Architecture:** Pure rules and every word go in a new core module `packages/core/src/onboarding` (steps, the practice jars, the suggested plan for the weeks line, the gate decision, the reward schema and the copy) with Vitest tests. A new migration adds `complete_child_onboarding()`, a child-only `security definer` function that marks the tour finished (`child_tours.finished_at`, the row the web tour already uses) and pays the welcome reward once (a `spark_events` row with `source_key = 'welcome'` and the `jar_starter` badge). `@jarso/data/tour` gets `completeOnboarding(db)`. The phone gets a feature module `apps/mobile/src/features/onboarding` (data hooks, a per-user AsyncStorage cache of "done", the step screens, `OnboardingFlow`, `OnboardingGate`, `OnboardingScreen`) and a route `app/(child)/onboarding.tsx` for the replay. The gate wraps the child `Stack` in `app/(child)/_layout.tsx`, so on a first open the intro renders *instead of* the tabs (Home never mounts, so the daily check-in prompt cannot race it).

**Tech Stack:** Expo 58, React Native 0.88, NativeWind 4, react-native-svg 15, Reanimated 4.7 (`useReducedMotion`), React Native `PanResponder` + `Animated` (the coin drag; no new dependency), expo-haptics, `playSound`, TanStack Query 5, AsyncStorage, Jest + RNTL (mobile), Vitest (core, data), pgTAP (CI only).

**Spec:** `docs/superpowers/specs/2026-11-06-mobile-kid-rework-design.md` ("Onboarding → Child", "Fun loop", "Data and backend implications"). Mockup: `docs/superpowers/specs/mockups/2026-11-06-mobile-kid-rework.html` section 2 (C1–C7).

## Roadmap (this is plan 8 of 10)

1. Foundation (merged). 2. Progress backend (merged). 3. Child shell and Home (merged). 4. Jar pages and goal (merged). 5. Learn and the daily check-in (merged). 6. Diary, Jarso tab, Me, bell, level-up (in progress, same tree). 7. Allowance split. **8. Child onboarding** (this plan). 9. Parent sign-up and onboarding on the phone. 10. Parent restyle (in progress, same tree).

## Decisions

1. **Gating comes from the server, cached on the phone.** The intro shows when the child's `child_tours.finished_at` is null, the same row the web welcome tour (#138) reads, so a child is welcomed once, on whichever device comes first, and a skip on the phone also stops the web tour. A per-user AsyncStorage flag `jarso-onboarded:<userId>` caches "done" so a returning child's cold start needs no network read before the tabs. If the tour can't be read (offline, an error), the intro is skipped for this run: the app must never be blocked by its own welcome. Rejected: device-only gating (a child would get the intro again on every new phone, and the web tour would still show after the phone intro).
   - Consequence, accepted: children who already finished or skipped the web tour don't see the phone intro on their own. They can open it from Me ("Replay the intro").
2. **Step 1 (sign in) stays the existing PIN form.** QR sign-in needs the parent's QR (plan 9, P7) and a camera module (`expo-camera`, a native rebuild). Without a QR to scan it can't be built or tested here, so it moves to plan 9 together with the PIN pad restyle. The intro starts once the child is signed in.
3. **No voice yet, so no mute button.** The spec's spoken line needs `expo-speech` (or recordings), which is a new native module and a dev-build rebuild; plan 1 shipped only short effect clips. The intro plays the existing `coin` and `cheer` clips (the Me sound switch mutes them). Voice is listed in Open issues for a later plan.
4. **The reward needs a migration.** No existing function pays a one-off reward: `progress_award` only takes the six habit kinds, and no badge fits a finished intro. The new `complete_child_onboarding()` writes `spark_events` and `child_badges` directly under `progress_lock`, rather than redefining the 120-line `progress_award` (which plan 7's migration may also touch). It is idempotent by the `(child_id, source_key)` unique key. This project uses hosted Supabase without Docker: the migration and its pgTAP test are written here and run in PR CI; nothing is pushed. Types are added by hand in exactly the shape `supabase gen types` emits for a no-argument jsonb function (`complete_mission` is the template).
5. **The phone keeps working before the migration is live.** If `complete_child_onboarding` fails (not deployed yet, offline), the phone falls back to `save_welcome_tour(null, true)` and celebrates without the reward chips. Chips show only what the server says it paid; a replay pays nothing and shows no chips.
6. **Practice money is its own type.** `PracticeJars` carries `mode: "practice"` and lives only in React state; no practice value is ever passed to a data function. The PRACTICE tag is on every practice screen. Real money only appears in the goal step (the real Save balance for "about N weeks").
7. **The goal is real.** It goes through `useSaveGoal()` (`save_goal`), so the server checks the plan against the allowance as it does in the goal sheet. If the child already has a goal, the step shows it with "Keep my goal" and never replaces it. The plan for the weeks line is `suggestedPlan(allowance)`: a quarter of the allowance rounded down to a whole unit (at least 1), shown to the child as "With ₹30 a week", changeable later in the goal sheet. Without a running allowance there is no plan and no weeks line. When plan 7 ships the Save split, `suggestedPlan` becomes the split.

## Global Constraints

- **Never commit until the user says so** (lessons, memory). The "Commit" steps record the intended split: one focused Conventional Commit per task, subject ≤ 60 chars, no AI attribution.
- **No Docker, no `supabase db reset`, no `db push`, nothing against the linked project.** The migration is written and reviewed; pgTAP runs in CI.
- **Shared working tree.** Plans 6 and 10 are being built in this tree at the same time. Edit only: `packages/core/src/onboarding/**` (new), one line in `packages/core/package.json` exports, `packages/core/src/progress/badges.ts` (one badge appended) and its count test, `packages/data/src/tour/repository.ts` (one function appended), the new migration and pgTAP file, the one function entry in `packages/db/src/database.types.ts`, `apps/mobile/src/features/onboarding/**` (new), `apps/mobile/app/(child)/onboarding.tsx` (new), one key in `apps/mobile/src/lib/query.ts`, the gate wrap in `apps/mobile/app/(child)/_layout.tsx`, the one replay row on Me (Task 8, last), their tests and the docs. Shared files: small additive edits with Edit after re-reading, never Write. Plan 10 owns `app/(parent)/**` and `src/features/{parent,family}`; plan 6 owns Me and `src/features/progress/look-picker.tsx`.
- **Verification is scoped:** `pnpm --filter @jarso/mobile test -- <paths>`, `pnpm --filter @jarso/core test`, `pnpm --filter @jarso/data test`, `pnpm --filter @jarso/mobile typecheck`, `pnpm exec biome check <files>`. A full `pnpm check` runs once at the end; failures in other plans' files are reported, not fixed.
- CLAUDE.md hard rules: core and data purity (rule 18), barrels, money in integer minor units, practice and recorded money never mix (rule 14), Biome only, child copy rules. **Word budget:** labels 1–3 words, Jarso's bubble ≤ 8 words, headings ≤ 6 words, no paragraphs. Jarso is never sad.
- **Reduced motion:** no ticking (the amount jumps), no bounce; the coin can still be tapped. **Accessibility:** every drag has a tap alternative (the coin is a button), the PRACTICE tag has a spoken label, every step heading is a `header`.
- `useParentLabel()` names the parent ("Mum", else "your parent"). The real-world line is said once, on the Save step.

## Review Focus

1. **Practice never reaches the ledger.** No practice amount is passed to `@jarso/data` (a source-grep test over `features/onboarding` for `recordPurchase|createRequest|outbox|enqueue`), and `PracticeJars` can't go below 0 or move more than Spend holds (Task 1 tests).
2. **A replay or a double tap pays once.** `complete_child_onboarding` pays 50 only on the first call for life (pgTAP); the phone's Done button ignores a second tap; a replay celebrates with no chips (Task 3, Task 6 tests).
3. **Offline or the function missing.** Finish falls back to `save_welcome_tour`, then to nothing; the child still lands on Home with a celebration, and the local flag stops the intro next time (Task 3 tests).
4. **The gate never blocks.** Tour read fails → tabs show. Local flag set → tabs with no network read. Server says finished → flag is written (Task 3, Task 7 tests).
5. **An existing goal is never replaced** (Task 5 test), and a refused plan (`plan_over_allowance`) shows the plan's own line and lets the child skip (Task 5 test).

---

### Task 1: Core onboarding module (steps, practice jars, plan, gate, reward, copy) and the Jar Starter badge

**Files:**
- Create: `packages/core/src/onboarding/{index,steps,practice,gate,reward,copy}.ts`
- Modify: `packages/core/package.json` (exports: `"./onboarding": "./src/onboarding/index.ts"`)
- Modify: `packages/core/src/progress/badges.ts` (append `jar_starter` to `BADGE_KEYS`; `BADGES.jar_starter = { name: "Jar Starter", how: "Finish your Jarso intro", icon: "sparkles" }`), `packages/core/tests/progress/badges.test.ts` (count 23 → 24)
- Test: `packages/core/tests/onboarding/onboarding.test.ts`

**Interfaces:**
```ts
// steps.ts
export const ONBOARDING_STEPS = ["meet", "spend", "save", "goal", "look"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
/** The step after `step`, or null after the last (then the flow finishes). */
export function nextStep(step: OnboardingStep): OnboardingStep | null;
/** 1-based position for the dots. */
export function stepNumber(step: OnboardingStep): number;
/** Steps that use practice money and show the PRACTICE tag. */
export function isPracticeStep(step: OnboardingStep): boolean; // spend, save

// practice.ts — never real money; lives in UI state only
export type PracticeJars = { mode: "practice"; spendMinor: number; saveMinor: number };
export function practiceAmounts(currency: string): { startMinor: number; snackMinor: number; coinMinor: number }; // 100, 20, 10 major units (minorDigits)
export function startPractice(currency: string): PracticeJars;          // spend = start, save = 0
export function practiceBuy(jars: PracticeJars, priceMinor: number): PracticeJars; // unchanged if price > spend or price <= 0
export function practiceSave(jars: PracticeJars, coinMinor: number): PracticeJars; // moves min(coin, spend); unchanged at 0
export function practiceFill(jars: PracticeJars): number;                // save / (spend + save), 0 when both 0

/** A quarter of the allowance, rounded down to a whole unit, at least one unit; null without one. */
export function suggestedPlan(allowanceMinor: number | null, currency: string): number | null;

// gate.ts
export type OnboardingGate = "wait" | "show" | "skip";
export function onboardingGate(input: {
  localDone: boolean | null;                       // null while AsyncStorage is read
  tour: { finishedAt: string | null } | "loading" | "error";
}): OnboardingGate;  // localDone null → wait; true → skip; tour loading → wait; error → skip; finishedAt → skip; else show

// reward.ts — mirrored by complete_child_onboarding SQL; keep in sync
export const ONBOARDING_REWARD = { sparks: 50, badge: "jar_starter" } as const;
export const onboardingRewardSchema: z.ZodType<{ sparks: number; badge: BadgeKey | null }>; // unknown badge → null
export type OnboardingReward = { sparks: number; badge: BadgeKey | null };

// copy.ts
export const ONBOARDING_GOALS: readonly { emoji: GoalEmoji; name: string }[]; // 🎮 Game, ⚽ Boots, 🎧 Headphones, 📚 Books, 🚲 Bike, 🎁 A gift
export const onboardingCopy: {
  practiceTag: "PRACTICE"; practiceLabel: "Practice money, not real";
  skip: "Skip"; next: "Next"; stepLabel: (n: number, total: number) => string;
  meet: { hello: (name: string | null) => string; heading: "I help your money grow. Ready?"; go: "Let's go!" };
  spend: { heading: "This is Spend"; sub: "Money in your pocket."; caption: "In your pocket";
           ask: (price: string) => string; snack: (price: string) => string; hint: "Tap the snack"; done: "Written down. Jar stays true!" };
  save: { heading: "This is Save"; sub: (parent: string) => string; ask: "Drag a coin into Save!";
          coin: "Move a coin to Save"; done: "Save is growing!"; realWorld: (parent: string) => string;
          spendLabel: (amount: string) => string; saveLabel: (amount: string) => string };
  goal: { heading: "Save for something"; sub: "Pick one. You can change it."; costLabel: "It costs about";
          plan: (amount: string, frequency: Frequency) => string; weeks: (n: number) => string;
          submit: "Set my goal"; notNow: "Not now"; keep: "Keep my goal"; yours: "Your goal" };
  look: { heading: "Make Jarso yours"; done: "Done!" };
  done: { title: "You're in!"; sparks: (n: number) => string; badge: "First badge"; go: "See my jars" }; // the mockup's "Go to my jars" is 4 words
  replay: "Replay the intro";
};
```
`sub(parent)` and `realWorld(parent)` capitalise the first letter of a sentence ("Your parent keeps it safe for you.", "For real, you hand the cash to Mum."). `plan` reads "With ₹30 a week" (`weekly` → week, `monthly` → month, `quarterly` → quarter, `annual` → year). `weeks(1)` = "About 1 week", `weeks(15)` = "About 15 weeks".

- [x] **Step 1: Write the failing tests** in `onboarding.test.ts`:
  - `steps run meet, spend, save, goal, look and then finish` (`nextStep("look") === null`, `stepNumber("goal") === 4`)
  - `only spend and save are practice steps`
  - `practice starts at 100 in Spend and nothing in Save` (INR: `{ mode: "practice", spendMinor: 10000, saveMinor: 0 }`; JPY: `spendMinor: 100`)
  - `buying the snack takes 20 off Spend` (10000 → 8000)
  - `practice never goes below zero` (`practiceBuy` with price > spend is unchanged; `practiceSave` at spend 0 is unchanged; a coin of 10 with spend 5 moves 5)
  - `a coin moves from Spend to Save and the total stays the same`
  - `practice jars are marked practice` (`startPractice("INR").mode === "practice"`)
  - `practiceFill is 0 when empty and save over the total otherwise`
  - `suggested plan is a quarter of the allowance in whole units` (12000 INR → 3000; 1000 → 200 is 250 floored to 200; 50 → 100 at least one unit; null → null; 0 → null)
  - `gate`: `waits while the local flag is read`, `skips when done on this phone`, `waits while the tour loads`, `skips when the tour can't be read`, `skips when finished`, `shows when not finished`
  - `reward schema keeps a known badge and drops an unknown one` (`{ sparks: 50, badge: "jar_starter" }` passes; `badge: "nope"` → `null`; `sparks: -1` fails)
  - `copy stays inside the word budget`: every label ≤ 3 words (`practiceTag`, `skip`, `next`, `meet.go`, `spend.hint`, `goal.submit`, `goal.notNow`, `goal.keep`, `look.done`, `done.badge`, `done.go`, `replay`); every bubble ≤ 8 words (`meet.hello("Sam")`, `spend.ask("₹20")`, `spend.done`, `save.ask`, `save.done`); headings ≤ 6 words; no string contains `lost|fail|wrong|sad`
  - `the real-world line names the parent and starts with a capital` (`realWorld("Mum")` = "For real, you hand the cash to Mum."; `save.sub("your parent")` starts with "Your")
  - `goal presets use goal emoji` (each `emoji` is in `GOAL_EMOJI`)
  - In `badges.test.ts`: count 24.
- [x] **Step 2: Run them.** `pnpm --filter @jarso/core test -- tests/onboarding tests/progress/badges.test.ts`. Expected: FAIL (module missing, count 23).
- [x] **Step 3: Implement** the six files (relative imports inside core: `../lib` for `minorDigits`, `../goals` for `GOAL_EMOJI`, `../progress` for `BADGE_KEYS`, `../allowance` type `Frequency`), the barrel, the export line and the badge.
- [x] **Step 4: Run again plus purity.** `pnpm --filter @jarso/core test && pnpm exec biome check packages/core/src/onboarding packages/core/tests/onboarding`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(core): child onboarding steps, practice jars and copy`

### Task 2: `complete_child_onboarding()` migration, pgTAP, types and the data function

**Files:**
- Create: `supabase/migrations/20261106150000_child_onboarding.sql`
- Create: `supabase/tests/database/child_onboarding.test.sql`
- Modify: `packages/db/src/database.types.ts` (one `Functions` entry, by hand: `"complete_child_onboarding": { Args: Record<PropertyKey, never>; Returns: Json }`, after `complete_checkin`)
- Modify: `packages/data/src/tour/repository.ts` (append `completeOnboarding`)
- Test: `packages/data/tests/tour/repository.test.ts`

**Migration:**
```sql
-- spark_events gains the one-off 'welcome' kind (the finished intro). Only complete_child_onboarding writes it.
alter table public.spark_events drop constraint spark_events_kind_check;
alter table public.spark_events add constraint spark_events_kind_check
  check (kind in ('log', 'checkin', 'step', 'save', 'goal_milestone', 'goal_reached', 'welcome'));

create or replace function public.complete_child_onboarding()
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$ … $$;
```
Body, in order (lock order: the tour row first, `progress_lock` last, as docs/database.md requires):
1. `v_uid := (select auth.uid())`; the approved child's `family_id` from `family_members`, else `raise exception using errcode = 'JA403', message = 'Not allowed'`.
2. Upsert `child_tours (child_id, family_id, finished_at = now())`, keeping `buddy` (same as `save_welcome_tour(null, true)`).
3. `v_row := public.progress_lock(v_uid)`; null → `JA403`.
4. `v_day := public.family_today(v_row.family_id)`; insert `spark_events (child_id, family_id, kind 'welcome', amount 50, source_key 'welcome', day)` `on conflict (child_id, source_key) do nothing`; `get diagnostics v_paid = row_count`.
5. If paid: `update child_progress set sparks = sparks + 50, level = greatest(level, public.progress_level(sparks + 50))`.
6. Insert `child_badges (child_id, family_id, 'jar_starter')` `on conflict do nothing`; `get diagnostics v_badge = row_count`; then `perform public.progress_check_badges(v_uid, v_day)` (a level badge may follow).
7. Return `jsonb_build_object('sparks', case when v_paid > 0 then 50 else 0 end, 'badge', case when v_badge > 0 then 'jar_starter' end)`.
Comment the function and the badge table's new writer; `revoke execute … from public, anon; grant execute … to authenticated`. It does not mark the day active (an intro is not a habit) and writes nothing to `ledger_entries`.

**pgTAP (`plan(9)`):** a parent gets `JA403`; a child's first call returns `{"sparks": 50, "badge": "jar_starter"}`; `child_progress.sparks` is 50; the tour row has `finished_at`; a second call returns `{"sparks": 0, "badge": null}` and sparks stay 50; a buddy picked earlier is kept; a sibling's progress is untouched; no `ledger_entries` row for the child; anon gets `42501`.

**Data:**
```ts
/** Finishes the child's intro: the tour is done and the welcome reward is paid once. */
export async function completeOnboarding(db: Client): Promise<OnboardingReward>;
// rpc("complete_child_onboarding"); error → toAppError(error, "Failed to finish the intro"); result parsed with onboardingRewardSchema, else AppError("INTERNAL", …)
```

- [x] **Step 1: Write the failing data tests** (`fakeClient` from `../fake-client`): `completeOnboarding calls the function and returns what it paid`; `a replay returns no sparks and no badge`; `a database error becomes an AppError`; `a malformed result is INTERNAL`. Also `findTour reads the row` and `saveTour sends null for a missing buddy` (the module had no tests).
- [x] **Step 2: Run.** `pnpm --filter @jarso/data test -- tests/tour`. Expected: FAIL.
- [x] **Step 3: Write the migration, the pgTAP file, the type entry and the function.** Check the newest migration timestamp first (`ls supabase/migrations | tail -3`) so this one sorts last.
- [x] **Step 4: Run.** `pnpm --filter @jarso/data test && pnpm --filter @jarso/data typecheck`. Expected: PASS. pgTAP is not run here (no Docker); it runs in PR CI (`pnpm db:test`).
- [ ] **Step 5: Commit.** `feat(db): complete_child_onboarding pays the welcome once`

### Task 3: Phone data hooks: gate, finish, skip

**Files:**
- Create: `apps/mobile/src/features/onboarding/{index,local-done,use-onboarding}.ts`
- Modify: `apps/mobile/src/lib/query.ts` (key `tour: (userId) => ["tour", userId] as const`)
- Test: `apps/mobile/tests/features/onboarding/use-onboarding.test.tsx`

**Interfaces:**
```ts
// local-done.ts — AsyncStorage `jarso-onboarded:<userId>`
export async function readOnboarded(userId: string): Promise<boolean>; // false on a storage error
export async function writeOnboarded(userId: string): Promise<void>;  // logs, never throws
// use-onboarding.ts
export function useOnboardingGate(userId: string | undefined): OnboardingGate;
export function useFinishOnboarding(): { finish: () => Promise<OnboardingReward>; pending: boolean };
export function useSkipOnboarding(): () => Promise<void>;
```
- `useOnboardingGate`: reads the flag once per user; queries `findTour` (key `keys.tour`, only while the flag is false); maps to core's `onboardingGate`; a finished tour writes the flag. No user → `"skip"`.
- `finish()`: `completeOnboarding`; on any error `logger.warn("onboarding finish failed", { code })` then `saveTour({ finished: true })` (its error only logged) and `{ sparks: 0, badge: null }`. Always writes the flag; invalidates `keys.progress` and `keys.tour`. Never throws. A second call while one runs returns the same promise.
- `skip()`: `saveTour({ finished: true })` (error logged), writes the flag, invalidates `keys.tour`. Never throws.

- [x] **Step 1: Write the failing tests** (mock `@jarso/data/tour`, `@/lib/supabase/client`, `useSession`): `shows the intro when the tour is not finished`; `skips when the phone already knows it is done, without reading the tour` (`findTour` not called); `skips and remembers when the server says finished`; `skips when the tour can't be read`; `finish returns what the server paid and remembers it`; `finish falls back to save_welcome_tour when the new function fails` (`completeOnboarding` rejects → `saveTour` called with `{ finished: true }`, result `{ sparks: 0, badge: null }`, flag written); `finish never throws when both fail`; `finish twice at once calls the server once`; `skip saves finished and remembers it`.
- [x] **Step 2: Run.** `pnpm --filter @jarso/mobile test -- tests/features/onboarding/use-onboarding.test.tsx`. Expected: FAIL.
- [x] **Step 3: Implement**, with the barrel (`export * from "./use-onboarding"`; screens are added later; `local-done` stays internal).
- [x] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): onboarding gate, finish and skip hooks`

### Task 4: Frame, Meet, Spend and Save steps

**Files:**
- Create: `apps/mobile/src/features/onboarding/{onboarding-frame,meet-step,spend-step,save-step,use-ticker}.tsx`
- Test: `apps/mobile/tests/features/onboarding/steps.test.tsx`

**Interfaces:**
```ts
export function OnboardingFrame(props: {
  step: OnboardingStep; onSkip: () => void; tone?: "page" | "teal"; footer?: ReactNode; children: ReactNode;
}): JSX.Element; // safe area; top row: dots (accessible "Step n of 5") and Skip (ghost); PRACTICE pill (accessibilityLabel practiceLabel) on practice steps; scrolling body; pinned footer
export function MeetStep(props: { name: string | null; onNext: () => void; onSkip: () => void }): JSX.Element;
export function SpendStep(props: { currency: string; onNext: (jars: PracticeJars) => void; onSkip: () => void }): JSX.Element;
export function SaveStep(props: { currency: string; start: PracticeJars; parent: string; onNext: () => void; onSkip: () => void }): JSX.Element;
/** Counts from the old value to the new one in 8 ticks over 400 ms; jumps under reduced motion. */
export function useTicker(value: number): number;
```
- Meet: teal page, bubble `meet.hello(name)`, `<Jarso mood="wave" size={200} bounce />`, heading, `keycap-gold` `xl` "Let's go!".
- Spend: heading + sub; a solid teal tile (`bg-teal-700`, radius 24) with the wallet icon, `formatMoney(useTicker(spend))` in `text-money-xl`, caption; Jarso + bubble `spend.ask(price)`; the snack tile (cookie icon, `spend.snack(price)`, `accessibilityRole="button"`, gold ring). Tap: `practiceBuy`, `playSound("coin")`, selection haptic, bubble becomes `spend.done`, the tile disables, footer shows `keycap` Next. Before the tap the footer shows the hint.
- Save: two Jarsos side by side (Spend `tint="spend"`, Save with `fill={practiceFill}` and mood `wow` after the first coin), labels `spendLabel`/`saveLabel`; a gold coin between them that is a `PanResponder` drag (released more than 60 dp to the right counts) and also a button named `save.coin`; each move is `practiceSave(coinMinor)`, `playSound("coin")`. Bubble `save.ask`, then `save.done`. The real-world card (`bg-gold-50`, hand-coins icon, `realWorld(parent)`) is always shown. Next appears after the first coin.

- [x] **Step 1: Write the failing tests:**
  - `meet says hi by name and Let's go moves on`; `meet without a name still says hi`
  - `spend shows PRACTICE and 100` (`getByLabelText(practiceLabel)`, text `₹100.00`-style per `formatMoney`)
  - `tapping the snack takes 20 off and plays the coin` (after `act` + fake timers, `₹80`; `playSound` called with `"coin"`; Next calls `onNext` with `spendMinor: 8000`)
  - `the snack can only be bought once`
  - `save says to hand the cash to the parent` (`For real, you hand the cash to Mum.`)
  - `the coin is a button that moves 10 into Save` (press `save.coin`; Save label shows 10; Next appears)
  - `no step mentions a real balance` (render each with `jest.mock("@jarso/data/…")` none called — the steps take no hooks that read money)
  - `useTicker jumps under reduced motion` (mock `useReducedMotion` → true)
  - `skip calls onSkip from every step`
- [x] **Step 2: Run.** `pnpm --filter @jarso/mobile test -- tests/features/onboarding/steps.test.tsx`. Expected: FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): practice Spend and Save steps for the intro`

### Task 5: Goal step (real goal, about N weeks)

**Files:**
- Create: `apps/mobile/src/features/onboarding/goal-step.tsx`
- Test: `apps/mobile/tests/features/onboarding/goal-step.test.tsx`

**Interfaces:**
```ts
export function GoalStep(props: { onNext: () => void; onSkip: () => void }): JSX.Element;
```
- Reads `useHome()` (currency, `availability.saveMinor - reservedSaveMinor`), `useGoal()`, `useAllowance()`, `useSavingPace()` from `@/features/goals`; writes with `useSaveGoal()`.
- While home or goal load: a spinner in the frame. A load error: the frame with Not now only.
- An existing goal: "Your goal", the `GoalRing`, name and `toGoLine` (with `weeksToGoal` from the goal's own plan), `keycap` "Keep my goal" → `onNext`. Nothing is saved.
- No goal, pick: a 3×2 grid of `ONBOARDING_GOALS` (radio tiles, emoji 34 sp, name). Picking moves to price.
- Price: the picked emoji and name, `goal.costLabel`, `AmountKeypad`; under it, when `suggestedPlan(allowance)` and a pace exist and a price is typed: `goal.plan(money(plan), frequency)` and `goal.weeks(weeksToGoal(...))` beside a small `GoalRing`. Footer: `keycap` "Set my goal" (`loading` while saving, disabled without a price) and ghost "Not now" (→ `onNext`). Submit parses `goalInputSchema(currency)` with `{ name, emoji, target, plan: toMajorString(plan) or "" }`; on success `onNext`; a refusal shows `fieldErrors.plan`/`target` or `actionErrorMessage` in a calm `Notice`.

- [x] **Step 1: Write the failing tests** (mock `@jarso/data/goals`, `@jarso/data/allowance`, `@jarso/data/ledger`/home reads as `tests/features/goals/*` do):
  - `an existing goal is shown and kept, never saved` (`callSaveGoal` not called; Keep → `onNext`)
  - `picking Boots then 450 shows about 15 weeks with 30 a week` (allowance weekly 12000 → plan 3000; save 0; 45000 → `weeksToGoal` = 15)
  - `Set my goal saves the real goal` (`callSaveGoal` called with `{ name: "Boots", emoji: "⚽", targetMinor: 45000, planMinor: 3000 }`; then `onNext`)
  - `without an allowance there is no weeks line and the plan is empty` (`planMinor: null`)
  - `a refused plan shows its line and Not now still moves on`
- [x] **Step 2: Run.** `pnpm --filter @jarso/mobile test -- tests/features/onboarding/goal-step.test.tsx`. Expected: FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): pick a real goal in the intro`

### Task 6: Look step, the flow, the celebration and the replay route

**Files:**
- Create: `apps/mobile/src/features/onboarding/{look-step,onboarding-flow,onboarding-screen}.tsx`
- Create: `apps/mobile/app/(child)/onboarding.tsx` (`export default OnboardingScreen`)
- Modify: `apps/mobile/src/features/onboarding/index.ts`
- Test: `apps/mobile/tests/features/onboarding/onboarding-flow.test.tsx`

**Interfaces:**
```ts
export function LookStep(props: { onNext: () => void; onSkip: () => void }): JSX.Element;
// LookPicker from @/features/progress (plan 6) with level = progress.level ?? 1 and value = local state
// (from progress.look, else DEFAULT_LOOK); Done → useSetJarsoLook().mutate(look) when it changed, then onNext.
export function OnboardingFlow(props: { onDone: () => void }): JSX.Element;
export function OnboardingScreen(): JSX.Element; // the replay route: OnboardingFlow with onDone = back (or Home)
```
- `OnboardingFlow` holds the step and the practice jars. Name from `useNickname()` (null until it loads), parent from `useParentLabel()`, currency from `useHome()` (practice uses it once known; until then `"INR"` is not guessed: Spend and Save wait for the currency with a spinner inside the frame).
- Skip on any step: `skip()` then `onDone()`.
- After Look: `finish()` (a `done` ref ignores a second tap), then `celebrate({ title: done.title, tone: "grape", mood: "cheer", look, chips, primary: { label: done.go } })` where chips are `[{ icon: "zap", label: done.sparks(r.sparks) }]` when `r.sparks > 0` plus `[{ icon: "award", label: done.badge }]` when `r.badge`; then `onDone()` (the celebration shows over Home).

- [x] **Step 1: Write the failing tests** (mock data modules, `useCelebrate` via `@/components/celebrate`):
  - `walks meet, spend, save, goal, look and finishes with +50 and the first badge` (celebrate called with chips `["+50", "First badge"]`, `onDone` called)
  - `a replay that pays nothing celebrates without chips`
  - `skip on the first step saves finished and closes` (`saveTour` with `{ finished: true }`, `onDone`)
  - `the look step uses LookPicker and saves a changed look` (`setJarsoLook` called with the picked lid)
  - `Done twice finishes once`
  - `nothing in onboarding writes money` (source grep: no file in `src/features/onboarding` matches `/recordPurchase|createRequest|outbox|enqueue|ledger/`)
- [x] **Step 2: Run.** `pnpm --filter @jarso/mobile test -- tests/features/onboarding`. Expected: FAIL.
- [x] **Step 3: Implement** the three files, the route and the barrel (`export * from "./onboarding-flow"; export * from "./onboarding-gate"` (Task 7); `export * from "./onboarding-screen"; export * from "./use-onboarding"`). If `look-picker.tsx` is not there yet, do Tasks 7 first and come back.
- [x] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): child intro flow with a welcome celebration`

### Task 7: The first-open gate in the child layout

**Files:**
- Create: `apps/mobile/src/features/onboarding/onboarding-gate.tsx`
- Modify: `apps/mobile/app/(child)/_layout.tsx` (wrap the `<Stack>` in `<OnboardingGate userId={userId}>`; one import)
- Test: `apps/mobile/tests/features/onboarding/onboarding-gate.test.tsx`

**Interfaces:**
```ts
/** On a child's first open, the intro instead of the tabs; then the tabs. Never blocks on a failure. */
export function OnboardingGate(props: { userId: string; children: ReactNode }): JSX.Element;
// wait → the same centred spinner as the layout's loading state; show → <OnboardingFlow onDone={() => setDone(true)} />; skip → children
```
- [x] **Step 1: Write the failing tests:** `shows the intro on a first open`; `shows the tabs once the phone knows it is done`; `shows the tabs when the tour can't be read`; `after Skip the tabs show`.
- [x] **Step 2: Run.** `pnpm --filter @jarso/mobile test -- tests/features/onboarding/onboarding-gate.test.tsx`. Expected: FAIL.
- [x] **Step 3: Implement** and wire the layout (re-read it first; one import and the wrap; `OutboxSync` and `NoticeListener` stay outside the gate).
- [x] **Step 4: Run** the onboarding suites and `tests/app`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): show the intro on a child's first open`

### Task 8: "Replay the intro" on Me (last, after plan 6's Me edits)

**Files:**
- Modify: the child Me screen (`apps/mobile/src/features/settings/settings-screen.tsx` or wherever plan 6 moved it; re-read first): one `ListRow` "Replay the intro" (`onboardingCopy.replay`, a `sparkles` `RowIcon`) that pushes `/(child)/onboarding`.
- Test: one case in the Me screen's test: `Replay the intro opens the intro`.

- [x] **Step 1: Write the failing test.** Press the row by its label; expect `router.push("/(child)/onboarding")`.
- [x] **Step 2: Run.** Expected: FAIL.
- [x] **Step 3: Add the row** with Edit.
- [x] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): replay the intro from Me`

### Task 9: Docs and verification

- [x] **Step 1: Docs.** `docs/mobile.md` (a "Child intro (plan 8)" paragraph: steps, gating on `child_tours.finished_at` plus `jarso-onboarded:<userId>`, PRACTICE never touches the ledger, replay from Me; layout routes list gets `onboarding`). `docs/database.md` (`complete_child_onboarding() → jsonb`, the `welcome` spark kind). `docs/api.md` (the function's row and errors).
- [x] **Step 2: Run** `pnpm check`. Report failures outside this plan's files; fix this plan's.
- [x] **Step 3: Grep guards.** `grep -rnE "recordPurchase|createRequest|outbox|enqueue|ledger" apps/mobile/src/features/onboarding` prints nothing.
- [ ] **Step 4: Commit.** `docs: child intro on the phone`

## Open issues

- Voice and mute (spec C2) need `expo-speech` or recorded lines and a dev-build rebuild: a later plan.
- QR sign-in and the PIN pad (spec C1) move to plan 9, which makes the parent's QR.
- The migration must be pushed (by the user, after `supabase migration list --linked`) before the reward is paid on device; until then the phone falls back to `save_welcome_tour` and shows no chips.
- `complete_child_onboarding` can be called without doing the intro. It pays 50 Sparks once for life and Sparks are never money, so this is accepted.

## Execution notes (deviations)

- `use-ticker` is a `.ts` file (no JSX). `useFinishOnboarding()` returns `{ finish }` only: the flow's `closing` ref already guards double taps, so a `pending` flag had no reader.
- The LookStep tests live in `onboarding-flow.test.tsx`. The gate test also checks the spinner while the tour read is pending.
- The welcome celebration button reads "See my jars": the mockup's "Go to my jars" is 4 words, over the 1–3 word label budget.
- Adding `jar_starter` to `BADGE_KEYS` needed one entry in plan 6's exhaustive `BADGE_ICONS` (`apps/mobile/src/features/me/badge-icons.ts`, `SparklesIcon`).
- Wrapping the child `Stack` in `OnboardingGate` needed a pass-through `jest.mock("@/features/onboarding")` in the three tests that render the child layout (`tests/session.test.tsx`, `tests/session-offline.test.tsx`, `tests/app/parent-layout.test.tsx`), next to their existing stubs for `OutboxSync`, `LevelUpWatcher` and `NoticeListener`.
- Plan 6 moved Me to `src/features/me/me-settings.tsx` and left a marker comment for this row; the row replaced it. Its test is in `tests/features/me/me-screen.test.tsx`.
- pgTAP (`child_onboarding.test.sql`, 10 assertions) is written but not run here (no Docker); it runs in PR CI.

## Self-review

- Spec coverage: steps 2–7 of the child onboarding are built; step 1 and the voice are deferred with reasons (Decisions 2, 3). PRACTICE label and ledger separation: Decision 6, Review Focus 1. Skip: every step. Replay: Task 8. Gating: Decision 1. Reward: Decision 4, Task 2.
- Types are consistent: `PracticeJars`, `OnboardingGate`, `OnboardingReward` are defined in Task 1 and consumed by Tasks 3–7 by those names.
- No placeholders: every step names its files, functions and test names.
