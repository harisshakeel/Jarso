# Roadmap

Three demos, each a working slice of the pilot in `REQUIREMENTS.md`. This page says what each demo ships, by FR, and in what order. The status of each FR is verified in `docs/fr-audit.md`. Updated 2026-10-30, after the landing page (#34, #35).

## Timeline

Dates to be set. Tracks run in parallel; an arrow means "after".

| | Money | Learning and design | Platform and ops |
| --- | --- | --- | --- |
| **Demo 1** (now) | Built | Built | Key in Vercel, guide on for the demo child, Console spend limit |
| **Demo 2** | Deposits and withdrawals → inbox and reminders, savings goal | Landing page (built, #34 and #35) → gamified child dashboard (after the goal) | Guide eval gate; demo hardening last |
| **Final demo** | Emergency funds, diary complete, predict before deciding | Weekly review and comeback task, inside the dashboard | Web push and app install, pilot readiness (email for notices deferred) |

## At a glance

| FR | Requirement | Demo 1 (now) | Demo 2 | Final demo |
| --- | --- | --- | --- | --- |
| FR13 | Family accounts and onboarding | Built | — | Email confirmation back on, slice 1 fixes |
| FR01 | Allowance schedule and handover | Built, except the reminder | Handover reminder | — |
| FR03 | Spend and Save jars | Balances, split at handover, history | Deposits and withdrawals between jars; effect on the goal | — |
| FR04 | Money diary | Purchases and undo | Diary tab with history and Undo | Money received, corrections |
| FR14 | Purchases, limits, deposits, withdrawals | Purchases, overspend rule, money rules, limit notice rows | Deposits, withdrawals, reservations, cap, auto-approve, auto-confirm | — |
| FR06 | Interactive daily learning | Built | — | — |
| FR08 | Related learning material | Built | — | — |
| FR10 | Learning progress | Built | Skill badges on the dashboard | — |
| FR12 | Return experience | Next learning step on child Home | Requests and goal in the next step; recognition on the dashboard | Comeback task after missed days |
| FR07, FR09 | AI money guide (Jarso) and its boundaries | Behind a flag, demo child only | Ask Jarso on Home with look-ups of the child's own data (ADR 0011); goal look-ups and memory; eval gate passed | On for pilot families after legal review |
| FR16 | Notifications | Notice rows only | Inbox, badge, reminders (in-app only) | Web push and app install (built); email for notices deferred |
| FR02 | Personal savings goal | — | Goal, plan, progress, payments left | — |
| FR15 | Emergency funds | — | — | Request, decision, handover |
| FR05 | Predict before deciding | — | — | Predict, reveal, try other choices |
| FR11 | Weekly review | — | — | Weekly summary with a fresh question |
| Design | Landing page | Built: scroll-driven landing page with the coded hero and the jar thread (#34, #35) | — | — |
| Design | Child dashboard | Next step, jars, learning summary | Jar Home: the jars are the screen | Weekly review card |

First-milestone acceptance criteria (`REQUIREMENTS.md`): all 13 met once the requests slice (PR B) merges.

Sizes below are relative effort (S < M < L), not dates.

## Demo 1: real pocket money, and learning about it

**Story.** A parent sets up the family and a child joins. An allowance falls due, and the parent hands it over split into Spend and Save. The child records purchases inside the parent's rules. Then the child learns: a check-in, a mission with hints and a topic page, and the money guide explaining "Why?" on a step.

**Demo script**

1. Parent signs up and adds a child; the child signs in with their PIN.
2. Parent shows the weekly allowance and a one-time gift. The due badge is on both accounts.
3. Parent hands the allowance over, splitting it into Spend and Save; the child's jars update.
4. Child records a purchase. One larger than Spend is refused kindly; the parent turns on overspending. The child undoes a purchase.
5. Parent sets a spending limit on the money rules page.
6. Child does the check-in and a mission: a hint, a wrong answer that links to the topic, the replay at the end.
7. Child asks the guide "Why?" on a step, then an off-topic question that gets redirected. Parent reads the chat and shows the switch.
8. Parent opens the child's learning page: skill levels, kept apart from money.

**Before the demo**

- In Vercel Production add `ANTHROPIC_API_KEY` (sensitive) and `FEATURE_GUIDE=true`, redeploy, and switch the guide on for the demo child only.
- Put the key in a dedicated Anthropic Console workspace with a US$100 monthly spend limit (the Default workspace can't have one).
- Create the demo family a day early with today as the allowance's first date, so one allowance is already due. There is no demo clock until Demo 2.

**Gaps to name, not show:** no inbox or reminders yet (limit notices are stored, not shown), no savings deposits or withdrawals, no savings goal. The guide is a pilot feature, on for this family only until the eval gate and the legal review.

## Demo 2: the whole family money loop, and a product that looks the part

**Goal.** Every first-milestone acceptance criterion met, the Save jar working toward a goal, a landing page and a gamified child dashboard, and a demo clock so the audience can watch an allowance fall due and a reminder fire.

| # | Slice | FRs | Size | Design | Depends on |
| --- | --- | --- | --- | --- | --- |
| 1 | **Deposits and withdrawals.** `requests` with reservations; withdrawal cap, auto-approve and auto-confirm in use; child request sheets and list; parent "Needs you" items and decisions; request notices. | FR14, FR03 | L | Written: slices 3–4 design §4.4–4.6 and plan | #30 |
| 2 | **Inbox and reminders, in-app only.** Inbox and unread badge for both roles; handover reminders (the due day, then every 3 days); notices open the record's current state. No email, no `notification_deliveries` and no `/api/cron` route yet: email moves to the final demo with web push. | FR16, FR01 | L | Written: first-milestone design, slice 5 | 1, for request notices |
| 3 | **Savings goal.** One goal per child; a plan per allowance; progress net of reserved withdrawals; payments-left estimate; the goal's effect shown on the jars and the handover screen; goal and pending requests in the next step on both homes. Built straight after slice 7 (product owner, 2026-10-30): reserved money counts as zero until slice 1 lands. | FR02, FR03, FR12 | M | To write | 7 |
| 4 | **Landing page.** Replaces the sign-in page at `/`: the coded hero (the kid's question, the toss, the savings loop), How it works with live demos, the money guide, parent and child side by side, the safety statement and both ways in, joined by the jar's outline as one thread; light and dark, reduced motion, SEO and a sitemap. | — | M | Built: `superpowers/specs/2026-10-30-landing-page-design.md` (#34, #35) | Done |
| 5 | **Jar Home.** Child Home built around two jars: "Do this next" (goal reached, a withdrawal a parent said yes to, the learning order, set a goal, all done), Spend and Save side by side with the Save jar filling to the goal's line, due money as a coin outside the jars, open requests under their jar, and a strip of skills learned (counts that only go up, no day grid). History moves to a Diary tab. Parent Home leads with Needs you (due handovers, requests, unread limit notices) and shows each child's jars small with the goal line. Designed from the HTML mockup the user approved, with no Figma step and no milestone road. | FR12, FR02, FR03, FR04, FR10 | L | Built: `superpowers/specs/2026-10-30-inbox-goal-jar-home-design.md` §6 | 3; 2 for the inbox badge |
| 7 | **Jarso, the agent (child).** "Ask Jarso" at the top of the child's Home; read-only look-ups of the child's own jars, allowance, history, rules and learning, and a saving plan for a price they give; figures filled in by the app; status lines while it works; on by default with a parent switch to turn it off; parents see what it looked at; Claude Sonnet 5.5; `instructions.md` for its voice. | FR07, FR09 | L | Written: `superpowers/specs/2026-10-30-jarso-agent-design.md`, ADR 0011 | Done (this slice) |
| 8 | **Jarso knows the goal, and remembers.** `get_goal` over the savings goal ("how much more for my bike?" without giving the price) and `get_requests`: built; structured memory (short typed facts, at most 20, 90 days, checked for personal details, shown to child and parent with delete): built. | FR07, FR02 | M | Plan in the agent spec §8 | 3, 7 |
| 6 | **Demo hardening.** Demo clock (D11) with the injectable clock in the remaining time functions; a seed family with two children; a full-milestone e2e; each acceptance criterion mapped to a test; a design polish pass. | All | M | Written: first-milestone design, slice 6 | 1–5 |

Three tracks run side by side: Jarso (7, then 3 and 8), money (1, then 2), and design (4 done, 5 once the goal exists). Alongside: run the guide eval gate and fix what it finds.

**Gamification rules** (FR12, `docs/design.md` §8–10, child safety):

- Rewards follow understanding and thoughtful decisions, never the amount of money a child has or saves.
- No losing streaks, no "you missed a day" messages, no countdowns or pressure to return.
- No random rewards, loot boxes, or anything bought with money.
- No leaderboards or comparisons between children.
- Celebration only on child screens, once per moment, no confetti; reduced motion turns it into a plain state change.

**Demo script.** Open the new landing page and sign in as the child: the dashboard shows today's mission, the jars and the goal journey. Move the clock forward a week: the allowance falls due and the reminder lands in the parent's inbox. The parent hands it over and the goal moves on. The child asks to withdraw from Save; the money shows as reserved, the parent approves and hands it over, and it posts. The child deposits leftover cash and the parent confirms receiving it. The child finishes a mission and earns a skill badge. The parent's inbox shows the limit notice from an earlier purchase.

**Done when**

- Every first-milestone acceptance criterion maps to a passing test.
- The guide eval gate has passed: every safety and personal case routed correctly, zero FR09 breaks, at least 95% helpful.
- The landing page and the child dashboard are live in light and dark, at AA contrast, with reduced motion respected.
- The seed family runs the whole script on production.

## Final demo: the full pilot

**Goal.** Every FR in `REQUIREMENTS.md` built, apart from the deferrals already decided, and the app ready for real pilot families.

| Track | Slice | FRs | Size |
| --- | --- | --- | --- |
| Money | **Emergency funds** on the request machinery from Demo 2. Built: the grant lands in Spend (decided 2026-10-31). | FR15 | S |
| Money | **Diary complete.** Money received from other sources, traceable corrections, a diary screen. | FR04 | M |
| Money | **Predict before deciding.** Built: a guess, the real answer and a what-if slider before take-outs, put-ins and plan changes; the purchase hook waits for the diary. | FR05 | M |
| Learning | **Weekly review**, as a card on the dashboard. Built (`features/review`): received, spent, saved, still due and goal progress; how one decision changed the plan; a skill shown and one worth practising; a fresh question from the review pool. | FR11 | M |
| Learning | **Comeback task.** Built: after three days away, Home offers one fresh question before the next mission. | FR12 | S |
| Platform | **Web push and app install.** Built (ADR 0012): a per-browser switch on both inboxes, each notice pushed once from its own row after the action or by the daily `/api/cron/push` sweep, a manifest and service worker for install; everything works with the keys unset. Email for notices stays deferred until a sending domain exists. | FR16 | M |
| Platform | **Pilot readiness**, below. | FR13, FR07 | M |

The three tracks can run in parallel.

**Pilot readiness**

- Custom SMTP and email confirmation back on (Supabase dashboard; owner). The privacy notice (ADR 0008): built at `/privacy`, linked from the landing footer and the sitemap; a lawyer reviews it before Jarso opens beyond the pilot (owner).
- The guide on for pilot families after the eval gate and a UK/US legal review (owner).
- `/api/health?deep=1`: built (one RLS-scoped read; 503 when the database does not answer). Uptime monitor: point one at it (owner). Error tracking: deferred; Vercel's function logs plus `logger` carry codes and ids, and a Sentry free tier can be added when someone will read it.
- The pilot evaluation measures: written as SQL in `docs/pilot-measures.md` (families completing the first flow, weekly return, due-to-handover time, journey completion, understanding apart from completion, unanswered requests, balance errors). Period and thresholds remain an open decision in `REQUIREMENTS.md`.
- Slice 1 fixes: done (`setChildPin` revokes the child's sessions; `invite:global` caps invitations at 200 a day). Leftover test users deleted (owner, hosted project).
- An accessibility and performance pass on a low-end phone: not done; a manual pass with a real device before families join.

**Decisions needed first** (`REQUIREMENTS.md`, open decisions)

- Pilot countries and stronger parental verification.
- Pilot duration and success thresholds. Blocks the evaluation measures.

**Done when** every FR is Built in `docs/fr-audit.md` apart from the deferrals decided under "Not in the pilot", the readiness list is done, and a new family can sign up on production and use Jarso for a week with nothing seeded.

## Not in the pilot

- Child split planning (FR03): the parent decides the split at handover, by decision.
- Native apps, real payments, bank connections, live fund tracking and investments (`REQUIREMENTS.md`, later versions).

## How we work

Each slice gets a design if it lacks one (UI slices start in Figma), then one PR with CI green and a squash merge; the Supabase integration applies its migrations. After each demo, update `docs/fr-audit.md` and this page.
