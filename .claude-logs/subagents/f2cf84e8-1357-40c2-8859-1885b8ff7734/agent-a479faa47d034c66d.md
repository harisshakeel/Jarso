---
session_id: f2cf84e8-1357-40c2-8859-1885b8ff7734
agent_id: a479faa47d034c66d
agent_type: general-purpose
model: opus
description: Review Task 6a (spec + quality)
finished: True
total_exchanges: 1
generated_at: 2026-10-29T08:37:02.275477
---

# Subagent: Review Task 6a (spec + quality)

Session: `f2cf84e8-1357-40c2-8859-1885b8ff7734` | Agent: `a479faa47d034c66d` | Type: `general-purpose`


[CLAUDE_LOG_ENTRY type=PROMPT num=1 session=f2cf84e8-1357-40c2-8859-1885b8ff7734 agent=a479faa47d034c66d]
timestamp: 2026-10-28T18:59:04.262Z
time: 2026-10-28 18:59
chars: 1294

Your instructions are in /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/reviewer-common.md — read and follow them exactly. Placeholders:

- BRIEF_FILE: /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/task-6a-brief.md
- GLOBAL_CONSTRAINTS: docs/design.md is the binding specification for this task (read it in full: tokens §13 must match exactly, typography §3, shape §4, layout §5, components §6, motion §8, voice §9, accessibility §11 incl. AA contrast and 44px targets, dark theme §12, implementation order §14). Also CLAUDE.md rules: Cache Components (no session reads at layout top level), barrels (export new ui primitives from src/components/ui/index.ts; brand/shell barrels), Biome only. The user explicitly asked that all UI follow docs/design.md — deviations from it are spec findings.
- REPORT_FILE: /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/task-6a-report.md
- BASE_SHA: 8e84cf1  HEAD_SHA: 59532ed
- DIFF_FILE: /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/review-8e84cf1..59532ed.diff
Repo root: /home/ezio/Desktop/Work/8x/Jarso. Binary icon files: just confirm they exist at the required sizes (e.g. `file` command).


[CLAUDE_LOG_ENTRY type=RESPONSE num=1 session=f2cf84e8-1357-40c2-8859-1885b8ff7734 agent=a479faa47d034c66d]
timestamp: 2026-10-28T19:01:07.253Z
time: 2026-10-28 19:01
chars: 8153

### Spec Compliance

- ❌ Issues found. Brief steps 1–7 are all implemented, and the §13 tokens match. Two §6 component specs are missed:
  - **Button loading state.** §6 says "Loading state keeps width and shows a spinner". `src/components/ui/button.tsx:1001-1053` has no loading or pending variant or prop. `SignOutButton` (`sign-out-button.tsx:12`) still only sets `disabled`.
  - **Toast placement.** §6 says "Sonner, bottom above the tab bar, 4 s". Sonner was not touched: `src/components/providers/index.tsx:11` renders `<Toaster richColors />` with Sonner's default bottom-right position and no offset for the 64 px tab bar plus safe-area inset. On phones, toasts will sit on top of the `BottomNav`. The 4 s duration matches Sonner's default.
- ⚠️ Cannot verify from the diff:
  - `BottomNav` calls `usePathname()` (`bottom-nav.tsx:878`). With Cache Components on, the controller should confirm that the nested `(app)/parent|child/layout.tsx` (Tasks 7/9) renders it without a prerender or blocking-route error.
  - Whether Tasks 7–9 actually pass a role `homeHref` (the header currently links to `routes.dashboard`, `src/app/(app)/layout.tsx:86`).

Checks I ran:
- **§13 tokens:** compared line by line against `globals.css:307-447`. Every `:root` and `.dark` value matches; the only differences are Biome's trailing-zero trims (0.970→0.97 and so on). The `@theme inline` additions in §13 are all present (`globals.css:276-297`).
- **Icons** (`file`): `src/app/icon.png` 192×192, `apple-icon.png` 180×180, `favicon.ico` 32×32, `public/brand/icons/jarso-mark-512.png` 512×512 and `-192.png` 192×192. All correct.
- **"SVG mark" in the brief:** `ls public/brand` shows only PNGs (`jarso-mark.png`, `jarso-wordmark.png`). Using a PNG through `next/image` is justified, and §1 forbids redrawing the mark.
- **Removed button sizes (`xs`, `icon-xs`):** grep found no remaining callers.
- **Fonts (§3):** `layout.tsx:547-551` loads Nunito 400/600/700/800 as `--font-sans`, keeps Geist Mono and drops Geist Sans.
- **Type scale (§3):** `globals.css:224-247` matches the table (Display 40/44 800 −0.02em, H1 32/38, H2 24/30, H3 20/26, Money XL/L/Money).
- **Shape (§4):** radius 0.875rem. Card is `rounded-xl` (14 × 1.4 ≈ 20 px). The bottom sheet is `rounded-t-2xl` (≈25 px). Buttons and chips are pills. Input and Select are `rounded-lg` (14 px).
- **Status chips (§2.5):** all six states map exactly to `status-chip.tsx:700-737` (due, pending, approved, handedOver, reserved with dashed border, closed with no red), plus practice in cyan-100.
- **§5 / §11 sizes:**
  - Tab bar `h-16` plus safe-area inset, 24 px icons, `text-xs font-semibold`, gold count badge (`bottom-nav.tsx:883-912`).
  - Header `h-14`, sticky, `bg-background/85`, `backdrop-blur-[16px]`, hairline (`app-header.tsx:787`).
  - 44 px targets: button default/lg/icon `h-11`/`size-11`, Input and Select trigger `h-11`, SelectItem `min-h-11`, checkbox hit area 24 + 2×10 = 44 px, sheet close `icon-lg`, header link `min-h-11`.
- **Cache Components:** `src/app/(app)/layout.tsx:73-90` reads no session.
- **Barrels:** `src/components/ui/index.ts` exports all five new primitives. `@/components/brand` and `@/components/shell` have barrels. `sheet.tsx:1460` imports `./button` relatively.
- **Landing (§14.7):**
  - "I'm a kid" → `routes.childSignIn`, "I'm a parent" → `routes.login` (`page.tsx:137-145`).
  - "New here?" links → `routes.childStart` and `routes.signup` (`page.tsx:153-158`).
  - Two-beat headline; wordmark only on white, hidden in dark per §1 (`page.tsx:122-126`).
- **Contrast:** I spot-checked white on light destructive, which the report doesn't list (`button.tsx:1026`): about 4.77:1, passes.

### Strengths

- The tokens are an exact transcription of §13. The derived extras are clearly marked and grounded in §2.3: `--ink-2`, `--hairline` as a colour, and `--keycap-ledge-gold` defined in both themes.
- The global `:focus-visible` rule (`globals.css:511-514`) replaces the per-primitive `ring-ring/50` and `outline-none`, so §11 "never remove outlines" is handled in one place.
- The reduced-motion block is deliberately left out of any CSS layer (`globals.css:519-528`), so it overrides every Tailwind utility without needing `!important`.
- `has-data-[slot=bottom-nav]` padding keeps the `(app)` layout static and role-agnostic, which fits the Cache Components rule.
- `BottomNav` lights only the deepest matching tab (`bottom-nav.tsx:867-871`), backed by a test that failed before the fix and passes after. Counts use `toLocaleString`, satisfying §11 "never abbreviated", and that is tested too.
- `StatusChip` always pairs an icon with a word, never uses red, and its words follow §9 voice ("Said yes", "Handed over").
- Making 44 px the default button height is a sound, safer reading of §6 and §11.

### Issues

#### Critical (Must Fix)
None.

#### Important (Should Fix)

1. **`src/components/ui/button.tsx:1001-1053` has no loading state (§6).** The slice-1 forms (signup, child sign-in, child start) will all submit with a pending state. Without a width-preserving spinner, each screen will invent its own, or the button will just grey out.
   - Fix: add a `loading?: boolean` prop to `Button`. It should render a Lucide `Loader2Icon` with `animate-spin` (reduced motion is already handled globally), set `aria-busy` and `disabled`, and keep the label's width. One way is to keep the label but make it invisible and overlay the spinner. Then use it in `SignOutButton`.
2. **Sonner placement and colours are not adapted (§6 Toast).** See `src/components/providers/index.tsx:11` and `src/components/ui/sonner.tsx:28-33`.
   - On phones, toasts cover the fixed tab bar instead of sitting above it. Sonner's z-index is far above the nav's `z-40`.
   - `richColors` paints the success and info toasts in Sonner's own palette, not the brand tokens.
   - `--normal-border: var(--border)` uses the input border instead of the hairline.
   - Fix: set `position="bottom-center"` and a mobile offset of `calc(4rem + env(safe-area-inset-bottom) + 8px)` when the nav is present (or a constant, since the app shell always has it). Drop `richColors`, or map it to the tokens, and use `--hairline` for the border.

#### Minor (Nice to Have)

1. **The keycap keeps its long shadow in dark mode (`src/app/globals.css:464-473`).** §4 and §12 say dark mode "drops the long shadows". The `.keycap` utility always applies `0 8px 16px -10px rgb(20 28 31 / 0.25)` and the white inset highlight. Fix: move the shadow into a `--keycap-shadow` variable that is redefined in `.dark` without the long term.
2. **Awkward accessible name for count tabs (`src/components/shell/bottom-nav.tsx:898-912`).** The badge, with its sr-only " new", renders before the label, so screen readers announce "1,250 new Inbox". Put the label first, or give the link an explicit `aria-label`, e.g. `Inbox, 1,250 new`.
3. **Inconsistent overlap of the `lg` rail (`bottom-nav.tsx:883`).** The rail uses `lg:top-14`, but the header is `h-14` plus `pt-[env(safe-area-inset-top)]`. On an iPad-width installed PWA with a top inset, the rail will start under the header. Use `lg:top-[calc(3.5rem+env(safe-area-inset-top))]`.
4. **Weak test (`src/components/brand/status-chip.test.tsx:676-679`).** "Never uses destructive" only checks that the class string has no `destructive`. That is acceptable as a guard but does not prove the §2.5 tone. Optionally, assert the `data-status`, and that the tone classes are `bg-muted text-muted-foreground`.
5. **Input border at rest is low contrast** (`#E6E2DA` on `#EFECE5`, `input.tsx:1193`). The implementer already flagged this as a design.md question, and I agree it belongs to the designer rather than this task. Noted here so it isn't lost.

### Assessment

**Task quality:** Needs fixes

**Reasoning:** The design foundation closely follows docs/design.md, with exact tokens and the type, shape, layout and accessibility rules applied, and the Cache Components and barrel rules are respected. Two explicit §6 component requirements are still missing, though, and the slice-1 screens will depend on both: the Button loading state, and toasts placed above the tab bar.
