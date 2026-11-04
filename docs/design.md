# Jarso design system

The visual language for the app, derived from the two logos in `packages/brand/assets/` (copied to `apps/web/public/brand/` at dev/build). Scope decisions behind it: playful and rounded; deep teal as the action colour with gold reserved for money; same component system for parent and child with different emphasis; bottom tab navigation; rounded friendly type; Lucide icons plus the jar as the recurring illustration; light motion; light and dark themes; WCAG AA, 44 px targets, 360 px phones first; warm coach voice.

Visual references, and what we take from each, are in section 15. Code owners: tokens live in `apps/web/src/app/globals.css`, fonts in `apps/web/src/app/layout.tsx`, primitives in `apps/web/src/components/ui`. Change this document and the tokens together.

## 1. Brand assets

| File | What | Use |
| --- | --- | --- |
| `packages/brand/assets/jarso-mark.png` | Jar mark, 1254 × 1254, transparent | App icon, favicon source, header mark, empty states, jar illustrations |
| `packages/brand/assets/jarso-wordmark.png` | "jarso" wordmark with mark, 2172 × 724, **opaque near-white background (#FDFDFD)** | Marketing page, emails, light surfaces only |
| `packages/brand/assets/jarso-wordmark-dark.png` | Dark-mode wordmark, white "jars" and gold "o", 2172 × 724, **opaque near-black background (#10191C)** | Marketing page in dark mode, dark emails |

The app serves 864 × 288 copies of both wordmarks (`jarso-wordmark-864.png`, `jarso-wordmark-dark-864.png`) through `JarsoWordmark`, which switches between them on the `.dark` class.

Rules:

- Minimum mark size 24 px; clear space around it equal to the lid height.
- Neither wordmark is transparent. The light one only sits on white or `surface` backgrounds. The dark one's background matches no dark token (it is darker than the dark `surface`, `#12303A`), so it is shown as a rounded tile on dark surfaces. Do not place either on teal or gold. Both rules go away once a transparent SVG exists.
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

A warm paper canvas with near-black ink, the same family as the reference sites (section 15), so the teal and gold read as the only colour on the page. White cards sit on the paper; card edges are hairlines drawn with ink at low alpha so they work on any surface.

| Token | Light | Dark |
| --- | --- | --- |
| Canvas (page background) | `#F7F5F0` paper | `#0B1F26` |
| Surface (card) | `#FFFFFF` | `#12303A` |
| Surface 2 (muted, inputs, chips) | `#EFECE5` | `#163842` |
| Ink (foreground) | `#141C1F` | `#E6F1F4` |
| Ink 2 (secondary text) | `#3E4B50` | `#C2D5DB` |
| Muted foreground | `#566469` | `#9DB6BE` |
| Hairline | `rgb(20 28 31 / 0.08)`, strong `0.14` | `rgb(230 241 244 / 0.10)`, strong `0.18` |
| Border (inputs) | `#8F8C84` | `#577D89` |

Measured on the paper canvas: ink 15.9:1, ink 2 8.3:1, muted foreground 5.6:1, primary teal-700 6.3:1, gold-600 text 4.7:1, cyan-700 text 6.2:1, focus ring 3.2:1. All pass AA. Cyan-600 does not pass as text on paper (4.4:1), which is why the cyan text token is cyan-700 in light mode.

Input borders were darkened (light) and lightened (dark) in the same hue so §11's 3:1 for component boundaries holds, as with destructive: light `#8F8C84` is 3.4:1 on white cards and 3.1:1 on paper; dark `#577D89` is 3.1:1 on cards and 3.8:1 on the background. Card edges keep the soft border token.

### 2.4 Semantic roles

Why the primary is not the brand teal: `#027A98` on white is 4.95:1, which passes AA for text but leaves no margin and fails for white text on it at small sizes. `teal-700` gives 6.9:1 both ways.

| Role | Light | Dark | Contrast |
| --- | --- | --- | --- |
| Primary (buttons, links, active tab) | teal-700 `#00627D`, foreground white | teal-400 `#65ADC6`, foreground ink | 6.9:1 on white; 6.5:1 on dark bg |
| Primary hover | teal-800 / teal-300 | | |
| Secondary (quiet buttons, selected chips) | teal-100 `#C4F4FF` with teal-800 text | teal-900 `#003548` with teal-100 text | ≥ 9:1 |
| Accent (highlights, lid, info) | brand cyan `#01D8ED` fill with ink text; cyan-700 `#006570` as text | cyan-300 fill with ink; cyan-300 as text | fill 9.9:1; text 6.2:1 light, 9.5:1 dark |
| Money / Save / celebration | brand gold `#FDC301` fill with ink text; gold-600 `#8B6900` as text | brand gold fill with ink; brand gold as text | fill 9.3:1; text 5.1:1 light, 10.5:1 dark |
| Destructive (form errors, irreversible actions only) | `oklch(0.56 0.245 27)`, darkened to meet §11 AA on paper | `oklch(0.704 0.191 22)` (existing) | 4.6:1 on paper, 5.0:1 white on it; 5.9:1 on dark bg |
| Focus ring | cyan-500 `#0098A8`, 3 px, offset 2 px | cyan-300 `#00D6EB` | 3.5:1 against white (non-text minimum 3:1) |
| Border, input | border `#E6E2DA`, card edges use the hairline; input `#8F8C84`, darkened to meet §11 | border `#234853`; input `#577D89` | input 3.4:1 on white, 3.1:1 on paper; 3.1:1 on dark card |
| Muted | `#EFECE5` with `#566469` text (5.2:1) | `#163842` with `#9DB6BE` (8:1) | |

Hard rules:

- Gold and cyan are **never** text on light surfaces at their brand values. Use gold-600 or cyan-700 for text, or put ink text on a gold or cyan fill.
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

The parent's dashboard colours each child with `series-1` to `series-8` (the dataviz reference palette in its validated order, light and dark steps in `tokens.css`; `series-0` is the neutral tone past an eighth child). The slot follows the child's place in the family, never their rank, so a filter never repaints anyone. Light slots 3 to 5 (aqua `#00a470`, yellow `#c58100`, magenta `#d86d96`) are one step darker than the reference and dark slot 6 (green `#188d15`) one step lighter, so every child clears 3:1 on the card in both themes (3.2:1 at the weakest); the set still passes the validator's adjacent checks (worst colour-blind ΔE 9.0 light / 8.4 dark, normal vision 17.2 / 19.3). A child's Save is the solid colour and Spend the same colour as 45° stripes on a 20% ground, so Spend keeps full colour strength and the two jars differ by texture, not lightness; the legend shows both swatches. Labels on a series fill are white (APCA). Every series is still named beside its mark and stated in a sentence.

## 3. Typography

**Nunito** for everything on screen, loaded with `next/font/google` (weights 400, 600, 700, 800) and exposed as `--font-sans`. Geist Mono stays for code only. Nunito is rounded, highly legible at small sizes and has a friendly 800 weight for big numbers.

Money is set with `font-variant-numeric: tabular-nums lining-nums` so columns of amounts align. Verify once in the browser that Nunito's tabular figures align; if they do not, load Manrope for the `.money` class only.

| Style | Web size / line | Phone size / line | Weight | Use |
| --- | --- | --- | --- | --- |
| Display | 40 / 44 | 26 / 32 | 800 | Home greeting, milestone screens |
| H1 | 32 / 38 | 22 / 28 | 800 | Page titles |
| H2 | 24 / 30 | 18 / 24 | 700 | Section titles, card titles on home |
| H3 | 20 / 26 | 16 / 22 | 700 | Card titles |
| Body | 16 / 24 | 16 / 22 | 400 | Default. Never smaller for children's reading text. Phone: 16 / 22 on child screens |
| Body (parent) | — | 15 / 21 | 400 | Parent screens only |
| Body strong | 16 / 24 | 16 / 22 | 700 | Labels, button text |
| Small | 14 / 20 | 13 / 18 | 400–600 | Timestamps and meta only. Not for anything a child must read: card and sheet descriptions, field helpers and errors are Body |
| Caption | 12 / 16 | 12 / 16 | 600 | Chips, timestamps. Not for instructions |
| Money XL | 44 / 48 | 32 / 36 | 800 tabular | Jar balance on jar screen |
| Money L | 28 / 32 | 22 / 26 | 700 tabular | Balances on home cards |
| Money | 20 / 24 | 17 / 22 | 700 tabular | Diary rows, request amounts |

Phone sizes come from `mobileFontSize` in `packages/brand/tokens.ts` (the phone app never uses the web `fontSize`). Titles and money cap system font scaling at 1.3× (`maxFontSizeMultiplier`); body, small and caption keep scaling. The phone's calm rules: hierarchy comes from weight and space rather than size; one accent (teal action or gold money) per card; meta text in the muted colour; spacing on the 4 dp grid with 16 dp gutters and 12–16 dp card padding; no more than one Display or Money XL per screen; lists over stacked cards where items repeat.

Large headlines (Display, H1, Money XL) are set tight, `letter-spacing: -0.02em`, line-height 1.1, as every reference site does; body stays at normal tracking. An **eyebrow** style (12 / 16, 600, teal-700, `letter-spacing: 0.08em`, sentence case) labels sections and steps ("Step 2 of 3", "Due Friday"); phone: same 12 / 16. The reference sites set eyebrows in all caps with 0.14em tracking; we keep sentence case for children and allow all caps only on parent tables and the marketing page.

Currency symbol sits before the number at 60 % of the number's size, aligned to the cap height. Minor units are shown only when non-zero on child screens ("£12" not "£12.00"), always on parent confirmation screens.

Sentence case everywhere. No all-caps labels; children read them more slowly.

## 4. Shape, space, elevation

- **Radius token** `--radius: 0.875rem` (14 px). With the existing multipliers: inputs and in-card buttons 14 px, cards about 20 px, large cards and sheets about 25 px. **Standalone action buttons and chips are pills** (9999 px), as on all three product references; the pill is the brand's button shape, the 14 px radius is for things that sit inside a form row.
- **Spacing** on a 4 px grid: 4, 8, 12, 16, 24, 32, 48. Card padding 16 on phones, 24 on tablet and up. Screen gutter 16 at 360 px, 24 from 640 px.
- **Elevation** has three steps, all drawn with ink alpha so they sit on paper and on white alike:
  - Resting card: hairline `0 0 0 1px rgb(20 28 31 / 0.06), 0 1px 2px rgb(20 28 31 / 0.06)`.
  - Raised (primary card, sheets, popovers): `0 1px 0 rgb(20 28 31 / 0.04), 0 14px 40px -22px rgb(20 28 31 / 0.35)`.
  - Keycap (child primary button, see section 6): `inset 0 1px 0 rgb(255 255 255 / 0.5), 0 3px 0 <ledge colour>, 0 8px 16px -10px rgb(20 28 31 / 0.25)`; pressed state removes the 3 px ledge and translates down 2 px.
  Dark mode keeps the hairlines at `rgb(230 241 244 / 0.10)` and drops the long shadows.
- **Sticky bars** (header, bottom tab bar) are canvas at 85 % opacity with `backdrop-filter: blur(16px)` and a hairline on the content side, so content scrolls under them.
- **Jar silhouette** (rounded rectangle, wider lid) is the one custom shape. Use it for jar cards, goal progress and empty states; do not invent other blobs.

## 5. Layout and navigation

Design at 360 px first, then 768 and 1024. Single column on phones; parent screens may use two columns from 768 px.

**Bottom tab bar** (phones and tablets; a left rail from 1024 px):

| Child | Parent |
| --- | --- |
| Home · Diary · Learn · Jarso · News | Home · Children · Money · Jarso · Inbox |

Tab bar height 64 px plus the safe-area inset, icons 24 px, labels 12 px 600, active tab primary with a filled icon. The Inbox tab shows a count badge in gold with ink text. Family settings live under the parent's Home.

**Header**: 56 px, the mark and name on the left (a link to the landing page), the light/dark switch and an icon-only Log out on the right, nothing else. From 1024 px the left rail ends with Settings ("Me" for a child) and, at its foot, the signed-in person's avatar (their initial in a teal disc) with their first name, opening Settings. On phones the avatar is not shown; Settings is reached from the tab bar's Me/Settings item. No hamburger, no sign out: that lives in Settings ("Done for now?"), so a child never has a destructive button a thumb away from Home. The light/dark toggle lives in Settings ("Looks") and on the signed-out pages.

**Page rhythm**: title, one primary card (balance, due allowance, next step), then lists. The first thing on every Home is the next step (FR12): a mission, a due handover, a pending request.

**Learning first (2026-11-04).** Learning leads on both Homes; money in detail has its own place.
- *Child Home*: the next step across the top with the child's points and days in a row, then the jars beside today's plan, pending purchases and the goal, and how the jars moved at the foot.
- *Parent Home*, one screen and no scrolling: "This week's learning" (one compact card per child: the name as a heading and link, points and days in a row as chips, the week in a line, the last lesson with how it went, what's next, and one "Add a child" link), then Needs you as compact rows (child · what, due date and "5 days ago" in gold text, amount, Hand over; at most five, then "and N more" to Money; never "overdue"), requests and limit notices, then Jarso's summary.
- *Jarso's summary*: a plain card (hairline border, card surface), Jarso's small face beside the heading "Jarso's summary", two or three sentences at body size kept to 68 characters a line, and a muted note under it that it was written by AI. It talks about the children's learning first, then anything waiting; never a bright banner.
- *Children*: one panel per child about learning (week, next, skills, practice or check-in, the last three lessons with how each went), Spend and Save in one line at the foot, Send a note.
- *Money* (the tab at `/parent/allowance`): the week in three figures, each child's allowance, then the filter, the money chart, totals, Worth knowing, spending by category, the next two weeks and recent activity.
- *A child's page* opens on Learning (summary, lessons done, skills), then Money and Jarso; money flows (handovers, gifts, the allowance, rules) return to its Money tab.

Installable as a PWA later in the pilot: respect `env(safe-area-inset-*)`, use the mark for icons, keep the tab bar fixed.

## 6. Components

Built on the existing shadcn primitives in `apps/web/src/components/ui`. Add with `pnpm dlx shadcn@latest add <name>` (run in `apps/web`) and export from the barrel.

| Component | Notes |
| --- | --- |
| Button | Pill. Default = primary teal-700 with white text; `outline` on canvas with the hairline for secondary actions; `ghost` in lists; `destructive` only for irreversible actions. Height 44 px (`lg`) for any action a child taps; 36 px allowed in parent tables. Loading state keeps width and shows a spinner. |
| Keycap button | The child's one primary action per screen (Record purchase, Ask a parent, Confirm). Primary pill plus the keycap shadow: a 3 px teal-900 ledge below; pressed state drops the ledge and moves 2 px down. Gold keycap (gold fill, ink text, gold-700 ledge) only for money moments such as confirming a handover. Never more than one keycap per screen. |
| Card | White surface, 20 px radius, border, optional soft shadow when it is the page's primary card. |
| Jar shelf (child Home) | The two jars side by side at every width, drawn with `JarIllustration`: under each, the jar name, Money L balance, a one-line caption ("Cash you have", "Kept by your parent"), open requests as plain lines, and the jar's buttons. Both jars sit on the shared scale; counted Save money is gold and money waiting to come out is a hatched band. The goal is not drawn on the jar (see Goal staircase). Money that is due floats outside as a dashed coin. A key in words sits under the shelf. The parent's child card shows the same two jars small. |
| Jarso page (`/child/jarso`, `/parent/jarso`) | The chat as a page. An empty chat is a hero in the middle: Jarso's eyes (112 px, looking down at the box while it has focus), a greeting that names the person ("Hi Maya. Ask me about your money." / "Hi Sam. Ask me anything about Maya's money."), the disclosure line small under it, the composer about 42 rem wide on a raised card, and the starter questions as a 2 × 2 grid of cards (icon, the question, a one-line hint) under it, over a soft teal radial glow. After the first reply it becomes the thread: a slim header with the small eyes, messages rising in, the composer pinned at the foot, the cards gone. Past chats are not advertised: one "History" ghost button (icon + word, top-left) opens a left drawer with "New chat" on top and the chats grouped Today / This week / Earlier, each with the small eyes, its first message and its day (the parent's also names the child), the open one highlighted. Picking a chat up again keeps its turns and thumbs; a full chat (12 turns) says so and offers a new one. The window on Home is the same thread in a card, with an "Open" link beside its title. The Jarso tab (sparkles) sits before News/Inbox. |
| Money ride (child Home) | "Your money ride": Spend (teal) and Save (gold) as two 6 px rollercoaster tracks over this week (the default), this month or 3 months, ending at today's balances. Height is the amount, left to right is days: the monotone curve passes exactly through each day's figure. Thin posts in the track's colour hold each track up every day or two; the ground is a 2 px hairline with a small teal flag and the date at a handful of days, today always; two money marks only, the top and zero, in bold muted type, no gridlines. A gold coin (teal-800 rim, 2 px card ring) sits on each track on every day money moved. The child's coach (`coachIdFor("jar-graph")`, 30 px) rides a small cart (teal-800 body, two wheels, a safety bar) on the track that moved most in the period, Save if tied, parked at today. A pill control picks the period; a legend with track keys names the series. Pointing, tapping or the arrow keys read a day: a dashed hairline finds it and a card gives the date and both figures, value first. The same coach says the line under it in a speech bubble ("Save climbed £8 this week. Nice.", "Spend dipped £12 this month.", "Both jars stayed put this week."; "Nice." only when Save went up, never a judgement of an amount); "See the numbers" lists the same figures as a table. A parent's view keeps its own title ("How Sam's jars moved"). |
| Goal staircase (child Home card and `/child/goal`) | The goal as a climb: stacks of gold coins rising step by step from left to right, one step per allowance of the plan (at most 12 steps; beyond that each step is a group of allowances, and a line says so), the goal's item large on the top step, and the child's coach (picked by the goal's id, so it stays the same) standing on the step they have reached, or on the ground before the first. Climbed steps are solid gold; the rest are ghosted outlines. Passing a quarter mark (25, 50, 75, 100 %) lights that step with a soft gold glow and the coach cheers once. One line under it: "About 30 allowances to go", "£600 to go" without a plan, or "Reached. Time to ask your parent."; "The amounts" disclosure gives saved, to go and the plan. The Home card is compact and links to the page; without a goal the card invites the child to set one. |
| Progress | Elsewhere a line of text ("⚽ Football boots · £26 of £45 · plans £4 each allowance"). Always says amount saved, remaining and the estimated payments in words. |
| Status chip | See 2.5. Icon plus word, never colour alone. |
| Badge (count) | Gold fill, ink text, min 20 px, on Inbox tab and request lists. |
| Inbox item | Icon in a tinted circle, one-line title, one-line detail, relative time, chevron. Unread has a teal-100 background. |
| Request card | Amount in Money, reason, status chip, who asked, and the one action available to this role. |
| Handover sheet (parent) | Bottom sheet: due amount, two inputs (cash to child, kept as savings) starting from the previous handover's split, running total must equal the due amount, one confirm button. When the child has a goal with a plan, one note line says so ("Maya plans to save £4 each time toward ⚽ Football boots"); it never changes the split. |
| Forms | Label above, 44 px input, helper text below, error text in destructive with icon, `aria-invalid` and `aria-describedby` wired (already in `Field`). |
| Empty state | Mark illustration, one sentence, one action. |
| Toast | Sonner, bottom above the tab bar, 4 s, never for errors that need action. |
| Skeleton | Surface-2 block with a left-to-right shimmer (a translucent white band translating across, 1.5 s) for every Suspense boundary. |
| Step indicator | Eyebrow "Step 2 of 3" plus three pill dots; used by onboarding, missions and the handover sheet. Borrowed from the numbered "stops" pattern on the AFK site. |
| Mission player | One step per card (`features/learning`): eyebrow "Step 3 of 7" (or "One more look: 1 of 2" for replays) above a row of progress dots, the prompt as H2, the input, then one keycap (Check, Continue or Try again) with an outline Hint button beside it. Inputs: option cards with a radio, a money or count field with the currency symbol and unit, a Spend/Save slider with live teal and gold readouts, two-choice pills per item for sorting, a select per term for matching. Focus moves to the prompt on each step and to the feedback heading after Check. |
| Lesson film (`LessonFilm`, `features/learning/components/lesson-film`) | A 10 to 15 second animated intro that plays when the child taps Start mission, or Start the questions on the check-in (the check-in and missions 1 and 3 so far; one scene per mission key, and "check-in", in `film-scenes.tsx`). The check-in's film shows five question cards, a padlock opening ("no score, nothing locked") and the seven-day road with a coin landing on day 1. Drawn like the landing hero, not a video file: the hero's jar and coins (`components/brand/jar-art.tsx`, easing from `lib/motion.ts`) on a `tint-teal` stage, with Nell, the films' one narrator, standing on the left and mouthing the words. The narration lives in the content (the mission's or the check-in's `film.lines`, two to four lines, about 25 to 40 words, counted in coins, never in a currency, so one recording fits every family); each line is one beat of the scene, and the scene moves through its beat in step with the voice. Under the stage, Nell's speech bubble shows the line being spoken (captions always on, the same words). The voice is a very soft, warm female AI voice, recorded once per line by `scripts/lesson-voice.py` into `apps/web/public/lessons/voice/` (file names carry a hash of the words, so an edited line never plays an old recording); when a recording is missing it falls back to a soft female voice on the device, and to captions on a timer when the browser can't speak. Pause / Play, Skip intro and, at the end, a "Let's start" keycap with "Watch again". The voice is unlocked inside the Start mission tap. A resumed mission doesn't replay it but offers "Watch the intro". Reduced motion shows each beat's last frame, still, while its line is spoken. |
| Question picture (`StepPictureView`, `features/learning/components/step-pictures.tsx`) | A still picture above a question's blackboard, keyed by step key (the five check-in questions so far): the situation the words describe, drawn with the films' jar, coins and a few props (a book, a game, a snack, a football goal, a calendar) on a `tint-teal` panel. Only the setup, never the working: a "?" sits where the answer goes, because the check-in places a child and must measure them, not the picture (a test checks no picture contains its answer). Amounts come from the question's own money tokens in the family's currency. No motion and no voice of its own; Read aloud covers the words. The SVG is labelled with what it shows. |
| Feedback panel | Inline under the input, `role="status"`: teal-100 with a check icon for "That's it.", muted with a bulb for "Have another go." and, after the second try, "Here's how it works." plus the answer. Predictions reveal their outcome only once the step is final. Never "Incorrect". |
| Coach and blackboard (mission player) | Every question sits on a blackboard: a teal-950 board in a 6 px gold-800 frame (gold-900 in dark), the eyebrow in teal-200, the prompt in teal-50 at 24 px, a chalk underline drawn under it. Beside it one of four coaches (`CoachFigure`, §7), chosen by the step key so the same step always brings the same coach, with its name under it and a speech bubble (secondary surface, tail on the left): one short line before the child answers ("Take your time."), then the hints they ask for, then the feedback panel. The hints stay for a second go but leave once the step is settled (right, or the answer shown), so the bubble is then only the feedback; "Try again" clears a wrong pick so the next go starts fresh (a typed number, sorting, matching and the slider keep the child's work to adjust). Asking for a hint brings the bubble into view. The coach cheers once for a right answer and nods once for a wrong one. |
| Coach says (`CoachSays`) | The same coach-and-bubble piece on every screen a coach appears on: the coach (88 px with its name under it, or 44 px with the name as its accessible label for a small aside), a secondary-surface speech bubble with a left tail, one short line, and optionally what belongs under the line (a button). One coach per screen, picked by a stable page key (`coachIdFor`), so a page always keeps its coach. The moments and each coach's line live in `components/brand/coaches.ts`; nothing moves. |
| Path | The Learn tab's vertical journey: a 48 px circle per day (teal check when done, gold play ring for the current mission, muted lock after it), eyebrow "Day 2 · Spending within your balance", title and one line. The parent's copy is read-only. |
| Next-step card | First card on the child's Home (§5): eyebrow "Next step", a two-beat headline ("Practice time. About a minute."), one line, one keycap link. Order: unfinished mission, due practice, the check-in before mission 1, the next mission. |
| Ask Jarso | The thread on the Jarso page (the Jarso tab, `/child/jarso` and `/parent/jarso`), when Jarso is on (ADR 0011); it is not on Home: the heading "Ask Jarso" (visible once the chat has begun, read-only over the hero), the line "Jarso is an AI. Your parent can see these chats." always, up to four starter questions as cards while the chat is empty, and a 280-character box with a plain primary "Ask" (Home keeps its one keycap for the next step) and a microphone beside it ("Speak your question", 44 px) wherever the browser can listen: the words land in the box after what was typed, and the person still presses Ask, so every question goes through the screened pipeline on an explicit send; a miss says "Couldn't hear that. Type it instead." While Jarso works, the thinking bubble (§8) names each look-up; the reply then types itself out as a reply card with the cyan "Jarso AI" chip (the small eyes in it), money figures in tabular numerals, "Looked at" as icon chips, topics and the quick check. The first-ever chat starts with the intro card. |
| Guide sheet | Bottom sheet opened by "Ask about this" (topic) or "Help me" / "Why?" beside a step. The floating Jarso buddy opened during a lesson talks about the same step (title "Ask about this question", starters "Can you give me a hint?" / "What is this question asking?", then "Why is that the answer?" once settled), and a new step starts a new chat. Both send the step by key with the wrong tries, the hints already opened and the last wrong try, so "why is mine wrong?" has an answer. Header "Jarso" with the line "Jarso is an AI. Your parent can see these chats." The first-ever chat starts with an intro card. Child messages are teal bubbles on the right; replies are white cards with a cyan "Jarso AI" chip, a "Looked at: jars" line when Jarso looked something up, up to two topic chips, an optional quick check, and thumbs up or down. Safety replies list helplines as links. 280-character box with a counter and a keycap Send. |
| Skill list | Per topic, each skill with its level word (Not started, Started, Practised, Got it) and three dots. Learning only, never beside money (invariant 11). |

Primitives to add next: `badge`, `progress`, `tabs`, `sheet`, `dialog`, `avatar`, `separator`, `skeleton`, `tooltip`.

## 7. Iconography and illustration

- **Lucide** icons only, 24 px in navigation and 20 px inline, stroke 2. Prefer filled variants only for the active tab.
- **Jar illustrations** are SVGs drawn from the mark: an outline jar that fills with teal or gold to the balance ratio, coins as gold ellipses with a teal-800 rim as in the mark. One component, `JarIllustration` (`@/components/jar`), with `jar`, `capacityMinor`, `filledMinor`, `reservedMinor`, `goal`, `dueCoin` and `size` props. It is decorative (`aria-hidden`); every amount is also written beside it.
- **The four coaches** are kids drawn exactly like the hero's kid on the landing page (`KidFigure` and `CoachFigure` in `@/components/brand`; the hero's own animated version is `features/landing/components/kid-art.tsx`, and the two must stay alike): thick round-ended strokes, flat fills, a hoodie like the lid, trousers like the jar, gold only on the coins each of them holds. **Bo** is the hero's boy (calm: brown crop, cyan hoodie, a handful of coins cupped in both hands). **Zuzu** is a boy (cheeky: black curls, a teal-500 top with a cyan sticker, one arm up flipping a coin). **Pip** is a girl (curious: ginger bunches, a teal-200 hoodie, holding one coin up to look at it). **Nell** is a girl (thoughtful: a dark bob with a cyan hairband, round glasses, two coins held close). Skin and hair are flat warm tokens: `skin-1` to `skin-4`, `hair-1` to `hair-4`, `blush` for cheeks and `kid-ink` for eyes and mouths, the same in both themes. The face follows what just happened: a smile at rest, an open-mouth cheer for a right answer, the hero's unsure wave for a wrong one. `@jarso/core/learning` (`packages/core/src/learning/coaches.ts`) holds their ids, names, the stable picker (`coachIdFor`) and the lines around a question; `components/brand/coaches.ts` the lines for the app's moments.
- **Where the coaches appear** (one per screen, at a moment that earns it): the child's sign-in and start screens (a greeting), the next-step card on Home and Learn (a nudge beside the button), the Learn header, the jar graph's and the history's empty states, the News empty state, the "Done for now?" card on Me, the offline banner (28 px, beside the line), and the not-found and error screens, where the coach stands in for the mark. Parent screens stay plain apart from an empty money history.
- **Jarso's face** (`JarsoEyes` in `@/components/brand`) is the official jar mark, drawn from the mark's own geometry (`jar-outline.ts`: the same outline, stroke, cyan lid, lid coin and coins), with two white eyes rimmed in teal inside it. Nothing else: no mouth, no sparkle, no new jar shape. Sizes 20 / 28 / 64 / 112 px (`sm` / `md` / `lg` / `xl`). The pupils look ahead, down at the composer, or up at the coins dropping in while Jarso thinks; it blinks every 5 s (§8). It is decorative beside the "Jarso" or "Jarso AI" words and named `Jarso` only when it stands alone.
- **Coins** appear only where money moves: handover confirmed, deposit confirmed, goal reached. The coins dropping into Jarso's jar while it thinks (§8) are the one exception: they show Jarso working, not money moving.
- No emoji in UI chrome. Emoji may appear in child-authored labels.

## 8. Motion

| Moment | Motion | Duration |
| --- | --- | --- |
| Buttons, chips, tab switch | Colour and 1 px press translate; keycap drops 2 px | 150 ms |
| Cards and list items on first paint | Rise-in: opacity 0 to 1, translateY 12 px to 0, scale 0.99 to 1; stagger 40 ms per item, at most 6 items | 250 ms |
| Sheets, dialogs, page transitions | Slide up / fade | 250 ms |
| Jar fill after a confirmed handover | Fill level rises, two coins drop; the coin icon in the toast does one `rotateY` flip | 500 ms |
| Money moves between the jars, or leaves Spend | Three coins arc from the source jar to the other (`coin-fly`, one turn in the air, 70 ms apart), or up and away for a purchase; the target's drop follows. Coins clink | 700 ms |
| Money ride tracks | Draw from left to right (`graph-draw`) when the ride or its period appears | 900 ms |
| Money ride cart | Once the tracks are drawn, the coach's cart rides its track from the first day to today (`coaster-ride`, a CSS motion path along the track; the cart stays upright) and parks there. Reduced motion, and browsers without motion paths, show it parked | 1000 ms, after 900 ms |
| Goal reached, mission complete | Ring completes, badge scales in once | 600 ms |
| Goal staircase passes a quarter mark | The reached step glows gold (`badge-in`) and the coach cheers once (`coach-cheer`); never on first paint, never when money leaves | 900 ms |
| Coach reacts to an answer | Right: two small hops (`coach-cheer`) with the cheer face; wrong: one nod (`coach-nod`) with the unsure face. Once, never looping | 700 / 500 ms |
| Skeletons | Shimmer band | 1.5 s loop |
| Jarso's eyes, idle | A blink (`eyes-blink`, the lids scale to 8 % and back) every 5 s wherever the face shows; the pupils slide down (250 ms) while the composer has focus. The one idle loop the app allows besides skeletons: it is what makes Jarso feel awake on a page that is otherwise still | 5 s loop |
| Jarso thinking | A loading state, so it may loop like a skeleton: Jarso's lid tips open, a coin drops in every 0.7 s (`jar-drop`), the jar wobbles a little as each lands (`jar-wobble`), the mark's pile grows by a coin at a time (`jar-land`) and the pupils look up; beside it the status line, which after 2.5 s on one step turns over to that step's own funny lines (`guideCopy.quips`, "Lifting the lids…" while peeking in the jars) and then "Still thinking…"; under it four steps (reading → looking things up → writing → checking) light up as the server's status lines arrive, the current one pulsing softly, done ones solid teal; each new status line fades up (`fade-up`) instead of jumping; during "Double-checking the answer…" a check mark draws itself (`check-draw`). Reduced motion: the jar still, looking ahead, the line and the steps, no drops or check | 0.7 s loop; 2.5 s per line; 250 ms; 600 ms |
| A reply lands | The reply is typed out word by word (`TypedText`): the whole screened reply is in hand first, so this is a reveal at about 25 words a second, never longer than 2 s, with a caret at the end; the chip's eyes look down while it types. Assistive technology gets the whole text at once; reduced motion and reopened chats show it whole | ≤ 2 s |

Easing `cubic-bezier(0.2, 0.8, 0.2, 1)`. With `prefers-reduced-motion: reduce`, everything becomes an instant state change; the coins do not fall or fly and the rise-in is skipped. Nothing loops except skeletons, Jarso's blink and the thinking bubble (both loading or idle states, above). No confetti, no smooth-scroll library, no parallax: those belong to marketing pages, not to an app a child uses daily.

**Sound.** Four sounds, synthesised in the browser (`apps/web/src/lib/sounds.ts`, no audio files), quiet (gain at most 0.2) and each a body tone plus a brighter partial with a bell-like decay, so they ring rather than beep: coins clinking (under 400 ms) when money moves between the jars, leaves Spend, a purchase is saved, or Jarso's jar starts filling while it thinks; a rising two-note bell for a right answer; one soft woody slide down for a wrong one, never a buzzer; and a three-note fanfare with a held top note (under a second) once a mission or practice is finished. Nothing plays before the person has touched the page (the browser's `navigator.userActivation`, or a first-press listener where that is missing). One "Sounds" switch on Settings (child and parent) turns them off for that browser (`localStorage`, `jarso:sounds`).

**Read aloud (demo 3).** Every lesson step has a "Read aloud" button (`ReadAloudButton`): a teach step reads its title, body and example; a question reads the board's prompt and its note. Once an answer is checked, the coach's feedback has its own "Read it to me" button (the heading, the feedback, and the answer once it is shown). The browser's own speech synthesis speaks, on the device, at 0.85 of its default speed (about 150 words a minute; the default was too fast for children reading along). It picks a calm English voice that is on the device: the page's accent first, then a "Premium" or "Enhanced" voice, then a short list of clear ones (Serena, Martha, Kate, Daniel, Samantha and so on); never a novelty voice and never one that sends the words to a server. Nothing leaves the device and the words stay on screen throughout. One reading at a time: the button turns into Stop while it speaks, and a new step or leaving the page stops it. The button appears only where the browser can speak.

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
| News (child tab), Me (child settings) | Inbox, Settings |
| Move my money, ask for extra | Requests |
| Said yes, Not now, Waiting, Done | Approved, Rejected, Pending, Completed |
| put in, take out, each time | deposit, withdrawal, per time |
| Something went wrong. Please try again. | Failed to load…, any message written for a developer |

Headlines use the two-beat cadence the reference sites use ("Link in. Notes out.", "Your turn."): "Due today. Hand it over.", "Saved up. Nearly there.", "Three missions. Ten minutes." One idea per beat, a full stop between.

Never: exclamation marks in errors, "oops", shame words, or anything that calls the child's balance small.

## 10. Role emphasis

Same tokens and components; different hierarchy.

- **Child**: Home opens on the jars (the money first), with one gold keycap under them to record a purchase and the allowance as one line; tapping a jar opens its tray of actions, so the resting shelf is just two jars and two balances. Then how the jars moved, the one next step and the goal; Ask Jarso lives on the Jarso tab. The week and the skills live on Learn, whose road winds up the page with the jar parked on the current stop. Celebration moments exist here only. Fewer words per screen.
- **Parent**: Home opens on what needs them: due handovers, pending requests, limit notices, each with its action inline. Then the family's money as one picture, never a block per child: a filter (Everyone, then one chip per child, remembered on the device) and a period switch at the top re-scope the whole page; the money chart stacked by child, one totals card, Worth knowing, spending by category against the period before, the next two weeks, one compact tile per child (the only per-child block) and one merged activity list with a name chip per line. Charts, stat tiles and small multiples are allowed on this dashboard only (spec 2026-11-02); every figure is also in a sentence; asking Jarso about a child lives on the Jarso tab (the same thread as the child's, asking as the parent, with a chip per child when there are several). The same components as the child, more of them: cards and sentences at every width, never a table or a key-value grid; Small only for timestamps. No celebration animation; a quiet confirmation toast instead.

## 11. Accessibility

- AA contrast for all text and 3:1 for icons and focus rings, in both themes. The tables above hold the measured ratios; re-measure when a token changes.
- 44 × 44 px minimum targets for every child-facing control; 36 px allowed only inside parent tables.
- Visible focus ring everywhere, cyan-500 light and cyan-300 dark; never remove outlines.
- Every input has a visible label. Errors are announced via `aria-describedby`.
- Status always carries an icon or word. Charts have a text summary.
- Reduced motion honoured. No content relies on hover.
- Reading level: body copy around age 10. Numbers are never abbreviated ("1,250", not "1.3k").

## 12. Dark theme

The first visit follows the device setting; after that a one-click light/dark toggle (`next-themes`) keeps the last choice. The toggle is in the header, or top-right on pages without one (§5). The warm paper canvas is a light-mode idea only; dark is a tinted navy-teal, not black: background `#0B1F26`, cards `#12303A`, hairlines at 10 % light ink, input borders `#234853`. Primary becomes teal-400 with ink text; brand gold and cyan stay at their brand values and are allowed as text because they clear 9:1 on these surfaces. Shadows are dropped; borders carry elevation. Illustrations keep their colours; the jar outline uses teal-300.

## 13. Tokens for `globals.css`

Replace the neutral `:root` and `.dark` blocks with these. Chart and sidebar variables follow the same mapping.

```css
:root {
  --radius: 0.875rem;
  --background: oklch(0.970 0.007 89);           /* paper canvas #F7F5F0 */
  --foreground: oklch(0.220 0.013 223);          /* ink #141C1F */
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.220 0.013 223);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.220 0.013 223);
  --primary: oklch(0.462 0.087 225);            /* teal-700 */
  --primary-foreground: oklch(1 0 0);
  --secondary: oklch(0.94 0.055 223);           /* teal-100 */
  --secondary-foreground: oklch(0.385 0.074 227); /* teal-800 */
  --muted: oklch(0.943 0.010 87);                /* surface-2 #EFECE5 */
  --muted-foreground: oklch(0.493 0.019 221);    /* #566469 */
  --accent: oklch(0.806 0.138 207);             /* brand cyan fill */
  --accent-foreground: oklch(0.220 0.013 223);
  --accent-text: oklch(0.463 0.080 208);           /* cyan-700, cyan as text */
  --destructive: oklch(0.56 0.245 27.325);      /* darkened to meet §11 AA on paper */
  --border: oklch(0.914 0.012 85);               /* #E6E2DA */
  --input: oklch(0.64 0.012 85);                 /* #8F8C84, darkened to meet §11 3:1 */
  --hairline: rgb(20 28 31 / 0.08);
  --hairline-strong: rgb(20 28 31 / 0.14);
  --shadow-rest: 0 0 0 1px rgb(20 28 31 / 0.06), 0 1px 2px rgb(20 28 31 / 0.06);
  --shadow-raised: 0 1px 0 rgb(20 28 31 / 0.04), 0 14px 40px -22px rgb(20 28 31 / 0.35);
  --ring: oklch(0.622 0.107 208);               /* cyan-500 */
  --gold: oklch(0.846 0.173 87);                /* brand gold, fills */
  --gold-foreground: oklch(0.220 0.013 223);
  --gold-text: oklch(0.54 0.111 86);            /* gold-600 */
  --keycap-ledge: oklch(0.30 0.06 223);         /* teal-900 under the primary keycap */
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
  --input: oklch(0.565 0.046 220);              /* #577D89, lightened to meet §11 3:1 */
  --ring: oklch(0.801 0.137 207);               /* cyan-300 */
  --accent-text: oklch(0.801 0.137 207);
  --gold: oklch(0.846 0.173 87);
  --gold-foreground: oklch(0.226 0.029 223);
  --gold-text: oklch(0.846 0.173 87);
  --hairline: rgb(230 241 244 / 0.10);
  --hairline-strong: rgb(230 241 244 / 0.18);
  --shadow-rest: 0 0 0 1px rgb(230 241 244 / 0.10);
  --shadow-raised: 0 0 0 1px rgb(230 241 244 / 0.14);
  --keycap-ledge: oklch(0.385 0.074 227);       /* teal-800 */
}
```

Add to `@theme inline`: `--color-gold: var(--gold); --color-gold-foreground: var(--gold-foreground); --color-gold-text: var(--gold-text); --color-accent-text: var(--accent-text); --shadow-rest: var(--shadow-rest); --shadow-raised: var(--shadow-raised);` and switch `--font-sans` to the Nunito variable. Keycap and shimmer are two small utilities in `globals.css`.

## 14. Implementation order

1. Fonts: load Nunito in `apps/web/src/app/layout.tsx`, keep Geist Mono; set `--font-sans`.
2. Tokens: paste section 13 into `globals.css`; add the gold colour utilities; set `--radius`.
3. Icons: export the mark at 512, 192 and 180 px plus a 32 px favicon into `public/` and `apps/web/src/app/`; add `manifest.webmanifest` when PWA work starts.
4. Primitives: add the components listed in section 6; export from the barrel.
5. Brand components: `JarsoMark`, `JarIllustration`, `Money` (formats minor units with tabular figures), `StatusChip`.
6. Shell: bottom tab bar and header in `apps/web/src/app/(app)/layout.tsx`, role-aware tabs once FR13 lands.
7. Replace the placeholder home with the wordmark on white and the two sign-in actions.

## 15. Reference sites and what we borrow

Studied from their live HTML and CSS on 2026-10-28. Three are products in the same family as the hackathon host; matching their surface language makes Jarso feel at home next to them while the teal, gold and jar keep it unmistakably ours.

| Site | What it is | Palette and type | What we take | What we leave |
| --- | --- | --- | --- | --- |
| 8xresearch.com | AI user-interview product | Paper canvas `#F6F5F2`, ink `#0A0A0A`, indigo accent `#4F46E5`; Inter and Onest with `ss01 cv11` features | Paper-and-ink base; one accent used sparingly; pill buttons with a 2 px outline offset on focus; blurred sticky header; short two-beat section titles ("Your turn.") | Indigo; marketing density; smooth-scroll library |
| karma.business | Reddit marketing product | Canvas `#F3F2F0`, ink `#1D212C`, teal `#0B5E55` and `#0E9384`, pink `#FF7AB8`, peach `#FFB08F`; General Sans display, Switzer body, `-0.035em` headlines | Hairline-plus-shadow card recipe (`0 0 0 1px ink/6%`); 20 to 24 px card radii next to pill buttons; `hero-rise` entrance (12 px up, fade); the "one calm console" layout for the parent home | Pink and peach gradients; 3D hero |
| afk-ai-tau.vercel.app | Meeting notetaker (your own) | Canvas `#F9F6F0`, ink `#1E1711`, violet `#7041FB`, amber "now" `#FFE7B5`; Instrument Sans, JetBrains Mono eyebrows | Keycap button shadow and press state; numbered "Stop 01" steps as our step indicator; `coin` rotateY flip; shimmer skeleton; semantic colour names (`signal`, `now`, `match`) as the model for our status tokens | Violet; mono eyebrows on child screens |
| harisshakeel.site | Your portfolio | Dark `#161A15`, cream `#F5F3EC`, lime `#D2E76A`; Anton display, Montserrat body, mono labels | Typographic confidence: one huge headline, lots of air, labelled sections; a marquee only for the marketing page, if ever | Dark default; condensed display face; glitch and marquee motion in-app |

Rules of thumb distilled from all four: one accent per screen, everything else is paper and ink; headline big and tight, body relaxed; borders are hairlines, elevation is rare and soft; motion enters once and then stays still; copy is short, concrete and a little playful.

Everything above is a starting point for the pilot. Change it when a screen proves it wrong, and change this document in the same PR.
