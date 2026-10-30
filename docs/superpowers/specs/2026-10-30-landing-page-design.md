# Landing page — design

Date: 2026-10-30. Status: live at https://jarso.vercel.app (#34). The hero is a coded animation, not a generated video (product owner, 2026-10-30): a kid throws coins into the jar, then the savings loop. Roadmap: Demo 2, slice 4 (`docs/roadmap.md`). Builds on `docs/design.md` (tokens, type, voice, motion) and replaces today's sign-in page at `/`.

## 1. Intent

One page that shows what Jarso does, mostly by moving rather than telling. A parent should understand the loop (allowance, Spend and Save, a goal, a daily mission, the guide) in under a minute of scrolling, and a child should find "I'm a kid" without reading anything else.

**Goals**

- Show the product working: real Jarso components, rendered live with demo data, animate through each step. No screenshots, no stock illustration.
- A scroll-driven hero animation that tells the money loop without words: a kid throws coins into the jar, then the jar splits into Spend and Save.
- Under 200 words above the footer, buttons and labels included. Every headline is a two-beat line from the voice rules (`design.md` §9).
- Both ways in stay one tap away: parents set up a family, kids sign in or start.
- Light and dark, AA contrast, reduced motion, 360 px phones first, no horizontal scroll.

**Anti-goals (failure even if it looks good)**

- Template landing page: icon-grid features, testimonial carousel, logo wall, pricing table, FAQ wall, stats band, "trusted by".
- Modals or popups of any kind: no cookie banner (we run no ad tracking), no newsletter popup, no video lightbox, no sign-in modal.
- AI-slop visuals: purple-blue gradient blobs, glassmorphism, orbs, 3D plastic renders, stock photos of children, sparkles, confetti.
- Motion for its own sake: marquees, parallax backgrounds, cursor followers, smooth-scroll hijacking.
- Copy that shames, pressures or overclaims ("best", "#1", "AI-powered", countdowns).

## 2. What the references do

Studied 2026-10-30 in headless Chrome: hero frames over 7 seconds, 10 to 19 scroll positions per site at 1440 and 390 px, the running animations from `document.getAnimations()`, and AFK's hero video frame by frame. Earlier palette and type notes are in `design.md` §15.

| Site | Motion and components worth taking | Leave |
| --- | --- | --- |
| afk-ai-tau.vercel.app | **Scroll-scrubbed hero video**: a 12 s, 1920 × 1080 clip in a sticky full-height figure inside a 480 vh (phone) / 700 vh (desktop) section. At scroll 0 the first 0.62 s loops at 0.6× speed as an idle breath; once scrolling, `currentTime = progress × 10.6 s`, eased 10 % per frame. Reduced motion swaps to a plain `aspect-video` player with a play button; the video has an `aria-label` and a captions track. The clip is flat UI motion graphics on paper, no text cuts, and its last frame returns to the first. Then a **route timeline**: numbered stops alternating left and right on a line that draws with scroll (spring-smoothed). | Violet |
| karma.business | **Pinned scroll story**: three steps ("1 brief", "Verified owners", "Their own voice") swap inside one sticky 100 svh frame while a mascot draws ribbon paths across it; a small step indicator shows position. Headline letters rise in on a 1050 ms expo-out. **Product console** with tabs and floating annotation cards at different depths. A **statement that lights up word by word** as you scroll. A fan of avatar lines converging on the logo. | 3D mascot, gradient sunrise, cookie banner |
| dev.definable.ai | Headline **words blur and rise in** (400 ms each, staggered). **Connector paths draw themselves** between small agent chips around the headline. A **live console** below the hero whose numbers keep ticking. Section titles in two beats with the **second beat muted** ("Nothing happens in the dark. *Every run is traced…*"). Tabbed feature demos built in HTML, not images. | Dark default, WebGL fluid, logo marquee, long copy (1,500 words) |
| 8xresearch.com | Pinned "how it works" with a **sticky progress ruler** at the right edge and one object travelling through five steps. Two-beat headings with a muted second line. | Portrait wall, orb, dark default |
| harisshakeel.site | Typographic confidence: one huge headline, **big outlined step numerals** ("01", "02"), lots of air, labelled sections. | Condensed display face, glitch and marquee |

What makes them not feel like templates: the product is the illustration, motion explains a sequence instead of decorating, each section says one thing in one or two short lines, and there is one accent colour on paper and ink.

## 3. Page map

Order top to bottom. Copy is final unless marked. Amounts in the demos use £ (the UK pilot first); swap to $ if the demo audience is American.

### 3.0 Header

Sticky, canvas at 85 % with a 16 px blur and a hairline (`design.md` §4). Left: the mark and "Jarso" (the opaque wordmark can't sit on paper, `design.md` §1). Right: "Safety" (`/safety`) from 640 px, then **one** button, "Get started", and the theme toggle. Get started opens a menu (not a modal) with every way in: Parents, "Log in" (`/login`) and "Set up your family" (`/signup`); Kids, "Sign in" (`/sign-in/child`) and "Start here" (`/start`). Rows are 44 px tall.

### 3.1 Hero, scroll-driven animation

| | |
| --- | --- |
| Copy | H1, the kid's question: **"Got money, but not sure how to manage it?"** Buttons: "Set up your family" (primary pill, keycap), "I'm a kid" (outline pill). Pop-ups in act 1: "Spend some." (left) · "Save some." (right) · "Learn as you go." (centred over the jar). Captions under the jars in act 2: "Split it. Spend and Save." · "Save for something real." · "Again next week. A bit wiser." |
| Layout | Section 600 vh desktop, 420 vh phones; a sticky `h-svh` stage whose content is centred: the H1, the buttons and the scene (sized by its 640 × 390 frame) form one block. The opening frame is only the kid, the H1 and the buttons. The pop-ups sit beside the coins on desktop and above them on phones; act 2's captions take the H1's place. |
| Motion | H1 words rise 16 px and unblur from 8 px, 60 ms apart, 700 ms, `cubic-bezier(0.16, 1, 0.3, 1)`, then fade over the first 5 % of the scroll with the buttons. The scene is drawn from scroll progress (§5). Pop-ups slide in from their side, unblur and settle, and leave together at the checkpoint. |
| Reduced motion | No pinning and no scrubbing. One screen: the H1 and buttons, a still of the answer (both jars, Save three quarters full of coins), and every pop-up and caption as a list. |

### 3.2 How it works, stepper on the thread (`id="how"`)

Four steps, each 80 % of a screen tall on desktop, beside a sticky rail of big outlined numerals "01" to "04" whose active one fills in (8x's ruler, the portfolio's numerals, Karma's step-by-step story without pinning). Beside the numerals runs one rounded line in the jar's teal, as thick as the hero jar's stroke, with a coin drawn like the mark's coins (a wide gold oval with a teal rim) that slides to the active step; on phones the same line is the route the steps hang from, with a gold dot per step. This line is the hero jar's outline, unwound (§5): the thread arrives here and hands over to it. Each step is a two-beat H2, one line, and a **live demo** on the right built from Jarso's own components with demo data. A demo plays once when its step becomes active (about 2.5 s), then holds its final state. On phones the steps stack and the rail becomes AFK's vertical route line that draws as you scroll; each demo plays when it is 40 % in view.

| # | Eyebrow | H2 (two beats) | Line | Live demo |
| --- | --- | --- | --- | --- |
| 01 | For parents | Due today. Hand it over. | You hand over the cash. Jarso keeps the record. | Handover card: "Weekly allowance £10" with the cyan Due chip. The split slider glides from 50/50 to 60/40, Spend £6 (teal) and Save £4 (gold) roll to their values, the gold keycap "Hand over" presses, two coins drop into two jars. |
| 02 | For kids | Spend some. Write it down. | Inside the rules you set. | Purchase sheet: "Comic" and "£3" type in, Spend rolls £6 to £3, a diary row slides in ("Comic, −£3, today") with a teal "Within your rules" chip floating beside it, Karma-style. |
| 03 | For kids | Save some. Get there. | A goal, a plan, and how many weeks to go. | Goal card "Football boots, £40": the gold ring fills from 45 % to 55 %, "6 more allowances" fades in. Needs the savings goal (Demo 2, slice 3) on `main` first. |
| 04 | For kids | A mission a day. About three minutes. | Short, playful lessons on real money choices. | Mission step: "You have £8. Which plan leaves something for Save?", an option gets picked, "That's it." feedback, then the skill dots fill Started → Practised. |

### 3.3 Money guide

| | |
| --- | --- |
| Copy | H2 **"Stuck? Ask."** muted second beat: "Hints first. Answers after two tries." Small line under the demo: "Off until you turn it on. You can read every chat." Link: "How the guide stays safe" → `/safety`. |
| Demo | The real guide sheet layout. A child bubble types "Why save before I spend?" (AFK's typewriter, 28 ms a character), three dots, then a reply card with the cyan "AI guide" chip: "If you save first, the saving always happens. What's left is yours to spend." plus a topic chip "Spend and Save". Plays once. |

### 3.4 Kids plan. Parents stay in charge.

Two phone frames side by side (stacked on phones): the child's Home (next-step card, Spend and Save jars) and the parent's Home ("Needs you": the due handover). Definable's connector path draws from the parent's "Hand over" button to the child's Save jar, and a gold coin travels along it (`offset-path`), then the child's Save amount rolls up. No body copy; the H2 is the whole message.

### 3.5 Safety statement, lit by scroll

One sentence at H1 size, words going from 25 % to full ink as the line crosses the viewport (Karma, Definable): **"No cards. No bank details. No ads.** The cash stays with you, and you can see every jar, purchase and chat." Under it, three quiet chips with icons: "No real payments", "Guide off by default", "Ages 11 to 14".

### 3.6 Your turn

H2 **"Your turn."** muted second beat: "Start with this week's pocket money." Primary keycap "Set up your family", link "Kids, start here". Beside it, the jar drawn as SVG at the hero jar's size, the end of the page thread: the thread arrives at its curl and draws its outline, then four coins drop in, the lid lands and the lid coin pops. The hero's jar, wound back up at the end of the page. With reduced motion the jar is simply there.

### 3.7 Footer

Wordmark, "A pocket-money pilot for families with children aged 11 to 14.", links Safety and Sign in, theme toggle. The privacy notice link joins when ADR 0008's notice exists.

**Copy budget:** 190 words from the header to the footer, buttons and chips included. For scale: Definable has about 1,500, Karma and 8x about 750.

## 4. Motion system

| Pattern | Spec | Reduced motion |
| --- | --- | --- |
| Headline word rise | Per word: `translateY(16px)` and `blur(8px)` to none, 700 ms, 60 ms stagger, expo-out `cubic-bezier(0.16, 1, 0.3, 1)` | Shown at rest |
| Section entrance | `rise-in` from `design.md` §8 (12 px, 250 ms, 40 ms stagger), triggered at 30 % in view | None |
| Scroll-driven hero scene | rAF loop, passive scroll listener; the drawn progress moves 18 % of the way toward the scroll position each frame, so wheel jumps stay smooth | A still frame |
| Stepper | Full-height steps beside a sticky rail; the active step is the one crossing the middle of the screen; the coin on the line moves to it in 500 ms | Steps stacked, all final states |
| Thread | A fixed overlay draws one path from the hero jar to the closing jar: the hero jar's outline backwards, a curve out of the curl, the How it works line, the left margin, a curve into the closing jar's curl, the closing jar's outline. Only a stretch of it shows, never a trail, always as thick as the hero jar's stroke (published as `--thread-width`, which also sizes the How it works line and the closing jar). The scroll slides the stretch along the path, the same stroke-drawing motion that builds the jar in act 1. The How it works line hides whenever the stretch is anywhere but on it | None: the line and the closing jar show as they are |
| Live demos | Scripted keyframes in CSS and small state machines; play once per entry, about 2.5 s, then hold | Final state rendered |
| Money roll | Tabular digits count to the new value, 400 ms | Final value |
| Path draw and travelling coin | SVG `stroke-dashoffset` 900 ms, then the coin on `offset-path`, 700 ms | Path drawn, coin at the end |
| Lit statement | CSS `animation-timeline: view()` per word, opacity 0.25 → 1; `@supports` fallback is full ink | Full ink |

Nothing loops except the hero's idle second. No library: CSS scroll-driven animations where supported, plus two small hooks (`useScrollProgress`, `useInViewOnce`) built on `IntersectionObserver` and rAF. No Lenis, Framer Motion or GSAP, so no new dependencies.

## 5. Hero animation

Coded in SVG (`hero-scene.tsx`, `kid-art.tsx`, `jar-art.tsx`) and drawn as a pure function of scroll progress, so scrolling back plays it backwards. The kid is drawn like the jar mark: thick round-ended strokes and flat fills, a cyan hoodie like the lid, teal trousers like the jar, dot eyes and a small smile. Gold is money only: the coins.

| Progress | Beat | Words |
| --- | --- | --- |
| 0–0.05 | Only the kid: a handful of coins cupped over the tummy, eyes on them, a wavy unsure mouth. Until the first scroll, "?" bubbles keep rising around the head, drifting, swelling and popping, each on its own loop. | H1 and buttons |
| 0.05–0.10 | The bubbles fade; the kid crouches. | |
| 0.10–0.20 | A hop, arms up in a V, and eight coins fly up from both hands, spinning. | "Spend some." from 0.15 |
| 0.11–0.25 | The view follows the coins up: the kid drops out of the bottom of the frame and fades. The coins hang near the top, drifting and spinning. | |
| 0.20–0.31 | The jar draws itself below them: the outline runs from the top-left curl, down, along the bottom and up the right. | "Save some." from 0.27 |
| 0.30–0.44 | The coins fall into the jar one after another, eight in all. | |
| 0.44–0.49 | The lid drops on and the lid coin pops in. | "Learn as you go." from 0.42 |
| 0.50 | **Checkpoint.** One jar, eight coins, centred. Pop-ups have left. | |
| 0.50–0.64 | The jar splits: the deep-teal Save jar slides out to the right, three coins hop across. | "Split it. Spend and Save." |
| 0.64–0.75 | A coin rises from Spend, flips into a ticked card and floats away. | |
| 0.76–0.88 | A stream of twelve coins pours into Save and its pile rises to about three quarters of the jar. The height of the coins is the progress: no bar, no ring, no star. | "Save for something real." |
| 0.89–0.93 | The labels fade and the Save jar slides back into Spend; its coins come too, so the one jar ends full (eighteen coins). | "Again next week. A bit wiser." from 0.895 |
| 0.93–1.00 | **The unwind.** The lid lifts away and the coins fade; the outline un-draws from its right end while its head crawls out of the curl on the left, at the jar's full thickness. | |
| after the hero | As How it works scrolls in, the stroke crawls down-left onto the 01–04 line, at the same thickness, and becomes it. Scrolling back winds it into the jar. | |
| the rest of the page | When How it works ends, the line leaves it: the same stretch slides down the left margin (on phones, along the screen's edge), its head held at one height on screen, leaving nothing behind. It weaves: in the gap above the parent and child phones it crosses to the right margin in one S-curve, runs down beside them, and crosses back in the gap below. Each piece takes its own share of the scroll: straight runs as much as they drop, each crossing about half its length (so it is not rushed), the last run into the jar half its length; the shares shrink if the page would end first. Above the Your turn card it turns in one curve into the closing jar's curl and grows back into a whole outline as it draws that jar, which is the hero jar's size; once whole, the closing jar's coins drop and the lid lands. It is always home by the end of the page. | |

| Element | Light | Dark |
| --- | --- | --- |
| Spend jar | `#057B99` | `#8AC8DF` |
| Save jar | `#004B62` | `#3D92AE` |
| Lids, hoodie | `#00D6EB` | `#00D6EB` |
| "?" bubbles (outline and mark) | `#00627D` | `#65ADC6` |
| Coins | `#FDC301` (rims `#004B62`) | same |
| Kid's trousers | `#00627D` | `#65ADC6` |
| Kid's shoes | `#003548` | `#C4F4FF` |
| Skin, hair | `#D9A07A`, `#2B1D14` | same |

## 6. Build

- `src/app/(marketing)/page.tsx` composes sections from `@/features/landing`. The page is fully static: no Supabase reads, no cookies, so it prerenders.
- `src/features/landing/components/`: `hero.tsx` (client), `hero-scene.tsx`, `kid-art.tsx`, `jar-art.tsx`, `jar-thread.tsx`, `get-started-menu.tsx`, `how-it-works.tsx`, `demos/{handover,purchase,goal,mission,guide}-demo.tsx`, `family-view.tsx`, `lit-statement.tsx`, `your-turn.tsx`, `landing-chrome.tsx` (header and footer), `structured-data.tsx`; `jar-outline.ts` (the outline geometry the jar and the thread share); `index.ts` barrel. Demos reuse `StatusChip`, the keycap and shimmer utilities and the tokens; where an app component is tied to a server action, the demo uses a presentational copy with fixed data.
- Budgets: LCP under 2.5 s on a mid-range phone on 4G (the H1 is the LCP element), JavaScript for the landing under 40 kB gzipped beyond the framework, CLS 0.
- Accessibility: one H1; every demo has an accessible name and a text equivalent; the pinned stepper is a plain ordered list to screen readers; focus never lands inside a pinned frame you can't see; 44 px targets; no horizontal scroll at 360 px.
- Tests: Playwright for every Get started menu link and both hero buttons, a reduced-motion run that asserts every headline and caption is visible, and a 360 px no-overflow check.

## 7. Open questions

1. £ or $ in the demos? £ for now.
2. Step 03 shows the savings goal, which is built later in Demo 2 (slice 3).
