# Jarso design system

The visual language for the app, derived from the two logos in `public/brand/`. Scope decisions behind it: playful and rounded; deep teal as the action colour with gold reserved for money; same component system for parent and child with different emphasis; bottom tab navigation; rounded friendly type; Lucide icons plus the jar as the recurring illustration; light motion; light and dark themes; WCAG AA, 44 px targets, 360 px phones first; warm coach voice.

Code owners: tokens live in `src/app/globals.css`, fonts in `src/app/layout.tsx`, primitives in `src/components/ui`. Change this document and the tokens together.

## 1. Brand assets

| File | What | Use |
| --- | --- | --- |
| `public/brand/jarso-mark.png` | Jar mark, 1254 × 1254, transparent | App icon, favicon source, header mark, empty states, jar illustrations |
| `public/brand/jarso-wordmark.png` | "jarso" wordmark with mark, 2172 × 724, **opaque near-white background (#FDFDFD)** | Marketing page, emails, light surfaces only |

Rules:

- Minimum mark size 24 px; clear space around it equal to the lid height.
- The wordmark is not transparent, so it only sits on white or `surface` backgrounds until a transparent SVG exists. Do not place it on teal, gold or dark surfaces.
- Never recolour, stretch or add effects to either asset. Tints of the jar for illustration are drawn as new SVGs, not filters on the PNG.
- Open item for the designer: the two files differ slightly in colour (mark teal `#027A98` and gold `#FDC301`; wordmark teal `#04717A` and orange-gold `#FBA81E`). The UI palette follows the **mark**, because it becomes the app icon the child sees daily. Ask for SVG exports of both in the mark's colours.

## 2. Colour

### 2.1 Source colours

| Name | Hex | OKLCH | Where it comes from |
| --- | --- | --- | --- |
| Brand teal | `#027A98` | `oklch(0.538 0.100 223)` | Jar body |
| Brand gold | `#FDC301` | `oklch(0.846 0.173 87)` | Coins |
| Brand cyan | `#01D8ED` | `oklch(0.806 0.138 207)` | Jar lid |

### 2.2 Tonal scales

Generated from each source colour's hue and chroma with stepped lightness. Use scale steps, not ad-hoc hex values.

| Step | Teal (hue 223) | Gold (hue 87) | Cyan (hue 207) |
| --- | --- | --- | --- |
| 50 | `#D2FFFF` | `#FFF077` | `#92FFFF` |
| 100 | `#C4F4FF` | `#FFE462` | `#7FFFFF` |
| 200 | `#ABE1F6` | `#FFCF36` | `#59EFFF` |
| 300 | `#8AC8DF` | `#EBB500` | `#00D6EB` |
| 400 | `#65ADC6` | `#C99A00` | `#00B6C9` |
| 500 | `#3D92AE` | `#A87F00` | `#0098A8` |
| 600 | `#057B99` (brand) | `#8B6900` | `#007E8C` |
| 700 | `#00627D` | `#705300` | `#006570` |
| 800 | `#004B62` | `#563E00` | `#004D56` |
| 900 | `#003548` | `#3D2B00` | `#00363D` |
| 950 | `#002233` | `#281A00` | `#002329` |

Brand gold `#FDC301` sits between gold-200 and gold-300 and is used as-is for fills. Brand cyan `#01D8ED` equals cyan-300.

### 2.3 Neutrals

Teal-tinted greys so surfaces feel like the brand rather than generic grey.

| Token | Light | Dark |
| --- | --- | --- |
| Ink (foreground) | `#0F2A33` | `#E6F1F4` |
| Ink 2 (secondary text) | `#3D5660` | `#C2D5DB` |
| Muted foreground | `#5C7580` | `#9DB6BE` |
| Border | `#D7E4E8` | `#234853` |
| Surface 2 (muted, inputs) | `#EEF5F7` | `#163842` |
| Surface (card) | `#FFFFFF` | `#12303A` |
| Background | `#F6FAFB` | `#0B1F26` |

### 2.4 Semantic roles

Why the primary is not the brand teal: `#027A98` on white is 4.95:1, which passes AA for text but leaves no margin and fails for white text on it at small sizes. `teal-700` gives 6.9:1 both ways.

| Role | Light | Dark | Contrast |
| --- | --- | --- | --- |
| Primary (buttons, links, active tab) | teal-700 `#00627D`, foreground white | teal-400 `#65ADC6`, foreground ink | 6.9:1 on white; 6.5:1 on dark bg |
| Primary hover | teal-800 / teal-300 | | |
| Secondary (quiet buttons, selected chips) | teal-100 `#C4F4FF` with teal-800 text | teal-900 `#003548` with teal-100 text | ≥ 9:1 |
| Accent (highlights, lid, info) | brand cyan `#01D8ED` fill with ink text; cyan-600 `#007E8C` as text | cyan-300 fill with ink; cyan-300 as text | fill 8.6:1; text 4.8:1 light, 9.5:1 dark |
| Money / Save / celebration | brand gold `#FDC301` fill with ink text; gold-600 `#8B6900` as text | brand gold fill with ink; brand gold as text | fill 9.3:1; text 5.1:1 light, 10.5:1 dark |
| Destructive (form errors, irreversible actions only) | `oklch(0.577 0.245 27)` (existing) | `oklch(0.704 0.191 22)` (existing) | |
| Focus ring | cyan-500 `#0098A8`, 3 px, offset 2 px | cyan-300 `#00D6EB` | 3.5:1 against white (non-text minimum 3:1) |
| Border, input | `#D7E4E8` | `#234853` | |
| Muted | `#EEF5F7` with `#5C7580` text (4.9:1) | `#163842` with `#9DB6BE` (8:1) | |

Hard rules:

- Gold and cyan are **never** text on light surfaces at their brand values. Use gold-600 or cyan-600 for text, or put ink text on a gold or cyan fill.
- White text only on teal-700 or darker, never on brand teal, gold or cyan.
- Destructive red never represents money. A negative, due or over-limit amount is shown in ink with explicit words, never in red: an eleven-year-old should not be shamed by a colour.
- Colour is never the only signal. Every status has an icon or a word next to it.

### 2.5 Money and status colours

| State | Treatment |
| --- | --- |
| Spend jar | Teal. Jar illustration filled teal-600; amounts in ink. |
| Save jar | Gold. Jar filled brand gold; amounts in ink; "saved" label gold-600. |
| Goal progress | Gold ring or bar on teal-100 track. |
| Due (allowance not yet handed over) | Cyan-100 chip, cyan-700 text, clock icon. Never counted in a balance display. |
| Pending request | Surface-2 chip, ink-2 text, hourglass icon. |
| Approved, waiting for handover | Cyan-100 chip, teal-800 text, check icon. |
| Handed over / confirmed | Teal-100 chip, teal-800 text, check-circle icon. |
| Reserved Save | Gold-100 chip with a dashed border, gold-700 text, lock icon. |
| Rejected / cancelled | Surface-2 chip, muted text, x icon. No red. |
| Limit notice (parent) | Gold-100 banner, gold-700 text, bell icon. Informational, not an error. |
| Practice money | Always paired with a "Practice" chip in cyan-100 and a dashed jar outline, so it can never be mistaken for recorded money. |

### 2.6 Charts

`chart-1` teal-600, `chart-2` brand gold, `chart-3` cyan-500, `chart-4` teal-300, `chart-5` gold-400. Weekly review uses at most three series.

## 3. Typography

**Nunito** for everything on screen, loaded with `next/font/google` (weights 400, 600, 700, 800) and exposed as `--font-sans`. Geist Mono stays for code only. Nunito is rounded, highly legible at small sizes and has a friendly 800 weight for big numbers.

Money is set with `font-variant-numeric: tabular-nums lining-nums` so columns of amounts align. Verify once in the browser that Nunito's tabular figures align; if they do not, load Manrope for the `.money` class only.

| Style | Size / line | Weight | Use |
| --- | --- | --- | --- |
| Display | 40 / 44 | 800 | Home greeting, milestone screens |
| H1 | 32 / 38 | 800 | Page titles |
| H2 | 24 / 30 | 700 | Section titles, card titles on home |
| H3 | 20 / 26 | 700 | Card titles |
| Body | 16 / 24 | 400 | Default. Never smaller for children's reading text |
| Body strong | 16 / 24 | 700 | Labels, button text |
| Small | 14 / 20 | 400–600 | Meta, helper text, parent tables |
| Caption | 12 / 16 | 600 | Chips, timestamps. Not for instructions |
| Money XL | 44 / 48 | 800 tabular | Jar balance on jar screen |
| Money L | 28 / 32 | 700 tabular | Balances on home cards |
| Money | 20 / 24 | 700 tabular | Diary rows, request amounts |

Currency symbol sits before the number at 60 % of the number's size, aligned to the cap height. Minor units are shown only when non-zero on child screens ("£12" not "£12.00"), always on parent confirmation screens.

Sentence case everywhere. No all-caps labels; children read them more slowly.

## 4. Shape, space, elevation

- **Radius token** `--radius: 0.875rem` (14 px). With the existing multipliers: controls 14 px, cards about 20 px, large cards and sheets about 25 px, chips fully rounded. This echoes the mark's curves without turning dense parent tables into pills.
- **Spacing** on a 4 px grid: 4, 8, 12, 16, 24, 32, 48. Card padding 16 on phones, 24 on tablet and up. Screen gutter 16 at 360 px, 24 from 640 px.
- **Elevation** is mostly borders, not shadows. One soft shadow for raised cards and the bottom bar: `0 1px 2px oklch(0.27 0.04 223 / 6%), 0 8px 24px -12px oklch(0.27 0.04 223 / 18%)`. Dark mode uses borders only.
- **Jar silhouette** (rounded rectangle, wider lid) is the one custom shape. Use it for jar cards, goal progress and empty states; do not invent other blobs.

## 5. Layout and navigation

Design at 360 px first, then 768 and 1024. Single column on phones; parent screens may use two columns from 768 px.

**Bottom tab bar** (phones and tablets; a left rail from 1024 px):

| Child | Parent |
| --- | --- |
| Home · Jars · Diary · Learn · Inbox | Home · Requests · Allowance · Inbox |

Tab bar height 64 px plus the safe-area inset, icons 24 px, labels 12 px 600, active tab primary with a filled icon. The Inbox tab shows a count badge in gold with ink text. Family settings live under the parent's Home.

**Header**: 56 px, page title H1 or the mark on Home, one optional action on the right. No hamburger.

**Page rhythm**: title, one primary card (balance, due allowance, next step), then lists. The first thing on every Home is the next step (FR12): a mission, a due handover, a pending request.

Installable as a PWA later in the pilot: respect `env(safe-area-inset-*)`, use the mark for icons, keep the tab bar fixed.

## 6. Components

Built on the existing shadcn primitives in `src/components/ui`. Add with `pnpm dlx shadcn@latest add <name>` and export from the barrel.

| Component | Notes |
| --- | --- |
| Button | Default = primary; `outline` for secondary actions; `ghost` in lists; `destructive` only for irreversible actions. Height 44 px (`lg`) for any action a child taps; 36 px allowed in parent tables. Loading state keeps width and shows a spinner. |
| Card | White surface, 20 px radius, border, optional soft shadow when it is the page's primary card. |
| Jar card | Mark-shaped illustration on the left, jar name, Money L balance, a one-line status chip (due, reserved). Spend is teal, Save is gold. |
| Progress | Goal: ring on the goal card, bar in lists. Gold on teal-100. Shows amount saved, remaining and estimated payments. |
| Status chip | See 2.5. Icon plus word, never colour alone. |
| Badge (count) | Gold fill, ink text, min 20 px, on Inbox tab and request lists. |
| Inbox item | Icon in a tinted circle, one-line title, one-line detail, relative time, chevron. Unread has a teal-100 background. |
| Request card | Amount in Money, reason, status chip, who asked, and the one action available to this role. |
| Handover sheet (parent) | Bottom sheet: due amount, two inputs (cash to child, kept as savings) prefilled from the child's plan, running total must equal the due amount, one confirm button. |
| Forms | Label above, 44 px input, helper text below, error text in destructive with icon, `aria-invalid` and `aria-describedby` wired (already in `Field`). |
| Empty state | Mark illustration, one sentence, one action. |
| Toast | Sonner, bottom above the tab bar, 4 s, never for errors that need action. |
| Skeleton | Teal-tinted pulse on surface-2 for every Suspense boundary. |

Primitives to add next: `badge`, `progress`, `tabs`, `sheet`, `dialog`, `avatar`, `separator`, `skeleton`, `tooltip`.

## 7. Iconography and illustration

- **Lucide** icons only, 24 px in navigation and 20 px inline, stroke 2. Prefer filled variants only for the active tab.
- **Jar illustrations** are SVGs drawn from the mark: an outline jar that fills with teal or gold to the balance ratio, coins as gold ellipses with a teal-800 rim as in the mark. One component, `JarIllustration`, with `jar`, `fill` and `size` props.
- **Coins** appear only where money moves: handover confirmed, deposit confirmed, goal reached.
- No emoji in UI chrome. Emoji may appear in child-authored labels.

## 8. Motion

| Moment | Motion | Duration |
| --- | --- | --- |
| Buttons, chips, tab switch | Colour and 1 px press translate | 150 ms |
| Sheets, dialogs, page transitions | Slide up / fade | 250 ms |
| Jar fill after a confirmed handover | Fill level rises, two coins drop | 500 ms |
| Goal reached, mission complete | Ring completes, badge scales in once | 600 ms |
| Skeletons | Gentle pulse | 1.5 s loop |

Easing `cubic-bezier(0.2, 0.8, 0.2, 1)`. With `prefers-reduced-motion: reduce`, everything becomes an instant state change; the coins do not fall. Nothing loops except skeletons. No confetti in the pilot.

## 9. Voice

Warm coach, plain words, second person, short sentences. Parent screens use the same voice, a notch more direct.

| Say | Not |
| --- | --- |
| Spend, Save | wallet, account, fund |
| due, handed over, kept as savings | posted, disbursed, settled |
| ask a parent, your parent said yes | request approved, authorised |
| Not enough in Spend for that yet | Insufficient funds |
| You went over your limit. Your parent has been told. | Limit violation |
| Try again? Here's a hint. | Incorrect |
| mission, practice | task, assignment, lesson module |

Never: exclamation marks in errors, "oops", shame words, or anything that calls the child's balance small.

## 10. Role emphasis

Same tokens and components; different hierarchy.

- **Child**: Home opens on the next step, then jar cards with big gold and teal balances, goal ring, missions. Celebration moments exist here only. Fewer words per screen.
- **Parent**: Home opens on what needs them: due handovers, pending requests, limit notices, each with its action inline. Denser lists, Small text allowed, tables from 768 px. No celebration animation; a quiet confirmation toast instead.

## 11. Accessibility

- AA contrast for all text and 3:1 for icons and focus rings, in both themes. The tables above hold the measured ratios; re-measure when a token changes.
- 44 × 44 px minimum targets for every child-facing control; 36 px allowed only inside parent tables.
- Visible focus ring everywhere, cyan-500 light and cyan-300 dark; never remove outlines.
- Every input has a visible label. Errors are announced via `aria-describedby`.
- Status always carries an icon or word. Charts have a text summary.
- Reduced motion honoured. No content relies on hover.
- Reading level: body copy around age 10. Numbers are never abbreviated ("1,250", not "1.3k").

## 12. Dark theme

Follow the system setting, toggled by `next-themes` (already installed). Dark is a tinted navy-teal, not black: background `#0B1F26`, cards `#12303A`, borders `#234853`. Primary becomes teal-400 with ink text; brand gold and cyan stay at their brand values and are allowed as text because they clear 9:1 on these surfaces. Shadows are dropped; borders carry elevation. Illustrations keep their colours; the jar outline uses teal-300.

## 13. Tokens for `globals.css`

Replace the neutral `:root` and `.dark` blocks with these. Chart and sidebar variables follow the same mapping.

```css
:root {
  --radius: 0.875rem;
  --background: oklch(0.982 0.004 214);
  --foreground: oklch(0.268 0.037 223);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.268 0.037 223);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.268 0.037 223);
  --primary: oklch(0.462 0.087 225);            /* teal-700 */
  --primary-foreground: oklch(1 0 0);
  --secondary: oklch(0.94 0.055 223);           /* teal-100 */
  --secondary-foreground: oklch(0.385 0.074 227); /* teal-800 */
  --muted: oklch(0.965 0.008 217);
  --muted-foreground: oklch(0.547 0.034 227);
  --accent: oklch(0.806 0.138 207);             /* brand cyan */
  --accent-foreground: oklch(0.268 0.037 223);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.91 0.015 218);
  --input: oklch(0.91 0.015 218);
  --ring: oklch(0.622 0.107 208);               /* cyan-500 */
  --gold: oklch(0.846 0.173 87);                /* brand gold, fills */
  --gold-foreground: oklch(0.268 0.037 223);
  --gold-text: oklch(0.54 0.111 86);            /* gold-600 */
  --chart-1: oklch(0.541 0.100 223);
  --chart-2: oklch(0.846 0.173 87);
  --chart-3: oklch(0.622 0.107 208);
  --chart-4: oklch(0.80 0.06 223);
  --chart-5: oklch(0.711 0.145 87);
}

.dark {
  --background: oklch(0.226 0.029 223);
  --foreground: oklch(0.951 0.012 216);
  --card: oklch(0.291 0.040 223);
  --card-foreground: oklch(0.951 0.012 216);
  --popover: oklch(0.291 0.040 223);
  --popover-foreground: oklch(0.951 0.012 216);
  --primary: oklch(0.71 0.07 223);              /* teal-400 */
  --primary-foreground: oklch(0.226 0.029 223);
  --secondary: oklch(0.30 0.06 223);            /* teal-900 */
  --secondary-foreground: oklch(0.94 0.055 223);
  --muted: oklch(0.33 0.04 223);
  --muted-foreground: oklch(0.76 0.03 219);
  --accent: oklch(0.801 0.137 207);
  --accent-foreground: oklch(0.226 0.029 223);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(0.379 0.046 220);
  --input: oklch(0.379 0.046 220);
  --ring: oklch(0.801 0.137 207);               /* cyan-300 */
  --gold: oklch(0.846 0.173 87);
  --gold-foreground: oklch(0.226 0.029 223);
  --gold-text: oklch(0.846 0.173 87);
}
```

Add to `@theme inline`: `--color-gold: var(--gold); --color-gold-foreground: var(--gold-foreground); --color-gold-text: var(--gold-text);` and switch `--font-sans` to the Nunito variable.

## 14. Implementation order

1. Fonts: load Nunito in `src/app/layout.tsx`, keep Geist Mono; set `--font-sans`.
2. Tokens: paste section 13 into `globals.css`; add the gold colour utilities; set `--radius`.
3. Icons: export the mark at 512, 192 and 180 px plus a 32 px favicon into `public/` and `src/app/`; add `manifest.webmanifest` when PWA work starts.
4. Primitives: add the components listed in section 6; export from the barrel.
5. Brand components: `JarsoMark`, `JarIllustration`, `Money` (formats minor units with tabular figures), `StatusChip`.
6. Shell: bottom tab bar and header in `src/app/(app)/layout.tsx`, role-aware tabs once FR13 lands.
7. Replace the placeholder home with the wordmark on white and the two sign-in actions.

Everything above is a starting point for the pilot. Change it when a screen proves it wrong, and change this document in the same PR.
