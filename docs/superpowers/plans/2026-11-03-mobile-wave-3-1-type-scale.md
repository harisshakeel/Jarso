# Mobile wave 3, plan 1: phone type scale and visual calm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The existing child phone app uses a smaller, calmer phone type scale (tokens only, no raw Tailwind sizes), titles and money stop growing past 1.3× system font scale, child Home matches mockup B, and the shared tokens, primitives and calm components exist for the parent screens (plan 2).

**Architecture:** `@jarso/brand/tokens` gains `mobileFontSize`; the phone's Tailwind theme reads it instead of the web `fontSize`, and `cn` learns the token names so `tailwind-merge` stops treating them as colours. The `Text` primitive picks the body size from a `BodySizeProvider` (child 16 / parent 15), caps font scaling on title and money tokens, and sets tabular figures on money. A grep test keeps raw sizes and all-caps labels out of `apps/mobile`. Small shared screen components (`Card`, `Eyebrow`, `ProgressBar`, `ListRow`, `ScreenHeader`) carry the calm rules so each screen stops hand-rolling them.

**Tech Stack:** Expo SDK 58, NativeWind v4 on Tailwind 3, `tailwind-merge` v3, `class-variance-authority`, jest-expo + React Native Testing Library, Vitest (brand), Biome.

**Spec:** `docs/superpowers/specs/2026-11-03-mobile-wave-3-design.md` (Goal 5, Decided §9) and the approved mockup `docs/superpowers/specs/mockups/2026-11-03-mobile-wave-3-type-scale.html` (phones B and C are the target; A is today). Plans 2–4 of wave 3 (parent screens, push, payments) build on this one.

## Global Constraints

- Web unchanged: `fontSize` in `packages/brand/tokens.ts`, `tokens.css` and every web file stay byte-identical; web unit and e2e tests stay green.
- Phone scale (size / line height px, weight): display 26/32 800 · h1 22/28 800 · h2 18/24 700 · h3 16/22 700 · body 16/22 400 (child) · body-parent 15/21 400 · small 13/18 400–600 · caption 12/16 600 · money-xl 32/36 800 tabular · money-l 22/26 700 tabular · money 17/22 700 tabular.
- "A child's reading text is never under 16. Parent body text is 15." `small` is meta only (timestamps, counts, jar names over an amount); `caption` is chips and eyebrows only. Card and sheet descriptions, field helpers and errors are body.
- "System font scaling stays on (accessibility). Cap it at 1.3× (`maxFontSizeMultiplier`) on titles and money only." Body, small and caption are never capped.
- Calm rules (spec §9, verbatim): hierarchy comes from weight and space rather than size; one accent (teal action or gold money) per card; meta text in the muted colour; spacing on the 4 dp grid with 16 dp gutters and 12–16 dp card padding; no more than one Display or Money XL per screen; lists over stacked cards where items repeat.
- Sentence case everywhere for children: no `uppercase` labels in `apps/mobile` (`docs/design.md` §3).
- Copy is unchanged and comes from `@jarso/core` (web wording wins over mockup wording: "Spent something?" not "Log a buy", "Hi, Sam!" not "Hi Sam"). The only new copy is `goalCopy.card.ofTarget` (Task 6), added in core.
- Touch targets 48 dp (`h-12`), labels and roles kept; existing `accessibilityLabel`s and Maestro selectors ("Put some in Save", "Take some out", "Ask for extra", "Move my money", "See it", "Set a goal", …) keep working.
- `pnpm check` green after every task. Never read `.env*`; never print credentials (CLAUDE.md rule 17).
- Commits: Conventional Commits, one logical change each, subject ≤ 60 chars, no AI attribution. **Commit steps run only after the user says to commit.**

## Review Focus

1. **`tailwind-merge` drops size tokens next to a colour.** Today `cn("font-sans-bold text-h3", "text-primary")` returns `"font-sans-bold text-primary"` (verified), so jar names already lose `text-h3`; with a `text-body` base, any `text-muted-foreground` override would drop the body size and fall back to RN's 14. *(Task 2 tests: `keeps a size token beside a colour`, `later size token wins`, `body and body-parent conflict`)*
2. **Large system font (Android "largest", 1.3–2.0×) on a 360 dp phone.** Titles and money stop at 1.3×, body keeps scaling, and an explicit prop still wins. *(Task 3 tests: `caps title and money tokens at 1.3`, `leaves body uncapped`, `explicit maxFontSizeMultiplier wins`, `caps a money input`)*
3. **A big balance or long nickname in the jars card.** Two jars share one row at 360 dp; "₹1,23,45,678" must shrink to fit on one line, not wrap or clip, and a long nickname wraps beside the avatar. *(Task 6 test: `big balances stay on one line`)*
4. **Goal edge states on the new Home goal card.** No plan, reached, and saved over target: bar clamps to 0–100, the line under it uses core's `goalLine`. *(Task 6 tests: `no plan says what is left`, `reached fills the bar`; Task 5 test: `clamps the value`)*
5. **Parent body size leaking into child screens.** Without a provider `Text` is child body 16; only inside `BodySizeProvider size="parent"` is it 15, and a nested child provider wins. *(Task 3 test: `body size defaults to child and follows the nearest provider`)*

---

## File Structure

```
packages/brand/tokens.ts                         MODIFY add mobileFontSize, MobileFontToken
packages/brand/tests/tokens.test.ts              MODIFY phone scale tests
docs/design.md                                   MODIFY §3 table gains a Phone column
apps/mobile/tailwind.config.js                   MODIFY fontSize from mobileFontSize
apps/mobile/src/lib/utils.ts                     MODIFY cn via extendTailwindMerge
apps/mobile/src/lib/font-scale.ts                NEW    MAX_TITLE_FONT_SCALE, fontScaleCap, isMoneyClass
apps/mobile/src/lib/dates.ts                     MODIFY todayLine
apps/mobile/src/components/ui/text.tsx           MODIFY body context, cap, tabular, drop raw variants
apps/mobile/src/components/ui/{button,label,input}.tsx  MODIFY body token, input cap
apps/mobile/src/components/screen/{card,eyebrow,progress-bar,list-row,screen-header}.tsx  NEW
apps/mobile/src/components/screen/tab-heading.tsx MODIFY uses ScreenHeader
apps/mobile/src/features/**, apps/mobile/app/**  MODIFY raw sizes → tokens; calm pass
apps/mobile/src/features/jars/jars-card.tsx      NEW    both jars in one card (replaces jar-card.tsx)
apps/mobile/src/features/home/home-screen.tsx    MODIFY mockup B
apps/mobile/src/features/goals/{goal-card,home-step-card}.tsx  MODIFY mockup B
packages/core/src/goals/copy.ts                  MODIFY goalCopy.card.ofTarget
apps/mobile/tests/type-scale.test.ts             NEW    theme + grep guards
apps/mobile/tests/lib/{utils,font-scale,dates}.test.ts  NEW
apps/mobile/tests/components/{text,screen}.test.tsx     NEW
docs/mobile.md                                   MODIFY type scale note
```

## Interfaces produced for plans 2–4

- Tailwind size classes (the only sizes allowed in `apps/mobile`): `text-display`, `text-h1`, `text-h2`, `text-h3`, `text-body`, `text-body-parent`, `text-small`, `text-caption`, `text-money-xl`, `text-money-l`, `text-money`.
- `@jarso/brand/tokens`: `mobileFontSize` (same entry shape as `fontSize`: `{ size; lineHeight; fontWeight?; letterSpacing? }`), `type MobileFontToken = keyof typeof mobileFontSize`.
- `@/components/ui`: `BodySizeProvider({ size: "child" | "parent"; children: ReactNode })`, `useBodySizeClass(): "text-body" | "text-body-parent"`. Plan 2 wraps `app/(parent)/_layout.tsx` in `<BodySizeProvider size="parent">`; nothing else changes per screen.
- `@/lib`: `MAX_TITLE_FONT_SCALE = 1.3`, `fontScaleCap(className?: string): number | undefined`, `isMoneyClass(className?: string): boolean`, `todayLine(now: Date, timeZone: string): string` ("Tuesday 3 November"), `cn` aware of the tokens.
- `@/components/screen`: `Card`, `CardSeparator`, `Eyebrow`, `ProgressBar`, `ListRow`, `ScreenHeader`, `TabHeading` (signatures in Task 5).

---

### Task 1: `mobileFontSize` tokens and the design doc's Phone column

**Files:**
- Modify: `packages/brand/tokens.ts` (after `fontSize`, ~line 238), `docs/design.md:118-138`
- Test: `packages/brand/tests/tokens.test.ts`

**Interfaces:**
- Produces: `export const mobileFontSize` and `export type MobileFontToken = keyof typeof mobileFontSize`.

- [ ] **Step 1: Write the failing tests** in a new `describe("phone type scale", …)` (outside the CSS parity block: `mobileFontSize` has no CSS twin)

```ts
it("covers every web size token plus body, body-parent, small and caption", () => {
  expect(Object.keys(mobileFontSize).sort()).toEqual(
    [...Object.keys(fontSize), "body", "body-parent", "small", "caption"].sort(),
  );
});
it("matches the spec table", () => {
  expect(mobileFontSize.display).toEqual({ size: 26, lineHeight: 32, fontWeight: 800, letterSpacing: -0.4 });
  expect(mobileFontSize.h1).toEqual({ size: 22, lineHeight: 28, fontWeight: 800, letterSpacing: -0.3 });
  expect(mobileFontSize.h2).toEqual({ size: 18, lineHeight: 24, fontWeight: 700 });
  expect(mobileFontSize.h3).toEqual({ size: 16, lineHeight: 22, fontWeight: 700 });
  expect(mobileFontSize.body).toEqual({ size: 16, lineHeight: 22 });
  expect(mobileFontSize["body-parent"]).toEqual({ size: 15, lineHeight: 21 });
  expect(mobileFontSize.small).toEqual({ size: 13, lineHeight: 18 });
  expect(mobileFontSize.caption).toEqual({ size: 12, lineHeight: 16 });
  expect(mobileFontSize["money-xl"]).toEqual({ size: 32, lineHeight: 36, fontWeight: 800, letterSpacing: -0.64 });
  expect(mobileFontSize["money-l"]).toEqual({ size: 22, lineHeight: 26, fontWeight: 700 });
  expect(mobileFontSize.money).toEqual({ size: 17, lineHeight: 22, fontWeight: 700 });
});
it("is never larger than the web for a shared token", () => {
  for (const key of Object.keys(fontSize) as (keyof typeof fontSize)[])
    expect(mobileFontSize[key].size).toBeLessThanOrEqual(fontSize[key].size);
});
it("keeps child reading text at 16 or more", () => {
  expect(mobileFontSize.body.size).toBeGreaterThanOrEqual(16);
});
```

- [ ] **Step 2: Run** `pnpm --filter @jarso/brand test` → FAIL (`mobileFontSize` is not exported).

- [ ] **Step 3: Add `mobileFontSize`** with exactly the values above (`as const`). Weights only where the web sets one (titles, money); body, small and caption take weight from the `font-sans-*` family class, because React Native picks the weight by font file. Letter spacing: display and h1 from mockup B/C (-0.4, -0.3); money-xl is -0.02em × 32. Doc comment: "Phone type scale (wave 3 spec §9). Not in tokens.css; the web never reads it." Update the file header comment so it no longer claims every export mirrors `tokens.css`.

- [ ] **Step 4: Add the Phone column to `docs/design.md` §3**: table headers `Style | Web size / line | Phone size / line | Weight | Use`; add a Body (parent) row (web —, phone 15 / 21, "Parent screens only"); Body row's Use gains "Phone: 16 / 22 on child screens". Under the table, one paragraph: phone sizes come from `mobileFontSize`; titles and money cap system font scaling at 1.3×; the calm rules (copy the six from spec §9). Eyebrow line gains "phone: same 12 / 16".

- [ ] **Step 5: Run** `pnpm --filter @jarso/brand test` → PASS (existing parity tests unchanged).

- [ ] **Step 6: Commit**

```bash
git add packages/brand/tokens.ts packages/brand/tests/tokens.test.ts docs/design.md
git commit -m "feat(brand): add phone type scale tokens"
```

---

### Task 2: phone theme reads the tokens; `cn` knows them

**Files:**
- Modify: `apps/mobile/tailwind.config.js`, `apps/mobile/src/lib/utils.ts`, `docs/mobile.md:8`
- Test: `apps/mobile/tests/type-scale.test.ts` (new), `apps/mobile/tests/lib/utils.test.ts` (new)

**Interfaces:**
- Consumes: `mobileFontSize` (Task 1).
- Produces: every `text-<MobileFontToken>` class resolves; `cn(...inputs: ClassValue[]): string` treats them as the `font-size` group.

- [ ] **Step 1: Write the failing tests**

`type-scale.test.ts` (same `resolveConfig` pattern as `tests/tailwind-colors.test.ts`):
```ts
it("maps every phone token into the theme", () => {
  for (const [key, { size, lineHeight }] of Object.entries(mobileFontSize))
    expect(fontSizes[key]).toEqual([`${size}px`, expect.objectContaining({ lineHeight: `${lineHeight}px` })]);
  expect(fontSizes.h1[1]).toEqual({ lineHeight: "28px", letterSpacing: "-0.3px", fontWeight: "800" });
});
```
`lib/utils.test.ts`:
```ts
it("keeps a size token beside a colour", () => {
  expect(cn("font-sans-bold text-h3", "text-primary")).toBe("font-sans-bold text-h3 text-primary");
  expect(cn("text-body text-foreground", "text-muted-foreground")).toBe("text-body text-muted-foreground");
});
it("later size token wins", () => expect(cn("text-body", "text-money-l")).toBe("text-money-l"));
it("body and body-parent conflict", () => expect(cn("text-body-parent", "text-body")).toBe("text-body"));
```

- [ ] **Step 2: Run** `pnpm --filter @jarso/mobile test -- type-scale utils` → FAIL (`h1` is 32px; `text-h3` dropped).

- [ ] **Step 3: Implement.** `tailwind.config.js`: require `mobileFontSize` instead of `fontSize` and map it with the existing mapper, still under `theme.extend.fontSize` for now (raw sizes keep working until Task 4 removes them). Update the header comment ("phone type scale"). `utils.ts`: build the merger once with `extendTailwindMerge({ extend: { classGroups: { "font-size": [{ text: Object.keys(mobileFontSize) }] } } })` and use it in `cn`. `docs/mobile.md` line 8: the theme's type scale is `mobileFontSize` (spec §9), not the web `fontSize`.

- [ ] **Step 4: Run** `pnpm --filter @jarso/mobile test` → PASS (whole suite: copy assertions are size-independent).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/tailwind.config.js apps/mobile/src/lib/utils.ts apps/mobile/tests/type-scale.test.ts apps/mobile/tests/lib/utils.test.ts docs/mobile.md
git commit -m "feat(mobile): use phone type scale in the theme"
```

(If the reviewer prefers, the `cn` change is its own `fix(mobile): keep size tokens in cn` commit: it fixes jar names losing `text-h3` today.)

---

### Task 3: `Text`, `Button`, `Label`, `Input` primitives

**Files:**
- Create: `apps/mobile/src/lib/font-scale.ts` (export from `apps/mobile/src/lib/index.ts`)
- Modify: `apps/mobile/src/components/ui/text.tsx`, `button.tsx:58`, `label.tsx:31`, `input.tsx:11,19`, `apps/mobile/src/components/ui/index.ts` (already `export *` from text)
- Test: `apps/mobile/tests/lib/font-scale.test.ts`, `apps/mobile/tests/components/text.test.tsx`

**Interfaces:**
- Consumes: `cn` (Task 2).
- Produces:
  - `MAX_TITLE_FONT_SCALE = 1.3`; `fontScaleCap(className?: string): number | undefined` → 1.3 when the class string contains `text-display|h1|h2|h3|money-xl|money-l|money` as a whole class, else `undefined`; `isMoneyClass(className?: string): boolean`.
  - `BodySizeProvider({ size, children })`, `useBodySizeClass()` in `text.tsx`.
  - `Text` props unchanged except the unused `variant` prop and its raw-size variants (`h1`–`h4`, `p`, `blockquote`, `code`, `lead`, `large`, `small`, `muted`) are removed, with `ROLE`/`ARIA_LEVEL` (no caller passes `variant` to `Text`; typecheck confirms).

- [ ] **Step 1: Write the failing tests**

`font-scale.test.ts`:
```ts
it.each(["text-display", "font-sans-bold text-h3", "text-money", "text-money-xl text-primary"])("caps %s", (c) =>
  expect(fontScaleCap(c)).toBe(1.3));
it.each([undefined, "text-body", "text-small", "text-caption", "text-body-parent", "text-moneyish"])("leaves %s", (c) =>
  expect(fontScaleCap(c)).toBeUndefined());
it("knows money classes", () => {
  expect(isMoneyClass("text-money-l")).toBe(true);
  expect(isMoneyClass("text-h1")).toBe(false);
});
```
`components/text.test.tsx`:
```ts
it("caps title and money tokens at 1.3", …)        // <Text className="text-money-l">£4</Text> → props.maxFontSizeMultiplier === 1.3
it("leaves body uncapped", …)                       // <Text>Hi</Text> → maxFontSizeMultiplier undefined
it("explicit maxFontSizeMultiplier wins", …)        // <Text className="text-h1" maxFontSizeMultiplier={2}> → 2
it("sets tabular figures on money", …)              // className "text-money" → StyleSheet.flatten(props.style).fontVariant toEqual ["tabular-nums"]
it("body size defaults to child and follows the nearest provider", …)
  // renderHook(useBodySizeClass) → "text-body"; wrapped in parent → "text-body-parent";
  // parent provider wrapping a child provider → "text-body"
it("caps a money input", …)                         // <Input className="text-money-xl" /> → maxFontSizeMultiplier 1.3
```

- [ ] **Step 2: Run** `pnpm --filter @jarso/mobile test -- font-scale text` → FAIL (module missing).

- [ ] **Step 3: Implement.**
  - `font-scale.ts`: a single regex over whole classes (`(?<![\w-])text-(…)(?![\w-])`).
  - `text.tsx`: `BodySizeContext` defaults to `"child"`; base class `cn("font-sans text-foreground", useBodySizeClass(), …)`; after merging `textClass` and `className`, pass `maxFontSizeMultiplier={props.maxFontSizeMultiplier ?? fontScaleCap(merged)}` and, when `isMoneyClass(merged)`, `style={[{ fontVariant: ["tabular-nums"] }, props.style]}`.
  - `button.tsx`: drop `text-base` from `buttonTextVariants` (Text supplies the body size). `label.tsx`: drop `text-base`. `input.tsx`: replace `text-base` with `useBodySizeClass()`, drop `md:text-sm`, pass `maxFontSizeMultiplier={props.maxFontSizeMultiplier ?? fontScaleCap(className)}`.

- [ ] **Step 4: Run** `pnpm --filter @jarso/mobile test && pnpm --filter @jarso/mobile typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib apps/mobile/src/components/ui apps/mobile/tests/lib/font-scale.test.ts apps/mobile/tests/components/text.test.tsx
git commit -m "feat(mobile): body size context and font scale cap"
```

---

### Task 4: replace every raw size with a token; guard it

**Files:**
- Modify: `apps/mobile/tailwind.config.js` (move the map from `theme.extend.fontSize` to `theme.fontSize`, so raw sizes stop existing), `apps/mobile/app/(child)/(tabs)/_layout.tsx:44` (tab label style from `mobileFontSize.caption`), and every file in the inventory below
- Test: `apps/mobile/tests/type-scale.test.ts`

**Interfaces:**
- Consumes: token classes (Task 2), `fontScaleCap` via `Text`/`Input` (Task 3).

Inventory (from `grep -rnE "text-(xs|sm|base|lg|xl|[2-9]xl)\b" apps/mobile/src apps/mobile/app`, after Task 3: ~85 hits in 33 files, none in `app/`). Rules, applied in order:

| Raw use | Becomes |
|---|---|
| Errors, field hints, sheet descriptions/lines, disclosures, intros, notice bodies, jar notes, guide reply lines, graph number rows (`text-sm`, `text-lg` reading text) | drop the class (Text's body, 16) |
| Timestamps and dates (`inbox-list:83`, `guide-screens:124`), roadmap day label (`roadmap:49`), coach names (`coach-says:10`, `mission-player:725`), graph legend and toggles (`jar-graph:126,137,226`), "The amounts" summary (`goal-staircase:130`) | `text-small` |
| Status chip (`request-list:129`), guide label (`intro:13`) | `text-caption` |
| `uppercase` eyebrows (`home-step-card:54`, `next-step-card:36`, `parts:83`, `week-card:22,61,75`, `inbox-list:107`, `mission-player:315,527,647`) | leave for Task 7 (`Eyebrow`); for now `text-caption`, keep `uppercase` |
| Money shown (`predict-step:109` → `text-money`; `step-views:137,141` → `text-money-l`; `step-views:99` currency mark, `step-views:113` input → `text-money`) | as listed |
| Amount inputs (`sheet-parts:68`, `purchase-sheet:197`, `goal-sheet:321`) | `text-money-xl` (the one Money XL on that sheet) |
| Headings (`mission-player:648` → `text-h1`; `mission-player:776`, `roadmap:41`, `goal-staircase:115` full → `text-h3`) | as listed |
| Emoji (`category-chips:35` → `text-h2`; `goal-sheet:162` → `text-h1`) | as listed |
| `thread.tsx:225` TextInput `text-base` | `useBodySizeClass()` |

- [ ] **Step 1: Write the failing guard tests** in `type-scale.test.ts` (reuse the `files()` walker from `tailwind-colors.test.ts`; move it to `tests/source-files.ts` and import it in both)

```ts
it("uses no raw Tailwind size class in the app", () => {
  // src/ and app/, .ts/.tsx; prefixed variants (md:text-sm, dark:text-lg) count too
  expect(hits(/(?<![\w-])text-(?:xs|sm|base|lg|xl|[2-9]xl)(?![\w-])/g)).toEqual([]);
});
it("offers no size outside the phone scale", () => {
  expect(Object.keys(fontSizes).sort()).toEqual(Object.keys(mobileFontSize).sort());
});
it("uses Display or Money XL at most once per file", () => {
  expect(filesWithMoreThanOne(/(?<![\w-])text-(?:display|money-xl)(?![\w-])/g)).toEqual([]);
});
```
`hits` returns `"<class> (<relative path>:<line>)"` strings so a failure names the spot.

- [ ] **Step 2: Run** `pnpm --filter @jarso/mobile test -- type-scale` → FAIL listing the inventory and the extra default sizes.

- [ ] **Step 3: Apply the table** file by file; switch `tailwind.config.js` to `theme.fontSize`; tab bar label uses `mobileFontSize.caption.size/lineHeight`.

- [ ] **Step 4: Run** `pnpm --filter @jarso/mobile test && pnpm --filter @jarso/mobile typecheck && pnpm lint` → PASS (copy assertions unchanged).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile
git commit -m "refactor(mobile): replace raw text sizes with tokens"
```

---

### Task 5: calm screen components

**Files:**
- Create: `apps/mobile/src/components/screen/{card,eyebrow,progress-bar,list-row,screen-header}.tsx`
- Modify: `apps/mobile/src/components/screen/index.ts`, `tab-heading.tsx`, `apps/mobile/src/lib/dates.ts`
- Test: `apps/mobile/tests/components/screen.test.tsx`, `apps/mobile/tests/lib/dates.test.ts`

**Interfaces:**
- Produces (all from `@/components/screen`):
  - `Card(props: ViewProps & { className?: string })`: `gap-3 rounded-2xl border border-border bg-card px-4 py-3.5` (16 / 14 dp, mockup B).
  - `CardSeparator()`: hairline (`h-px bg-border`), hidden from accessibility.
  - `Eyebrow({ children: string; tone?: "primary" | "muted" })`: `text-caption font-sans-semibold tracking-[1px]`, `text-primary` (default) or `text-muted-foreground`; sentence case, never `uppercase`.
  - `ProgressBar({ value: number; tone?: "gold" | "primary"; accessibilityLabel: string })`: `h-2 rounded-full bg-muted` track; `accessibilityRole="progressbar"`, `accessibilityValue={{ min: 0, max: 100, now }}` with `now = Math.round(clamp(value, 0, 1) * 100)`.
  - `ListRow({ label: string; detail?: string; trailing?: ReactNode; onPress?: () => void; accessibilityRole?: "button" | "link"; accessibilityLabel?: string })`: `min-h-12` row; label body semibold, detail `text-small text-muted-foreground`; chevron when `onPress`.
  - `ScreenHeader({ overline?: string; title: string; size?: "display" | "h1"; trailing?: ReactNode })`: overline `text-small font-sans-semibold text-muted-foreground`; title `font-sans-extrabold text-<size>` (`h1` default), `accessibilityRole="header"`, `min-w-0 flex-1` so long names wrap.
  - `TabHeading({ title, children })`: unchanged signature, renders `ScreenHeader` (h1, was h2) in `gap-4 px-4 pt-4 pb-10`.
- `@/lib`: `todayLine(now: Date, timeZone: string): string`, `Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone })`.

- [ ] **Step 1: Write the failing tests**

```ts
it("clamps the value", …)            // ProgressBar value -1 → accessibilityValue.now 0; 2 → 100; 0.57 → 57
it("eyebrow keeps sentence case", …) // getByText("Do this next")
it("list row is a 48 dp button with its label", …) // getByRole("button", { name: "Take some out" }); press → onPress called
it("list row without onPress is not a button", …)
it("screen header is a header with its overline", …) // getByRole("header", { name: "Hi, Mia!" }); getByText("Tuesday 3 November")
it("todayLine names the family's day", () => {
  expect(todayLine(new Date("2026-11-03T23:30:00Z"), "Asia/Kolkata")).toBe("Wednesday 4 November");
  expect(todayLine(new Date("2026-11-03T09:00:00Z"), "Europe/London")).toBe("Tuesday 3 November");
});
```

- [ ] **Step 2: Run** `pnpm --filter @jarso/mobile test -- screen dates` → FAIL.
- [ ] **Step 3: Implement** the components and `todayLine`; export them from the barrels.
- [ ] **Step 4: Run** `pnpm --filter @jarso/mobile test` → PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/screen apps/mobile/src/lib/dates.ts apps/mobile/tests/components/screen.test.tsx apps/mobile/tests/lib/dates.test.ts
git commit -m "feat(mobile): add calm card, eyebrow and list parts"
```

---

### Task 6: child Home to mockup B

**Files:**
- Create: `apps/mobile/src/features/jars/jars-card.tsx` (replaces `jar-card.tsx`; update `features/jars/index.ts`)
- Modify: `apps/mobile/src/features/home/home-screen.tsx`, `apps/mobile/src/features/goals/goal-card.tsx`, `home-step-card.tsx`, `apps/mobile/src/features/learning/next-step-card.tsx`, `packages/core/src/goals/copy.ts:76-82`
- Test: `apps/mobile/tests/features/jars/home-screen.test.tsx`, `apps/mobile/tests/features/goals/goals.test.tsx`, `packages/core/tests/goals/copy.test.ts`

**Interfaces:**
- Consumes: `Card`, `CardSeparator`, `Eyebrow`, `ProgressBar`, `ListRow`, `ScreenHeader` (Task 5), `todayLine` (Task 5), `goalLine` from `@jarso/core/goals`.
- Produces:
  - `JarsCard({ spend: JarHalf; save: JarHalf; total: string; actions: ReactNode })` with `type JarHalf = { name: string; amount: string; caption: string; share: number; notes: string[] }`.
  - `goalCopy.card.ofTarget(saved: string, target: string): string` → `` `${saved} of ${target}` `` ("£34 of £60").

Layout (mockup B), top to bottom, `gap-3.5 px-4 pt-2 pb-8`:
1. `ScreenHeader` size `display`: overline `todayLine(now, context.timezone)`, title `Hi, ${nickname}!` / `Hi!` (web copy), trailing the Me avatar button (`h-11 w-11` → `h-12 w-12`).
2. `JarsCard` (`accessibilityLabel` "Your jars"): header row "Your jars" (`text-h2`) and, right-aligned, the total `money(spend + save)` alone in `text-small text-muted-foreground` (mockup's "in all" wording is not web copy, so no new string). Two halves in one row: a 28×34 jar drawing, name `text-small font-sans-semibold text-muted-foreground`, amount `text-money-l` with `numberOfLines={1} adjustsFontSizeToFit` (Spend in foreground, Save in `text-gold-text`: the card's one accent). Each half keeps `accessibilityLabel="{name} jar"` and gets `accessibilityHint={caption}`; notes (held / waiting) as muted body under the row. Then two `Button variant="secondary"` (`h-12`, `flex-1`): "Spent something?" and "Put some in Save".
3. `PendingPurchases` (unchanged, only when there are some).
4. `HomeStepCard` / `NextStepCard`: `Card` + `Eyebrow` (`doThisNext` / `goalReachedEyebrow` / the learning eyebrow), title `font-sans-bold text-h3`, body muted, one primary pill.
5. `GoalCard`: `Card`; row: `"{emoji} {name}"` `font-sans-bold text-h3` + `goalCopy.card.ofTarget(money(counted), money(target))` `text-small text-muted-foreground`; `ProgressBar tone="gold" value={progress.fillRatio}` with `accessibilityLabel={goalCopy.card.title(emoji, name, money(target))}`; `goalLine(progress, money)` as muted body; "See it" link kept top-right (Maestro `goal.yaml`). Empty state unchanged. The staircase stays on the goal screen only.
6. A `Card` of `ListRow`s (role button, chevron) for the other four actions: "Take some out", "Got money", "Ask for extra", "Move my money", separated by `CardSeparator`.
7. `JarGraph` last.

- [ ] **Step 1: Write the failing tests**

home-screen.test.tsx (keep existing `opens %s` table, add `Got money`, `Move my money`):
```ts
it("shows both jars in one card with the total", …)
  // within(getByLabelText("Your jars")): getByText("£12.50"), getByText("£34"), getByText("£46.50");
  // getByLabelText("Spend jar").props.accessibilityHint === "Cash you have"
it("shows the date over the greeting", …)  // jest.useFakeTimers().setSystemTime(…) → getByText("Tuesday 3 November")
it("big balances stay on one line", …)     // spend 1_234_567_800 → amount Text has numberOfLines 1 and adjustsFontSizeToFit
it("has two quick actions in the jars card", …) // within jars card: buttons "Spent something?", "Put some in Save" only
```
Replace the old `"shows both jars with their amounts and captions"` assertion on visible captions with the hint check.

goals.test.tsx (replace `"shows the goal's title and staircase in words on the card"`):
```ts
it("shows the goal with a gold bar and what is left", …)
  // getByText("⚽ Football boots"), getByText("£20 of £45"), getByRole("progressbar").props.accessibilityValue.now === 44,
  // getByText("About 5 allowances to go")
it("no plan says what is left", …)   // planMinor null → getByText("£25 to go")
it("reached fills the bar", …)       // counted ≥ target → now 100, getByText("Reached. Time to ask your parent.")
```
core: `expect(goalCopy.card.ofTarget("£34", "£60")).toBe("£34 of £60")`.

- [ ] **Step 2: Run** `pnpm --filter @jarso/mobile test -- home-screen goals` and `pnpm --filter @jarso/core test -- goals` → FAIL.
- [ ] **Step 3: Implement** `ofTarget` in core, then `JarsCard`, then the Home, goal and step cards as laid out above. Delete `jar-card.tsx`.
- [ ] **Step 4: Run** `pnpm check` → PASS.
- [ ] **Step 5: Commit** (two commits)

```bash
git add packages/core/src/goals/copy.ts packages/core/tests
git commit -m "feat(goals): add goal card amount-of-target copy"
git add apps/mobile
git commit -m "feat(mobile): calmer child Home with one jars card"
```

---

### Task 7: calm pass on Diary, Learn, News, Jarso and Me

**Files:**
- Modify: `apps/mobile/src/features/history/{diary-screen,history-list}.tsx`, `diary/where-it-went.tsx`, `learn/{learn-screen,play-screens}.tsx`, `learning/{week-card,roadmap,parts,mission-player}.tsx`, `news/{news-screen,inbox-list}.tsx`, `guide/guide-screens.tsx`, `settings/settings-screen.tsx`, `requests/request-list.tsx`
- Test: `apps/mobile/tests/type-scale.test.ts`, existing feature tests under `apps/mobile/tests/features/**`

**Interfaces:**
- Consumes: Task 5 components.

Changes (same for every tab: title is `ScreenHeader`/`TabHeading` at `h1`, sections `h2`, card titles `h3` at `font-sans-bold`, card padding via `Card`, page gutter `px-4`, gaps `gap-4` between cards):
- **Diary:** title `h1`; spend line plain body; where-it-went in `Card`.
- **Learn:** title `h1`; every `uppercase` eyebrow → `Eyebrow` (week-card ×3, parts, mission-player ×3; the dark mission header keeps `text-teal-200` via `className`); week-card `p-5` → `Card`; "Your week" link → `ListRow` (role link) in a `Card`; roadmap day number `text-h3`.
- **News:** title `h1`; group labels → `Eyebrow tone="muted"`; empty state `p-5` → `Card`; `ago` `text-small`.
- **Jarso:** title `h1`; the chat list's stacked bordered cards → one `Card` of `ListRow`s (title, `detail` = day) with `CardSeparator`s; disclosure muted body.
- **Me:** title `h1`; sections in `Card`; section titles `font-sans-bold text-h3` (was extrabold); `gap-6` → `gap-4`.
- **Requests:** title `h1`.

- [ ] **Step 1: Write the failing guard test** in `type-scale.test.ts`:

```ts
it("uses no all-caps labels", () => {
  expect(hits(/(?<![\w-])uppercase(?![\w-])/g)).toEqual([]);
});
it("titles every tab screen at h1", () => {
  // TAB_SCREEN_FILES: the screen components behind the five tabs and Me (diary-screen, history-list,
  // learn-screen, news-screen, guide-screens, settings-screen); hits(re, files?) defaults to all files
  expect(hits(/accessibilityRole="header"\s+className="[^"]*text-h2/g, TAB_SCREEN_FILES)).toEqual([]);
});
```
Plus in `tests/features/guide/*`: `it("lists chats as rows in one card", …)` → each chat `getByRole("button", { name: title })` and all inside one container labelled `guideUi.pastChats`.

- [ ] **Step 2: Run** `pnpm --filter @jarso/mobile test -- type-scale guide` → FAIL.
- [ ] **Step 3: Apply** the changes screen by screen; no copy changes.
- [ ] **Step 4: Run** `pnpm check` → PASS.
- [ ] **Step 5: Commit** (one per screen group)

```bash
git commit -m "style(mobile): calm Learn screens and eyebrows"     # learn/, learning/, guard test
git commit -m "style(mobile): calm Diary and News"                 # history/, diary/where-it-went, news/
git commit -m "style(mobile): list Jarso chats in one card"        # guide/guide-screens + test
git commit -m "style(mobile): calm Me and Requests"                # settings/, requests/
```

---

### Task 8: device check and screenshots

**Files:**
- Modify: `tasks/todo.md` (device-only checks, as wave 2)

- [ ] **Step 1:** On `main` before the branch, take "before" screenshots of Home, Diary and Learn on an Android dev build at 360 dp (`adb exec-out screencap -p > before-home.png`); after the branch, the same three "after", plus Home at system font size "Largest". Keep them out of the repo; attach to the PR (spec §9 Done when; the parent family home shot belongs to plan 2).
- [ ] **Step 2:** Run the Maestro flows locally (`pnpm --filter @jarso/mobile e2e` with the test child's `-e` flags from your shell): all pass with the new Home (labels kept).
- [ ] **Step 3:** Check on the device that Nunito's tabular figures line up in the jars card and diary amounts; if not, note it in `tasks/todo.md` (design.md §3 already allows a fallback).
- [ ] **Step 4:** `pnpm check` and `pnpm turbo lint typecheck test build` → green; `git diff main -- apps/web packages/brand/tokens.css` is empty.
- [ ] **Step 5: Commit**

```bash
git add tasks/todo.md
git commit -m "docs(mobile): note wave 3 type scale device checks"
```
