# Mobile Kid Rework, Plan 6: Diary, Jarso tab, Me, bell, level-up (plus customising Jarso) Implementation Plan

> **Status: in progress** on `feat/mobile-kid-rework-6-8-10` (built alongside plans 8 and 10 in the same tree).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the child's side of the rework outside Home and Learn:

- **Make Jarso yours:** a `LookPicker` (lid colour swatches, wear unlocked by level, a live Jarso), shared with plan 8's onboarding
- **Me = trophy room:** Jarso in the child's look, level name and a bar to the next level, streak and Sparks, the badge shelf (tap a badge for how it is earned), the look picker, then settings (Sound effects, Notifications, Dark mode, What Jarso remembers, My asks) and Sign out
- **Level-up:** when the level rises, one grape `celebrate()` with the level name and, when a look unlocks, "Wear it" / "Later"
- **Diary tab:** "This week you spent" as picture bars, the two actions under their new names, then the existing list
- **Jarso tab:** the chat gets a face: Jarso, "Ask me anything", the short AI notice (FR09), starter questions as rows, then past chats
- **Bell (child inbox):** Jarso-faced inbox: mark-all as a pill, the same rows, and a sleepy Jarso with "That's everything" at the end

**Architecture:** Pure rules and copy go in core with Vitest tests: the look copy (`mascot/copy.ts`), the level-up rule and the Me copy (`progress/level-up.ts`, `progress/me-copy.ts`), the week's picture bars (`ledger/week-bars.ts`), the Jarso tab copy (`guide/tab-copy.ts`) and the child inbox copy (`notifications/kid-copy.ts`). Shared web copy (`guideCopy`, `inboxCopy`, `progressCopy`, `diaryCopy`) is read, never edited. On the phone, `LookPicker` and the level-up watcher live in `features/progress`; the Me screen becomes its own module `features/me` (it takes the child's menu out of `features/settings`, which keeps the theme and nickname pieces); the Diary, Jarso tab and inbox restyles are child-only files so the parent screens (plan 10) are untouched: `features/diary/week-spent-card.tsx`, `features/guide/guide-screens.tsx` (child `ChatList` only) and a new `features/news/kid-inbox-screen.tsx`. No migration, no new query key: progress, badges and look already come from `useProgress()` (plan 2).

**Tech Stack:** Expo 58, React Native 0.88, NativeWind 4, react-native-svg 15, Reanimated 4.7, expo-audio (`playSound`, `useSoundOn`), AsyncStorage, TanStack Query 5, Jest + RNTL (mobile), Vitest (core).

**Spec:** `docs/superpowers/specs/2026-11-06-mobile-kid-rework-design.md` ("Mascot: Customising", "Navigation (child)", "Fun loop: Levels, Badges"). Mockup: `docs/superpowers/specs/mockups/2026-11-06-mobile-kid-rework.html` section 7 (T1 Diary, T2 Jarso chat, T3 Me, T4 Bell, T5 Level up). Backend (merged, plan 2): `get_progress` (`level`, `sparks`, `streak`, `badges`, `look`), `set_jarso_look`, `useProgress()`, `useSetJarsoLook()`.

## Roadmap (this is plan 6 of 10)

1. Foundation (merged). 2. Progress backend (merged). 3. Child shell and Home (merged). 4. Jar pages and goal (merged). 5. Learn and the daily check-in (merged, #147). **6. Diary, Jarso tab, Me, bell, level-up** (this plan). 7. Allowance split. 8. Child onboarding (parallel, same tree). 9. Parent sign-up. 10. Parent restyle (parallel, same tree).

## Global Constraints

- **Coordination contract (binding; plans 8 and 10 run in this working tree at the same time):**
  - Task 1 ships first and its signature is frozen: `export function LookPicker(props: { level: number; value: JarsoLook; onChange: (look: JarsoLook) => void }): JSX.Element`, exported from `@/features/progress`. Plan 8 imports it.
  - Plan 8 adds ONE row, "Replay the intro", to the Me screen's settings group later. The group lives in `features/me/me-settings.tsx` with a marked slot comment; don't reorder or rename around it.
  - Never touch `app/(parent)/**`, `src/features/{parent,family}/**`, `src/features/onboarding/**`, `app/(child)/onboarding*`, `app/(auth)/**`. Shared parent/child files (`news-screen.tsx`, `inbox-list.tsx`, `history-list.tsx`, `where-it-went.tsx`, `thread.tsx`) are not restyled; at most a small additive prop.
  - Shared files (barrels, `src/lib/query.ts`, `packages/core/src/progress/copy.ts`, `app/(child)/_layout.tsx`): small additive edits with the Edit tool, re-reading first. Never rewritten.
  - No commits and no pushes in this run (the user commits later). The "Commit" step in each task records the intended split. Never read `.env*`.
  - No migration. If one seems needed, stop and report.
- **Verification is scoped** (others' WIP shares the tree): `pnpm --filter @jarso/mobile test -- <paths>`, `pnpm --filter @jarso/core exec vitest run <paths>`, `pnpm --filter @jarso/mobile typecheck`, `pnpm exec biome check <files>`. A root `pnpm check` runs once, in Task 8. Type errors in other plans' files are noted, not fixed.
- CLAUDE.md hard rules: feature modules and barrels, core purity (rule 18), Biome only, child copy rules. Word budget: labels 1 to 3 words, Jarso lines up to 8 words, no paragraphs on the child side. Jarso is never sad. Looks unlock by level only, never bought (no price, no currency anywhere near the picker or level-up).
- Mobile tests in `apps/mobile/tests/` mirroring `src/`; core tests in `packages/core/tests/<module>/`. Reduced motion respected (the `Jarso` bounce and `Confetti` already check it).
- `docs/design.md` and `docs/mobile.md` read before UI work; tokens only (no raw hex except lid swatches, which come from `lidHex`).

## Review Focus

1. **Level-up runs once per rise, on any screen.** The watcher reads the last level it showed from AsyncStorage (`jarso-level-seen:<userId>`). No stored level (first run, a new phone): store the current level, no celebration (a child at level 4 on a new phone is not told "Level 4!"). Level rises 2 → 4 in one award: one celebration for level 4, and the unlocked wear is the newest one in (2, 4] (headphones). The stored level is written before `celebrate()`, and an in-memory ref blocks a second call in the same run even if storage fails. A level that goes down (data fix) is stored quietly (Task 2 core tests, Task 3 hook tests).
2. **"Wear it" applies only an unlocked look.** It calls `useSetJarsoLook().mutate({ ...look, wear })` with the wear `newWear()` returned, which by construction is unlocked at the new level. The picker disables locked wear (`accessibilityState.disabled`, no `onChange`). The server's `set_jarso_look` stays the authority (it already rejects locked wear) and the optimistic hook rolls back on error.
3. **Switching child on one phone.** Level-seen and the picker are keyed by `userId`; a second child signing in gets their own stored level, so no stale celebration (Task 3 test with two user ids).
4. **Plan 8 slot.** `MeSettings` keeps a single `ListGroup` with a `{/* Plan 8: "Replay the intro" row */}` comment where the row goes (after "My asks", before Dark mode is fine either way); nothing else depends on the row count.
5. **FR09 on the Jarso tab.** The AI notice is still on screen before the first chat ("I'm an AI. Mum can see our chats."), with the parent's label from `useParentLabel()`. Starter rows open a new chat with the question typed in the box, not sent: the intro and the child's own tap still come first.

---

### Task 1: LookPicker and the look copy (ships first)

**Files:**
- Create: `packages/core/src/mascot/copy.ts`, `apps/mobile/src/features/progress/look-picker.tsx`
- Modify: `packages/core/src/mascot/index.ts` (add `export * from "./copy";`), `apps/mobile/src/features/progress/index.ts` (add `export * from "./look-picker";`)
- Test: `packages/core/tests/mascot/copy.test.ts`, `apps/mobile/tests/features/progress/look-picker.test.tsx`

**Interfaces:**
```ts
// core
export const lookCopy: {
  title: "Make Jarso yours"; lidHeading: "Lid colour"; wearHeading: "Wear"; preview: string;
  lid: Record<LidColor, string>;   // Sky, Grape, Blush, Green, Ink
  wear: Record<Wear, string>;      // Nothing, Cap, Shades, Headphones, Crown
  lidLabel(name: string): string;                 // "Grape lid"
  unlocksAt(level: number): string;               // "Level 4"
  lockedLabel(name: string, level: number): string; // "Headphones, unlocks at level 4"
};
// mobile (frozen)
export function LookPicker(props: { level: number; value: JarsoLook; onChange: (look: JarsoLook) => void }): JSX.Element;
```
- Preview: `<Jarso mood="cheer" size={140} fill={0.5} look={value} bounce accessibilityLabel={lookCopy.preview} />`.
- Lids: a `radiogroup` of 48 dp circles filled with `lidHex(lid)`, `accessibilityRole="radio"`, label `lookCopy.lidLabel(name)`, `accessibilityState.checked`; chosen = `border-primary` ring + white check.
- Wear: a `radiogroup` of pill chips in `WEAR_UNLOCK_LEVEL` order. Locked: lock icon, `lookCopy.unlocksAt(n)` beside the name, `disabled`, label `lookCopy.lockedLabel(name, n)`, faded. Never a price.

- [x] **Step 1: Failing tests.** Core: `names every lid colour`, `names every wear option`, `a locked option says the level that unlocks it`, `chosen options read as selected labels`. Mobile: `shows one swatch per lid colour, the chosen one selected`, `tapping a lid changes only the lid` (`onChange({ lid: "grape", wear: "none" })`), `tapping unlocked wear changes only the wear` (level 3, shades), `locked wear shows its unlock level and cannot be picked` (level 1, crown: disabled, "Level 5" visible, no `onChange`), `previews Jarso in the chosen look` (image named `lookCopy.preview`, `jarso-wear-crown` drawn).
- [x] **Step 2: Run.** `pnpm --filter @jarso/core exec vitest run tests/mascot` and `pnpm --filter @jarso/mobile test -- tests/features/progress`. Expected: FAIL.
- [x] **Step 3: Implement** the copy, the picker and both barrel lines.
- [x] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): LookPicker to make Jarso yours`

### Task 2: Core level-up rule, Me copy, week bars, tab and inbox copy

**Files:**
- Create: `packages/core/src/progress/level-up.ts`, `packages/core/src/progress/me-copy.ts`, `packages/core/src/ledger/week-bars.ts`, `packages/core/src/guide/tab-copy.ts`, `packages/core/src/notifications/kid-copy.ts`
- Modify (one appended line each): `packages/core/src/progress/index.ts` (two lines), `ledger/index.ts`, `guide/index.ts`, `notifications/index.ts`
- Test: `packages/core/tests/progress/level-up.test.ts`, `packages/core/tests/progress/me-copy.test.ts`, `packages/core/tests/ledger/week-bars.test.ts`, `packages/core/tests/guide/tab-copy.test.ts`

**Interfaces:**
```ts
// progress/level-up.ts
export type LevelUpDecision = "none" | "remember" | "celebrate";
/** seen null or seen > level → "remember"; level > seen → "celebrate"; equal → "none". */
export function levelUpDecision(seen: number | null, level: number): LevelUpDecision;
/** The newest wear unlocked in (from, to]; null when none (cap and none unlock at 1). */
export function newWear(from: number, to: number): Wear | null;
export const levelUpCopy: {
  eyebrow: "Level up";
  title(level: number, name: string): string;   // progressCopy.levelUp(level, name) → "Level 5! Money Maker"
  unlocked(wearName: string): string;           // "Crown unlocked"
  wearIt: "Wear it"; later: "Later"; yay: "Yay!";
};

// progress/me-copy.ts
export const meCopy: {
  title: "Me";
  level(level: number, name: string): string;   // "Level 4 · Coin Keeper"
  toNext(sparks: number, next: number): string; // "60 ⚡ to Level 5"
  topLevel: "Top level!";
  levelBar: "Level progress";
  streak(n: number): string; sparks(n: number): string; // "3 day streak", "120 Sparks"
  badgesHeading: "My badges";
  badgeCount(n: number, total: number): string; // "6 of 23"
  badgeEarned(name: string): string;            // "First Save, earned"
  badgeLocked(name: string): string;            // "First Save, not yet"
  settings: "Settings"; sound: "Sound effects"; myAsks: "My asks";
  signIn(nickname: string | null): string;      // the existing nickname line, unchanged words
};
/** Earned badges first (oldest first), then the rest in BADGE_KEYS order. */
export function badgeShelf(earned: readonly { key: BadgeKey; earnedAt: string }[]):
  { key: BadgeKey; earned: boolean }[];

// ledger/week-bars.ts
export type WeekBar = { key: string; emoji: string; label: string; totalMinor: number; share: number };
/** This week's spending as up to `max` bars (share of the biggest = 1), plus the week's total. */
export function weekSpentBars(history: readonly HistoryItem[], today: string, max?: number): {
  totalMinor: number; bars: WeekBar[];
};
export const weekSpentCopy: { heading: "This week you spent"; empty: "Nothing spent yet" };

// guide/tab-copy.ts
export const jarsoTabCopy: {
  heading: "Ask me anything";
  notice(parent: string): string;   // "I'm an AI. Mum can see our chats."
  startersLabel: "Try asking";
  starters: readonly { key: "saving" | "spent" | "learning"; question: string }[]; // from guideCopy.suggestions
  pastChats: string;                // guideUi.pastChats
};

// notifications/kid-copy.ts
export const kidInboxCopy: { allDone: "That's everything"; nothingNew: "Nothing new yet"; markAll: "Mark all read" };
```

- [x] **Step 1: Failing tests.**
  - `level-up.test.ts`: `first read only remembers`; `a rise celebrates`; `same level does nothing`; `a lower level is remembered quietly`; `newWear gives shades at 3, headphones at 4, crown at 5`; `a jump from 2 to 4 gives the newest wear, headphones`; `no wear in a range with none (5 to 7)`; `the title uses the level name` (`levelUpCopy.title(5, "Money Maker")` = `"Level 5! Money Maker"`).
  - `me-copy.test.ts`: `level line and next level`; `badgeShelf puts earned first, keeps every badge once` (length `BADGE_KEYS.length`, earned order by `earnedAt`).
  - `week-bars.test.ts`: `three biggest categories, biggest share 1`; `total counts every purchase this week, not just the bars`; `last week and money in are ignored`; `no purchases gives no bars and total 0`.
  - `tab-copy.test.ts`: `the notice names the parent, capitalised`; `starters are the shared guide questions`.
- [x] **Step 2: Run.** `pnpm --filter @jarso/core exec vitest run tests/progress tests/ledger/week-bars.test.ts tests/guide/tab-copy.test.ts`. Expected: FAIL.
- [x] **Step 3: Implement** and append the barrel lines.
- [x] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(core): level-up rule and kid copy for Me and tabs`

### Task 3: Level-up celebration

**Files:**
- Create: `apps/mobile/src/features/progress/level-seen.ts`, `apps/mobile/src/features/progress/use-level-up.ts`
- Modify: `apps/mobile/src/features/progress/index.ts` (add `export * from "./use-level-up";`; `level-seen` stays internal), `apps/mobile/app/(child)/_layout.tsx` (render `<LevelUpWatcher />` inside `CelebrationProvider`, one import + one line)
- Test: `apps/mobile/tests/features/progress/use-level-up.test.tsx`; the tests that render the child layout (`tests/app/parent-layout.test.tsx`, `tests/session.test.tsx`, `tests/session-offline.test.tsx`) mock `LevelUpWatcher` as they already mock `OutboxSync` and `NoticeListener`

**Interfaces:**
```ts
// level-seen.ts — AsyncStorage key `jarso-level-seen:<userId>`
export async function readLevelSeen(userId: string): Promise<number | null>; // null on error or junk
export async function writeLevelSeen(userId: string, level: number): Promise<void>; // logs, never throws

// use-level-up.ts
/** Watches the child's level; on a rise, one celebrate() with the unlocked look. */
export function useLevelUp(): void;
/** `useLevelUp()` as a component for the child layout. Renders nothing. */
export function LevelUpWatcher(): null;
```
- On a `celebrate` decision: `writeLevelSeen` first, then `celebrate({ title: levelUpCopy.title(level, name), subtitle: levelUpCopy.eyebrow, mood: moodFor("levelUp"), tone: "grape", sound: "cheer", look: wear ? { ...look, wear } : look, chips: wear ? [{ icon: "unlock", label: levelUpCopy.unlocked(lookCopy.wear[wear]) }] : undefined, primary: wear ? { label: levelUpCopy.wearIt, onPress: () => setLook.mutate({ ...look, wear }) } : { label: levelUpCopy.yay }, secondary: wear ? { label: levelUpCopy.later } : undefined })`. `name` is `levelProgress(sparks).name`.
- A `shown` ref keyed `userId:level` stops a second celebration in the same run.

- [x] **Step 1: Failing tests** (mock `@jarso/data/progress`, AsyncStorage in-memory, `@/components/celebrate` `useCelebrate` → `jest.fn()`): `first run stores the level and does not celebrate`; `a rise celebrates once with the unlocked wear and stores the level`; `Wear it puts the new wear on` (call `primary.onPress()` → `setJarsoLook` called with `{ lid, wear: "crown" }`); `a rise with no new look offers Yay! only`; `the same level again does not celebrate`; `storage failure still celebrates only once this run`; `each child has their own stored level`.
- [x] **Step 2: Run.** `pnpm --filter @jarso/mobile test -- tests/features/progress`. Expected: FAIL.
- [x] **Step 3: Implement** and wire `LevelUpWatcher` in the child layout.
- [x] **Step 4: Run again plus the layout tests.** `pnpm --filter @jarso/mobile test -- tests/features/progress tests/app`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): celebrate a level-up with the unlocked look`

### Task 4: Me screen (trophy room, look, settings)

**Files:**
- Create: `apps/mobile/src/features/me/{index.ts,me-screen.tsx,trophy-card.tsx,badge-shelf.tsx,badge-icons.ts,me-settings.tsx}`
- Move: `SettingsScreen` (renamed `MeSettings`, now only the settings group and Sign out) and `MemoriesScreen` from `features/settings/settings-screen.tsx` to `features/me`; delete `settings-screen.tsx` and its barrel line
- Modify: `apps/mobile/app/(child)/me.tsx` (→ `MeScreen`), `apps/mobile/app/(child)/memories.tsx` (→ `@/features/me`)
- Test: `apps/mobile/tests/features/me/me-screen.test.tsx` (the old `SettingsScreen` and `MemoriesScreen` cases move here); `apps/mobile/tests/features/settings/settings-screen.test.tsx` keeps only `loadTheme` (renamed `theme.test.tsx`)

**Interfaces:**
```ts
export function MeScreen(): JSX.Element;
export function TrophyCard(props: { nickname: string | null; progress: Progress }): JSX.Element;
export function BadgeShelf(props: { badges: Progress["badges"] }): JSX.Element;
export function MeSettings(): JSX.Element;   // the settings group (plan 8 slot) + sign out
export function MemoriesScreen(): JSX.Element;
export const BADGE_ICONS: Record<BadgeKey, LucideIcon>;
```
- `MeScreen`: `ScrollView` (bottom safe area; the stack header says "Me"), then `TrophyCard`, `BadgeShelf`, a card with `lookCopy.title` + `LookPicker` (`level` from progress, `value` = `progress.look`, `onChange` = `useSetJarsoLook().mutate`), then `MeSettings`. While progress loads the trophy, shelf and picker hide; on error they hide too (settings still work).
- `TrophyCard`: Jarso (`look`, size 96, decorative), nickname as header (or "You"), `meCopy.level(level, name)`, `ProgressBar` (`share`, label `meCopy.levelBar`), `meCopy.toNext(toNext, level + 1)` or `meCopy.topLevel`, streak and Sparks pills, the nickname sign-in line (the old card's words, unchanged).
- `BadgeShelf`: header `meCopy.badgesHeading` + `meCopy.badgeCount(earned, BADGE_KEYS.length)`; a wrap grid of 56 dp tiles from `badgeShelf()`; earned = `bg-tint-gold` + icon, label `meCopy.badgeEarned(name)`; not yet = `bg-muted` + lock, label `meCopy.badgeLocked(name)`. Each tile is a button; pressing shows one line under the grid: the badge name and `how` (`accessibilityLiveRegion="polite"`).
- `MeSettings` rows in order: Sound effects (switch row, `useSoundOn()`), Notifications (`/(child)/notifications`), Dark mode, What Jarso remembers (as today), My asks (`/(child)/requests`), the plan 8 slot comment; then the sign-out block exactly as today.

- [x] **Step 1: Failing tests** in `me-screen.test.tsx` (the old settings mocks plus `@jarso/data/progress` `getProgress`/`setJarsoLook` and `@/lib/sound` `useSoundOn`): every moved case from `settings-screen.test.tsx` (dark mode switch, sign out, outbox warning, notifications row, memories rows, nickname lines, MemoriesScreen) still passes against `MeScreen`/`MemoriesScreen`; new: `shows the level name and Sparks to the next level` (sparks 640 → "Level 4 · Coin Keeper", "60 ⚡ to Level 5"); `top level says so` (sparks 3200); `badge shelf counts earned badges and explains one on tap`; `picking a lid saves the look` (`setJarsoLook` called with `{ lid: "grape", wear: "none" }`); `locked wear can't be picked on Me`; `the sound switch turns sound effects off`; `My asks opens the asks page`.
- [x] **Step 2: Run.** `pnpm --filter @jarso/mobile test -- tests/features/me tests/features/settings`. Expected: FAIL.
- [x] **Step 3: Implement**, move the code, update both routes.
- [x] **Step 4: Run again.** Expected: PASS. `grep -rn "SettingsScreen\b" apps/mobile/src apps/mobile/app` prints only `ParentSettingsScreen` and friends.
- [ ] **Step 5: Commit.** `feat(mobile): Me as a trophy room with Jarso's look`

### Task 5: Diary tab restyle

**Files:**
- Create: `apps/mobile/src/features/diary/week-spent-card.tsx`
- Modify: `apps/mobile/src/features/diary/index.ts` (append), `apps/mobile/src/features/history/diary-screen.tsx`
- Test: `apps/mobile/tests/features/diary/week-spent-card.test.tsx`, `apps/mobile/tests/features/history/diary-screen.test.tsx`

**Interfaces:**
```ts
export function WeekSpentCard(props: { context: FamilyContext }): JSX.Element | null; // child only, keys.week(userId)
```
- `WeekSpentCard`: eyebrow `weekSpentCopy.heading`, the total in `text-money-xl`, then one row per bar: emoji, a teal bar `width = share * 100%` (min 12%), the amount on the bar row; `weekSpentCopy.empty` when there are no bars. Same query and key as `WhereItWentCard` (`keys.week`), so it shares the cache. Hidden while loading or on error.
- `DiaryScreen` header: `ScreenHeader` "Diary"; `WeekSpentCard`; the two actions side by side from `jarPageCopy.actions.spend` (`keycap` "I bought something" → `/(child)/purchase`, `keycap-white` "I got money" → `/(child)/received`) each with its hint under the label; the Spend line as a small pill; `PendingPurchases`; then the list (unchanged `HistoryList`). `WhereItWentCard` stays for parents only.

- [x] **Step 1: Failing tests.** `week-spent-card.test.tsx`: `shows the week's total and a bar per top category`; `says nothing spent yet with no purchases`; `hides while loading`. `diary-screen.test.tsx`: `actions use the new names and open their sheets`; `shows the week card in the list's header`.
- [x] **Step 2: Run.** `pnpm --filter @jarso/mobile test -- tests/features/diary/week-spent-card.test.tsx tests/features/history`. Expected: FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run again plus the diary suites.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): Diary with this week's picture bars`

### Task 6: Jarso tab restyle

**Files:**
- Modify: `apps/mobile/src/features/guide/guide-screens.tsx` (`ChatList` and `JarsoChatScreen`'s `draft` pass-through only), `apps/mobile/src/features/guide/thread.tsx` (one optional prop `draft?: string`, the composer's initial text), `apps/mobile/app/(child)/jarso/[conversationId].tsx` (read the `draft` param)
- Test: `apps/mobile/tests/features/guide/jarso-tab.test.tsx`

**Interfaces:**
```ts
export function JarsoChatScreen(props: { conversationId: string; draft?: string }): JSX.Element;
// GuideThread gains: draft?: string  (useState(draft ?? ""))
```
- `ChatList`: centred Jarso (`mood="wave"`, size 120, `look` from `useProgress`, decorative), `jarsoTabCopy.heading` as header, the notice as a grape chip with a sparkles icon (`jarsoTabCopy.notice(useParentLabel())`), a `keycap` "New chat" button (unchanged label `guideUi.newChat`), a `ListGroup` "Try asking" with the three starters (icon tiles; each pushes `{ pathname: "/(child)/jarso/[conversationId]", params: { conversationId: "new", draft: question } }`), then past chats as today.

- [x] **Step 1: Failing tests** (mocks as in `guide.test.tsx`/`child-chats.test.tsx`): `shows Jarso, Ask me anything and the AI notice with the parent's name`; `a starter opens a new chat with the question typed`; `New chat still opens an empty chat`; `the draft fills the composer but is not sent` (render `GuideThread` with `draft`; text input has the value; `send` not called).
- [x] **Step 2: Run.** `pnpm --filter @jarso/mobile test -- tests/features/guide`. Expected: FAIL (the new file only).
- [x] **Step 3: Implement.**
- [x] **Step 4: Run all guide suites.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): Jarso tab with the mascot and starter questions`

### Task 7: Bell: the child's inbox

**Files:**
- Create: `apps/mobile/src/features/news/kid-inbox-screen.tsx`
- Modify: `apps/mobile/src/features/news/index.ts` (append), `apps/mobile/app/(child)/news.tsx` (→ `KidInboxScreen`)
- Test: `apps/mobile/tests/features/news/kid-inbox.test.tsx`; Home header wiring is already in place (plan 3): `tests/features/home/home-screen.test.tsx` keeps covering bell → `/(child)/news` and avatar → `/(child)/me`

**Interfaces:**
```ts
export function KidInboxScreen(): JSX.Element; // same hooks as NewsScreen with viewer "child"
```
- No own header (the stack header says Notifications). Mark all as a small pill (`kidInboxCopy.markAll`, accessible name `inboxCopy.markAll` kept for screen readers) at the top right when anything is unread; `InboxList` unchanged; "Show more" as an outline pill; at the end a sleepy Jarso (size 70, decorative) with `kidInboxCopy.allDone`. Empty: sleepy Jarso and `kidInboxCopy.nothingNew`. Loading spinner and alert error as today.

- [x] **Step 1: Failing tests** (mocks as `news.test.tsx`): `lists notices and ends with That's everything`; `empty inbox shows sleepy Jarso and Nothing new yet`; `mark all read clears unread`; `opening a notice marks it read and routes`.
- [x] **Step 2: Run.** `pnpm --filter @jarso/mobile test -- tests/features/news`. Expected: FAIL.
- [x] **Step 3: Implement** and point the child route at it.
- [x] **Step 4: Run again plus home.** `pnpm --filter @jarso/mobile test -- tests/features/news tests/features/home`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): child inbox with Jarso behind the bell`

### Task 8: Docs and verification

**Files:**
- Modify: `docs/mobile.md` (child screens: Me trophy room, LookPicker, level-up watcher and its `jarso-level-seen:<userId>` key, Diary bars, Jarso tab, child inbox)

- [x] **Step 1: Update the docs** (facts only, short).
- [x] **Step 2: Scoped checks.** `pnpm --filter @jarso/core test`, `pnpm --filter @jarso/mobile test -- tests/features/{progress,me,settings,diary,history,guide,news,home} tests/app`, `pnpm --filter @jarso/mobile typecheck`, `pnpm exec biome check <this plan's files>`.
- [x] **Step 3: One root `pnpm check`.** Report failures in other plans' files without fixing them. (Run 2026-11-06: stopped at lint on plan 8's `tests/features/onboarding/onboarding-gate.test.tsx`; plan 8's `OnboardingGate` also fails the three layout-rendering suites with no QueryClient. Nothing in this plan's files.)
- [ ] **Step 4: Commit.** `docs(mobile): Me, level-up, Diary, Jarso tab and inbox`

## Self-review

- Spec coverage: customising (Task 1, 4), levels unlock looks and level-up (Tasks 2, 3), badges with how earned (Task 4), Me from the avatar (existing wiring, Task 4 screen), notifications behind the bell (Task 7), Diary restyle (Task 5), Jarso tab around the mascot (Task 6), sound mute (Task 4 Sound effects row). Mockup T1 filter chips (All/Spent/Got) and day-grouped big-icon rows are left out: they live in `history-list.tsx`, shared with the parent's view of a child (plan 10's area); a later plan can add them once plan 10 lands.
- No placeholders: every new export has a signature above and a named test.
- Type consistency: `JarsoLook`, `Wear`, `LidColor` from `@jarso/core/mascot`; `Progress`, `BadgeKey` from `@jarso/core/progress`; `FamilyContext` from `@jarso/data/family`; `Celebration` from `@/components/celebrate`.
