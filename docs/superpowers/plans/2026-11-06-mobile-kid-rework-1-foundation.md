# Mobile Kid Rework, Plan 1: Foundation (Jarso mascot, keycaps, celebrations, sound) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the building blocks every later rework screen uses:

- the living Jarso mascot
- the 4-colour keycap buttons
- a full-screen celebration with confetti, sound and a haptic
- the sound setting

**Architecture:** Pure mascot rules live in `packages/core/src/mascot`: moods, outfits and unlock levels, fill maths, and the jar geometry. The phone draws Jarso with `react-native-svg` and animates it with Reanimated, both already installed. A `CelebrationProvider` at the root of the child layout exposes `celebrate()`; later plans call it in place of `flash()`. `CoachSays` keeps its API but shows Jarso instead of a named coach.

**Tech Stack:** Expo 58, React Native 0.88, NativeWind 4, react-native-svg 15, Reanimated 4.7, expo-haptics, `expo-audio` (new), Jest + RNTL (mobile), Vitest (core).

**Spec:** `docs/superpowers/specs/2026-11-06-mobile-kid-rework-design.md`. Mockups: `docs/superpowers/specs/mockups/2026-11-06-mobile-kid-rework.html`. The `jarso()` function in the mockup's script is the reference drawing.

## Roadmap (this is plan 1 of 10)

Each plan ships working software on its own. Each one is written once the plan before it has merged, so its interfaces are real code and not guesses.

1. **Foundation** (this plan).
2. **Progress backend.** Migration for `child_progress`, `child_badges` and `child_checkins`, plus `profiles.child_facing_name`. Sparks are awarded inside the existing recording functions, with daily caps. `core/progress` holds the values, levels and badges; `data/progress` is the repository.
3. **Child shell and Home.** New tabs (Home · Learn · + · Diary · Jarso), the + sheet, Home blocks and moment cards, and the rewritten flows: keypad, picture grid, celebration, tracker, and new copy in core.
4. **Jar pages and goal.** Weekly bars (core `weeklyTotals`), the goal ring and stars, and goal reached. `JarGraph` is removed from the child app.
5. **Learn.** Quest map, mission player restyle, right and wrong sheets, and the daily check-in.
6. **Diary, Jarso tab, Me, bell, level-up.** Plus customising Jarso.
7. **Allowance Spend/Save split.** ADR 0019, migration, core and data, and the parent allowance UI.
8. **Child onboarding.** Practice coins, goal pick, make Jarso yours, replay from Me.
9. **Parent sign-up and onboarding on the phone.** OTP email template, steps P1–P7, rule presets, QR hand-off.
10. **Parent restyle.** Family cards with one-tap answers, handover cards.

## Global Constraints

- **Never commit until the user says so.** (Lessons, memory.) The "Commit" steps record the intended commit split: one focused Conventional Commit per task, no AI attribution.
- `packages/core` stays pure: no React, React Native, `@/**` or platform globals (CLAUDE.md rule 18).
- **Colours** come from `@jarso/brand/tokens` (`palette`, `semantic`, `useTokens()`). No raw hex in mobile components except the lid colours, which map onto palette values.
- **Mobile tests** live in `apps/mobile/tests/` mirroring `src/`. Core tests live in `packages/core/tests/<module>/`.
- **Reduced motion** (the OS setting, `useReducedMotion()` from Reanimated): no confetti, no bounce, and Jarso is drawn still.
- **Sound** is off when the saved setting is off. Each clip is shorter than 1 s.
- **Jarso is never sad.** There are exactly six moods: `happy`, `cheer`, `wow`, `think`, `wave`, `sleepy`.
- **Outfits** unlock by level only, never by purchase. Outfits: `none` (Lv 1), `cap` (Lv 1), `shades` (Lv 3), `headphones` (Lv 4), `crown` (Lv 5).
- **Lid colours:** `cyan` (palette.cyan.300), `grape` (palette.grape.500), `blush` (palette.blush), `green` (palette.teal.600, the brand's teal, so there is no new hue), `ink` (palette["kid-ink"]).
- **Keycap ledge on mobile is 5 dp** (spec), up from 3. The pressed state sinks 5 dp.
- **Accessibility.** Jarso is decorative (`accessibilityElementsHidden`) unless it gets an `accessibilityLabel`. Every celebration title is announced with `AccessibilityInfo.announceForAccessibility`.
- Run `pnpm check` before declaring the plan done.

## Review Focus

1. **Fill outside 0..1.** Negative Save or overshooting a goal must not draw gold outside the jar. Clamp in core (Task 3 test).
2. **Reduced motion is on.** The celebration still shows and still announces, with no confetti nodes rendered (Task 7 test).
3. **Sound with no audio device, or a failed load.** `playSound` must never throw into a tap handler (Task 6 test).
4. **Two `celebrate()` calls back to back** (for example a log and then a level-up). They queue and show one after another, never stacked (Task 7 test).
5. **Dark theme.** The keycap white variant keeps a visible ledge, and the text stays readable (Task 2 colour test).

---

### Task 1: Test harness for Reanimated and expo-audio

**Files:**
- Modify: `apps/mobile/package.json` (add `expo-audio`, using the version `npx expo install expo-audio` picks for SDK 58)
- Modify: `apps/mobile/tests/setup.ts`
- Test: `apps/mobile/tests/lib/reanimated-mock.test.tsx`

**Interfaces:**
- Produces: Jest can render components that use `react-native-reanimated` and `expo-audio`. `expo-audio` is mocked with `createAudioPlayer: jest.fn(() => ({ play: jest.fn(), seekTo: jest.fn(), remove: jest.fn() }))`.

- [ ] **Step 1: Write the failing test** `renders an Animated.View`. Render `<Animated.View testID="a" />` from `react-native-reanimated` and expect `screen.getByTestId("a")` to be truthy.
- [ ] **Step 2: Run it.** Command: `pnpm --filter @jarso/mobile test -- tests/lib/reanimated-mock.test.tsx`. Expected result: FAIL, either a native module error or a worklets init error.
- [ ] **Step 3: Install and mock.** Run `cd apps/mobile && npx expo install expo-audio`. In `setup.ts`, add `jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"))`. If Reanimated 4 has no `/mock`, call `require("react-native-reanimated").setUpTests()` instead. Add the `expo-audio` mock above, with a one-line comment for each, in the style of the existing mocks.
- [ ] **Step 4: Run it again.** Expected result: PASS. Then run `pnpm --filter @jarso/mobile test` to check every existing suite still passes.
- [ ] **Step 5: Commit.** Message: `test(mobile): mock reanimated and expo-audio in jest`.

### Task 2: Keycap buttons in four colours, 5 dp ledge

**Files:**
- Modify: `packages/brand/tokens.ts`, `packages/brand/tokens.css`. Add semantic `keycap-ledge-grape` (light `#473097` = grape-800, dark `#32236b` = grape-900), `keycap-ledge-white` (light `#b9cdd5`, dark `#0b1f26`), `keycap-white` (light `#ffffff`, dark `#1b3d48`) and `keycap-white-foreground` (light `#004b62` = teal-800, dark `#d2ffff` = teal-50).
- Modify: `apps/mobile/src/components/ui/button.tsx`
- Test: `apps/mobile/tests/components/button.test.tsx`, `packages/brand/tests/tokens.test.ts` (existing parity test, must still pass)

**Interfaces:**
- Produces: `Button` variants `keycap`, `keycap-gold`, `keycap-success`, `keycap-grape` and `keycap-white`, with a 5 dp ledge. New size `xl` = `h-[72px]` for big choice buttons (the check-in's Nope/Yes).

- [ ] **Step 1: Write the failing tests.**
  - `keycap-grape has a grape ledge`: render `<Button variant="keycap-grape">`, and expect its `className` to contain `border-keycap-ledge-grape` and `border-b-[5px]`.
  - `keycap-white label uses keycap-white-foreground`.
  - `xl keycap sinks to 67 when pressed`: the className contains `active:h-[67px]`.
- [ ] **Step 2: Run them.** Command: `pnpm --filter @jarso/mobile test -- tests/components/button.test.tsx`. Expected result: FAIL.
- [ ] **Step 3: Add the tokens and the variants.**
  - Add the tokens to both token files, with the same keys in light and dark.
  - In `button.tsx`, change `KEYCAP` to `border-b-[5px] active:border-b-0 active:translate-y-[5px] active:mb-[5px]`.
  - Add the two variants, the text variants and the `SPINNER` entries.
  - Add size `xl`.
  - Update `compoundVariants` so each keycap height minus 5: `active:h-[43px]` (default), `[39px]` (sm), `[51px]` (lg), `[39px]` (icon), `[67px]` (xl).
- [ ] **Step 4: Run the tests.** Command: `pnpm --filter @jarso/mobile test -- tests/components tests/tailwind-colors.test.ts && pnpm --filter @jarso/brand test`. Expected result: PASS.
- [ ] **Step 5: Commit.** Message: `feat(mobile): grape and white keycaps with a 5 dp ledge`.

### Task 3: `@jarso/core/mascot`, Jarso's rules

**Files:**
- Create: `packages/core/src/mascot/index.ts`, `packages/core/src/mascot/jarso.ts`, `packages/core/src/mascot/geometry.ts`
- Modify: `packages/core/package.json` (exports: add `"./mascot": "./src/mascot/index.ts"`)
- Test: `packages/core/tests/mascot/jarso.test.ts`

**Interfaces:**
- Produces:
  - `type JarsoMood = "happy" | "cheer" | "wow" | "think" | "wave" | "sleepy"`
  - `const JARSO_MOODS: readonly JarsoMood[]`
  - `type LidColor = "cyan" | "grape" | "blush" | "green" | "ink"`, `const LID_COLORS: readonly LidColor[]`
  - `type Wear = "none" | "cap" | "shades" | "headphones" | "crown"`, `const WEAR_UNLOCK_LEVEL: Record<Wear, number>` (values as in Global Constraints)
  - `type JarsoLook = { lid: LidColor; wear: Wear }`, `const DEFAULT_LOOK: JarsoLook = { lid: "cyan", wear: "none" }`
  - `wearUnlocked(wear: Wear, level: number): boolean`
  - `availableWear(level: number): Wear[]`, in the order of `WEAR_UNLOCK_LEVEL`
  - `parseLook(value: unknown): JarsoLook`. A Zod parse that falls back to `DEFAULT_LOOK` for each bad field.
  - `jarsoFill(input: { saveMinor: number; spendMinor: number; goalTargetMinor: number | null }): number`. Returns 0..1. With a goal it is save ÷ target. Without one it is save ÷ (spend + save), or 0 when both are 0. Clamped to [0, 1].
  - `type JarsoMoment = "rest" | "logged" | "saved" | "milestone" | "goalReached" | "levelUp" | "answerRight" | "answerWrong" | "waiting" | "empty" | "greeting"`
  - `moodFor(moment: JarsoMoment): JarsoMood`. The map is: rest→happy, logged→cheer, saved→cheer, milestone→cheer, goalReached→cheer, levelUp→wow, answerRight→cheer, answerWrong→think, waiting→think, empty→sleepy, greeting→wave.
  - `geometry.ts` exports `JAR_OUTLINE_D` (this exact string: `"M150 128C172 152 160 176 128 198C98 220 88 246 88 290L88 352C88 395 112 418 155 418L352 418C395 418 418 395 418 352L418 170"`), `JAR_INSIDE_D = JAR_OUTLINE_D + "L418 128L150 128Z"` and `JAR_FILL_RANGE = { bottom: 418, height: 280 }`.

- [ ] **Step 1: Write the failing tests.**
  - `jarsoFill`:
    - `{save 30000, spend 0, goal 45000}` → `2/3`
    - `{save 50000, spend 0, goal 45000}` → `1`
    - `{save -100, spend 0, goal null}` → `0`
    - `{save 0, spend 0, goal null}` → `0`
    - `{save 100, spend 300, goal null}` → `0.25`
  - `wearUnlocked("crown", 4)` → false, and `wearUnlocked("crown", 5)` → true.
  - `availableWear(1)` → `["none","cap"]`.
  - `parseLook({ lid: "pink", wear: "cap" })` → `{ lid: "cyan", wear: "cap" }`.
  - `moodFor("answerWrong")` → `"think"`.
  - The set of `moodFor` outputs over every moment is a subset of `JARSO_MOODS`.
- [ ] **Step 2: Run them.** Command: `pnpm --filter @jarso/core test -- tests/mascot`. Expected result: FAIL, because the module is missing.
- [ ] **Step 3: Implement the three files and the barrel.**
- [ ] **Step 4: Run the tests and the purity check.** Command: `pnpm --filter @jarso/core test && pnpm lint`. Expected result: PASS, with no Biome purity errors.
- [ ] **Step 5: Commit.** Message: `feat(core): mascot rules for Jarso (moods, looks, fill)`.

### Task 4: `<Jarso />`, the mascot drawn on the phone

**Files:**
- Create: `apps/mobile/src/components/brand/jarso.tsx`, `apps/mobile/src/components/brand/index.ts`
- Modify: `apps/mobile/tsconfig.json` or the path aliases, only if `@/components/brand` doesn't already resolve through `@/*`
- Test: `apps/mobile/tests/components/jarso.test.tsx`

**Interfaces:**
- Consumes: Task 3 (`JarsoMood`, `JarsoLook`, `JAR_OUTLINE_D`, `JAR_INSIDE_D`, `JAR_FILL_RANGE`, `DEFAULT_LOOK`).
- Produces: `Jarso(props: { mood?: JarsoMood; size?: number; fill?: number; look?: JarsoLook; tint?: "save" | "spend"; gaze?: "ahead" | "up"; bounce?: boolean; accessibilityLabel?: string; testID?: string })`. The defaults are mood `happy`, size 120, fill 0.4, `DEFAULT_LOOK`, tint `save`, gaze `ahead`, and bounce false.
  - Exported helper: `lidHex(lid: LidColor): string`, which maps onto palette values.

- [ ] **Step 1: Write the failing tests.**
  - `is hidden from screen readers without a label`: the root has `accessibilityElementsHidden: true`.
  - `with a label it is an image`: `getByRole("image", { name: "Jarso" })`.
  - `fill sets the gold rect`: with `fill={0.5}`, the `testID="jarso-fill"` Rect's `y` equals `418 - 0.5*280`.
  - `every mood renders`: loop over `JARSO_MOODS`, rendering each without throwing and with `testID="jarso-mouth-<mood>"` present.
  - `crown draws the crown`: `look={{lid:"grape",wear:"crown"}}` gives `getByTestId("jarso-wear-crown")`.
  - `lidHex("grape")` equals `palette.grape["500"]`.
- [ ] **Step 2: Run them.** Command: `pnpm --filter @jarso/mobile test -- tests/components/jarso.test.tsx`. Expected result: FAIL.
- [ ] **Step 3: Implement it by porting the mockup's `jarso()` drawing to react-native-svg.**
  - Use `viewBox="-10 -50 532 540"`.
  - Draw the parts in this order: arms, feet, white inside, gold fill clipped by `JAR_INSIDE_D`, outline (stroke teal-600, width 56), lid, lid coin, wear, cheeks, eyes, mouth.
  - Tint `spend` uses teal-500 and teal-400 for the fill instead of gold.
  - `shades` is two dark rounded rects over the eyes with a bridge. `headphones` is an arc over the lid plus two cups.
  - With `bounce` on, play a single Reanimated `withSequence` scale of 1 → 1.08 → 1 over 500 ms whenever `mood` changes. Skip it when `useReducedMotion()` is true.
  - Add an idle blink: eyelids close for 120 ms every 4 s. This is the one loop design.md allows. It is disabled under reduced motion.
- [ ] **Step 4: Run the tests.** Command: `pnpm --filter @jarso/mobile test -- tests/components`. Expected result: PASS.
- [ ] **Step 5: Commit.** Message: `feat(mobile): draw Jarso with moods, fill and looks`.

### Task 5: `CoachSays` shows Jarso

**Files:**
- Modify: `apps/mobile/src/components/screen/coach-says.tsx`
- Test: `apps/mobile/tests/components/screen.test.tsx` (add cases)

**Interfaces:**
- Consumes: `Jarso` (Task 4), and `moodFor` and `JarsoMoment` (Task 3).
- Produces: the same API `CoachSays({ coachKey, moment })`, plus an optional `size?: "sm" | "md"` (44 or 88 dp). The line is still `coachLine(coachIdFor(coachKey), moment)`. The coach name is no longer shown. The layout is a row: Jarso on the left, then a speech bubble with a left tail (white card, 20 radius, 3 dp `#d3e1e7` ledge, font-sans-extrabold).

- [ ] **Step 1: Write the failing tests.**
  - `coach says shows Jarso, not a coach name`: render `<CoachSays coachKey="learn" moment="learn" />`. Expect `queryByText(coachNames[coachIdFor("learn")])` to be null, and the line text to be present.
  - `bubble line is one Text`: the line node is a single Text with `numberOfLines` unset.
- [ ] **Step 2: Run it.** Expected result: FAIL, because the name is still shown.
- [ ] **Step 3: Implement it.** The mood is `"sleepy"` for the `nothingNew` moment and `"happy"` otherwise.
- [ ] **Step 4: Run the tests.** Command: `pnpm --filter @jarso/mobile test -- tests/components tests/features/learning tests/features/news`. Expected result: PASS.
- [ ] **Step 5: Commit.** Message: `feat(mobile): Jarso speaks the coach lines`.

### Task 6: Sound effects and the sound setting

**Files:**
- Create: `scripts/make-sounds.mjs`. It writes three 16-bit mono 22.05 kHz WAVs using only Node built-ins:
  - `coin`: two sine blips, 1320 Hz then 1760 Hz, 70 ms each, with a fast decay.
  - `pop`: a 90 ms sweep from 600 to 1200 Hz.
  - `cheer`: an arpeggio of 523, 659, 784 and 1047 Hz, 110 ms each.
- Create: `apps/mobile/assets/sounds/{coin,pop,cheer}.wav` (the script's output, committed)
- Create: `apps/mobile/src/lib/sound.ts`
- Modify: `apps/mobile/src/lib/index.ts` (barrel)
- Test: `apps/mobile/tests/lib/sound.test.ts`

**Interfaces:**
- Produces:
  - `type SoundName = "coin" | "pop" | "cheer"`
  - `playSound(name: SoundName): void`. Fire-and-forget. It never throws, logs failures with `logger.warn`, and does nothing while sound is off.
  - `getSoundOn(): Promise<boolean>`. Reads the AsyncStorage key `jarso.sound`; the default is true.
  - `setSoundOn(on: boolean): Promise<void>`
  - `useSoundOn(): [boolean, (on: boolean) => void]`
  - One `createAudioPlayer` per clip, created lazily and reused (`seekTo(0)` then `play()`).

- [ ] **Step 1: Write the failing tests.**
  - `plays when on`: with the mock, `playSound("coin")` causes the player's `play` to be called once.
  - `silent when off`: after `await setSoundOn(false)`, `play` is not called.
  - `never throws`: when `createAudioPlayer` throws, `expect(() => playSound("pop")).not.toThrow()`.
  - `defaults to on`: `await getSoundOn()` is true when storage is empty.
- [ ] **Step 2: Run them.** Expected result: FAIL.
- [ ] **Step 3: Generate the assets and implement it.** Generate with `node scripts/make-sounds.mjs apps/mobile/assets/sounds`, then implement `sound.ts`. Keep the on/off value in a module variable, warmed by `getSoundOn()` on first use, so `playSound` stays synchronous.
- [ ] **Step 4: Run the tests.** Command: `pnpm --filter @jarso/mobile test -- tests/lib/sound.test.ts`. Expected result: PASS.
- [ ] **Step 5: Commit.** Message: `feat(mobile): short sound effects with an off switch`.

### Task 7: Confetti and `celebrate()`

**Files:**
- Create: `apps/mobile/src/components/celebrate/confetti.tsx`, `apps/mobile/src/components/celebrate/celebration.tsx`, `apps/mobile/src/components/celebrate/index.ts`
- Modify: `apps/mobile/app/(child)/_layout.tsx` (wrap the stack in `<CelebrationProvider>`)
- Test: `apps/mobile/tests/components/celebration.test.tsx`

**Interfaces:**
- Consumes: `Jarso` (Task 4), `Button` keycaps (Task 2), `playSound` (Task 6), `JarsoMood` and `JarsoLook` (Task 3).
- Produces:
  - `type Celebration = { title: string; subtitle?: string; mood?: JarsoMood; tone?: "teal" | "gold" | "grape" | "success"; chips?: { icon: "zap" | "flame" | "award" | "unlock"; label: string }[]; primary: { label: string; onPress?: () => void }; secondary?: { label: string; onPress?: () => void }; sound?: SoundName; look?: JarsoLook; fill?: number; sheet?: boolean }`
  - `CelebrationProvider({ children })`
  - `useCelebrate(): (c: Celebration) => void`
  - `Confetti({ count?: number })`, 40 by default.
- Behaviour:
  - Calls queue up, and one shows at a time.
  - Showing one plays `sound` (default `cheer`), fires `Haptics.notificationAsync(Success)` and announces the title.
  - `sheet: true` renders a bottom sheet over the screen (the lesson feedback, mockup L3). Otherwise it fills the screen with the tone's gradient (mockups F3, J3, C7, T5).
  - The primary button closes the celebration and then calls `onPress`.
  - Confetti is 40 pieces in palette colours that fall over 1.6 s, once. It renders nothing under reduced motion.
- The default Jarso mood is `cheer`.

- [ ] **Step 1: Write the failing tests.**
  - `shows title and chips and announces`: call `celebrate({ title: "Written down!", chips: [{icon:"zap",label:"+10"}], primary: {label:"Nice"} })` from a test button. Expect `getByText("Written down!")` and `getByText("+10")`, and expect `AccessibilityInfo.announceForAccessibility` to have been called with `"Written down!"`.
  - `queues two`: call it twice. Only the first title shows. Pressing "Nice" shows the second.
  - `primary runs onPress after closing`.
  - `reduced motion has no confetti`: mock `useReducedMotion` to return true, and expect `queryAllByTestId("confetti-piece")` to have length 0.
  - `plays the chosen sound`: `playSound` is called with `"coin"` when `sound: "coin"`.
- [ ] **Step 2: Run them.** Expected result: FAIL.
- [ ] **Step 3: Implement it.** Use a React Native `Modal`, transparent, with `statusBarTranslucent`. The gradients are react-native-svg `LinearGradient` rects:
  - teal: teal-600 → teal-900
  - gold: `#fff3b0` → gold-100
  - grape: grape-500 → grape-900
  - success: tint-success → card

  The text uses the semantic foregrounds.
- [ ] **Step 4: Run the tests.** Command: `pnpm --filter @jarso/mobile test`. Expected result: PASS, with the whole suite green.
- [ ] **Step 5: Commit.** Message: `feat(mobile): celebrations with confetti, sound and haptics`.

### Task 8: Verify on a device and finish

- [ ] **Step 1: Run `pnpm check`.** Expected result: lint, typecheck and tests all pass.
- [ ] **Step 2: Add a temporary dev-only screen and look at it on a device.** Add `app/(child)/dev-foundation.tsx`, guarded by `__DEV__`. It shows every mood, the five lids with each outfit, the four keycaps, and a button per celebration tone. Run `pnpm mobile` on the device, compare against the mockup's H1, C6, F3 and T5, and fix any drift.
- [ ] **Step 3: Delete the dev screen.** Then update `docs/design.md` §7 (the mobile mascot: Jarso replaces the coaches on the phone, with moods, looks and the never-sad rule) and §8 (celebration, confetti, sound). Also update `docs/mobile-ui-parity.md`: gaps 1, 4 and 5 are closed by Jarso.
- [ ] **Step 4: Commit.** Message: `docs: Jarso mascot and celebrations on mobile`.
