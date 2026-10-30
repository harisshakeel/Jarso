# Landing page — design

Date: 2026-10-30. Status: first build on `feat/landing-page`, awaiting the product owner's feedback; the hero runs on a coded jar scene until the generated video arrives. Roadmap: Demo 2, slice 4 (`docs/roadmap.md`). Builds on `docs/design.md` (tokens, type, voice, motion) and replaces today's sign-in page at `/`.

## 1. Intent

One page that shows what Jarso does, mostly by moving rather than telling. A parent should understand the loop (allowance, Spend and Save, a goal, a daily mission, the guide) in under a minute of scrolling, and a child should find "I'm a kid" without reading anything else.

**Goals**

- Show the product working: real Jarso components, rendered live with demo data, animate through each step. No screenshots, no stock illustration.
- A scroll-driven hero video that tells the money loop without words.
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

Sticky, canvas at 85 % with a 16 px blur and a hairline once scrolled (`design.md` §4). Left: the mark and "Jarso" (the opaque wordmark can't sit on paper, `design.md` §1). Right: "How it works" (anchor) and "Safety" (`/safety`) from 768 px, then "Log in" (ghost, `/login`) and "Sign up" (primary pill, `/signup`), then the theme toggle. Kids reach their PIN sign-in from the hero's "I'm a kid" and from the login page's "Are you a kid?" link.

### 3.1 Hero, scroll-scrubbed video

| | |
| --- | --- |
| Copy | H1 **"Spend some. Save some."** Line: "Your child plans their pocket money. You stay in the loop." Buttons: "Set up your family" (primary pill, keycap), "I'm a kid" (outline pill). |
| Layout | Section 450 vh desktop, 320 vh phones; a sticky `h-svh` stage. The H1, line and buttons sit above the jar; the captions take the strip below it. The video's edges fade into the canvas with a radial `mask-image`, so a slight colour mismatch never shows a box. |
| Motion | H1 words rise 16 px and unblur from 8 px, 60 ms apart, 700 ms, `cubic-bezier(0.16, 1, 0.3, 1)`. At scroll 0 the clip's first second loops slowly. The H1, line and buttons fade out over the first 8 % of the scroll; the video then scrubs with the scroll (AFK's mapping). Four HTML captions fade in and out at the video's beats, eyebrow style, bottom centre: "Allowance day." · "Split it. Spend and Save." · "Save for something real." · "Again next week. A bit wiser." |
| Reduced motion | No pinning and no scrubbing. The section is one screen: poster image, H1, line, buttons, the four captions as a short list, and a "Play" button that plays the clip once at normal speed. |
| Slow or save-data connections | `navigator.connection.saveData` or 2G: poster only, captions as a list. |

The clip and its prompts are in §5 and Appendix A.

### 3.2 How it works, pinned stepper (`id="how"`)

Four steps, each 80 % of a screen tall on desktop, beside a sticky rail of big outlined numerals "01" to "04" whose active one fills in, with a progress line (8x's ruler, the portfolio's numerals, Karma's step-by-step story without pinning). Each step is a two-beat H2, one line, and a **live demo** on the right built from Jarso's own components with demo data. A demo plays once when its step becomes active (about 2.5 s), then holds its final state. On phones the steps stack and the rail becomes AFK's vertical route line that draws as you scroll; each demo plays when it is 40 % in view.

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

H2 **"Your turn."** muted second beat: "Start with this week's pocket money." Primary keycap "Set up your family", link "Kids, start here". Beside it, the jar mark drawn as SVG: on entering view, three coins drop in with one `rotateY` flip each (`design.md` §8), once.

### 3.7 Footer

Wordmark, "A pocket-money pilot for families with children aged 11 to 14.", links Safety and Sign in, theme toggle. The privacy notice link joins when ADR 0008's notice exists.

**Copy budget:** 190 words from the header to the footer, buttons and chips included. For scale: Definable has about 1,500, Karma and 8x about 750.

## 4. Motion system

| Pattern | Spec | Reduced motion |
| --- | --- | --- |
| Headline word rise | Per word: `translateY(16px)` and `blur(8px)` to none, 700 ms, 60 ms stagger, expo-out `cubic-bezier(0.16, 1, 0.3, 1)` | Shown at rest |
| Section entrance | `rise-in` from `design.md` §8 (12 px, 250 ms, 40 ms stagger), triggered at 30 % in view | None |
| Scroll scrub (hero video) | rAF loop, passive scroll listener, `currentTime` lerps 10 % toward the target each frame; paused when off screen | Poster and Play button |
| Pinned stepper | `position: sticky` frame; the active step is `floor(progress × 4)`; steps crossfade 300 ms; rail fills with progress | Steps stacked, all final states |
| Live demos | Scripted keyframes in CSS and small state machines; play once per entry, about 2.5 s, then hold | Final state rendered |
| Money roll | Tabular digits count to the new value, 400 ms | Final value |
| Path draw and travelling coin | SVG `stroke-dashoffset` 900 ms, then the coin on `offset-path`, 700 ms | Path drawn, coin at the end |
| Lit statement | CSS `animation-timeline: view()` per word, opacity 0.25 → 1; `@supports` fallback is full ink | Full ink |

Nothing loops except the hero's idle second. No library: CSS scroll-driven animations where supported, plus two small hooks (`useScrollProgress`, `useInViewOnce`) built on `IntersectionObserver` and rAF. No Lenis, Framer Motion or GSAP, so no new dependencies.

## 5. Hero video

**Story, 12 s, one continuous shot, no words.** The Jarso jar is the only character. The coded scene on the live page (`hero-scene.tsx`) plays the same beats at the same times, so the video can replace it without moving the captions: scroll progress maps to video time as `progress × 12 s`.

| Time | Beat | Caption shown in HTML |
| --- | --- | --- |
| 0.0–1.0 s | Idle: one Spend jar, centred, three coins inside; the lid coin bobs. Loops before the first scroll. | — |
| 1.0–3.6 s | Allowance: the lid hinges open (1.0–1.3 s), five coins fall in one after another (1.2–3.6 s), the lid closes (3.2–3.6 s). | Allowance day. |
| 3.8–6.5 s | Split: a second jar, the Save jar in deep teal, slides out from behind to the right while the Spend jar slides left (3.8–5.0 s); three coins hop across in arcs (5.2–6.5 s). | Split it. Spend and Save. |
| 6.5–7.7 s | Spend: a coin rises out of the Spend jar, flips once, becomes a small white card with a tick, and floats up and away. | (same caption) |
| 7.9–10.3 s | Save: a pale track circles the Save jar, a thick gold ring fills it from a third to three quarters (8.2–9.8 s), a star pops at the top (9.8–10.3 s). | Save for something real. |
| 10.6–12.0 s | Reset: the ring fades, the Save jar slides back behind the Spend jar and disappears, three coins remain. The last frame is the first frame. | Again next week. A bit wiser. |

**Exact colours** (the tokens the page renders; `design.md` §2):

| Element | Light | Dark |
| --- | --- | --- |
| Background, edge to edge | `#F7F5F0` | `#0B1F26` |
| Spend jar body | `#057B99` | `#8AC8DF` |
| Save jar body | `#004B62` | `#3D92AE` |
| Lids (both jars) | `#00D6EB` | `#00D6EB` |
| Coin face, lid coin, star, ring | `#FDC301` | `#FDC301` |
| Coin rim | `#004B62` | `#004B62` |
| Star outline | `#705300` | `#705300` |
| Ring track | `#C4F4FF` | `#003548` |
| Receipt card | `#FFFFFF` | `#12303A` |
| Tick on the card | `#00627D` | `#65ADC6` |
| Contact shadow under each jar | `#141C1F` at 7 % | `#E6F1F4` at 7 % |

Gold is money only: coins, the ring and the star. Never a gold jar.

**Files and encoding**

- One 16:9 clip serves every screen: phones crop the sides, so all the action stays inside the middle 62 % of the width. A light version first, then the dark version from the same prompt.
- Re-encode for scrubbing: H.264 MP4 and AV1 or VP9 WebM, a keyframe every 6 frames, no audio, 1920 and 1280 px wide, each under 2.5 MB; the first frame as an AVIF and JPEG poster. This needs `ffmpeg`, which is not installed on this Mac.
- `public/landing/hero-{light,dark}.{mp4,webm}`, `hero-{light,dark}-poster.{avif,jpg}`, `hero.vtt` with the four beats; add `mp4|webm|vtt|avif` to the proxy matcher's static list in the same change.
- The `<video>` is `muted playsinline preload="auto"` with `aria-hidden`, because the HTML captions carry the meaning.

## 6. Build

- `src/app/(marketing)/page.tsx` composes sections from `@/features/landing`. The page is fully static: no Supabase reads, no cookies, so it prerenders.
- `src/features/landing/components/`: `hero.tsx` and `hero-video.tsx` (client), `how-it-works.tsx`, `demos/{handover,purchase,goal,mission,guide}-demo.tsx`, `family-view.tsx`, `lit-statement.tsx`, `your-turn.tsx`, `landing-header.tsx`; `index.ts` barrel. Demos reuse `StatusChip`, the keycap and shimmer utilities and the tokens; where an app component is tied to a server action, the demo uses a presentational copy with fixed data.
- Budgets: LCP under 2.5 s on a mid-range phone on 4G (the poster is the LCP element), JavaScript for the landing under 40 kB gzipped beyond the framework, CLS 0.
- Accessibility: one H1; every demo has an accessible name and a text equivalent; the pinned stepper is a plain ordered list to screen readers; focus never lands inside a pinned frame you can't see; 44 px targets; no horizontal scroll at 360 px.
- Tests: Playwright for both sign-in paths and the parent CTA from the hero and the header popover, a reduced-motion run that asserts every headline and caption is visible, and a 360 px no-overflow check.

## 7. Open questions

1. Is "Spend some. Save some." still the line? It is today's sign-in headline, and it says the product in four words.
2. £ or $ in the demos?
3. Does step 03 wait for the savings goal, or ship first with step 03 hidden?
4. Dark hero video: generate a dark version, or keep the hero light in both themes?

## Appendix A. Prompts for ChatGPT

Attach `public/brand/jarso-mark.png` (the transparent mark) and `public/brand/jarso-wordmark.png`, then paste A.1. Generate the still (A.2), approve it, then animate it (A.3). The live page at https://jarso.vercel.app plays the same animation in code: scroll the first screen to watch it.

### A.1 Brand brief (paste first)

```text
You are making the hero animation for Jarso. Use this brief for everything in this chat.

WHAT JARSO IS
A pocket-money app for children aged 11 to 14 and their parents. The parent hands over an allowance in cash; the child splits it into two jars, Spend and Save, records purchases, saves toward a goal and does short daily money lessons. Warm, calm, encouraging. Never flashy, never babyish.

THE LIVE SITE
https://jarso.vercel.app. Open it and scroll the first screen slowly: the page already plays this exact animation as a flat drawing. Your video replaces that drawing, so match its shapes, colours, positions and timing.

THE LOGO (attached)
A jar drawn as one thick, round-ended stroke: up the right side, round the bottom, up the left side, and at the top left the stroke curls in an S toward the lid like a hinge. The lid is a separate rounded bar on top. A round gold coin sits just right of the lid, like the dot of a letter j. Inside, flat gold coins lie at the bottom: two stacked on the left with a thin dark rim between them, one on the right. The wordmark is "jarso" in heavy rounded lowercase. Never redraw, distort or recolour the logo itself.

EXACT COLOURS (hex, no substitutes)
Light version:
- Background, edge to edge: #F7F5F0
- Spend jar body: #057B99
- Save jar body: #004B62
- Lids: #00D6EB
- Coins, the lid coin, the ring and the star: #FDC301
- Coin rims: #004B62
- Star outline: #705300
- Ring track: #C4F4FF
- Receipt card: #FFFFFF with a tick in #00627D
- Soft contact shadow under each jar: #141C1F at 7% opacity
Dark version (only when asked): background #0B1F26, Spend jar #8AC8DF, Save jar #3D92AE, ring track #003548, receipt card #12303A with a tick in #65ADC6, shadow #E6F1F4 at 7%. Lids, coins, rims, ring and star keep their light-version colours.
Gold means money: it is only ever coins, the ring and the star. Never draw a gold jar.

STYLE
Flat 2D vector motion graphics. Thick strokes with fully round ends, flat fills, no outlines in other colours, no gradients, no textures. Depth only from the soft contact shadow. Calm, precise easing: every motion settles before the next begins. One locked camera.

NEVER INCLUDE
Any text, letters, numbers or currency symbols; people, hands, faces or characters with eyes; any logo other than the jar; gradient, textured or vignetted backgrounds; floor lines or horizons; glitter, sparkles, confetti, lens flares, light rays; glossy or 3D plastic rendering; motion-blur trails; camera moves, zooms or shake; cuts, fades to black or transitions.
```

### A.2 Still frame (image, 16:9)

```text
Make a 16:9 image, 1920 x 1080: the first frame of the animation.

A single Jarso jar exactly like the attached mark, centred horizontally, its centre slightly below the middle of the frame, and about 30% of the frame's height tall. Jar body #057B99, lid #00D6EB, the lid coin #FDC301 just right of the lid, and inside three flat coins #FDC301 with #004B62 rims (two stacked on the left, one on the right). A very soft contact shadow under the jar, #141C1F at 7% opacity. Background #F7F5F0, perfectly flat from edge to edge: no vignette, texture, floor line or horizon. Nothing else in the frame. Flat vector style, crisp edges, no text.
```

### A.3 Animation (video, from the still)

```text
Animate the attached still into a 12-second, 16:9 clip, 24 or 30 frames per second, no audio. One continuous shot; the camera is locked off, front view, with no zoom, pan or shake. The background stays exactly #F7F5F0 for the whole clip. No text, numbers or symbols at any time. Keep every element inside the middle 62% of the frame's width. Smooth, calm easing; each motion settles before the next starts.

0.0-1.0 s IDLE: almost still. The lid coin bobs up and down slightly. This first second must loop seamlessly on its own.

1.0-3.6 s ALLOWANCE: at 1.0 s the lid (#00D6EB) hinges open, pivoting up and to the left from its left end, about 28 degrees. From 1.2 s, five coins (#FDC301 with #004B62 rims) fall in from the top of the frame one after another, about half a second apart, and land in the jar with one small bounce each, stacking on the three already there (eight in total). At 3.2-3.6 s the lid swings shut.

3.8-5.0 s SPLIT: a second jar of exactly the same shape, the Save jar, body #004B62, lid #00D6EB, no lid coin, slides out from behind the first to the right, while the first jar (the Spend jar, #057B99) slides left. They end side by side with a small gap, the Spend jar centred at 39% of the frame's width and the Save jar at 61%.

5.2-6.5 s three coins, one after another, hop in neat arcs from the top of the Spend jar into the Save jar. The Spend jar now holds five coins, the Save jar three.

6.5-7.7 s SPEND: one coin rises straight up out of the Spend jar, flips once around its vertical axis and, as it turns edge-on, becomes a small rounded white card (#FFFFFF) with a tick (#00627D), which floats up and fades out. Four coins remain in the Spend jar.

7.9-10.3 s SAVE: a thin pale ring track (#C4F4FF) fades in around the Save jar, a circle about half the frame's height across. From 8.2 s a thick gold ring (#FDC301, round ends) draws clockwise along the track from the top, from one third to three quarters full, finishing at 9.8 s. At 9.8 s a small five-point star (#FDC301, outlined #705300) pops at the top of the ring with a slight overshoot.

10.6-12.0 s RESET: the ring and star fade out; the Save jar slides back behind the Spend jar and disappears; the Spend jar slides back to the centre with three coins, the lid coin back beside its lid. The final frame is identical to the first frame, so the clip loops.

Style: flat 2D vector motion graphics in the Jarso brand, thick round-ended strokes and flat colours from the brief, soft contact shadows only. No people, hands, faces, eyes, extra logos, gradients, sparkles, confetti, motion-blur trails, cuts or transitions. Gold is only ever coins, the ring and the star.
```

### A.4 Dark version (after A.3 is approved)

```text
Same clip, same timing, positions and motion. Change only these colours: background #0B1F26 for the whole clip, Spend jar body #8AC8DF, Save jar body #3D92AE, ring track #003548, receipt card #12303A with a tick in #65ADC6, contact shadow #E6F1F4 at 7%. Lids #00D6EB, coins #FDC301 with #004B62 rims, the ring and the star stay as they were. The last frame still matches the first.
```

If the 12-second clip comes out messy, generate it as three 4-second clips (0-4, 4-8, 8-12 s), each starting from the last frame of the one before; they can be joined when the clip is re-encoded.
