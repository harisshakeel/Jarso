# Functional requirements audit — 2026-10-31

State of `main` after the slice 2 checkpoint (#18–#27) plus the learning track (#28), the AI money guide (#29) and purchases and money rules (#30), and of the hosted database, against `REQUIREMENTS.md` and the first-milestone spec (`docs/superpowers/specs/2026-10-28-first-milestone-design.md`). Verified from the source tree, migrations, tests, CI runs and the hosted catalog, not from PR descriptions.

Legend: **Built** = on `main`, usable end to end, tested, live on production · **Partial** = some pieces built, not usable for the whole requirement · **Not started** · **Later** = deferred by decision.

## Per requirement

| FR | Requirement | Status | What exists | What is missing | Slice |
| --- | --- | --- | --- | --- | --- |
| FR01 | Allowance schedule and handover | **Built** | Weekly, monthly, every 3 months and yearly schedules; due exactly once from the hourly `generate-due-occurrences` job; change, pause (through a date or until resumed), resume, stop; handover with the Spend/Save split starting from the last split; not given (S10); one-time gifts that stay hidden from the child until handover (S2–S5); due badges on both sides; child allowance card and history. The hourly `send-handover-reminders` job (minute 7) gives the parent an `allowance_due` notice on the due day and a `handover_reminder` every 3 days while the allowance is still due; the child gets only the `allowance_due` notice. Gifts get no notices. An occurrence first seen late waits for its next 3-day mark. Card handover (a test-mode showcase, ADR 0013): pay a due allowance or gift by card through the Stripe or Razorpay test-mode provider (several can be on; the parent picks one at checkout) or the fake provider, save a card per provider, auto charge per schedule or gift (each toggle uses one provider's card), `card_charge_failed` notice, "paid by card" in history. Off by default: a provider is on only when its keys are set (ADR 0014). | Real payments stay out of the pilot; the manual pass against real Stripe and Razorpay test mode is for the deployer (`docs/deploy.md`). Razorpay limits: INR only, recurring on cards enabled by Razorpay support, test tokens last 3 days, an auto charge settles in up to 72 h, a deterministic charge failure shows only when that window expires, the 1 rupee save-card charge is not refunded, and a provider whose keys are removed leaves its saved card and toggles in place (nothing is charged) until it is turned back on. | 2, 5 |
| FR02 | Personal savings goal | **Built** | One active goal per child (`goals`) with name, emoji, price and the child's own plan per allowance; progress counts Save less reserved withdrawals, never due or pending money; payments left from the plan, updated as the plan or balance changes; goal sheet with a live estimate; on child Home the Save jar fills to the goal's line and the goal-reached moment shows once in "Do this next"; the parent's child card shows the goal line; the plan shown to the parent on the handover screen without changing the split. | — | Demo 2 |
| FR03 | Spend and Save jars | **Built** for the pilot scope | `ledger_entries`, `balance()`, `list_ledger_history`; confirmed balances per jar with due shown separately; the handover records the actual split; child and parent history; money moves between jars through savings deposits and withdrawals (FR14), which show as their own history rows; child Home draws Spend and Save as jars, the Save jar filling to the goal's line (counted money, a hatched band for money waiting to come out, due money as a coin outside). | Child split planning is deferred by decision (REQUIREMENTS FR03 and S6: the parent decides the split at handover; confirmed by the product owner on 2026-10-31). Nothing else is missing. | 4 |
| FR04 | Money diary | **Built** | Child records purchases (amount, a category chip, optional name) and money received from other sources ("Got money": amount, where it came from, Spend or Save jar; counts at once, no approval). Lines carry a category emoji. Tapping a line opens its detail: Fix this (amount, category or name, as a reversal plus a new line in a chain, within 7 days of the first line), Undo (within 24 hours of the first line, for purchases and money received) and earlier versions; a fixed line reads "Fixed · was …". "Where your money went" card on the Diary and the parent's history (this week's spending by category and money in, as sentences). Parents get `money_received` and `entry_corrected` notices; the weekly review and the guide's history look-up know the category and received money. Money received and fixes are online only. | — | 3, later |
| FR05 | Predict before deciding | **Built** | Before a move that touches savings, the child predicts what it does to their goal (further off, the same, closer), then sees the real answer with a plain explanation and a what-if slider that moves no money (`features/goals/predict.ts`, `PredictStep`). Wired into the take-out and put-in sheets and into changing a goal's plan, whenever there is an unreached goal. Spending from Spend leaves the estimate where it was, which the weekly review's decision line states. | A prediction before a purchase: the diary is complete now, so the hook can be built into the purchase sheet. | goals |
| FR06 | Interactive daily learning | **Built** | Seven-day journey of missions (6–8 steps: choices, amounts, a Spend/Save slider, sorting, matching, predictions, reasons) with instant feedback, two free hints, two tries, missed steps replayed at the end, progress kept between visits, and spaced practice from a review pool in new situations (boxes of 1, 3, 7, 14 days). ADR 0009. | — | learning |
| FR07 | AI money guide (Jarso) | **Built, behind a flag** | Claude Sonnet 5.5 answers with Claude Haiku 5.5 input and output screens (ADR 0010, 0011); "Ask Jarso" at the top of the child's Home with read-only look-ups of the child's own jars (with money waiting to come out or go in), allowance, history, rules, savings goal, requests and learning, and a saving plan for a price the child gives; a memory of short typed facts the child told it (interests, what they're saving for, what's tricky, how they like help; never amounts or personal details), at most 20 for 90 days, shown to child and parent with Forget; figures filled in by the app from the look-ups; status lines while it works; on by default, and a parent can turn it off per child (told on the add-child form); topic, "Help me" and "Why?" entries; hint ladder that keeps the answer back until two tries; topic links and an optional check; thumbs up or down; rate limits, daily and monthly budgets and a circuit breaker. | Switch on for real families after the eval gate passes and a UK/US legal review. | guide |
| FR08 | Related learning material | **Built** | Five topic pages with an explanation, a worked example and a practice question; missions link to them after a wrong answer and back again; guide answers link to them. Opening a topic never changes progress. | — | learning, guide |
| FR09 | Guide boundaries | **Built, behind a flag** | Frozen prompt with the FR09 rules; input screen (off topic, personal details, safety, unsafe, jailbreak) and output screen; reviewed fixed copy; helplines and an emergency line for safety; contact details scrubbed; parents read every chat, flagged first; 30-day text retention; public `/safety` page; states the child's own figures but never judges or compares them, look-ups only after the input screen, parents told about the data on the add-child form, parents see what was looked at; 180 eval cases with a four-part gate. | The eval run itself (needs the key), and legal review. | guide |
| FR10 | Learning progress | **Built** | Five-question check-in before mission 1 (places, no score); skill levels Started, Practised, Got it from first-try answers, reasons and hint use; shown apart from money for the child and on the parent's learning page. | — | learning |
| FR11 | Weekly review | **Built** | `features/review`, computed in code from what the week's screens already read: received (allowances, gifts, extra money), spent, net into Save and still due for Monday to Sunday; the goal line; one decision and its effect on the plan (the biggest move into or out of Save, else the biggest purchase, which leaves the goal where it was, FR05); a skill that moved up this week and one worth another look; a fresh question from the review pool on a learned skill, played like practice. "Your week" on Home from Friday to Monday, and always at `/child/learn/week`. Praises thinking, never amounts. | — | review |
| FR12 | Return experience | **Built** | Child Home opens on one next step: a reached goal (shown once, no confetti), a withdrawal a parent said yes to, then the learning order (an unfinished mission, due practice, the check-in, the next mission), a nudge to set a goal, or all done; missions resume at the step the child left; skills learned shown as counts that only go up; open requests as lines under their jar; after three or more days without learning, Home offers one fresh question ("Welcome back. One quick question?") instead of the next mission, never a backlog or a missed-days message. | — | learning, later |
| FR13 | Family accounts and onboarding | **Built** | Families, members, invitations (link and short code), child PIN sign-in with lockout, rate limits, audit log, both onboarding paths. Parent settings in tabs: family, children (rename, reset PIN, remove per ADR 0007), and the parent's own details. Parent profile completion behind a blocking dialog (ADR 0008); reads stay open, actions are gated in the app. A child with money history keeps their account when removed. | Minor: child sign-out landing, nickname charset for combining marks, invitation retention job. | 1 |
| FR14 | Purchases, limits, deposits, withdrawals | **Built** | Purchases with the overspend rule (D2) and a per-child overspend switch; money rules (spending limit, withdrawal cap, auto-approve, auto-confirm; per item, week or month) with their sections on the parent's rules page; a spending-limit notice once per window. `requests` with reservations: a pending or approved withdrawal reserves Save and a pending deposit holds Spend. The child asks to take out (reason, caps, "you can take out" limit) or puts in; the parent approves or rejects, then confirms the hand-over; deposits are confirmed on receiving the cash; either side can cancel. Auto-approve skips only the approval step and auto-confirm posts at once. Posting is `post_request`, the one path to the ledger, once per request (`requests-race` e2e, pgTAP). | — | 3, 4 |
| FR15 | Emergency funds | **Built** | An `emergency` request kind on the request flow: the child asks for extra money with a required reason ("Ask for extra" on their Requests page); the parent approves or rejects from "Needs you"; an approved grant posts once, as `grant_in` into Spend (decided 2026-10-31), when the parent confirms handing it over; rejection and cancellation post nothing; `emergency_requested` and `emergency_decided` notices; history shows it as Extra money; Jarso can read it. No cap, auto rule or reservation applies. | — | FR15 |
| FR16 | Notifications | Built | `notifications` table written in the same transaction as the record (limit notices and request notices: `withdrawal_requested` and `deposit_requested` to the parents, `withdrawal_decided` and `deposit_decided` to the child, written by the request functions; an auto-approved or auto-confirmed request notifies no one), plus `allowance_due` and `handover_reminder` from the hourly job. In-app inbox at `/child/inbox` and `/parent/inbox` with an unread badge on the Inbox tab; opening a notice marks it read, with "Mark all as read"; notices open the record's current state. Web push (ADR 0012): a "Pings on this device" switch on both inboxes stores the browser subscription (`push_subscriptions`); each notice is claimed once (`notifications.pushed_at`) and sent with VAPID after the action that wrote it (`pushAfterNotices` via `after()`) or by the daily `/api/cron/push` sweep; `public/sw.js` shows it and opens the record; a dead endpoint is forgotten. App install: `/manifest.webmanifest` with the brand icons and `apple-mobile-web-app` metadata. Everything works with the VAPID keys unset. Optional Resend email adapter (invitation email only). Due badges and the parent's "Needs you" list are on screen but are not notifications; unread limit notices also appear under "Needs you", where View marks them read. | Email for notices stays deferred until a sending domain exists (ADR 0012); no `notification_deliveries` table, by decision. | 5 |

## Production state (hosted database)

| Item | State |
| --- | --- |
| Migration history | Matches `supabase/migrations` on `main`. `20261031020000_requests.sql` and `20261031020001_request_functions.sql` (this branch) are applied by the Supabase GitHub integration when it merges; `pnpm db:push` is only the fallback (`docs/deploy.md`). `20261102000000_diary_complete.sql` is already applied to the hosted project (pushed 2026-11-02, ahead of merge). |
| `generate-due-occurrences` | pg_cron, hourly at minute 5, succeeding. |
| `send-handover-reminders` | pg_cron, hourly at minute 7. The inbox migration creates the job and its function, so both appear when that migration is applied on merge. |
| Child money history | `ledger_entries.child_id` is `on delete restrict`, and `remove_child` keeps the account once ledger rows exist (ADR 0007). |
| Email confirmation | **Off.** Needs custom SMTP first; the confirmation template is commented out in `supabase/config.toml` until then, because the free tier rejects template changes and that stops the integration. Turn both back on before real families. |

## Milestone-one acceptance criteria

Each criterion in `REQUIREMENTS.md` ("First-milestone acceptance criteria") and the tests that prove it (updated 2026-11-02, slice 6). `M` is `tests/e2e/milestone.spec.ts`, the whole milestone in one run with one parent and one child, time moved by the demo clock. E2E references are `file:line` of the test; pgTAP files are in `supabase/tests/database/`. All 13 are met.

| # | Criterion | E2E | pgTAP |
| --- | --- | --- | --- |
| 1 | Child- and parent-initiated onboarding reach the parent-approved state | `onboarding.spec.ts:88` (parent-started), `:109` (child-started), `:157` (invitations list); `M` setup (`milestone.spec.ts:75`) | `family_core`, `invitations`, `child_accounts`, `list_my_invitations` |
| 2 | The parent can set an allowance schedule and spending limits | `allowance.spec.ts:108`, `:123`; `purchases.spec.ts:91`; `requests.spec.ts:281`, `:311`, `:368` (request rules); `M:135` | `allowance_schedules`, `money_rules` |
| 3 | A scheduled allowance becomes due exactly once, including on retry, with no balance change | `allowance.spec.ts:234`; `M:164` (falls due on the demo clock, one occurrence, jars at 0) | `allowance_generation`, `demo_clock` |
| 4 | Both accounts show the due badge; the parent gets a reminder while unconfirmed | `child-home.spec.ts:85`; `allowance.spec.ts:278`; `inbox.spec.ts:74`, `:94`, `:101`; `M:164` (badge and due-day notice on both sides), `M:205` (3-day reminder) | `inbox_reminders`, `demo_clock` |
| 5 | The handover posts the entered cash and savings to Spend and Save exactly once | `allowance.spec.ts:173`; `handover-race.spec.ts:106`, `:124`, `:146`; `M:223` (two ledger lines, both jars) | `handover`, `parent_gifts`, `retry_safety` |
| 6 | A purchase over a limit is recorded and the parent gets a limit notice | `purchases.spec.ts:116`, `:131`; `M:247` (notice in the parent's inbox) | `purchases`, `money_rules`, `notifications` |
| 7 | A withdrawal posts only after approval and handover; rejection changes nothing; reserved while pending or approved and not requestable again | `requests.spec.ts:119`, `:154`, `:173`; `requests-race.spec.ts:183`, `:198`, `:274`, `:363`; `M:267` | `withdrawals`, `requests` |
| 8 | A deposit posts only after the parent confirms receiving the cash; cancellation and rejection change nothing | `requests.spec.ts:209`, `:247`, `:297`; `requests-race.spec.ts:327`; `M:311` | `deposits`, `requests` |
| 9 | In-app notices for a new request and a limit breach, with push disabled | `requests.spec.ts:173` (asserts push is off), `:209`, `:247`; `inbox.spec.ts:118`, `:180`; `M:247`, `M:267`, `M:311` | `notifications` (notices are rows, independent of push) |
| 10 | Child-initiated onboarding collects only a nickname and the parent's email | `onboarding.spec.ts:109` | `invitations` |
| 11 | Repeated or concurrent confirmations and decisions cannot duplicate a balance change | `handover-race.spec.ts:106`, `:124`, `:146`; `requests-race.spec.ts:183`, `:302`, `:327`; `offline-purchase.spec.ts` (resent purchase recorded once) | `retry_safety`, `handover`, `withdrawals`, `deposits` |
| 12 | The whole flow works with push disabled | `M` (every step; the e2e server has no VAPID keys); `requests.spec.ts:173` | — (push is a delivery on top of the notice rows) |
| 13 | An unlinked account cannot view, confirm or decide anything for the family | `onboarding.spec.ts:206`; `family-settings.spec.ts:121` (a removed child is signed out); `onboarding.spec.ts:235`, `:262` (PIN lockout) | `family_core`, `child_accounts`, `handover`, `requests`, `withdrawals`, `deposits`, `money_rules`, `notifications` |

## Known follow-ups from slice 2 (non-blocking)

- **Injectable clock (D11):** done with the slice 6 demo clock. Callers keep real time; the family offset is added in `family_today`, `family_now` and the stamp triggers.
- **Generator timeout:** fixed. The generator stops starting schedules after 45 s (under the job's 60 s timeout) and records the run as `error` with `stopped_early`; a schedule stuck behind a lock fails alone after 5 s. Only a single schedule running past the remaining 15 s would still lose the row.
- **`allowance_next_due_on`** can show a past date between an ended pause and the next hourly run. Display only; it fixes itself on the next run.
- **Module boundary:** fixed. The occurrence reads behind history live in `allowance` (`getOccurrenceAmounts`, `getClosedOccurrences`); the ledger service calls them.
- **Date helpers:** fixed. `utcMidnight`, `formatIsoDate` and `localDateOf` in `@/lib` replace the copies.
- **Parent home** makes about six queries per child; fine at family size.
- **ADR 0008, amended:** money functions check parenthood but not profile completion; the app gate is the enforcement.

## Tests on `main`

| Suite | Count |
| --- | --- |
| pgTAP assertions | 456 |
| Playwright e2e tests | 32, in 9 spec files |

## Who built what

Two people, one repository, squash-merged pull requests; the PR author is the person who built it. Haris's PRs were written with Claude Code, and each session's prompts and replies are in `.claude-logs/`. Numbers are pull requests.

| Area | Built by | Pull requests |
| --- | --- | --- |
| Scaffold, CI, requirements and the first-milestone plan | Pratyush | #1 scaffold, #7 requirements, #9 plan and pilot decisions; Haris: #14 hosted auth config, #36 roadmap |
| FR13 family accounts and onboarding | Pratyush, then Haris | Pratyush: #10 family and onboarding, #12 invitations list, #13, #22; Haris: #15 sign-in logging, #16 parent settings (rename, PIN reset, child removal), #17 parent details (ADR 0008) |
| FR01 allowance and handover | Pratyush, fixes by Haris | Pratyush: #18 allowance, gifts and handover, #19 parent home and allowance tab; Haris: #23, #24, #25 |
| FR03 Spend and Save jars | Pratyush, fixes by Haris | Pratyush: #18 split at handover, #40 money between jars, #42 jar Home; Haris: #23 |
| FR04 money diary | Pratyush | #30 purchases, money rules and overspending, #31, #42 Diary tab; money received, categories and corrections: `feat/diary-complete` |
| FR14 purchases, limits, deposits, withdrawals | Pratyush | #30 purchases and limits, #40 savings withdrawals and deposits |
| FR02 personal savings goal | Pratyush; Jarso and prediction by Haris | Pratyush: #41 goal; Haris: #44 Jarso reads the goal, #46 predict before deciding |
| FR06, FR08, FR10 learning, topics, progress | Haris | #28 seven-day missions, topics, practice and progress |
| FR07, FR09 AI money guide and its boundaries | Haris | #29 guide on Claude with screens, parent switch and evals, #32 monthly cap, #38 Ask Jarso agent (ADR 0011), #39 on by default, #44 goal and requests tools, #47 memory |
| FR05 predict before deciding | Haris | #46, #48 |
| FR11 weekly review, FR12 return experience | Haris | #28 next step on Home, #46 weekly review and comeback task, #48 |
| FR15 emergency funds | Haris | #45 |
| FR16 notifications | Pratyush (inbox), Haris (push and install) | Pratyush: #37 in-app inbox and handover reminders, #43 live inbox over Realtime; Haris: #49 web push and app install (ADR 0012), #51 |
| Offline and slow networks (device outbox) | Pratyush | #33 |
| Theme, brand, landing page and SEO | Pratyush (theme), Haris (brand, landing) | Pratyush: #12, #20 light/dark toggle; Haris: #26 dark wordmark, #34 landing page with SEO and sitemap, #35 hero |
| Hosted deploy and migration history | Pratyush | #21 |
| Pilot readiness: privacy notice, deep health, pilot measures | Haris | #50, #52 |
| Checkpoint audits and this document | Haris | #27, #36, #52 |

Dependabot's five action bumps (#2–#6) are the only other merges.

## Cross-cutting, built

- Landing page at `/` (#34, #35): the coded hero, How it works with live demos, the jar's outline as one thread through the page, the Get started menu, SEO metadata, a sitemap, `robots.txt` and the share image. No FR's status changes with it.
- Design system from `docs/design.md`: Nunito, tokens, light and dark themes with a one-click toggle, primitives including alert dialog, sheet and tabs, brand components including light and dark wordmarks, app shell with Home and Allowance navigation.
- Delivery: CI (lint, typecheck, unit, build, gitleaks, pgTAP, e2e on a fresh Supabase), Vercel on `main`, the Supabase GitHub integration for migrations, squash-merge workflow.
- Learning: content as reviewed JSON, progress tables written only by checked functions, spaced review (ADR 0009). The guide: screened Claude pipeline, parent switch, transcripts, retention, evals and a public `/safety` page (ADR 0010).
- Security for a public repo: secret scanners, redacted session logs, CSRF guard, owner-only personal data, internal SQL helpers not callable by `anon` or `authenticated` (`generate_for_schedule` stays callable by `service_role` for the e2e fast-forward).
- Demo clock (D11, slice 6): `families.clock_offset` (forward only, at most a year) added to the family's today, to business timestamps by triggers and to the money-rule windows; `advance_family_clock` (parent, demo families only) catches up generation and replays each skipped day's reminders; auto charge skips a family whose clock moved; the app reads `family_now` for every family today. Behind `FEATURE_DEMO_CLOCK`, a "Demo clock" card on parent settings (+1 day, +7 days, +1 month).

## Cross-cutting, not built

- The demo seed family (slice 6).
- Error tracking (deferred: logs carry codes and ids; a Sentry free tier when someone will read it) and the uptime monitor itself (`/api/health?deep=1` is built for it).
- Custom SMTP and the confirmation email (dashboard work). The privacy notice is built at `/privacy`; legal review pending.

## Plan

Moved to `docs/roadmap.md`: what Demo 1, Demo 2 and the final demo ship, by FR, and in what order.
