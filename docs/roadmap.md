# Roadmap

Jarso was built in ten days, from 28 October to 6 November 2026, by two people: Pratyush Sharma (`pratyush618`) and Haris Shakeel (`harisshakeel`). In that time it became a web app for children and parents and an Expo phone app on the same Supabase backend, delivered in more than 130 merged pull requests. Each larger slice started from a design spec and a plan in `docs/superpowers/`, then landed as one pull request with CI green, squash-merged onto `main` in nearly every case; the Supabase GitHub integration applied its migrations to the hosted database on merge. This page records what shipped each day, what the three demos covered by FR, and what comes next. The status of every FR is verified in `docs/fr-audit.md`. Numbers are pull requests; dates are merge dates in UTC.

## Delivered, day by day

### Wednesday 28 October

- **Foundation.** The Next.js and Supabase scaffold with CI (#1).
- **Scope.** The requirements for a parent and child pilot built around a parent handing over pocket money (#7).

### Thursday 29 October

- **Plan.** The first-milestone design and the pilot decisions (#9).
- **Family accounts (FR13).** Families, invitations by link and short code, child PIN sign-in and both onboarding paths (#10, #12, #13); parent settings to rename a child, reset a PIN or remove a child (#16); parent details before a parent acts (#17, #22); sign-in logging (#15).
- **Allowance and jars (FR01, FR03).** Schedules, one-time gifts and the handover split into Spend and Save (#18); the parent's Home, child page and allowance tab (#19); fixes from review (#23, #24, #25).
- **Learning (FR06, FR08, FR10).** Seven-day missions, topic pages, spaced practice and skill progress (#28).
- **Money guide (FR07, FR09).** The guide on Claude with input and output screens, a parent switch and evals (#29).
- **Platform.** Hosted auth settings managed from `config.toml` (#14), the hosted deploy and migration history (#21), a one-click light and dark theme with the dark wordmark (#20, #26), and the slice 2 checkpoint audit (#27).

### Friday 30 October

- **Diary and rules (FR04, FR14).** Purchases, money rules and the overspend rule (#30, #31).
- **Inbox (FR16, FR01).** The in-app inbox and handover reminders (#37).
- **Jarso, the agent (FR07).** "Ask Jarso", which reads the child's own data (#38), on by default with a parent switch (#39), and guide spend capped at US$100 a month (#32).
- **Slow networks.** Jarso stays usable on slow and offline networks: no call waits forever, and purchases queue on the device (#33).
- **Landing page.** A scroll-driven page with the coded hero, the jar's outline as one thread, SEO and a sitemap (#34, #35).
- **Plan.** Demo 2 and the final demo, by FR (#36).

### Saturday 31 October

- **Requests (FR14, FR03, FR15).** Savings withdrawals and deposits with reservations (#40), and emergency funds granted into Spend (#45).
- **Savings goal (FR02).** One goal per child with a plan per allowance and payments left (#41).
- **Jar Home (FR12).** The child's Home built around the two jars, a Diary tab, and "Needs you" on the parent's Home (#42).
- **Notifications (FR16).** A live inbox over Supabase Realtime (#43), and web push with app install (#49, #51).
- **Jarso.** Reads the savings goal and requests (#44), and remembers short facts that the child and parent can see and delete (#47).
- **Learning (FR05, FR11, FR12).** The weekly review, the comeback task and predict before deciding (#46, #48).
- **Pilot readiness.** The privacy notice, a deep health check and the pilot measure queries (#50); the FR audit brought up to date (#52).

### Sunday 1 November

- **Card handover (FR01).** Paying an allowance or gift by card through Stripe or Razorpay in test mode, with saved cards and auto charge (#56), and the auto charge columns kept from children (#61).
- **Diary complete (FR04).** "What was it for?" chips, money received from other sources, fixes with a trail, and "Where your money went" (#65).
- **Child-first screens.** A text floor, plain words and calm errors (#54); cards and sentences instead of tables (#55); jars first, with a tap on a jar for its actions (#57); parent tabs, rules as sentences and earned moments (#62); a lesson road and a playable How it works (#63); settings on the rail and an avatar in the header (#67).
- **Landing page.** Tuned for phones and for scrolling (#64, #66, #68).
- **Record.** Who built what, by area and pull request (#53).

### Monday 2 November

- **Monorepo.** The web app moved into a pnpm and Turborepo workspace, with shared packages for config, database types, content, brand and pure domain code (#72, #73, #75).
- **Jarso.** Says where it is while it works and why a reply was held back (#70); a full-page Jarso chat, and parents asking Jarso about their child (#80).
- **Child Home.** A graph of how the jars moved (#69), fitted to a laptop screen (#76).
- **Characters and sound.** Four coach characters and a blackboard in missions and across the child's screens (#71, #77), and sounds (#80).
- **Parent Home.** The family's week and each child's latest lines (#78).
- **CI.** End-to-end tests in two shards, cached builds and runs that skip what a change cannot affect (#81, #82, #83, #84).

### Tuesday 3 November

- **Jarso does tasks.** Jarso prepares a purchase, a move between jars, money received or a goal, and nothing happens until the person confirms with a tap; a photo price check reads a price tag and offers a goal (#85).
- **Parent dashboard.** A family view with Jarso's summary, a note to a child and matching a child's own saving (#85).
- **Jarso noticed.** Weekly nudges for the child and their parents (#87), and an allowance-day plan with a one-tap Save split (#86); guide fixes (#92, #95); FR07 and FR09 closed for the pilot (#93).
- **Desktop.** A desktop redesign of the child and parent screens (#90).
- **Phone app.** The Expo child app, waves 1 and 2, at parity with the web child app (#94).

### Wednesday 4 November

- **Phone app.** Parents on the phone and a calmer type scale (#98); native push with child quiet hours and per-phone settings (#97, #101); native card payments in the Stripe and Razorpay sheets (#96, #102); Android release builds and local APKs (#108, #114, #123); pilot feedback and web parity (#103, #112, #128).
- **Learning.** Points and days in a row, never a run lost (#109); a lesson step read aloud (#110); "My bests", a board of one (#111); a success dialog and a clearer try again (#118, #119); animated lesson intros and check-in pictures (#122); each question on one screen (#124); Jarso knows the lesson question (#117).
- **Parent web.** A simple Home, a Children tab and a Money tab, with learning first (#115, #116); the lesson road, family jars and goals, with each child shown as a coach kid (#121, #126).
- **Polish.** Bell-like sounds and a mission fanfare (#107); a UI audit batch for copy, dead ends, dark mode and tap sizes (#125); guide fixes (#105, #127).

### Thursday 5 November

- **Welcome tour.** A game-style first visit led by the child's own buddy (#138).
- **Lessons.** A recorded voice for the lesson films (#139).
- **Child dashboard.** A simpler dashboard with fewer words (#140).
- **Phone app.** Settings and Me as short menus (#129); provider logos and a card block that loads with the handover sheet (#131); push sign-up fixes (#135, #136); the wave 3 design, plans and mockups (#133).

### Friday 6 November

- **Phone kid rework.** The foundation: Jarso as a mascot with moods, keycap buttons, celebrations and sound (#141).
- **Progress.** Sparks awarded inside the database with daily caps, levels, badges and a forgiving streak (#143).
- **The phone's kid app.** A new child Home with Jarso, the streak and Sparks, a gold + button with keypad money flows that end in a celebration, and a tracker for each ask (#145); jar pages with weekly bars and a goal ring with milestone stars (#146); Learn as a quest map with picture answers and calm answer sheets, and a daily check-in (#147).
- **Fixes.** Sign-up and sign-in forms keep what a person types while the page loads (#144); CI port reservations (#142).

## Demos

Three demos, each a working slice of the pilot in `REQUIREMENTS.md`. Every row below shipped on `main`. All thirteen first-milestone acceptance criteria are met (`docs/fr-audit.md`).

| Demo | FR | What it covers | Shipped in |
| --- | --- | --- | --- |
| **Demo 1:** real pocket money, and learning about it | FR13 | Family accounts, invitations, child PIN sign-in, parent settings | #10, #12, #16, #17 |
| | FR01, FR03 | Allowance schedules, gifts, handover split into Spend and Save | #18, #19 |
| | FR04, FR14 | Purchases with undo, the overspend rule, money rules, limit notices | #30 |
| | FR06, FR08, FR10 | Daily missions with hints, topic pages, skill progress | #28 |
| | FR12 | The next learning step on the child's Home | #28 |
| | FR07, FR09 | The money guide with its screens, parent switch and evals | #29, #32 |
| **Demo 2:** the whole family money loop | FR14, FR03 | Deposits and withdrawals with reservations, cap, auto-approve and auto-confirm | #40 |
| | FR16, FR01 | Inbox, unread badge, handover reminders, live updates | #37, #43 |
| | FR02 | Savings goal, plan, progress and payments left | #41 |
| | FR12, FR04, FR10 | Jar Home, Diary tab, parent "Needs you", skills learned | #42 |
| | FR07, FR09 | Ask Jarso with look-ups of the child's own data, goal and requests, memory | #38, #39, #44, #47 |
| | FR01 | Card handover and auto charge, Stripe and Razorpay in test mode | #56 (web); #96, #102 (phone) |
| | Design | Landing page | #34, #35 |
| **Final demo:** the full pilot | FR15 | Emergency funds: request, decision, grant into Spend | #45 |
| | FR04 | Diary complete: money received, categories, traceable fixes | #65 |
| | FR05 | Predict before deciding: a guess, the real answer, a what-if slider | #46, #48 |
| | FR11 | Weekly review with a fresh question | #46 |
| | FR12 | Comeback task after days away | #46 |
| | FR16 | Web push and app install; native phone push | #49, #51, #97, #101 |
| | FR13 | Privacy notice, deep health check, pilot measure queries | #50 |

Beyond the three demos, the same ten days added the phone app for children and parents, Jarso doing tasks on confirmation, the parent dashboard, weekly nudges, the welcome tour, and the points, bests and progress system.

## Gamification rules

These apply to every child screen, on the web and the phone (FR12, `docs/design.md` §8 to §10, `docs/domain.md` invariant 21, child safety):

- Rewards follow understanding and thoughtful decisions, never the amount of money a child has or saves. Sparks have fixed values and daily caps, and are awarded inside the database.
- Streaks are forgiving: one rest day a week, and a broken streak is never mentioned. No "you missed a day" messages, no countdowns, no pressure to return.
- No random rewards, loot boxes, or anything bought with money.
- No leaderboards or comparisons between children. "My bests" is a board of one.
- Celebration only on child screens, once per moment. Reduced motion turns it into a plain state change.

## Pilot scope

Decided for the pilot (`REQUIREMENTS.md`, `docs/fr-audit.md`):

- The parent chooses the Spend and Save split at handover (FR03).
- Card handover runs in Stripe and Razorpay test mode by decision (ADR 0013, 0014, 0018). Real money waits for a separate decision and a legal review.
- Notices reach families in the inbox and by web and phone push. Email carries invitations only, once a sending domain is configured.
- Bank connections, live fund tracking and investments belong to later versions.

## Next

The next steps take Jarso to a pilot with real families.

- **Sign-up email.** Custom SMTP, push the confirmation template (link and code) and `otp_length = 6`, then email confirmation back on (`docs/auth.md`, Hosted setup). The phone's sign-up already handles both (plan 9).
- **Jarso for pilot families.** Run the guide eval gate (every safety and personal case routed correctly, no FR09 breaks, at least 95% helpful), then a UK and US legal review.
- **Accessibility and performance.** A pass on a real low-end phone before families join.
- **Pilot measures.** Agree the pilot's period and success thresholds, then read the measures in `docs/pilot-measures.md`: first flows completed, weekly return, due-to-handover time, journey completion, understanding, unanswered requests and balance errors.
- **Operations.** An uptime monitor on `/api/health?deep=1`, and a lawyer's review of the privacy notice before Jarso opens beyond the pilot.
- **Product decisions.** Pilot countries and stronger parental verification.
- **Phone app.** Carry the kid rework through its remaining plans (`docs/superpowers/specs/2026-11-06-mobile-kid-rework-design.md`).
