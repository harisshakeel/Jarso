# Mobile Kid Rework, Plan 10: Parent restyle (one-tap ask cards, child cards, handover cards) Implementation Plan

> **Status: implemented, not committed** (2026-11-06, on `feat/mobile-kid-rework-6-8-10`).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the parent app the rework's visual system (same tokens, keycaps and Jarso), calmer than the child's: no Sparks, no confetti, denser text allowed.

- Family: what needs the parent is on top, and each ask is answered in **one tap on its own card**: "Got it" / "Not yet" for money the child hands over (a put-in), "Yes" / "Not now" for an ask (a take-out or an ask for extra), "Handed over" / "Didn't give it" for an approved take-out.
- Each child is a card: their Jarso (their own look), one learning line with level and streak, and three money tiles (Spend, Save, Goal). No leaderboard, no ranking, nothing compares children.
- Allowances and gifts due are handover cards (icon, amount, due line, a gold "Hand over" keycap that opens the existing handover sheet).
- The handover sheet, the child hub, rules and allowance keep their function and take the new look.
- The parent's Notifications (the Inbox tab) gets its own calm screen with Jarso.

**Architecture:** Pure wording and rules go in core with Vitest tests: the ask card (`packages/core/src/requests/ask-card.ts`: which pair of answers a request gets and its two lines) and the child card (`packages/core/src/dashboard/family-cards.ts`: the one learning line, the week's missions from the quest map, the goal tile's percent, the parent restyle's copy). The phone keeps every mutation, idempotency key, `useSendOnce`, Alert confirmation, flash line and CONFLICT refresh in `ParentRequestRow`; only its render changes into an `AskCard`. A parent read of a child's progress (`useChildProgress(childId)`, `get_progress` already lets a parent read their child: `is_parent_of`, migration `20261106120200_progress_awards.sql`) lives in `features/family` (a leaf, so `allowance` and `parent` can both use it). No migration, no new mutation, no new route.

**Tech Stack:** Expo 58, React Native 0.88, NativeWind 4, react-native-svg 15 (Jarso), TanStack Query 5, lucide-react-native, Jest + RNTL (mobile), Vitest (core).

**Spec:** `docs/superpowers/specs/2026-11-06-mobile-kid-rework-design.md` ("Parent app", "Visual system changes", "Fun loop": parents see level and streak). Mockup: `docs/superpowers/specs/mockups/2026-11-06-mobile-kid-rework.html` section 8 (PA1 parent family, PA2 handover).

## Roadmap (this is plan 10 of 10)

1. Foundation (merged). 2. Progress backend (merged). 3. Child shell and Home (merged). 4. Jar pages and goal (merged). 5. Learn and the daily check-in (merged). 6. Diary, Jarso tab, Me, bell, level-up (in parallel). 7. Allowance split. 8. Child onboarding (in parallel). 9. Parent sign-up. **10. Parent restyle** (this plan, on `feat/mobile-kid-rework-6-8-10`).

## Global Constraints

- **Never commit until the user says so.** (Lessons, memory.) The "Commit" steps record the intended commit split: one focused Conventional Commit per task, subject ≤ 60 chars, no AI attribution.
- **Shared working tree.** Plans 6 and 8 build in the same tree at the same time. This plan edits only: `apps/mobile/app/(parent)/**`, `apps/mobile/src/features/{parent,family}/**`, the parent-only parts of `src/features/{requests,allowance,rules}` (`parent-request-items.tsx`, `due-list.tsx`, new `handover-card.tsx`, `handover-form.tsx`, `allowance-screen.tsx`, `allowance-form.tsx`, `gift-form.tsx`, `rules-form.tsx`), new core files `packages/core/src/requests/ask-card.ts` and `packages/core/src/dashboard/family-cards.ts`, their tests, and `docs/mobile.md` / `docs/design.md` in Task 9. Shared files get one additive line each, made with Edit after a fresh read: `packages/core/src/requests/index.ts`, `packages/core/src/dashboard/index.ts`, `apps/mobile/src/lib/query.ts` (`childProgress` key). **Do not touch** `app/(child)/**`, `app/(auth)/**`, `src/features/{progress,diary,onboarding,home,settings,learn,news}`, or any shared component's existing props.
- **No migration.** If a task finds it needs one, stop and say so.
- **Web copy is shared.** `parentRequestCopy`, `needsYouCopy`, `dueListCopy`, `handoverCopy`, `dashboardCopy`, `parentPageCopy` and `inboxCopy` render on the web: never edit their strings. New phone strings go in `askCardCopy` and `familyCardsCopy`. The result lines flashed after a tap (`parentRequestCopy.approved`, `.rejected`, `.depositDone`, `.depositRejected`, `.handedOver`, `.settled`, `.cancelled`) stay exactly as today.
- **Behaviour of the request answers is frozen.** `useDecideRequest`, `useCompleteRequest`, `useRejectDeposit`, `useCancelHandover` are unchanged; the row keeps one `idempotencyKey` per row across retries, `useSendOnce` (a second tap while one write runs is dropped), both buttons disabled while any write runs, `over_available` shown on the card, a thrown error shown on the card as `actionErrorMessage(cause)` with `accessibilityRole="alert"`, and "Didn't give it" still asks first in an `Alert` (`parentRequestCopy.didntHandOverTitle/Body/Confirm`).
- **Calm parent look.** Keycaps (`keycap` teal for the yes action, `keycap-white` for the other, `keycap-gold` for money handed over to a child: "Hand over" and the handover sheet's Confirm). No Sparks number, no `Confetti`, no `useCelebrate`, no `playSound` anywhere under `features/parent`, `features/family` or the files above (a source-grep test checks it). Parent body text stays 15/21 (`BodySizeProvider`).
- **Children are never compared.** Child cards keep the family's child order; nothing ranks, sums or contrasts them. A streak of 0 is not mentioned (spec: a broken streak is never mentioned).
- **Colours** from tokens: Spend tile `bg-tint-teal`, Save tile `bg-tint-gold` with `text-gold-text`, Goal tile bordered card; icon squares `rounded-2xl` on `tint-*`. Cards `rounded-3xl` (24 dp, spec "Radius: 24 for cards").
- **Accessibility.** Every button named; each card's two buttons carry the card's title as `accessibilityHint`; Jarso decorative; the child card is one button named `"<nickname>. <line>. Spend £x, Save £y, Goal z"`.
- Mobile tests in `apps/mobile/tests/` mirroring `src/`; core tests in `packages/core/tests/<module>/`. Run scoped tests (`pnpm --filter @jarso/mobile test -- <paths> --maxWorkers=2`); one root `pnpm check` in Task 9.

## Review Focus

1. **Two taps on "Got it".** The first tap starts `complete_request`; the second, while it runs, is dropped by `useSendOnce`, and both buttons are disabled with the pressed one showing its spinner. `callComplete` is called once, with the row's one idempotency key (Task 3 test).
2. **An answer that fails.** A CONFLICT shows its message on the card and refreshes the family reads; a network error shows the calm `actionErrorMessage` line; the buttons come back so the parent can try again with the same key (Task 3 tests).
3. **"Not yet" on a put-in.** It is `decide_deposit` (closes the put-in, nothing added), the same write as today's "Didn't get it", one tap, flashing "Okay, not added." (Task 3 test). An approved take-out's "Didn't give it" still asks first (Task 3 test).
4. **Progress that fails to load.** The child card still shows the name, the three money tiles and the missions line; level and streak are left out, Jarso wears the default look. Nothing red (Task 4 test).
5. **Two children.** Each card shows only its own child's level, streak and money, in the family's order; no sentence names both (Task 4 test).

---

### Task 1: Core ask card

**Files:**
- Create: `packages/core/src/requests/ask-card.ts`
- Modify: `packages/core/src/requests/index.ts` (append `export * from "./ask-card";`)
- Test: `packages/core/tests/requests/ask-card.test.ts`

**Interfaces:**
```ts
export type AskCardKind = "receive" | "decide" | "handover";
export type AskCard = { kind: AskCardKind; title: string; line: string; yes: string; no: string };
export const askCardCopy: {
  gotIt: "Got it"; notYet: "Not yet";           // a put-in: the child hands cash over
  yes: "Yes"; notNow: "Not now";                // a take-out or an ask for extra, pending
  handedOver: "Handed over"; didntGive: "Didn't give it"; // an approved take-out
  gotCash: "Got the cash?";
  fromSave: "From Save";
  extra: "Extra money";
  forReason: (reason: string) => string;        // "For: football boots"
  approvedFromSave: "Approved · from Save";
  approvedExtra: "Approved · extra";
};
/** The card for one request: which two answers it gets and its two lines. `amount` is formatted. */
export function askCard(
  request: Pick<SavingsRequest, "kind" | "status" | "reason">,
  nickname: string,
  amount: string,
): AskCard;
```
Mapping: deposit → `receive`, title `"Sam is saving £5"`, line `gotCash`, Got it / Not yet. Approved (withdrawal or emergency) → `handover`, title `"Hand £5 to Sam"`, line `approvedFromSave` / `approvedExtra`, Handed over / Didn't give it. Pending withdrawal → `decide`, title `"Sam asks £5 from Save"`, line `forReason(reason)` or `fromSave` with no reason. Pending emergency → `decide`, title `"Sam asks £5 extra"`, line `forReason(reason)` or `extra`.

- [ ] **Step 1: Write the failing tests:** `a put-in asks Got it or Not yet`; `a take-out asks Yes or Not now with its reason`; `a take-out with no reason says From Save`; `an ask for extra says extra with its reason`; `an approved take-out is handed over or not`; `an approved extra says extra`; `answer labels stay short` (every `yes`/`no` ≤ 3 words; titles never contain "overdue", "late" or "!").
- [ ] **Step 2: Run.** `pnpm --filter @jarso/core test -- tests/requests/ask-card.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** and append to the barrel.
- [ ] **Step 4: Run again plus the requests suite.** `pnpm --filter @jarso/core test -- tests/requests`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(core): one-tap ask card wording for parents`

### Task 2: Core child card line, week missions and goal percent

**Files:**
- Create: `packages/core/src/dashboard/family-cards.ts`
- Modify: `packages/core/src/dashboard/index.ts` (append `export * from "./family-cards";`)
- Test: `packages/core/tests/dashboard/family-cards.test.ts`

**Interfaces:**
```ts
export type WeekMissions = { done: number; total: number };
/** This week's quest (core `questMap` + `currentQuestWeek`): done and total, or null with no journey. */
export function weekMissions(journey: readonly Pick<JourneyMission, "key" | "day" | "title" | "status">[]): WeekMissions | null;
/** "Level 4 · 5-day streak · Missions 3/7". Unknown parts and a 0 streak are left out; null when nothing is known. */
export function childCardLine(facts: { level: number | null; streak: number | null; missions: WeekMissions | null }): string | null;
/** The goal tile: 0..100 (floored, reached is 100), or null with no goal. */
export function goalPercent(view: GoalView): number | null;
export const familyCardsCopy: {
  needsYou: (count: number) => string;  // "Needs you · 2", "Needs you" at 0
  children: "Children";
  spend: "Spend"; save: "Save"; goal: "Goal"; noGoal: "No goal";
  level: (n: number) => string;          // "Level 4"
  streak: (days: number) => string;      // "5-day streak"
  missions: (done: number, total: number) => string; // "Missions 3/7"
  childLabel: (nickname: string, line: string | null, spend: string, save: string, goal: string) => string;
  handOver: "Hand over";
  dueLine: (day: string, note: string | null) => string; // "Due 3 Nov · Birthday"
  handoverTitle: (amount: string, nickname: string) => string; // "£5 to Sam"
  inboxEmpty: "Nothing new";
  inboxEmptyLine: "Asks and handovers show up here.";
  unread: (n: number) => string;        // "3 new"
};
```

- [ ] **Step 1: Write the failing tests:** `the line has level, streak and the week's missions`; `a zero streak is never mentioned`; `missing progress leaves level and streak out`; `nothing known is null`; `week missions follow the quest week holding the current stop` (8 missions with the 8th current → `{ done: 0, total: 1 }`; 3 done of 7 → `{ done: 3, total: 7 }`); `an empty journey has no missions`; `goal percent floors, caps at 100, and is null with no goal`; `the copy never mentions sparks, rank or compare` (stringify every sample output; no `/spark|rank|best|top|than/i`).
- [ ] **Step 2: Run.** `pnpm --filter @jarso/core test -- tests/dashboard/family-cards.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** (imports `questMap`, `currentQuestWeek`, `JourneyMission` from `@jarso/core/learning`, `GoalView` from `@jarso/core/goals`, as `learning.ts` in this module does) and append to the barrel.
- [ ] **Step 4: Run the dashboard suite and lint.** `pnpm --filter @jarso/core test -- tests/dashboard && pnpm exec biome check packages/core/src/dashboard`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(core): parent child card line and goal percent`

### Task 3: One-tap ask cards

**Files:**
- Modify: `apps/mobile/src/features/requests/parent-request-items.tsx` (`ParentRequestItems` renders one `AskCard` per request, no separators; `ParentRequestRow` keeps its hooks and handlers, renders the card)
- Test: `apps/mobile/tests/features/requests/parent-request-items.test.tsx`

**Interfaces:**
```ts
export function ParentRequestItems(props: { items: FamilyRequestItem[]; currency: string }): ReactNode; // unchanged signature
```
The card (`rounded-3xl border border-border bg-card p-4 gap-3`): a 44 dp `rounded-2xl` icon square (`receive`: `PiggyBankIcon` on `tint-gold`; `decide`: `HandCoinsIcon` on `tint-teal`; `handover`: `BanknoteIcon` on `tint-teal`), the title (`font-sans-bold text-h3`), the line and "· 20 minutes ago" (`text-small text-muted-foreground`), the amount in the title. Then a row of two `flex-1` `sm` buttons: `keycap` with `card.yes`, `keycap-white` with `card.no`; the pressed one gets `loading`, both disabled while pending. Error under them (`text-destructive`, `accessibilityRole="alert"`).

- [ ] **Step 1: Update the tests** (labels move to `askCardCopy`, behaviour stays):
  - `says each request on its own card` (title `askCard(request, "Sam", "£5.00").title` and its line)
  - `Yes approves and flashes` (was "approve calls decide and flashes"; same `decide` payload, invalidations and `dispatchNotices`)
  - `Not now says no and flashes the web's line`
  - `already_decided flashes Already sorted`; `over_available shows the line on the card`; `a conflict shows the error and refetches the family`
  - `Got it confirms a put-in with one key per row`; `Not yet says no to a put-in` (`callDecideDeposit`, flash `depositRejected`)
  - `Handed over confirms an approved take-out`; `Didn't give it asks first` (spy `Alert.alert`, run the confirm button's `onPress`, expect `callCancel`)
  - new `two quick taps on Got it complete once` (hold `callComplete` on a deferred promise, press twice, expect 1 call and both buttons disabled)
  - new `a failed answer can be tried again with the same key` (reject once with `AppError("UNAVAILABLE", …)`, then resolve; both calls carry the same `idempotencyKey`)
  - new `no sparks, confetti or sound on the parent side` (`read()` from `tests/source-files.ts` over this file and every file under `src/features/{parent,family}` plus `due-list.tsx`, `handover-card.tsx`, `handover-form.tsx`: no `Confetti`, `useCelebrate`, `playSound`, `sparks`)
- [ ] **Step 2: Run.** `pnpm --filter @jarso/mobile test -- tests/features/requests/parent-request-items.test.tsx --maxWorkers=2`. Expected: FAIL (labels).
- [ ] **Step 3: Implement.** Keep `run`, `onDecide`, `onComplete`, `onRejectDeposit`, `onCancel` as they are; add a `pressed` state (`"yes" | "no" | null`) cleared when the write settles.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): answer asks in one tap on their card`

### Task 4: Parent read of progress and the child card

**Files:**
- Modify: `apps/mobile/src/lib/query.ts` (one key after `childLearning`: `childProgress: (childId: string) => ["child", childId, "progress"] as const`)
- Create: `apps/mobile/src/features/family/use-child-progress.ts`, `apps/mobile/src/features/parent/child-card.tsx`
- Modify: `apps/mobile/src/features/family/index.ts`, `apps/mobile/src/features/parent/index.ts` (append exports)
- Test: `apps/mobile/tests/features/parent/child-card.test.tsx`

**Interfaces:**
```ts
// use-child-progress.ts
/** A parent's read of one child's level, streak and Jarso look (`get_progress`, parent allowed). */
export function useChildProgress(childId: string): UseQueryResult<Progress>;

// child-card.tsx
export function MoneyTiles(props: { spend: string; save: string; goal: string }): JSX.Element;
export function ChildCard(props: { child: DashboardChild; currency: string; timezone: string }): JSX.Element;
export function ChildCards(props: { items: DashboardChild[]; currency: string; timezone: string }): JSX.Element;
```
`ChildCard` is one `Pressable` (`accessibilityRole="button"`, label `familyCardsCopy.childLabel(...)`, opens `/(parent)/children/<id>`): a 48 dp `tint-grape` circle with `<Jarso size={42} look={progress.data?.look} fill={jarsoFill({ saveMinor, spendMinor, goalTargetMinor })} />`, the nickname (`text-h3`), `childCardLine({ level, streak, missions: weekMissions(learning.journey) })`, a chevron; then `MoneyTiles`. Learning from `useChildLearning(child.id, timezone)` (`@/features/learning`).

- [ ] **Step 1: Write the failing tests** (mock `@jarso/data/progress` `getProgress`, `@jarso/data/learning` `getLearningOverview`, `expo-router`):
  - `shows Jarso, the line and three money tiles` (`"Level 4 · 5-day streak · Missions 3/7"`, `£12.50`, `£34`, `75%`)
  - `opens the child's hub`
  - `progress that fails leaves level and streak out` (line `"Missions 3/7"`, tiles still there, no alert role)
  - `two children each show only their own` (Sam level 4 / Mia level 2 in order; `getAllByRole("button")` names start with Sam then Mia; no text contains both names)
  - `no goal says No goal`
  - `asks the progress of each child by id` (`getProgress` called with `{ id: "client" }, "child-1"` and `"child-2"`)
- [ ] **Step 2: Run.** `pnpm --filter @jarso/mobile test -- tests/features/parent/child-card.test.tsx --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement** the key, hook, card and barrel lines.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): child cards with Jarso, level and streak`

### Task 5: Family and Children tabs in the new look

**Files:**
- Create: `apps/mobile/src/features/allowance/handover-card.tsx` (`HandoverCard`), export from `allowance/index.ts`
- Modify: `apps/mobile/src/features/parent/needs-you-card.tsx` (a section: eyebrow `familyCardsCopy.needsYou(n)` as header, the ask cards, the handover cards; all caught up is Jarso `happy` 40 dp beside `needsYouCopy.allCaughtUp` in a `tint-teal` pill), `family-home-screen.tsx` (summary card with a small Jarso; `ChildCards` under an eyebrow `familyCardsCopy.children`), `children-screen.tsx` (`ChildCards`; "Add a child" becomes `keycap-white`)
- Delete: `apps/mobile/src/features/family/children-list.tsx` (and its barrel line; no other user)
- Test: `apps/mobile/tests/features/parent/family-home.test.tsx`, `children.test.tsx`, new `apps/mobile/tests/features/allowance/handover-card.test.tsx`

**Interfaces:**
```ts
export function HandoverCard(props: {
  childId: string; item: DueItem; currency: string;
  /** Names the child in the title and the button's label (Family); omitted on the child's own page. */
  nickname?: string;
}): JSX.Element;
```
Card: `CalendarClockIcon` (allowance) or `GiftIcon` (gift) on `tint-gold`; title `"Allowance · £3.00"` (with nickname: `"Sam · Allowance · £3.00"`); line `familyCardsCopy.dueLine(formatDay(dueOn), note)`; a `keycap-gold` `sm` "Hand over" button labelled `needsYouCopy.handOverLabel(kind, nickname, day)` with a nickname, else `${dueListCopy.handOver}: …` as today; it pushes `/(parent)/children/<childId>/handover/<kind>/<id>`.

- [ ] **Step 1: Update and add tests:**
  - family-home: `needs you lists ask and handover cards, All caught up when empty` (eyebrow `familyCardsCopy.needsYou(2)`, the ask card's title, the hand-over button); `hand over opens the handover sheet for that item` (unchanged); `shows the date line, the title and the child cards` (`familyCardsCopy.children`, two `ChildCard` buttons, Sam's tiles `£12.50` / `£34`); `answers an ask from Family in one tap` (press `askCardCopy.yes`, `callDecideWithdrawal` called once)
  - children: rows → cards (`£12.50`, `£34`, `No goal`), open hub, add child, first-child card
  - handover-card: `names the child and the due day`; `opens the handover sheet`; `without a nickname uses the hub's label`
- [ ] **Step 2: Run.** `pnpm --filter @jarso/mobile test -- tests/features/parent tests/features/allowance/handover-card.test.tsx --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): family tab with ask, handover and child cards`

### Task 6: Child hub, rules and allowance in the new look

**Files:**
- Modify: `apps/mobile/src/features/parent/child-hub-screen.tsx` (hero: Jarso 72 dp in the child's look, `childCardLine`, `MoneyTiles` replacing `JarFigure`; asks as cards without the wrapping `Card`; section cards `rounded-3xl`)
- Modify: `apps/mobile/src/features/allowance/due-list.tsx` (`DueList` renders `HandoverCard`s under its header; `GiftList` "Give a gift" → `keycap-white`)
- Modify: `apps/mobile/src/features/allowance/{allowance-screen,allowance-form,gift-form}.tsx`, `apps/mobile/src/features/rules/rules-form.tsx`: the one primary save button per screen → `variant="keycap"`; nothing else changes
- Test: `apps/mobile/tests/features/parent/child-hub.test.tsx`, `apps/mobile/tests/features/rules/rules-form.test.tsx`, `apps/mobile/tests/features/allowance/allowance-form.test.tsx` (run, adjust only if a class assertion breaks)

- [ ] **Step 1: Add hub tests:** `the hub hero shows Jarso's line and the three tiles` (mock `getProgress` → level 3 streak 2; `"Level 3 · 2-day streak"`, `£12.50`, `£34`); `a due allowance is a handover card` (button `${dueListCopy.handOver}: …` pushes the handover route).
- [ ] **Step 2: Run.** `pnpm --filter @jarso/mobile test -- tests/features/parent/child-hub.test.tsx --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the parent, allowance and rules suites.** `pnpm --filter @jarso/mobile test -- tests/features/parent tests/features/allowance tests/features/rules --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): child hub, rules and allowance take the new look`

### Task 7: Handover sheet with Jarso and a gold Confirm

**Files:**
- Modify: `apps/mobile/src/features/allowance/handover-form.tsx` (`HandoverSheet` reads `useChildProgress(childId)` without waiting for it and passes `look`; `HandoverForm` gains optional `look?: JarsoLook`; the title block becomes Jarso `happy` 88 dp, `familyCardsCopy.handoverTitle(amount, nickname)` as the header, `handoverCopy.heading(...)` and the note under it; Confirm → `keycap-gold` `lg`; Not given → `keycap-white` `lg`)
- Test: `apps/mobile/tests/features/allowance/handover.test.tsx`

- [ ] **Step 1: Add tests:** `the sheet opens on Jarso and the amount to the child` (header `familyCardsCopy.handoverTitle("£3", "Sam")`); `the sheet does not wait for progress` (`getProgress` never resolves; Confirm still shows). Every existing case keeps passing unchanged.
- [ ] **Step 2: Run.** `pnpm --filter @jarso/mobile test -- tests/features/allowance/handover.test.tsx --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): handover sheet opens on Jarso and the amount`

### Task 8: The parent's Notifications screen

**Files:**
- Create: `apps/mobile/src/features/parent/parent-inbox-screen.tsx` (`ParentInboxScreen`), export from `parent/index.ts`
- Modify: `apps/mobile/app/(parent)/(tabs)/inbox.tsx` (render `ParentInboxScreen`)
- Test: `apps/mobile/tests/features/parent/parent-inbox.test.tsx`

Uses `useNotices`, `useUnreadCount`, `useMarkRead`, `useOpenNotice("parent")`, `InboxList` from `@/features/news` (reading only, `news` is not edited), currency from `useFamily()`. Header `parentPageCopy.inbox` with a `tint-teal` chip `familyCardsCopy.unread(n)` when unread; "Mark all as read" `keycap-white` `sm`; the list; "Show more" `keycap-white`. Empty: Jarso `sleepy` 96 dp centred, `familyCardsCopy.inboxEmpty` (`text-h2`) and `inboxEmptyLine`. An error is the calm `toUserMessage` line.

- [ ] **Step 1: Write the failing tests** (mock `@jarso/data/notifications`, `@jarso/data/family`, `expo-router`): `shows the parent's notices with the family currency`; `empty says Nothing new with a sleepy Jarso`; `mark all as read marks every notice`; `the unread chip counts new notices`; `opening a notice goes to its page`.
- [ ] **Step 2: Run.** `pnpm --filter @jarso/mobile test -- tests/features/parent/parent-inbox.test.tsx --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement** the screen and point the route at it.
- [ ] **Step 4: Run again plus the parent tab tests.** `pnpm --filter @jarso/mobile test -- tests/features/parent tests/app/parent-tabs.test.tsx tests/app/parent-layout.test.tsx --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): calm parent notifications screen with Jarso`

### Task 9: Docs and full verification

**Files:**
- Modify: `docs/mobile.md` (Kid-UI rework section: one paragraph for the parent restyle: ask cards, child cards with level and streak, handover cards, `useChildProgress` in `features/family`, the parent inbox screen), `docs/design.md` (§10 Parent: the phone's one-tap ask cards and child cards; no Sparks, no confetti)

- [ ] **Step 1: Update the docs** (facts only, short).
- [ ] **Step 2: Typecheck and lint this plan's files.** `pnpm --filter @jarso/mobile typecheck && pnpm --filter @jarso/core typecheck && pnpm exec biome check <files>`. Errors in files owned by plans 6 or 8 are noted, not fixed.
- [ ] **Step 3: Run the full check.** `pnpm check`. Report the result as is.
- [ ] **Step 4: Grep guards.** `grep -rn "Confetti\|useCelebrate\|playSound\|sparks" apps/mobile/src/features/{parent,family} apps/mobile/src/features/requests/parent-request-items.tsx apps/mobile/src/features/allowance/{due-list,handover-card,handover-form}.tsx` prints nothing.
- [ ] **Step 5: Commit.** `docs(mobile): parent restyle`

## Self-review

- **Spec coverage.** Visual system (keycaps, tokens, Jarso, 24 dp cards): Tasks 3–8. One-tap asks with the spec's pairs: Task 3 (Got it / Not yet, Yes / Not now). Child card (Jarso, learning in one line, three money tiles, level and streak, no comparing): Tasks 2 and 4. Handover, rules, allowance, hub keep function, new look: Tasks 5–7. Parent notifications: Task 8. Calmer (no Sparks, no confetti): constraint and Task 3's source test, Task 9's grep.
- **Interpretation.** "Got it / Not yet for handovers": in the mockup (PA1) that pair is on money the child hands to the parent ("Sam is saving ₹50 · Got the cash?"), i.e. a put-in. An allowance or gift due keeps opening the handover sheet (split, card payment, Not given) because the spec keeps the handover's function and that sheet is where money moves; its card gets a gold "Hand over" keycap. An approved take-out stays one tap ("Handed over"), as today.
- **Out of scope.** The allowance Spend/Save split (plan 7) and parent sign-up/onboarding (plan 9). The child inbox and bell (plan 6): `features/news` is read, not edited.
- **Type consistency.** `askCard` returns `AskCard` used by `ParentRequestRow`; `ChildCard` takes `DashboardChild` (has `spendMinor`, `saveMinor`, `goal`); `useChildProgress` returns `Progress` (`level`, `streak`, `look`); `HandoverCard` takes a `DueItem`, which `ChildDueItem` extends.
- **Dropped on purpose.** The Children tab no longer shows each child's newest money line ("Bought lunch · 3 Nov"); the card follows the spec (Jarso, one learning line, three tiles), and the line is one tap in on the hub's History.
