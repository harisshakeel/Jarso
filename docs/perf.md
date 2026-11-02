# Performance and low-end devices

Jarso is for children aged 11 to 14, often on a hand-me-down Android phone on mobile data. This page records what the pilot-hardening pass changed, how to measure a page, and what the owner checks by hand. There is no CI gate on scores: at about 60 users a manual run before each demo is enough.

## What changed

- **One wordmark, not two.** `JarsoWordmark` renders a light and a dark artwork and the `.dark` class hides one. Both used to load eagerly, so every visit downloaded both PNGs. Both now stay `loading="lazy"` (a `display: none` lazy image is never fetched) and `priority` only sets `fetchPriority="high"`, which reaches the visible one. This is the pattern the next/image docs give under "Theme detection".
- **No Geist Mono.** Nothing renders code, so the root layout no longer loads (and preloads) a second web font on every page. `--font-mono` falls back to the system monospace stack.
- **Accessibility at phone width.** `tests/e2e/a11y.spec.ts` runs axe on every public, child and parent page at 360 px in both themes (project `a11y` in `playwright.config.ts`). Serious or critical WCAG 2 A/AA violations fail CI.
- **Brand source PNGs kept.** `public/brand/jarso-mark.png`, `jarso-wordmark.png` and `jarso-wordmark-dark.png` (0.5 to 1.4 MB) are the master artwork listed in `design.md` §1. No page requests them (the app uses the 864 px copies and `icons/`), so they cost nothing at runtime; they stay as the documented sources.

## Lighthouse mobile run

Run against a production build on the **local** Supabase stack, never the hosted project (`.env.local` points there). The commands below put the local values in the process env without printing them; `__NEXT_PROCESSED_ENV=true` stops Next.js reading any `.env*` file.

```bash
pnpm db:start
eval "$(pnpm exec supabase status -o json 2>/dev/null | jq -r '@sh "export NEXT_PUBLIC_SUPABASE_URL=\(.API_URL) NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=\(.PUBLISHABLE_KEY) SUPABASE_SECRET_KEY=\(.SECRET_KEY)"')"
export __NEXT_PROCESSED_ENV=true NEXT_PUBLIC_APP_URL=http://localhost:3000
pnpm build && pnpm start
```

In a second terminal, for the public landing page (the CLI's default is a throttled Moto G Power profile):

```bash
pnpm dlx lighthouse http://localhost:3000/ --form-factor=mobile --throttling-method=simulate \
  --only-categories=performance,accessibility,best-practices --view
```

Signed-in pages need a session, so measure them from Chrome DevTools instead: open `http://localhost:3000`, sign up a parent, add a child, sign in as the child in another profile, then DevTools → Lighthouse → Mobile, Navigation, Performance + Accessibility. Measure `/child` and `/child/learn/whats-in-spend`.

Record the result here when you run it (date, commit, scores):

| Page | Performance | Accessibility | LCP | TBT | CLS | Date / commit |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | | | | | | |
| `/child` | | | | | | |
| `/child/learn/whats-in-spend` | | | | | | |

Rough targets for the pilot: Performance 80+, Accessibility 95+, LCP under 2.5 s, CLS under 0.1 on the throttled profile.

## Manual low-end device checklist (owner)

Use the slowest real phone available (ideally an Android with 2 to 3 GB RAM), Chrome, on mobile data or DevTools "Slow 4G".

- [ ] First visit to `/` shows the heading and the sign-in buttons within about 3 seconds; nothing jumps as fonts and images arrive.
- [ ] Only one wordmark downloads (DevTools → Network, filter `wordmark`), in both themes.
- [ ] Child sign-in with family code, nickname and PIN works with the on-screen keyboard open; the PIN field is not hidden behind it.
- [ ] Child home: jars, amounts and the next step render without horizontal scroll at 360 px; tapping a jar opens its detail on the first tap.
- [ ] A full mission: every step's input is reachable with the keyboard open, Check and Continue respond on the first tap, the coach bubble and feedback do not cover the input.
- [ ] Diary: "Spent something?" sheet opens, amount keyboard is numeric, saving shows the line straight away.
- [ ] Turn on the system "Remove animations" (Android) or "Reduce motion" (iOS): no spinning, sliding or bouncing remains, and nothing is missing.
- [ ] System font size at its largest: text wraps, no clipped buttons, every target still easy to tap.
- [ ] Dark theme: all text readable, the wordmark tile looks intentional.
- [ ] Airplane mode mid-mission and mid-diary entry: the offline notice shows and the answer or entry is not lost.
- [ ] TalkBack (Android) on the child home and one mission step: every control says what it is, the progress and the feedback after Check are read out.
- [ ] Scrolling a long history or diary list stays smooth (no visible stutter).
