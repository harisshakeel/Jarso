# Mobile Kid Rework, Plan 3: Child shell and Home Implementation Plan

> **Status: shipped** in #145.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the child's shell and Home:

- new tabs: Home · Learn · **+** · Diary · Jarso; notifications move to a bell on Home
- the raised gold **+** keycap opens the "What happened?" sheet with five money moments and "My asks"
- Home in about 25 words: header (avatar, streak, Sparks, bell), Jarso hero with one bubble, Spend/Save tiles, the goal, today's mission; moment cards replace the hero when something is happening
- every money flow becomes how much (big keypad + quick chips) → what for (picture grid) → celebration; waiting asks show a 3-step tracker

**Architecture:** Pure rules and every new line of child copy go to core: a new `@jarso/core/home` module (keypad, quick chips, picture options, hero line, moment cards, money actions, spark chips, word budget) plus flow copy in `@jarso/core/diary` and `@jarso/core/requests` (ask reasons, ask celebrations, tracker steps, Jarso's guess). The phone gets a small `features/flows` kit (keypad, picture grid, flow shell, tracker, the + sheet) that the rewritten sheets compose. The sheets keep their mutation hooks, payloads, idempotency keys and outbox path; only the screens change. `celebrate()` (plan 1) replaces `SentToast`/`flash()` in these flows. `useProgress` and `useParentLabel` (plan 2) feed the header, the celebration chips and every "Mum".

**Tech Stack:** Expo 58, React Native 0.88, Expo Router (js-tabs), NativeWind 4, react-native-svg, Reanimated 4.7, TanStack Query, Zod, Jest + RNTL (mobile), Vitest (core).

**Spec:** `docs/superpowers/specs/2026-11-06-mobile-kid-rework-design.md` (Navigation, Home, Money actions, Flows). Mockups: `docs/superpowers/specs/mockups/2026-11-06-mobile-kid-rework.html` section 3 (H1 Home, H2 the + sheet, H3 Home with moments) and section 4 (F1–F7). Cross-plan contract: `/tmp/kid-rework/contract.md` (binding).

## Roadmap position

Plan 3 of 10 (see plan 1's roadmap). Branch `feat/mobile-kid-home`, worktree `.claude/worktrees/home`. Plans 4 (jars, goal) and 5 (learn, check-in) are built in parallel and rebased onto this branch later, so file ownership below is strict.

## Global Constraints

- Commits ARE authorised for this work (user asked for PRs). One focused Conventional Commit per task, subject ≤ 60 chars, imperative, NO AI attribution / Co-Authored-By lines. Commit identity is preset per worktree (noreply email); don't change git config.
- No Docker, no `supabase db reset`, no `db push`. This plan needs NO migration; if a task finds it needs one, stop and say so.
- CLAUDE.md hard rules apply: feature modules, barrels, core purity (rule 18: no React, RN, `@/**` or platform globals in `packages/core`), money in integer minor units, Biome only, child copy rules.
- **Word budget:** labels 1–3 words, Jarso bubble ≤ 8 words, Home ≤ 30 words, no paragraphs on the child side. Jarso is never sad; wrong guesses are calm blue (`tint-cyan`/`secondary`), never red.
- Mobile tests in `apps/mobile/tests/` mirroring `src/`; core tests in `packages/core/tests/<module>/`. Reduced motion respected (no bounce, no confetti; plan 1's components already handle it).
- Shared machine (12 cores, 13 GB): targeted tests only, `pnpm --filter @jarso/mobile test -- <paths> --maxWorkers=2` and `pnpm --filter @jarso/core test -- <paths>`. Full `pnpm check` only in Task 10.
- Read `docs/design.md` and `docs/mobile.md` before UI work. Colours from tokens / Tailwind classes, no raw hex (the theme grep tests enforce it). Lucide icons in rounded tinted squares; emoji only for the goal item.
- **Ownership.** Edit only files this plan owns (contract): the child tabs layout, `(tabs)/index.tsx`, `(tabs)/news.tsx` (removed), the new `(tabs)/plus.tsx`, `app/(child)/_layout.tsx`, `components/screen/tab-bar.tsx`, `features/home/**`, new `features/flows/**`, the money-flow sheets and their routes, `features/requests/request-list.tsx`, `features/goals/predict-step.tsx`, `features/push/push-permission-card.tsx`, core diary/requests copy and the new `packages/core/src/home/`. Small, listed exceptions: `features/news/notice-listener.tsx` and `features/push/use-push-taps.ts` (inbox route), `components/sheet/sheet-parts.tsx` (drop `SentToast`), the two predict cases at the end of `tests/features/goals/goals.test.tsx`, additive lines in `packages/core/package.json` and `apps/mobile/src/lib/query.ts`. Never edit `features/jars/**`, `features/goals/**` (except `predict-step.tsx`), `features/learning/**` or `(tabs)/learn.tsx`.
- **Interfaces fixed for plans 4 and 5:** `JarTile` exported from `@/features/home` with `onPress?: () => void` (left undefined here); Home renders `<GoalCard currency={…} />` and `<NextStepCard step={…} />` with their current props; the + sheet is `/(child)/add`.
- **Domain unchanged.** Same hooks (`useRecordPurchase`, `useRecordReceived`, `useUndo`, `useCreateDeposit`, `useCreateWithdrawal`, `useCreateEmergency`, `useCancelRequest`), same payloads, same schemas, same idempotency key per opening, same outbox path, Undo kept on the purchase flow.
- "Mum" is always `useParentLabel()` (falls back to "your parent"); copy functions take it as an argument and capitalise it at the start of a sentence.

## Review Focus

1. **Parent label fallback.** With no `child_facing_name`, every line still reads well at the start and the middle of a sentence ("Your parent said yes!", "Give cash to your parent"). Task 2 and 3 tests cover both.
2. **Keypad edge input.** "0" then "5", two dots, a third decimal, a dot in a zero-decimal currency, and backspace on empty never produce an unparseable or over-long amount (Task 1).
3. **Jarso's guess when nothing changes.** `predictOutcome` returns `same` (amount 0, or a take-out that leaves counted Save over the target): no guess is shown and the button still works (Task 3, Task 8).
4. **Undo after the celebration.** "Undo" on the purchase celebration closes it, keeps the sheet open, calls `undoEntry` with the returned entry id and shows the undo result or refusal in the sheet (Task 7). A `queued` (offline) purchase shows the existing waiting view and no celebration.
5. **Moment cards hide the hero, and Home stays usable if a side read fails.** Requests, allowance-due, progress or week movements failing must not blank Home: each block hides itself (Task 6).

---

### Task 1: `@jarso/core/home`: keypad, quick chips, picture options, word budget

**Files:**
- Create: `packages/core/src/home/index.ts`, `packages/core/src/home/keypad.ts`, `packages/core/src/home/pictures.ts`, `packages/core/src/home/words.ts`
- Modify: `packages/core/package.json` (exports: add `"./home": "./src/home/index.ts"`, additive)
- Test: `packages/core/tests/home/keypad.test.ts`, `packages/core/tests/home/pictures.test.ts`, `packages/core/tests/home/words.test.ts`

**Interfaces:**
- Produces:
  - `type KeypadKey = "0" | "1" | … | "9" | "." | "back"`, `const KEYPAD_KEYS: readonly KeypadKey[]` (order: 1 2 3 4 5 6 7 8 9 . 0 back, as the mockup pad)
  - `pressKey(value: string, key: KeypadKey, currency: string): string`. Digits only; at most one "."; no "." when `minorDigits(currency) === 0`; at most `minorDigits` digits after "."; a leading "0" is replaced ("0"+"5" → "5"); "." on empty → "0."; at most 6 whole digits; `back` drops the last char.
  - `quickChips(currency: string, limitMinor?: number | null): number[]` (minor units). Major amounts: INR `[10, 20, 50, 100]`, JPY `[100, 500, 1000, 5000]`, anything else `[1, 2, 5, 10]`; chips above `limitMinor` are dropped.
  - `type PictureTint = "teal" | "grape" | "gold" | "cyan" | "success"`, `type PictureIcon = string` (a Lucide name in kebab case)
  - `type PictureOption = { key: string; label: string; icon: PictureIcon; tint: PictureTint }`
  - `spendPictures(): PictureOption[]` from `SPEND_CATEGORIES` (same keys and labels, 9 → 3×3): snacks `cookie`, games `gamepad-2`, clothes `shirt`, going_out `ticket`, gift_for_someone `gift`, school `pencil-ruler`, travel `bus`, apps `smartphone`, other `ellipsis`.
  - `receivedPictures(): PictureOption[]` from `RECEIVED_CATEGORIES`: family `users`, birthday `cake`, job `briefcase`, sold `tag`, found `coins`, other `ellipsis`.
  - Tints cycle `teal, grape, gold, cyan, success` in list order.
  - `wordCount(text: string): number` (whitespace-split, ignores "·", "→" and lone numbers-with-currency count as one word), `capitalise(text: string): string`
  - Budget constants: `BUBBLE_MAX_WORDS = 8`, `LABEL_MAX_WORDS = 3`, `HOME_MAX_WORDS = 30`.

- [ ] **Step 1: Write the failing tests.**
  - keypad: `builds 45 from 4 then 5`; `replaces a leading zero`; `refuses a second dot`; `stops at two decimals in INR`; `refuses a dot in JPY`; `dot on empty gives 0.`; `back on empty stays empty`; `caps whole digits at 6`; `every result parses` (fold random key sequences, `parseMoney(v, "INR")` is non-null whenever `v` is non-empty and doesn't end in ".").
  - chips: `INR chips are 10 20 50 100 in minor units` (`[1000, 2000, 5000, 10000]`); `GBP chips are 1 2 5 10`; `drops chips above the limit` (`quickChips("INR", 3000)` → `[1000, 2000]`).
  - pictures: `spend pictures are the 9 core categories in order` (keys equal `SPEND_CATEGORIES.map(c => c.key)`); `received pictures are the 6 core categories`; `every label fits the label budget`.
  - words: `wordCount("₹40 saved this week. Nice!")` → 5; `capitalise("your parent")` → `"Your parent"`.
- [ ] **Step 2: Run them.** `pnpm --filter @jarso/core test -- tests/home`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the three files and the barrel. Import `minorDigits`, `parseMoney` from `@jarso/core/lib` and categories from `@jarso/core/ledger`.
- [ ] **Step 4: Run** `pnpm --filter @jarso/core test -- tests/home && pnpm exec biome check packages/core/src/home packages/core/tests/home`. Expected: PASS, no purity errors.
- [ ] **Step 5: Commit.** `feat(core): keypad, quick chips and picture options`.

### Task 2: Home rules in core: hero line, moment cards, money actions, spark chips

**Files:**
- Create: `packages/core/src/home/hero.ts`, `packages/core/src/home/moments.ts`, `packages/core/src/home/copy.ts`, `packages/core/src/home/sparks.ts`
- Modify: `packages/core/src/home/index.ts`
- Test: `packages/core/tests/home/hero.test.ts`, `packages/core/tests/home/moments.test.ts`, `packages/core/tests/home/copy.test.ts`, `packages/core/tests/home/sparks.test.ts`

**Interfaces:**
- Consumes: `balanceHistory`, `jarChange`, `JarMovement`, `Jars` (`@jarso/core/ledger`); `SavingsRequest` (`@jarso/core/requests`); `JarsoMoment` (`@jarso/core/mascot`); `Progress` (`@jarso/core/progress`); Task 1.
- Produces:
  - `heroLine(input: { jars: Jars; movements: JarMovement[] | null; today: string; money: (minor: number) => string }): { text: string; moment: JarsoMoment }`. The graph caption's logic (`balanceHistory` over the last 7 days, then `jarChange`) cut to one jar and ≤ 8 words:
    - `movements === null` (still loading or failed): `"Good to see you!"`, `greeting`
    - both jars 0 and no moves: `"Your pocket money will land here."`, `empty`
    - Save went up: `` `${m} saved this week. Nice!` ``, `saved`
    - Save went down: `` `Save dipped ${m} this week.` ``, `rest`
    - only Spend moved: `` `Spend climbed ${m} this week.` `` / `` `Spend dipped ${m} this week.` ``, `rest`
    - nothing moved: `"Both jars stayed put this week."`, `rest`
  - `type HomeMoment = { kind: "said-yes"; request: SavingsRequest } | { kind: "allowance-due"; amountMinor: number } | { kind: "waiting"; request: SavingsRequest; more: number }`
  - `selectMoments(input: { requests: SavingsRequest[] | null; due: { totalMinor: number; count: number } | null }): HomeMoment[]`. Order: each `approved` withdrawal or emergency (newest first) as `said-yes`, then `allowance-due` when `due.count > 0`, then one `waiting` for the newest `pending` request with `more` = the other pending count. At most 3. Rejected and cancelled never show.
  - `momentLines(m: HomeMoment, money, parent: string): { title: string; line: string; chip?: string }` (2 lines max):
    - said-yes withdrawal: `` `${Parent} said yes!` `` / `` `${m} from savings is coming` ``; emergency: `` `${m} extra is coming` ``
    - allowance-due: `"Pocket money day!"` / `` `+${m} · ${Parent} hands it over` ``
    - waiting deposit: `` `Save ${m}` `` / `` `Give the cash to ${parent}` ``, chip `"Waiting"` (or `` `${more + 1} waiting` ``); withdrawal: `` `Use ${m} savings` `` / `` `Waiting for ${parent}` ``; emergency: `` `Extra ${m}` `` / `` `Waiting for ${parent}` ``
  - `homeCopy = { greeting: (name: string | null) => name ? \`Hi ${name}!\` : "Hi!", spendTile: { name: "Spend", caption: "In your pocket" }, saveTile: { name: "Save", caption: (parent) => \`${Parent} keeps it\` }, me: "Me", bell: "Notifications", sparks: (n) => \`${n} Sparks\`, streak: (n) => n === 1 ? "1 day" : \`${n} days\` }`
  - `type MoneyActionKey = "purchase" | "received" | "put-in" | "take-out" | "ask-extra"` (= the route names)
  - `moneyActions(parent: string): { key: MoneyActionKey; label: string; hint: string; icon: PictureIcon; tint: PictureTint }[]`, the spec table: I bought something / From Spend / `shopping-bag` / teal · I got money / Gift, pay, found / `gift` / success · Save some / `` `Give cash to ${parent}` `` / `piggy-bank` / gold · Use savings / `` `Ask ${parent} for it` `` / `hand-coins` / cyan · Ask for extra / Need a bit more? / `hand-helping` / grape.
  - `addSheetCopy = { title: "What happened?", open: "What happened?", myAsks: "My asks", waiting: (n: number) => \`${n} waiting\`, close: "Close" }`
  - `sparkChips(before: Progress | undefined, after: Progress | undefined): { icon: "zap" | "flame"; label: string }[]`: `+N` zap when both exist and `after.sparks > before.sparks`; a flame `homeCopy.streak(after.streak)` when `after.streak >= 1`. Nothing for a missing `after`.

- [ ] **Step 1: Write the failing tests.**
  - hero: `save up praises in ≤ 8 words` (jars `{spend: 1200, save: 34000}`, a +4000 save move today → `"₹40 saved this week. Nice!"`, moment `saved`); `save down is plain`; `spend only`; `nothing moved`; `empty jars and no moves is sleepy`; `null movements greets`; `every line fits the bubble budget` (loop over the cases, `wordCount ≤ BUBBLE_MAX_WORDS`); `never mentions shame words` (no "only", "lost", "bad").
  - moments: `said-yes first, then due, then waiting`; `caps at 3`; `rejected and cancelled never show`; `waiting counts the others`; `null inputs give no moments`; `deposit approved is not a said-yes` (deposits have no `approved`).
  - copy: `momentLines capitalises the fallback parent` (`"Your parent said yes!"`); `moneyActions labels fit 3 words and hints fit 5`; `Mum reads naturally` (`moneyActions("Mum")[2].hint === "Give cash to Mum"`); `saveTile caption` → `"Mum keeps it"` / `"Your parent keeps it"`.
  - sparks: `shows the gain and the streak`; `no zap without a before`; `no zap when sparks did not move (daily cap)`; `1 day not 1 days`.
- [ ] **Step 2: Run** `pnpm --filter @jarso/core test -- tests/home`. Expected: FAIL.
- [ ] **Step 3: Implement.** `heroLine` uses `balanceHistory(jars, movements, addDays(today, -6), today)` then `jarChange`. Keep `graphCaption` untouched (the web uses it).
- [ ] **Step 4: Run** the tests and `pnpm exec biome check packages/core/src/home`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(core): home hero line, moment cards and money actions`.

### Task 3: Flow copy in core: diary flows, asks, tracker, Jarso's guess

**Files:**
- Modify: `packages/core/src/diary/copy.ts` (append), `packages/core/src/requests/index.ts`
- Create: `packages/core/src/requests/flow-copy.ts`, `packages/core/src/home/guess.ts` (+ barrel line)
- Test: `packages/core/tests/diary/flow-copy.test.ts`, `packages/core/tests/requests/flow-copy.test.ts`, `packages/core/tests/home/guess.test.ts`

**Interfaces:**
- Produces (existing exports such as `entrySavedMessage`, `receivedCopy`, `depositMessage` stay unchanged for the web):
  - `purchaseFlowCopy = { howMuch: "How much?", onWhat: "On what?", next: "Next", spendHas: (m) => \`Spend has ${m}\`, nameHint: (hint: string) => \`${hint} (if you want)\`, done: (m, label) => \`Done · ${m} ${label.toLowerCase()}\`, celebrate: "Written down!", celebrateSub: (m, label) => \`${m} · ${label}\`, nice: "Nice", undo: "Undo" }`
  - `receivedFlowCopy = { howMuch: "How much?", got: (m) => \`Got ${m}!\`, from: "From", putItIn: "Put it in", spend: { label: "Spend", hint: "Keep the cash" }, save: { label: "Save", hint: (parent) => \`Give it to ${parent}\` }, submit: (jar: "Spend" | "Save") => \`Put it in ${jar}\`, goalAfter: (emoji, name, m) => \`${emoji} ${name}: ${m} to go after this!\` }`
  - `type AskKind = "deposit" | "withdrawal" | "emergency"`
  - `askFlowCopy(parent)`: `{ deposit: { title: "Save some", button: (m) => \`I'll give ${m} to ${parent}\`, limit: (m) => \`Spend has ${m}\` }, withdrawal: { title: "Use savings", forWhat: "For what?", button: \`Ask ${parent}\`, limit: (m) => \`You can ask up to ${m}\` }, emergency: { title: "Ask for extra", forWhat: "For what?", button: \`Ask ${parent}\`, otherHint: "Say what it's for" } }`
  - `askReasons(kind: "withdrawal" | "emergency", goal: { emoji: string; name: string } | null): { key: string; label: string; icon: PictureIcon; tint: PictureTint; emoji?: string }[]`: goal first (withdrawal only, label "My goal", emoji), then Games, A gift, Clothes, Going out, School, Other.
  - `reasonText(key: string, options, typed: string, goal): string` → goal: `` `My goal: ${goal.name}` `` (≤ 140 chars); Other: `typed.trim()`; else the label. Fed to the unchanged `withdrawalSchema` / `emergencySchema`.
  - `askCelebration(kind: AskKind, status: string, m: string, parent: string): { title: string; subtitle?: string; tracked: boolean }`:
    - deposit pending `` `Now give ${parent} ${m}` `` / `"Then it's in Save"` (tracked); confirmed or done `` `${m} in Save!` ``
    - withdrawal pending `` `Asked ${Parent}!` `` / `` `${m} from savings` `` (tracked); approved `` `${Parent} said yes!` `` / `` `${Parent} will hand you ${m}` `` (tracked); done `` `${m} is yours` `` / `` `${Parent} knows` ``
    - emergency pending `` `Asked ${Parent}!` `` / `` `${m} extra` `` (tracked)
    - any `already_sent`: `` `Already sent to ${parent}` ``, not tracked
  - `type TrackerStep = { state: "done" | "now" | "next"; title: string; sub?: string }`
  - `trackerSteps(request: SavingsRequest, m: string, parent: string, when: string): TrackerStep[] | null` (3 steps; `when` is the app's formatted "Today, 4:10 pm"):
    - deposit: You asked (`when`) · `` `Give ${parent} the ${m}` `` (`"Hand over the cash"`) · In your Save jar
    - withdrawal: You asked · `` `${Parent} says yes` `` · Cash in your hand
    - emergency: You asked · `` `${Parent} says yes` `` · In your Spend jar
    - `pending` → step 2 is now; `approved` → step 3 is now; `handed_over` / `confirmed` → all done; `rejected` / `cancelled` → `null`
  - `heldLine(m) => \`${m} held in Spend till then\`` (deposit pending only), `trackerCopy = { cancel: "Cancel this", cancelled: "Cancelled", title: "My asks", empty: "Nothing here yet." }`
  - `guessCopy = { question: (emoji) => \`${emoji} Your goal gets…\`, further: "Further", closer: "Closer" }`
  - `guessResult(outcome: Outcome, guess: "further" | "closer"): { right: boolean; line: string } | null`: `null` when `outcome.actual === "same"`; line is `"Yes! "`/`"Good guess! "` + `` `${n} allowance(s) ${closer|further}.` `` when `before` and `after` are both numbers and differ by `n > 0`, else `"A bit closer."` / `"A bit further."`. ≤ 8 words.

- [ ] **Step 1: Write the failing tests.**
  - diary: `done repeats the choice` (`purchaseFlowCopy.done("₹45", "Snacks")` → `"Done · ₹45 snacks"`); `goalAfter matches the mockup` (`"⚽ Boots: ₹0 to go after this!"`).
  - requests: `deposit button says the real action` (`"I'll give ₹50 to Mum"`); `only sentence starts capitalise` (`askFlowCopy("your parent").withdrawal.button` → `"Ask your parent"`; `askCelebration("withdrawal", "approved", "₹60", "your parent").title` → `"Your parent said yes!"`); `reasons put the goal first for withdrawals only`; `reasonText for the goal and for Other`; `emergency Other with no text gives "" so the schema refuses it`; `askCelebration maps every status` (table test over the result unions in `requests/types.ts`); `tracker pending deposit`, `tracker approved withdrawal`, `tracker done`, `tracker rejected is null`; `every tracker title fits 6 words`.
  - guess: `same gives null`; `closer by 2 allowances`; `no plan says a bit closer`; `wrong guess is kind` (starts with "Good guess!").
- [ ] **Step 2: Run** `pnpm --filter @jarso/core test -- tests/diary tests/requests tests/home`. Expected: FAIL.
- [ ] **Step 3: Implement.** Use `capitalise` from Task 1 for sentence starts only.
- [ ] **Step 4: Run** the same command plus `pnpm --filter @jarso/core typecheck`. Expected: PASS (the existing diary and requests snapshot tests unchanged).
- [ ] **Step 5: Commit.** `feat(core): copy for money flows, asks and the tracker`.

### Task 4: The flows kit on the phone

**Files:**
- Create: `apps/mobile/src/features/flows/{index.ts,amount-keypad.tsx,picture-grid.tsx,flow-shell.tsx,ask-tracker.tsx,sent-celebration.tsx,use-spark-chips.ts,icons.ts}`
- Modify: `apps/mobile/src/features/goals/predict-step.tsx` (add `JarsoGuess`; `PredictStep` and its props stay exactly as they are, `goal-sheet.tsx` still uses it)
- Create: `apps/mobile/tests/flow-render.tsx` (test helper: `QueryClientProvider` with `retry: false` + the real `CelebrationProvider`)
- Test: `apps/mobile/tests/features/flows/kit.test.tsx`, `apps/mobile/tests/features/goals/predict-step.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–3, `Jarso`, `Button` keycaps, `useCelebrate`, `CelebrationChip`, `useProgress`.
- Produces:
  - `AmountKeypad(props: { value: string; onChange: (v: string) => void; currency: string; chips?: number[]; limit?: string; error?: string; testID?: string })`. A big amount line (`text-money-xl`, `accessibilityLabel="Amount"`, `accessibilityValue`), one limit chip, the quick chips (setting, not adding), a 4×3 pad of 64 dp `keycap-white` keys; `back` is a `DeleteIcon` labelled "Delete". `error` shows under the amount (`accessibilityLiveRegion="polite"`).
  - `PictureGrid(props: { options: (PictureOption & { emoji?: string })[]; value: string | null; onChange: (key: string) => void; legend: string; columns?: 3 })`: a `radiogroup` of tiles, each a `radio` with the label, a tinted rounded icon square (`icons.ts` maps names to Lucide), `checked` tile gets a teal border.
  - `FlowShell(props: { title: string; step?: number; steps?: number; onBack?: () => void; onClose: () => void; footer: ReactNode; children: ReactNode; icon?: PictureIcon; tint?: PictureTint })`: header (back arrow when `onBack`, else X "Close"), step dots, title as `header`, scrollable body, footer pinned.
  - `AskTracker({ steps }: { steps: TrackerStep[] })`: vertical done / now / next with check, live dot and hollow dot; the `now` step is announced.
  - `SentCelebration({ celebration, onShown }: { celebration: Celebration; onShown?: () => void })`: calls `celebrate()` once on mount (ref-guarded), renders an empty `bg-background` view.
  - `useSparkChips(): { snapshot: () => void; chips: () => Promise<CelebrationChip[]> }`. `snapshot` keeps the cached progress; `chips` refetches `keys.progress` (bounded by a 1.5 s race), then `sparkChips(before, after)`. Never throws (returns `[]`).
  - `JarsoGuess(props: { move: "put_in" | "take_out"; amountMinor: number | null; goal: Pick<Goal, "name" | "emoji" | "targetMinor" | "planMinor">; saveMinor: number; reservedMinor: number })`: a row with a 44 dp `Jarso` (mood `think`, then `cheer` after a right guess, `happy` after a wrong one) and a bubble with `guessCopy.question`, two pills Further / Closer, then the `guessResult` line on `bg-secondary` (blue, never red). Hidden when the amount is null/≤ 0 or `guessResult` would be null. Resets when the amount changes.

- [ ] **Step 1: Write the failing tests.**
  - `AmountKeypad`: `taps build the amount` (press 4, 5 → `onChange` last called with "45"; drive state with a tiny host); `a quick chip sets the amount` ("₹20" → "20"); `delete removes a digit`; `shows the limit chip`; `keys are at least 44 dp` (style/className contains `h-16`).
  - `PictureGrid`: `is a radiogroup of 9 for spend`; `pressing a tile checks it`.
  - `FlowShell`: `back shows on step 2 and calls onBack`; `close calls onClose`; `title is a header`.
  - `AskTracker`: `marks done, now and next` (testIDs `tracker-step-done|now|next`).
  - `SentCelebration`: `celebrates once even when re-rendered` (title shows once; press "Nice" → `primary.onPress` called).
  - `useSparkChips`: `gives +10 and the streak after a log` (seed cache `{sparks: 230, streak: 5}`, refetch returns `{sparks: 240, streak: 6}`); `gives [] when the refetch fails`.
  - `JarsoGuess` (`predict-step.test.tsx`): `asks once an amount is typed`; `a right guess cheers` (put_in with a plan → "Yes! 1 allowance closer."); `a wrong guess is calm` (no `text-destructive`); `hidden when nothing changes`; `PredictStep still renders for change_plan` (guards `goal-sheet`).
- [ ] **Step 2: Run** `pnpm --filter @jarso/mobile test -- tests/features/flows tests/features/goals/predict-step.test.tsx --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.** Pad keys call `pressKey`; chips use `toMajorString`. Haptic `selectionAsync` on key press (catch and ignore). Reduced motion needs nothing extra here.
- [ ] **Step 4: Run** the tests, then `pnpm --filter @jarso/mobile typecheck && pnpm exec biome check apps/mobile/src/features/flows apps/mobile/src/features/goals/predict-step.tsx`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): keypad, picture grid and tracker for flows`.

### Task 5: Child shell: new tabs, the + keycap and the "What happened?" sheet

**Files:**
- Modify: `apps/mobile/app/(child)/(tabs)/_layout.tsx`, `apps/mobile/src/components/screen/tab-bar.tsx` (+ `components/screen/index.ts` barrel line), `apps/mobile/app/(child)/_layout.tsx`
- Create: `apps/mobile/app/(child)/(tabs)/plus.tsx` (renders `null`; never navigated to), `apps/mobile/app/(child)/add.tsx`, `apps/mobile/app/(child)/news.tsx`, `apps/mobile/src/features/flows/add-sheet.tsx`
- Delete: `apps/mobile/app/(child)/(tabs)/news.tsx`
- Modify: `apps/mobile/src/features/news/notice-listener.tsx` (`INBOX.child` → `"/(child)/news"`), `apps/mobile/src/features/push/use-push-taps.ts` (summary → `"/(child)/news"`)
- Test: `apps/mobile/tests/app/tabs.test.tsx` (rewrite cases), `apps/mobile/tests/features/flows/add-sheet.test.tsx`, `apps/mobile/tests/features/news/news.test.tsx` and `apps/mobile/tests/features/push/taps.test.tsx` (the one expected href each)

**Interfaces:**
- Consumes: `moneyActions`, `addSheetCopy` (Task 2), `useRequests`, `useParentLabel`.
- Produces:
  - Tabs in order `index` (Home, `HouseIcon`), `learn` (Learn, `MapIcon`), `plus` (title "", `tabBarButton` = `PlusTabButton`), `diary` (Diary, `NotebookPenIcon`), `jarso` (Jarso, `SparklesIcon`, still `href: null` when the guide is off). No `news` tab and no unread badge in the bar.
  - `PlusTabButton({ onPress }: { onPress: () => void })`: a 64 dp gold circle raised 18 dp above the bar with a 5 dp `keycap-ledge-gold` ledge and a `PlusIcon`, `accessibilityRole="button"`, `accessibilityLabel="What happened?"`. Pushes `/(child)/add`; never selects the `plus` tab.
  - `/(child)/add` in `SHEETS`; `/(child)/news` in `PAGES` (title "Notifications", the child inbox: `<NewsScreen viewer="child" />`). `/(child)/notifications` stays the push settings page Me opens.
  - `AddSheet({ onPick, onAsks, onClose }: { onPick: (key: MoneyActionKey) => void; onAsks: () => void; onClose: () => void })`: header "What happened?" with X, a 2-column grid of the five tiles (the fifth full width), each a `button` named by its label with the hint under it, then a "My asks" row with `` `${n} waiting` `` when there are pending or approved asks. The route does `router.replace(\`/(child)/${key}\`)` and `router.replace("/(child)/requests")`.
- [ ] **Step 1: Write the failing tests.**
  - tabs: `are Home, Learn, +, Diary and Jarso`; `the + button opens What happened?` (render the `tabBarButton` from the mocked `Tabs.Screen` options, press it, expect `push("/(child)/add")`); keep `tabs hide Jarso when guide off` and `keeps Jarso hidden when the guide state can't be read`; drop `badges Notifications with the unread count`.
  - add sheet: `shows the five moments with their hints` (`getByRole("button", { name: "Save some" })`, `"Give cash to Mum"` with `findParentLabels` mocked to `["Mum"]`); `uses your parent without a name`; `picking a moment opens its flow` (`onPick("put-in")`); `My asks shows how many are waiting` (2 pending → `"2 waiting"`); `fits the word budget` (sum of `wordCount` over visible text ≤ 32, the mockup's ~30).
  - news and taps: update the expected href to `"/(child)/news"`.
- [ ] **Step 2: Run** `pnpm --filter @jarso/mobile test -- tests/app/tabs.test.tsx tests/features/flows/add-sheet.test.tsx tests/features/news tests/features/push/taps.test.tsx --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.** The `plus` route file exists only because js-tabs needs a screen per tab; the name avoids `/(child)/add` clashing with the sheet (groups don't change URLs). Keep the 68 dp bar; the raised button overflows upward (`overflow: visible` on the bar style).
- [ ] **Step 4: Run** the tests and `pnpm --filter @jarso/mobile typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): child tabs with the + keycap and money moments`.

### Task 6: Home: header, Jarso hero, moments, jar tiles, goal, mission

**Files:**
- Rewrite: `apps/mobile/src/features/home/home-screen.tsx`
- Create: `apps/mobile/src/features/home/{home-header.tsx,home-hero.tsx,moment-card.tsx,jar-tile.tsx,use-home-extras.ts}`; Modify `features/home/index.ts`
- Modify: `apps/mobile/src/lib/query.ts` (additive: `allowanceDue: (u) => ["home", u, "due"]`, `homeWeek: (u) => ["home", u, "week"]`; both refresh with `home`)
- Move: `apps/mobile/tests/features/jars/home-screen.test.tsx` → `apps/mobile/tests/features/home/home-screen.test.tsx` (it tests Home; delete the old file)

**Interfaces:**
- Consumes: `heroLine`, `selectMoments`, `momentLines`, `homeCopy` (Task 2); `jarsoFill`; `useHome` (`@/features/jars`); `useGoal`, `GoalCard` (`@/features/goals`); `useLearningOverview`, `NextStepCard` (`@/features/learning`); `useRequests`; `useProgress`, `useParentLabel`; `useUnreadCount`; `useNickname`; `PendingPurchases`; `sumDueOccurrences` (`@jarso/data/allowance`); `listMovementsSince`, `localDate` (`@jarso/data/ledger`).
- Produces:
  - `JarTile(props: { jar: "spend" | "save"; amount: string; caption: string; onPress?: () => void })`: solid `bg-teal-600` (Spend, `WalletIcon`) or `bg-gold` (Save, `PiggyBankIcon`), 24 radius, 110 dp, name, `text-money-xl` amount (`numberOfLines={1}`, `adjustsFontSizeToFit`), caption. A `button` named `` `${name} ${amount}` `` only when `onPress` is set; otherwise a plain group.
  - `useAllowanceDue()`, `useHomeWeek(jars, context)` in `use-home-extras.ts` (reads above; each `null` on error).
  - `HomeScreen` order: `HomeHeader` → moment cards (if any) else `HomeHero` → `PendingPurchases` (unchanged, only shows when the outbox has items) → two `JarTile`s → `<GoalCard currency />` → today's mission: `useLearningOverview(timezone).data?.nextStep` → `<NextStepCard step />` (hidden while loading or on error).
  - `HomeHeader`: a 40 dp avatar circle with Jarso's head (`look` from progress) → `/(child)/me` ("Me"); greeting `homeCopy.greeting(nickname)`; Flame chip (streak, hidden at 0) and Zap chip (Sparks), each with an accessible label (`"5 days"`, `"240 Sparks"`); bell → `/(child)/news` with a gold count dot when unread > 0 (label `` `Notifications, ${n} new` ``).
  - `HomeHero`: `Jarso` 120 dp, `fill = jarsoFill({ saveMinor: jars.save, spendMinor: jars.spend, goalTargetMinor: goal?.goal.targetMinor ?? null })`, `mood = moodFor(hero.moment)`, `look` from progress, `bounce`; one bubble with `hero.text`.
  - `MomentCard({ moment, money, parent, onPress })`: 2 lines max (`numberOfLines={1}` each), tinted by kind (`tint-gold` + Jarso `wow` for allowance-due, `success-soft` + check for said-yes, card + clock + gold chip for waiting); every card opens `/(child)/requests`, except allowance-due which is not pressable (the parent hands it over; nothing for the child to do).
- Removed from Home: the jars card with quick actions, the MORE list, `JarGraph`, `PushPermissionCard`, `HomeStepCard`, the date overline.

- [ ] **Step 1: Write the failing tests** (`home-screen.test.tsx`; mock `@jarso/data/{ledger,requests,family,allowance,progress,goals,learning,notifications}` and `expo-router`):
  - keep: `greets the child by nickname` (`"Hi Sam!"`), `says Hi! when there is no nickname`, `refetches on pull to refresh`, `shows a calm message and retries when the jars can't load`, `never shows a raw error`, `big balances stay on one line`.
  - new: `shows Spend and Save tiles with their captions` (`"In your pocket"`, `"Mum keeps it"`); `tiles are not buttons yet`; `Jarso's bubble says how Save moved` (a +₹40 save movement this week → `"₹40 saved this week. Nice!"`); `shows streak and Sparks`; `hides the streak at 0`; `the avatar opens Me and the bell opens notifications`; `a waiting ask replaces the hero` (pending deposit → `"Save ₹50"`, `"Give the cash to Mum"`, no bubble text); `a yes shows as a moment` (approved withdrawal → `"Mum said yes!"`); `pocket money due shows the amount`; `renders the goal and today's mission` (`GoalCard` empty-state text and the `NextStepCard` title from `describeStep`); `no graph, no action list, no push card` (`queryByText("Move my money")`, `queryByText(graphCopy.title)` null); `Home stays up when side reads fail` (requests, due, progress and movements reject → tiles still show); `fits the word budget` (sum of `wordCount` over every `Text` outside the goal and mission cards ≤ 30 − 10, leaving room for them).
  - drop: `shows both jars in one card with the total`, `shows the date over the greeting`, `has two quick actions in the jars card`, `says what is waiting to come out and what is held`, `shows no reserved or held line when there is none` (moments replace them).
- [ ] **Step 2: Run** `pnpm --filter @jarso/mobile test -- tests/features/home --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.** Pull to refresh invalidates `home` (covers `due`, `week`, `balance`), `goal`, `learning`, `requests`, `progress`, `unread`. Use `formatMoney(…, { showMinor: "nonzero" })`.
- [ ] **Step 4: Run** the tests, `pnpm --filter @jarso/mobile typecheck`, `pnpm exec biome check apps/mobile/src/features/home`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): Home with Jarso, jar tiles and moment cards`.

### Task 7: "I bought something" and "I got money" as keypad flows

**Files:**
- Rewrite: `apps/mobile/src/features/diary/purchase-sheet.tsx`, `apps/mobile/src/features/diary/received-sheet.tsx`
- Modify (only if layout needs it): `apps/mobile/app/(child)/purchase.tsx`, `apps/mobile/app/(child)/received.tsx`
- Test: `apps/mobile/tests/features/diary/purchase-sheet.test.tsx`, the "Got money" block of `apps/mobile/tests/features/diary/diary-more.test.tsx`

**Interfaces:**
- Consumes: `AmountKeypad`, `PictureGrid`, `FlowShell`, `useSparkChips` (Task 4); `purchaseFlowCopy`, `receivedFlowCopy` (Task 3); `spendPictures`, `receivedPictures`, `quickChips` (Task 1); unchanged `useRecordPurchase`, `useRecordReceived`, `useUndo`, `sentEntryId`, `purchaseSchema`, `receivedSchema`, `NAME_HINTS`.
- Produces: `PurchaseSheet` and `ReceivedSheet` keep their names and props (`onClose`, `initial`, `replaces`), and `PurchaseDraft`. `JarChoice` is replaced by two big picks inside `received-sheet.tsx` (still exported, now `{ value, onChange, parent }`).
- Purchase: step 1 "How much?" (keypad, `quickChips(currency, availableSpendMinor)`, limit chip `spendHas`), Next validates the amount with `purchaseSchema`'s amount field error. Step 2 "On what?" (3×3 `spendPictures`, one optional name line with `nameHint(NAME_HINTS[key] ?? DEFAULT_NAME_HINT)`, `maxLength 60`), keycap `done(amount, label)`. Payload exactly `{ amount, category, label, idempotencyKey }`.
  - `sent` → `celebrate({ title: "Written down!", subtitle: celebrateSub, tone: "teal", mood: "cheer", sound: "coin", chips, primary: { label: "Nice", onPress: onClose }, secondary: entryId ? { label: "Undo", onPress: takeBack } : undefined })`; under it the sheet shows the existing saved view (undo result, refusal, Done).
  - `queued` → the existing `offlineCopy.waiting` view, no celebration. `refused` / `unsaved` / `unsent` → the notice on step 2.
- Received: step 1 "How much?" (keypad, chips). Step 2 `got(amount)` with "From" (`receivedPictures`, 3 columns), "Put it in" two big picks (Spend · Keep the cash / Save · Give it to Mum, default Spend as today), the optional name line, and `goalAfter` when Save is picked and there's an unreached goal (`remainingMinor - amountMinor`, floored at 0). Keycap `submit(jar)`. Payload unchanged. Success → `celebrate({ title: "Written down!", subtitle: \`${m} · ${label}\`, tone: "gold", sound: "coin", chips, primary: { label: "Nice", onPress: onClose } })`. No Undo (it had none).

- [ ] **Step 1: Update the tests first.**
  - purchase: rewrite `fill()` to press keypad keys (`getByRole("button", { name: "4" })`…), Next, then the "Snacks" radio. Keep the payload, refusal, queued, prefill (`initial` + `replaces`), idempotency (retry and new opening), dispatch-failure and double-press cases, adjusted to the button name `"Done · ₹2.50 snacks"` style (GBP → `£`). Replace `on success: undo action, refresh, one dispatch, haptic` with `on success: celebrates Written down with +10 and Undo` (wrap with `tests/flow-render.tsx`; mock `@jarso/data/progress`). Keep `undo calls undoEntry with the returned entry id and refreshes` (press "Undo" on the celebration) and `shows the calm message when undo is refused`. New: `Next needs an amount` (`aria-invalid` + the schema message, nothing sent); `a quick chip fills the amount`; `the button repeats the choice`.
  - received: `needs a pick before Put it in`; `Save shows the goal effect`; `records it once, refreshes and tells the parent` (same payload `{amount, jar, category, label, idempotencyKey}`); `shows a refusal's safe message`; `celebrates without Undo`.
- [ ] **Step 2: Run** `pnpm --filter @jarso/mobile test -- tests/features/diary --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement** with `FlowShell` (step 1 has X, step 2 has back). Keep the `sending` ref guard and `sentEntryId`. Snapshot spark chips before `mutateAsync`.
- [ ] **Step 4: Run** the tests and `pnpm --filter @jarso/mobile typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): keypad flows for buying and getting money`.

### Task 8: "Save some", "Use savings", "Ask for extra"

**Files:**
- Rewrite: `apps/mobile/src/features/requests/{put-in-sheet,take-out-sheet,ask-extra-sheet}.tsx`
- Modify: `apps/mobile/src/components/sheet/sheet-parts.tsx` (delete `SentToast`; it has no other user)
- Test: `apps/mobile/tests/features/requests/sheets.test.tsx`; `apps/mobile/tests/features/goals/goals.test.tsx` (delete only the two `predict step … in take-out` cases at the end and the `TakeOutSheet` import; the guess is covered in Task 4 and below)

**Interfaces:**
- Consumes: Task 4 kit, `JarsoGuess`, `askFlowCopy`, `askReasons`, `reasonText`, `askCelebration` (Task 3), `takeOutLimit`, unchanged `useCreateDeposit`, `useCreateWithdrawal`, `useCreateEmergency`, `depositSchema`, `withdrawalSchema`, `emergencySchema`, `useSendOnce`, `HomeWait`.
- Save some (one screen, F4): title "Save some"; two small Jarsos (Spend tint, Save) with live amounts `availableSpendMinor − x` and `saveMinor + x`; keypad with chips capped at `availableSpendMinor` and limit chip; `JarsoGuess move="put_in"` when the goal is unreached; keycap-gold `I'll give ₹50 to Mum`. Payload `{ amountMinor, idempotencyKey }`.
- Use savings (two steps, F6): step 1 keypad, limit chip `You can ask up to ${takeOutLimit}`, `JarsoGuess move="take_out"`, Next; step 2 "For what?" `askReasons("withdrawal", goal)`, Other opens one optional text line; keycap `Ask Mum`. Payload `{ amountMinor, reason: reasonText(...) , idempotencyKey }` (reason may be "").
- Ask for extra (two steps): same as Use savings with `askReasons("emergency", null)`, grape keycap; Other needs text (the schema's "Say what it's for." shows).
- The rule lines go; refusals (`over_available`, `over_cap`) show the existing `depositMessage` / `withdrawalMessage` text as a `Notice` on the amount step.
- Sent → `<SentCelebration celebration={{ ...askCelebration(kind, status, m, parent), tone: kind === "deposit" ? "gold" : "teal", chips, primary: { label: "Nice", onPress: onClose }, secondary: tracked ? { label: "Track it", onPress: () => router.replace("/(child)/requests") } : undefined }} />`.

- [ ] **Step 1: Update the tests first** (wrap with `tests/flow-render.tsx`; mock `@jarso/data/progress` and `@jarso/data/family` `findParentLabels`):
  - PutIn: replace `shows what Spend has and the deposit rule lines` with `shows what Spend has as one chip`; keep `sends the amount in minor units with the opening's key, refreshes, dispatches` (keypad input), `over_available shows its message, keeps the sheet open, sends no notice`, `rejects a bad amount without calling the server`, `reuses the key on a retry and makes a new one on the next opening`. New: `the jars update as you type`; `the button says I'll give ₹… to Mum`; `pending celebrates Now give Mum and offers Track it`.
  - TakeOut: replace the two rule-line cases with `shows the take-out limit as one chip`; keep `sends the amount, the reason and the key` (reason picked "Games" → `"Games"`), `asks without a reason (it is optional)` (Other, empty), `over_available keeps the sheet open`, `over_cap shows the cap message verbatim and keeps the sheet open`, `reuses the key after a refusal within one opening`, `says slow, not offline, when the phone is online but Jarso did not answer`. New: `My goal sends the goal's name`; `Jarso's guess shows with a goal and not without` (moved from goals.test); `approved celebrates Mum said yes`.
  - AskExtra: keep `needs a reason, with the web's message` (Other with no text) and `reuses the key on a retry after a failed request`; new `a picked reason is sent as its label`.
- [ ] **Step 2: Run** `pnpm --filter @jarso/mobile test -- tests/features/requests/sheets.test.tsx tests/features/goals --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.** Amount state is the keypad string; `parseMoney` feeds the live jars and the guess.
- [ ] **Step 4: Run** the tests, `pnpm --filter @jarso/mobile typecheck`, and `grep -rn "SentToast\|flash(" apps/mobile/src/features/{diary,requests}` (expected: only `parent-request-items.tsx`, a parent screen).
- [ ] **Step 5: Commit.** `feat(mobile): keypad flows for saving and asking`.

### Task 9: "My asks" as a tracker, and the push card after the first ask

**Files:**
- Rewrite: `apps/mobile/src/features/requests/request-list.tsx`
- Modify: `apps/mobile/src/features/push/push-permission-card.tsx`, `apps/mobile/app/(child)/_layout.tsx` (PAGES title `requests` → "My asks")
- Test: `apps/mobile/tests/features/requests/request-list.test.tsx`, `apps/mobile/tests/features/push/push-permission-card.test.tsx`

**Interfaces:**
- Consumes: `trackerSteps`, `heldLine`, `trackerCopy` (Task 3), `AskTracker` (Task 4), `useParentLabel`, `statusLabel`, unchanged `useRequests`, `useCancelRequest`, `useSendOnce`.
- Produces:
  - `RequestList()` (same export): header "My asks"; each open ask (`pending`, `approved`) is a card: title from the kind (`Save ${m}`, `Use ${m} savings`, `Extra ${m}`), `AskTracker` steps (`when` = `dayInZone` + time in the family timezone), `heldLine` for a pending deposit, and "Cancel this" on `pending` (same cancel logic, same `requestAlreadyMovedOnMessage`, same accessible name pattern `` `Cancel ${what} of ${amount}` ``). Closed asks below as compact rows with the existing status chip. Empty state `"Nothing here yet."`.
  - `PushPermissionCard({ title }?: { title?: string })`: with `title`, the child version shows that one line plus Turn on / Not now (no body). Without it, unchanged (the parent's Family home still uses it).
  - The list renders `<PushPermissionCard title={\`Want to hear when ${parent} answers?\`} />` above the asks once there is at least one request.
- [ ] **Step 1: Update the tests first.**
  - request-list: keep `says so when there is nothing yet`, `offers Cancel only on a Waiting request` (button name now "Cancel this"), `cancels, refreshes, tells the parent and says Cancelled`, `says calmly when it already moved on`, `shows the safe message when cancelling fails and lets the child try again`, `shows the safe message when the list cannot load, with Try again`, `sends one cancel for a double press in the same frame`. Replace `shows each kind, amount, day, reason and the web's status label` with `an open ask shows its tracker` (pending deposit: testIDs done/now/next, `"Give Mum the ₹50"`, `"₹50 held in Spend till then"`) and `closed asks keep the status chip` (`"Done"`, `"Not now"`). New: `asks the child about notifications after the first ask` (mock `usePushPermission` state `ask`).
  - push card: add `the child's after-ask line replaces the title and body`.
- [ ] **Step 2: Run** `pnpm --filter @jarso/mobile test -- tests/features/requests/request-list.test.tsx tests/features/push/push-permission-card.test.tsx --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests and `pnpm --filter @jarso/mobile typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): track asks step by step in My asks`.

### Task 10: Verify, docs, hand over

**Files:**
- Modify: `docs/mobile.md` (the child UI line: tabs Home · Learn · + · Diary · Jarso, bell on Home opens `/(child)/news`, the + sheet, keypad flows, My asks tracker; the Layout block's `(tabs)` list and sheets; the Kid-UI rework paragraph: flows now celebrate), `docs/design.md` §5 child tab bar (raised gold + keycap, no Notifications tab) and §9 Voice row "Move my money" → "My asks".

- [ ] **Step 1: Run** `pnpm check` in `/home/ezio/Desktop/Work/8x/Jarso/.claude/worktrees/home`. Expected: lint, typecheck and all tests pass. Fix anything red (likely suspects: a web test reading changed core copy, the theme grep tests).
- [ ] **Step 2: Check the budgets by hand** against mockups H1, H2, H3, F1–F7 on a device or emulator if one is available (`pnpm mobile`): Home ≤ 30 words, bubble ≤ 8, no line graph, + opens the sheet, a purchase celebrates with Undo, an ask shows the tracker. Note any drift in the PR description rather than widening scope.
- [ ] **Step 3: Update the docs** listed above.
- [ ] **Step 4: Commit.** `docs(mobile): child shell, Home and money flows`.
- [ ] **Step 5: Stop.** Don't push or open the PR; the controller opens it (and later rebases plans 4 and 5 onto this branch).

## Integration notes for plans 4 and 5 (no work here)

- Plan 4 sets `JarTile`'s `onPress` to open `/(child)/jar/spend|save` and registers `jar/[jar]` in PAGES. `features/jars/jar-graph.tsx` is no longer imported by Home after Task 6.
- Plan 5 adds `checkin` to SHEETS and calls its `useCheckinPrompt()` from `HomeScreen`; the mission block is the plain `<NextStepCard step />`, so a restyle inside that component reaches Home.
