# Mobile Kid Rework, Plan 5: Learn (quest map, question restyle, right and wrong sheets) and the daily check-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the child's Learn tab into a game the child wants to open, and add the one-tap daily check-in:

- a quest map: each week is a winding path of 7 stops, Jarso standing on today's stop, a chest at the end (a badge and a Jarso look, never money)
- questions with picture answers, the prompt as one big line and a Jarso hint bubble
- a green "Nailed it!" sheet with a cheer for a right answer, a calm blue "Close! Try again" sheet for a wrong one (never red)
- the daily check-in: "Spend anything today?" Nope / Yes, shown once per family-local day; Yes opens "I bought something"

**Architecture:** Pure rules go in core with Vitest tests: the quest-map layout and chest reward (`packages/core/src/learning/quest.ts`), the picture for an answer option (`learning/option-art.ts`), the new child copy (`learning/quest-copy.ts`), and the "ask the check-in now?" rule (`packages/core/src/progress/checkin.ts`). The phone draws the map with absolutely placed stops over a `react-native-svg` dashed path. The 828-line `MissionPlayer` keeps every state machine and save path exactly as it is; only its render functions change, and the new looks are pulled out into small presentational files (`jarso-hint.tsx`, `answer-sheet.tsx`, `picture-options.tsx`, `quest-map.tsx`). The check-in is a new feature module `apps/mobile/src/features/checkin` (screen, a per-user "already asked today" marker in AsyncStorage, and `useCheckinPrompt()`), with its route `app/(child)/checkin.tsx`. It writes only through `useDailyCheckin()` from plan 2. Home and the child layout are wired in the last task, after the rebase onto plan 4.

**Tech Stack:** Expo 58, React Native 0.88, NativeWind 4, react-native-svg 15, Reanimated 4.7, expo-haptics, expo-audio (`playSound`), TanStack Query 5, AsyncStorage, Jest + RNTL (mobile), Vitest (core).

**Spec:** `docs/superpowers/specs/2026-11-06-mobile-kid-rework-design.md` ("Learn", "Fun loop"). Mockup: `docs/superpowers/specs/mockups/2026-11-06-mobile-kid-rework.html` section 6 (L1 quest map, L2 question, L3 right answer, L4 daily check-in). Contract: `/tmp/kid-rework/contract.md`. Backend (merged, plan 2): `daily_checkin(p_answer)`, `get_progress` (`checkedInToday` is computed on the family-local day), `useProgress()`, `useDailyCheckin()`.

## Roadmap (this is plan 5 of 10)

1. Foundation (merged). 2. Progress backend (merged). 3. Child shell and Home (`feat/mobile-kid-home`). 4. Jar pages and goal (`feat/mobile-kid-jars`, on 3). **5. Learn and the daily check-in** (this plan, `feat/mobile-kid-learn`, rebased onto 4). 6. Diary, Jarso tab, Me, bell, level-up. 7. Allowance split. 8. Child onboarding. 9. Parent sign-up. 10. Parent restyle.

## Global Constraints

- **Contract rules (binding, from `/tmp/kid-rework/contract.md`):**
  - Commits ARE authorised for this work. One focused Conventional Commit per task, subject ≤ 60 chars, imperative, NO AI attribution / Co-Authored-By lines. Commit identity is preset per worktree (noreply email); don't change git config.
  - No Docker, no `supabase db reset`, no `db push`. This plan needs NO migration. If a task finds it needs one, stop and say so.
  - CLAUDE.md hard rules apply: feature modules, barrels, core/data purity (rule 18), money in integer minor units, Biome only, child copy rules. Word budget: labels 1–3 words, Jarso bubble ≤ 8 words, no paragraphs on the child side. Jarso is never sad; wrong answers are calm blue, never red.
  - Mobile tests live in `apps/mobile/tests/` mirroring `src/`; core tests in `packages/core/tests/<module>/`. Reduced motion is respected.
  - The machine is shared by three parallel builds. Run targeted tests only (`pnpm --filter @jarso/mobile test -- <paths> --maxWorkers=2`, `pnpm --filter @jarso/core test -- <paths>`). A full `pnpm check` runs only in Task 8.
  - Read `docs/design.md` and `docs/mobile.md` before UI work.
- **File ownership.** Edit only: `apps/mobile/src/features/{learn,learning,checkin}/**`, `apps/mobile/app/(child)/learn/**`, `apps/mobile/app/(child)/(tabs)/learn.tsx`, new `apps/mobile/app/(child)/checkin.tsx`, `packages/core/src/learning/**` (additions), `packages/core/src/progress/checkin.ts` (new file) plus one appended line in `progress/index.ts`, their tests, `apps/mobile/e2e/learn.yaml`, and the docs in Task 8. **Do not touch** Home (`features/home/**`, `(tabs)/index.tsx`), `(tabs)/_layout.tsx`, `(child)/_layout.tsx`, `features/goals/**`, `features/jars/**` until Task 9. Importing `useHome` from `@/features/jars` is allowed (reading, not editing).
- **Behaviour of the mission player is frozen.** `save`, `saveFinish`, `initialQueue`, `replayItems`, `begin`, `applyStart`, `finish`, `advance`, `stepDone`, and inside `StepView` the `check`, `send`, `continueOn`, the `busy` ref and the `CurrentStepContext` value keep their code byte for byte. Accessible names stay: `playerCopy.check`, `.continue`, `.tryAgain`, `.hint`, `.anotherHint`, `.next`, radios named by the option text, the `progressbar` with `playerCopy.progressLabel[kind]`. The existing tests in `tests/features/learning/learn.test.tsx` keep passing with only the right/wrong heading strings swapped.
- **Web copy is shared.** `playerCopy`, `roadmapCopy` and `learnCopy` render byte-identical on the web; never edit their strings. New child-phone strings go in the new `questCopy`.
- **Never money in the chest.** The chest reward type has no amount field; the map never shows a currency.
- **Wrong answer colours:** `tint-cyan` surface, `cyan-800` text (dark: `cyan-100`), Jarso `think`. No `destructive`, no `red`, no `bg-destructive` anywhere in the sheet (a source-grep test checks it).
- **Right answer:** `success-soft` surface, `success-text`, Jarso `cheer`, `<Confetti count={16} />` (renders nothing with reduced motion), `playSound("pop")`. The success haptic stays where it is today (in `check()`), so it is not doubled.
- **The check-in never blocks.** No spinner, no error text, no retry. A failed RPC is logged with `logger.warn("checkin failed", { code })` (an `AppError` code only, never the raw error object with a token) and the child moves on. It is not queued offline: the outbox kinds are server-defined and adding one is backend work (see Review Focus 2).
- **Once per family-local day.** "Today" is `familyToday(timezone)` from `@/lib` with the family's timezone from `useHome().data.context.timezone`, never the device's date.

## Review Focus

1. **Check-in near family-local midnight.** A family in `Asia/Kolkata` opens Home at 23:59 local (18:29Z), answers, then reopens at 00:01 (18:31Z). The second open is a new family day: the stored marker (`2026-11-06`) no longer matches `2026-11-07`, and the cached progress was read on the earlier day, so the rule says `refresh` (not `skip`) and the prompt shows once fresh progress says `checkedInToday: false` (Task 3 tests, Task 7 hook test).
2. **Check-in offline or the RPC fails.** Nope still closes the sheet at once; Yes still opens `/(child)/purchase`. Nothing red, no alert, no retry loop. The day's marker was written when the prompt opened, so it does not nag again today. The lost check-in is accepted (no outbox kind exists for it; queuing it would need a backend change, which this plan must not make). Progress that fails to load means no prompt at all (Task 7 tests).
3. **A week with fewer than 7 missions.** The layout puts the chest straight after the last stop, the banner reads `n / n`, nothing renders as an empty stop, and 8 missions make two weeks (7 + 1). An empty journey renders no map, only the next-step card (Task 1 tests).
4. **Everything done.** No stop is `now`; Jarso stands by the chest with `cheer` and the bubble "All done!"; the chest is open and shows its badge and look. Every done stop still opens its mission for replay (Task 1 and Task 4 tests).
5. **Wrong, then right on the same step.** First wrong: the blue sheet with "Close! Try again" and a Try again button that clears the sheet; nothing is saved and no haptic fires. Then right: the green sheet, haptic once, `pop` once, and Continue saves exactly one `step` with `tries: 2` (the existing `learn.test.tsx` case, plus a sheet test that the blue sheet never contains a red class). A second wrong shows the calm blue "Here's how" sheet with the answer line, then Continue.

---

### Task 1: Core quest map, chest reward and quest copy

**Files:**
- Create: `packages/core/src/learning/quest.ts`, `packages/core/src/learning/quest-copy.ts`
- Modify: `packages/core/src/learning/index.ts` (append `export * from "./quest"; export * from "./quest-copy";`)
- Test: `packages/core/tests/learning/quest.test.ts`

**Interfaces:**
```ts
export const QUEST_STOPS_PER_WEEK = 7;
export type QuestStopState = "done" | "now" | "locked";
export type QuestPoint = { x: number; y: number };
export type QuestStop = QuestPoint & {
  key: string; day: number; title: string; state: QuestStopState;
};
export type ChestReward = { badge: BadgeKey; earned: boolean; wear: Wear }; // no money, ever
export type QuestWeek = {
  week: number;            // 1-based
  stops: QuestStop[];      // 1..7
  chest: QuestPoint & { open: boolean };
  jarso: QuestPoint & { on: "stop" | "chest"; day: number | null };
  done: number; total: number;
  pathD: string;           // SVG path through every stop then the chest
  height: number;
};
export function questMap(
  journey: readonly Pick<JourneyMission, "key" | "day" | "title" | "status">[],
  layout?: { width?: number; stopSize?: number; rowGap?: number }, // defaults 324, 64, 96
): QuestWeek[];
export function currentQuestWeek(weeks: readonly QuestWeek[]): QuestWeek | null; // week holding "now", else the last
export function chestReward(week: number, input: { badges: readonly BadgeKey[]; level: number }): ChestReward;
export const questCopy: {
  heading: "Learn";
  week: (n: number) => string;           // "Week 1"
  count: (done: number, total: number) => string; // "3 / 7"
  today: (day: number) => string;        // "Day 3!"
  allDone: "All done!";
  chest: "Chest"; chestLocked: "Finish the week"; chestOpen: "You did it!";
  playStop: (day: number, title: string) => string; // "Play Day 3 · Small buys add up"
  sheet: { right: "Nailed it!"; wrong: "Close! Try again"; shown: "Here's how" };
  checkin: { eyebrow: "Daily check-in" };
};
```
Layout rule: stop `i` in a week sits at `x = LANES[i] * width` (`LANES = [0.5, 0.22, 0.62, 0.8, 0.45, 0.2, 0.55]`, clamped so the circle stays inside `[stopSize/2, width - stopSize/2]`) and `y = stopSize/2 + i * rowGap`; the chest is one `rowGap` below the last stop at `x = width/2`. `pathD` is `M` at stop 0 then one cubic `C` per hop with control points at the vertical midpoint, so the path winds. Status mapping: `done → done`, `current → now`, `locked → locked`. Jarso stands beside the `now` stop (`x + stopSize * 0.9`, clamped to `width - stopSize/2`), else beside the chest with `on: "chest"`. The chest is `open` when every stop of that week is `done`. `chestReward`: badge `CHEST_BADGES[week - 1] ?? last` with `CHEST_BADGES = ["missions_5", "missions_10"]`; `earned` = the child has it; `wear` = the last of `availableWear(level)`.

- [ ] **Step 1: Write the failing tests** in `quest.test.ts`:
  - `seven missions make one week of seven stops with the chest after the last`
  - `eight missions make two weeks (7 + 1)`
  - `fewer than seven: the chest follows the last stop and total is n`
  - `an empty journey has no weeks`
  - `Jarso stands on the now stop` (journey: 2 done, 1 current, 4 locked → `jarso.on === "stop"`, `jarso.day === 3`, `done === 2`)
  - `all done: no now stop, Jarso at an open chest`
  - `the path winds: neighbouring stops never share an x` and `every stop fits inside the width` (try width 280 and 400)
  - `pathD starts at stop 0 and has one curve per hop` (count of `C` = stops)
  - `currentQuestWeek picks the week with the now stop, else the last`
  - `chest reward is a badge and a look, never money` (`Object.keys(chestReward(1, { badges: [], level: 1 })).sort()` equals `["badge","earned","wear"]`; `earned` true when `missions_5` is in badges; `wear` is `"cap"` at level 1 and `"crown"` at 5)
  - `quest copy stays inside the word budget` (every string and sample function output ≤ 3 words for labels, ≤ 8 words for `today`/`allDone`/sheet lines; no "wrong", "lost" or "fail")
- [ ] **Step 2: Run them.** `pnpm --filter @jarso/core test -- tests/learning/quest.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `quest.ts` and `quest-copy.ts` (imports: `JourneyMission` type from `./types`, `BadgeKey` from `../progress`, `availableWear`, `Wear` from `../mascot`; relative imports inside core, as `progress/copy.ts` does with `../mascot`). Append to the barrel.
- [ ] **Step 4: Run again plus the learning suite and lint.** `pnpm --filter @jarso/core test -- tests/learning && pnpm lint`. Expected: PASS, no purity errors.
- [ ] **Step 5: Commit.** `feat(core): quest map layout and chest reward for Learn`

### Task 2: Core picture art for answer options

**Files:**
- Create: `packages/core/src/learning/option-art.ts`
- Modify: `packages/core/src/learning/index.ts` (append)
- Test: `packages/core/tests/learning/option-art.test.ts`

**Interfaces:**
```ts
export type OptionArt = { kind: "emoji"; emoji: string } | { kind: "letter"; letter: "A" | "B" | "C" | "D" };
/** A picture for an option, from keywords in its text; a letter tile when nothing matches. */
export function optionArt(text: string, index: number): OptionArt;
export const OPTION_ART_WORDS: readonly (readonly [RegExp, string])[]; // e.g. [/\bcomic/i, "📖"], [/headphone/i, "🎧"], [/\bgame/i, "🎮"], [/\bbook/i, "📚"], [/snack|biscuit|crisps/i, "🍪"], [/\bcap\b/i, "🧢"], [/keyring/i, "🔑"], [/ticket|cinema|film/i, "🎟️"], [/weeks?\b/i, "📅"], [/save|saving/i, "🐷"], [/nothing/i, "🤷"]
```
Emoji are allowed here: the spec permits them for "category art in lesson questions". The text keeps its money tokens; the art never shows a number, so it can't give the answer away.

- [ ] **Step 1: Write the failing tests:**
  - `a comic gets a book picture` (`optionArt("A comic for {m:650}", 0)` → `{ kind: "emoji", emoji: "📖" }`)
  - `first matching word wins` (`"Headphones and a game"` → 🎧)
  - `no match falls back to a letter by position` (`optionArt("It takes the same time", 1)` → `{ kind: "letter", letter: "B" }`)
  - `every option in the shipped missions gets art without throwing` (iterate `missions` from `@jarso/core/learning/content`, every choice/predict/reason option; index ≤ 3)
  - `art never contains a digit or a currency sign`
- [ ] **Step 2: Run.** `pnpm --filter @jarso/core test -- tests/learning/option-art.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** and append to the barrel.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(core): picture art for lesson answer options`

### Task 3: Core rule for when the daily check-in shows

**Files:**
- Create: `packages/core/src/progress/checkin.ts`
- Modify: `packages/core/src/progress/index.ts` (append `export * from "./checkin";`)
- Test: `packages/core/tests/progress/checkin.test.ts`

**Interfaces:**
```ts
export type CheckinDecision = "show" | "skip" | "refresh";
/**
 * Whether Home should ask "Spend anything today?" now. `today` and every day are family-local.
 * - progress not loaded (or failed): skip (never block, never guess)
 * - asked already today (lastPromptDay === today): skip
 * - progress read on an earlier family day: refresh (its checkedInToday is about that day)
 * - checkedInToday: skip; otherwise show
 */
export function checkinDecision(input: {
  timezone: string;
  now: Date;
  lastPromptDay: string | null;
  progress: { checkedInToday: boolean; readAt: Date } | null;
}): CheckinDecision;
```
Uses `familyToday` and `localDateOf` from `@jarso/core/lib` (core may import it; the web/app rule is about apps).

- [ ] **Step 1: Write the failing tests:**
  - `shows when not checked in and not asked today`
  - `skips once asked today, even if the check-in failed`
  - `skips when the server says checked in today`
  - `skips while progress is unknown`
  - `near Kolkata midnight a read from 23:59 asks for a refresh at 00:01` (`now` 2026-11-06T18:31Z, `readAt` 18:29Z, `lastPromptDay` "2026-11-06", `checkedInToday: true` → `"refresh"`)
  - `the same instant is still yesterday in London` (18:31Z, Europe/London, `lastPromptDay` "2026-11-06" → `"skip"`)
- [ ] **Step 2: Run.** `pnpm --filter @jarso/core test -- tests/progress/checkin.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run again with the progress suite.** `pnpm --filter @jarso/core test -- tests/progress`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(core): decide when the daily check-in shows`

### Task 4: Quest map on the Learn tab

**Files:**
- Create: `apps/mobile/src/features/learning/quest-map.tsx`
- Modify: `apps/mobile/src/features/learning/index.ts` (export `QuestMap`), `apps/mobile/src/features/learn/learn-screen.tsx`, `apps/mobile/src/features/learning/next-step-card.tsx` (look only; props `{ step }` and `nextStepHref` unchanged, so Home's "Today's mission" picks it up for free)
- Modify: `apps/mobile/e2e/learn.yaml` (tap `id: quest-stop-now` when a mission is next)
- Leave `roadmap.tsx` exported (no longer rendered on Learn; delete only if `grep -rn "Roadmap" apps/mobile` finds no other user)
- Test: `apps/mobile/tests/features/learning/quest-map.test.tsx`, `apps/mobile/tests/features/learn/learn-screen.test.tsx`

**Interfaces:**
```ts
export function QuestMap(props: {
  week: QuestWeek;          // from currentQuestWeek(questMap(journey, { width }))
  reward: ChestReward;
  look?: JarsoLook;
  fill?: number;
}): JSX.Element;
```
- A stop is a 64 dp circle: done = `bg-primary` with a check, now = `bg-grape-500` keycap ledge with a play icon, `testID="quest-stop-now"`, a soft halo unless reduced motion, locked = `bg-muted` with a lock. Done and now stops are `Pressable` with `accessibilityRole="button"` and label `questCopy.playStop(day, title)` (now) or `roadmapCopy.stopName(day, title)` (done), pushing `/(child)/learn/[missionKey]`. Locked stops are `accessible` with `roadmapCopy.locked(name)`.
- The path is one `<Path d={week.pathD} stroke={tokens.hairline-strong} strokeWidth={14} strokeDasharray="2 22" strokeLinecap="round" />` in an `Svg` hidden from screen readers.
- Jarso (`size 80`, mood `wave` on a stop, `cheer` at the chest, `look` from `useProgress`) with a bubble `questCopy.today(day)` or `questCopy.allDone`.
- The chest is a gold tile with a gift icon; closed it is labelled `questCopy.chestLocked`, open it shows the badge's lucide icon and name (`BADGES[reward.badge]`) and the wear name, labelled `questCopy.chestOpen`.
- LearnScreen (top to bottom): header row `questCopy.heading` with a flame streak pill and a zap Sparks pill from `useProgress()` (pills hide while loading); the grape week banner (`questCopy.week(n)`, the now mission's title or `roadmapCopy.journeyDone`, chip `questCopy.count(done, total)`); `NextStepCard` when the next step is practice, check-in or comeback (same `cardFirst` rule as today); the map; then the "Your week" row. `CoachSays` leaves Learn (Jarso is on the map). Width from `useWindowDimensions().width - 32`.
- NextStepCard restyle: a grape-tinted card (`bg-tint-grape`, radius 24), lucide icon in a rounded square, title, the one line, a `keycap-grape` button with the same `cta` label.

- [ ] **Step 1: Write the failing tests.**
  - `quest-map.test.tsx`: `draws seven stops and a chest`; `the now stop opens its mission` (press `getByRole("button", { name: questCopy.playStop(3, title) })` → `router.push({ pathname: "/(child)/learn/[missionKey]", params: { missionKey } })`); `a locked stop is not a button`; `all done shows the open chest with its badge name and Jarso's line`; `the chest never shows money` (no text matches `/[£₹$€]|\d+\.\d{2}/`).
  - `learn-screen.test.tsx` (mocks as in `learn.test.tsx`, plus `jest.mock("@jarso/data/progress", () => ({ getProgress: jest.fn() }))`): `shows the week banner with 2 / 7`; `practice due puts the next-step card above the map`; `fewer than seven missions still shows the chest`; `streak and Sparks pills come from progress`.
  - Keep `learn.test.tsx › the next step card opens its own screen` unchanged (it guards the restyled card's label and route).
- [ ] **Step 2: Run.** `pnpm --filter @jarso/mobile test -- tests/features/learning/quest-map.test.tsx tests/features/learn --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement** `quest-map.tsx`, the Learn screen and the card. Then update `e2e/learn.yaml`: when `quest-stop-now` is visible tap it, otherwise keep the current branches (not run in CI; just keep selectors true).
- [ ] **Step 4: Run again plus the learning suite.** `pnpm --filter @jarso/mobile test -- tests/features/learning tests/features/learn --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): Learn as a quest map with Jarso and a chest`

### Task 5: Questions with picture answers and a Jarso hint bubble

**Files:**
- Create: `apps/mobile/src/features/learning/picture-options.tsx`, `apps/mobile/src/features/learning/jarso-hint.tsx`
- Modify: `apps/mobile/src/features/learning/step-views.tsx` (`OptionInput` renders `PictureOptions`; other inputs keep their logic, restyled with radius 18/24 tiles only), `apps/mobile/src/features/learning/mission-player.tsx` (render only: see below)
- Test: `apps/mobile/tests/features/learning/step-views.test.tsx` (add), `apps/mobile/tests/features/learning/jarso-hint.test.tsx`

**Interfaces:**
```ts
export function PictureOptions(props: {
  options: { id: string; text: string }[]; // text already rendered with renderText
  selected: string | null;
  disabled: boolean;
  onSelect: (id: string) => void;
}): JSX.Element; // radiogroup (inputCopy.pickOne); 2 columns; each tile accessibilityRole="radio", accessibilityLabel = text, art from optionArt(text, i) (emoji 40 sp, or a letter in a tinted circle), the text under it in bold; selected = teal border + tint-teal

export function JarsoHint(props: {
  line: string;            // coach.says.idle / .hint / .checkIn, unchanged sources
  hints: string[];         // already sliced to hintsShown
  currency: string;
  look?: JarsoLook;
}): JSX.Element; // Jarso mood "think" size 64 + a speech bubble (secondary surface, tail left); hints as gold-100 rows under the line, labelled playerCopy.hints
```
Mission player changes, render only:
- `CoachBubble` is replaced by `JarsoHint`; the `coach` name line goes (Jarso speaks). `coachFor(stepKey).says` still picks the line, so the same step keeps the same words.
- The blackboard frame goes: the position eyebrow stays (muted), the prompt is `font-sans-extrabold text-h1` on the page, `accessibilityRole="header"`, full text (no truncation), predict note under it.
- The action row becomes `Hint` (`keycap-white`, flex 1, lightbulb icon, same labels/conditions) beside `Check` (`keycap-grape`, flex 2, same label, `disabled={!answer}`, `loading={saving}`). The check-in mode keeps `playerCopy.next` and no hint.
- `ProgressDots` becomes one grape bar (`bg-grape-500` fill on `bg-muted`, radius full, height 10) with the same `accessibilityRole="progressbar"`, label and `accessibilityValue`.
- `Feedback` is untouched in this task (the sheet comes in Task 6).

- [ ] **Step 1: Write the failing tests.**
  - `step-views.test.tsx`: `choice options show as picture tiles named by their text` (render `StepInput` with mission 1's `which-can-you-buy`; three `radio`s; "📖" is visible); `pressing a tile selects that option` (`onChange` called with `{ kind: "option", optionId: "comic" }`); `locked tiles ignore presses`.
  - `jarso-hint.test.tsx`: `shows the line and the hints asked for`; `Jarso is decorative` (no image role without a label).
  - In `learn.test.tsx` nothing changes yet; it must still pass.
- [ ] **Step 2: Run.** `pnpm --filter @jarso/mobile test -- tests/features/learning/step-views.test.tsx tests/features/learning/jarso-hint.test.tsx --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.** Before saving `mission-player.tsx`, diff it: `git diff -U0 apps/mobile/src/features/learning/mission-player.tsx | grep -E '^[-+].*(function (save|saveFinish|initialQueue|replayItems|begin|applyStart|finish|advance|stepDone|check|send|continueOn)\b|busy\.current|CurrentStepContext\.Provider value)'` must print nothing.
- [ ] **Step 4: Run the whole learning suite.** `pnpm --filter @jarso/mobile test -- tests/features/learning tests/features/learn --maxWorkers=2`. Expected: PASS, including every existing `learn.test.tsx` case.
- [ ] **Step 5: Commit.** `feat(mobile): picture answers and Jarso hints in lessons`

### Task 6: Right and wrong answer sheets, and a cheerful finish

**Files:**
- Create: `apps/mobile/src/features/learning/answer-sheet.tsx`
- Modify: `apps/mobile/src/features/learning/mission-player.tsx` (replace `Feedback` and the outcome buttons with `AnswerSheet`; restyle `DoneBadge` and the finish card only)
- Test: `apps/mobile/tests/features/learning/answer-sheet.test.tsx`; update `apps/mobile/tests/features/learning/learn.test.tsx` (heading strings only)

**Interfaces:**
```ts
type SheetOutcome = { correct: boolean; feedback: string; final: boolean };
export function AnswerSheet(props: {
  outcome: SheetOutcome;
  body: StepBody;
  currency: string;
  topicHref?: Href;
  look?: JarsoLook;
  pending: boolean;          // saving after Continue
  onContinue: () => void;    // StepView.continueOn
  onTryAgain: () => void;    // () => setOutcome(null)
}): JSX.Element;
```
- Right (`correct`): `bg-success-soft`, radius-top 24, Jarso `moodFor("answerRight")` size 96, heading `questCopy.sheet.right` in `text-success-text` with `accessibilityRole="header"`, the feedback line, predict outcome when `body.type === "predict"`, `<Confetti count={16} />`, `playSound("pop")` once on mount, Continue = `keycap-success` `xl` full width (label `playerCopy.continue`).
- Wrong, not final: `bg-tint-cyan`, Jarso `moodFor("answerWrong")` (think), heading `questCopy.sheet.wrong`, the feedback line, "Read about this topic" link when `topicHref`, Try again = `keycap` `xl` (label `playerCopy.tryAgain`). No sound.
- Wrong and final: same calm blue, heading `questCopy.sheet.shown`, the feedback, `playerCopy.answerLine(describeAnswer(body, currency))`, predict outcome, Continue = `keycap` `xl`.
- The sheet's content sits in an `accessibilityLiveRegion="polite"` view so the heading is announced, as the bubble's feedback was.
- Finish card: Jarso `cheer` size 120 with `<Confetti />` for a finished mission or practice (topic and check-in finish stay calm), the same heading/body strings, `keycap-grape` done button. `SavedOnDevice`, the error `ProblemText` and the Try again on a failed finish are unchanged.

- [ ] **Step 1: Write the failing tests** in `answer-sheet.test.tsx` (`jest.mock("@/lib/sound", () => ({ playSound: jest.fn() }))`):
  - `right answer: green sheet, Nailed it!, Continue, one pop`
  - `wrong answer: calm blue sheet says Close! Try again and offers Try again`
  - `the wrong sheet never uses red` (render it and assert no node's `className` matches `/destructive|red/`; also `read(answer-sheet.tsx)` from `tests/source-files.ts` contains neither `destructive` nor `red-`)
  - `second wrong shows the answer line and Continue`
  - `wrong answer plays no sound`
  - `reduced motion: no confetti nodes` (mock `useReducedMotion` → true)
  Update `learn.test.tsx › answer graded on device shows right/wrong and queues a step`: `playerCopy.again` → `questCopy.sheet.wrong`, `playerCopy.right` → `questCopy.sheet.right`; add `jest.mock("@/lib/sound", …)` and `jest.mock("@jarso/data/progress", () => ({ getProgress: jest.fn().mockRejectedValue(new Error("off")) }))`. Every other assertion (haptic once, `submit` payload with `tries: 2`, `stepPosition(3, 7)`, finish order `["step","completeMission"]`, resume skipping queued steps) stays as it is.
- [ ] **Step 2: Run.** `pnpm --filter @jarso/mobile test -- tests/features/learning/answer-sheet.test.tsx tests/features/learning/learn.test.tsx --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement**, then repeat Task 5's frozen-function diff check on `mission-player.tsx` (must print nothing).
- [ ] **Step 4: Run the learning suites.** `pnpm --filter @jarso/mobile test -- tests/features/learning tests/features/learn tests/components/celebration.test.tsx --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): green and calm blue answer sheets in lessons`

### Task 7: The daily check-in (screen, route, prompt hook)

**Files:**
- Create: `apps/mobile/src/features/checkin/index.ts`, `checkin-screen.tsx`, `prompt-day.ts`, `use-checkin-prompt.ts`
- Create: `apps/mobile/app/(child)/checkin.tsx` (`export { CheckinScreen as default } from "@/features/checkin"` style, as the other routes)
- Test: `apps/mobile/tests/features/checkin/checkin-screen.test.tsx`, `apps/mobile/tests/features/checkin/use-checkin-prompt.test.tsx`

Note: `app/(child)/learn/check-in.tsx` is the unrelated one-off FR10 placement quiz; this new route is `checkin` (no hyphen, contract name) and the module is `features/checkin`.

**Interfaces:**
```ts
// prompt-day.ts — AsyncStorage key `jarso-checkin-asked:<userId>` (docs/mobile.md naming)
export async function readPromptDay(userId: string): Promise<string | null>; // null on any storage error
export async function writePromptDay(userId: string, day: string): Promise<void>; // logs, never throws

// use-checkin-prompt.ts
/** Call on Home. On focus, asks the check-in once per family-local day; silent on any failure. */
export function useCheckinPrompt(): void;

// checkin-screen.tsx
export function CheckinScreen(): JSX.Element;
```
- `useCheckinPrompt`: reads `userId` (`useSession`), `timezone` (`useHome().data?.context.timezone`), `progress = useProgress()` (`readAt = new Date(progress.dataUpdatedAt)`), and the stored day; on `useFocusEffect` runs `checkinDecision`. `refresh` → `progress.refetch()` and decide again on the new data. `show` → set an in-memory `askedDay` ref, `await writePromptDay(...)`, then `router.push("/(child)/checkin")`. The ref stops a second push in the same run even if storage failed. Never throws.
- `CheckinScreen`: `bg-primary` (teal) full sheet, safe area; eyebrow `questCopy.checkin.eyebrow` in `text-teal-100`; `<Jarso mood="happy" size={150} look={progress.look} />`; heading `progressCopy.checkinQuestion` (white, `accessibilityRole="header"`); a row of two `xl` keycaps: `progressCopy.nope` (`keycap-white`) and `progressCopy.yes` (`keycap-gold`); under them a translucent card with a flame, `progressCopy.streakDays(streak)` and `progressCopy.restDay` (hidden while progress loads).
  - Nope: `checkin.mutateAsync("nope").catch(warn)` without awaiting, then `router.back()`.
  - Yes: `checkin.mutateAsync("yes").catch(warn)` without awaiting, then `router.replace("/(child)/purchase")`.
  - A second tap is ignored (a `done` ref). No error UI ever.

- [ ] **Step 1: Write the failing tests.**
  - `checkin-screen.test.tsx` (mock `@jarso/data/progress` `dailyCheckin` and `getProgress`, `expo-router`): `asks Spend anything today? with Nope and Yes`; `the buttons are xl keycaps` (className contains `h-[72px]`); `Nope writes nope and closes`; `Yes writes yes and opens I bought something` (`router.replace("/(child)/purchase")`); `a failed check-in still closes and shows nothing` (`dailyCheckin` rejects → `router.back` called, no `alert` role, `logger.warn` called); `a double tap writes once`.
  - `use-checkin-prompt.test.tsx` (mock `@/features/jars` `useHome` → `{ data: { context: { timezone: "Asia/Kolkata" } } }`, `@jarso/data/progress`, `expo-router` with `useFocusEffect: (cb) => require("react").useEffect(cb, [])`, `jest.useFakeTimers({ now: new Date("2026-11-06T10:00:00Z") })`): `opens the check-in once on the first open of the day`; `does not open after checking in today`; `does not open again the same family day` (stored `"2026-11-06"`); `rereads stale progress after family midnight and then asks`; `stays quiet when progress fails`; `storage failure still asks only once this run`.
- [ ] **Step 2: Run.** `pnpm --filter @jarso/mobile test -- tests/features/checkin --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement** the module, barrel (`export * from "./checkin-screen"; export * from "./use-checkin-prompt";`; `prompt-day` stays internal) and the route. Until Task 9 the route is not in SHEETS, so it opens as a plain page; that's fine for tests.
- [ ] **Step 4: Run again plus progress.** `pnpm --filter @jarso/mobile test -- tests/features/checkin tests/features/progress --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): daily check-in sheet with Nope and Yes`

### Task 8: Docs and full verification

**Files:**
- Modify: `docs/mobile.md` (Learning bullet: quest map, picture answers, sheets; the daily check-in and its `jarso-checkin-asked:<userId>` key; route list gets `checkin`), `docs/design.md` (§6 rows "Mission player", "Coach and blackboard", "Path": the phone's Jarso hint, picture tiles, green/calm-blue sheets, quest map; the web rows stay as they are, marked web)

- [ ] **Step 1: Update the docs** (facts only, short).
- [ ] **Step 2: Run the full check.** `pnpm check`. Expected: Biome, typecheck (web, mobile, core, data) and every unit suite pass. Fix anything in this plan's files; if a failure is in a file another plan owns, stop and report it.
- [ ] **Step 3: Grep guards.** `grep -rn "destructive\|red-" apps/mobile/src/features/learning/answer-sheet.tsx apps/mobile/src/features/checkin` prints nothing; `git diff main --stat` lists only files this plan owns.
- [ ] **Step 4: Commit.** `docs(mobile): Learn quest map and the daily check-in`

### Task 9: Integration (after rebase onto `feat/mobile-kid-jars`)

Run only after the controller has rebased this branch onto `feat/mobile-kid-jars` (which sits on `feat/mobile-kid-home`). This is the only task that edits plan 3's files.

**Files:**
- Modify: `apps/mobile/app/(child)/_layout.tsx` (append `"checkin"` to `SHEETS`)
- Modify: plan 3's Home screen (expected `apps/mobile/src/features/home/home-screen.tsx`; confirm with `grep -rn "export function HomeScreen" apps/mobile/src`) to call `useCheckinPrompt()` from `@/features/checkin` once at the top of the component
- Check, don't edit unless needed: Home's "Today's mission" block still renders `NextStepCard` (directly or through `HomeStepCard`); if plan 3 left a different seam for it, point it at `NextStepCard` with the same `step` prop
- Test: `apps/mobile/tests/features/home/*` (add one case), `apps/mobile/tests/app/*`

- [ ] **Step 1: Confirm the base.** `git log --oneline -3 feat/mobile-kid-jars` is in this branch's history; `useHome` is still exported from `@/features/jars` (else switch the two imports in `use-checkin-prompt.ts` and `learn-screen.tsx` to wherever plan 3/4 moved it).
- [ ] **Step 2: Write the failing test** in plan 3's Home test file: `Home asks the daily check-in on its first open of the day` (mock `@/features/checkin` → `{ useCheckinPrompt: jest.fn() }`, render Home, expect it called).
- [ ] **Step 3: Run.** `pnpm --filter @jarso/mobile test -- tests/features/home --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 4: Wire it.** Add `"checkin"` to `SHEETS` and the hook call on Home.
- [ ] **Step 5: Re-run the targeted suites and typecheck.** `pnpm --filter @jarso/mobile test -- tests/features/checkin tests/features/learning tests/features/learn tests/features/home tests/app --maxWorkers=2 && pnpm --filter @jarso/mobile typecheck`. Expected: PASS.
- [ ] **Step 6: Commit.** `feat(mobile): ask the daily check-in on Home's first open`
