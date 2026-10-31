# Functional requirements audit — 2026-10-30 (learning and guide)

State of `main` after the slice 2 checkpoint (#18–#27) plus the learning track (#28), the AI money guide (#29) and purchases and money rules (#30), and of the hosted database, against `REQUIREMENTS.md` and the first-milestone spec (`docs/superpowers/specs/2026-10-28-first-milestone-design.md`). Verified from the source tree, migrations, tests, CI runs and the hosted catalog, not from PR descriptions.

Legend: **Built** = on `main`, usable end to end, tested, live on production · **Partial** = some pieces built, not usable for the whole requirement · **Not started** · **Later** = deferred by decision.

## Per requirement

| FR | Requirement | Status | What exists | What is missing | Slice |
| --- | --- | --- | --- | --- | --- |
| FR01 | Allowance schedule and handover | **Built** | Weekly, monthly, every 3 months and yearly schedules; due exactly once from the hourly `generate-due-occurrences` job; change, pause (through a date or until resumed), resume, stop; handover with the Spend/Save split starting from the last split; not given (S10); one-time gifts that stay hidden from the child until handover (S2–S5); due badges on both sides; child allowance card and history. The hourly `send-handover-reminders` job (minute 7) gives the parent an `allowance_due` notice on the due day and a `handover_reminder` every 3 days while the allowance is still due; the child gets only the `allowance_due` notice. Gifts get no notices. An occurrence first seen late waits for its next 3-day mark. | — | 2, 5 |
| FR02 | Personal savings goal | **Built** | One active goal per child (`goals`) with name, emoji, price and the child's own plan per allowance; progress counts Save less reserved withdrawals, never due or pending money; payments left from the plan, updated as the plan or balance changes; goal sheet with a live estimate; on child Home the Save jar fills to the goal's line and the goal-reached moment shows once in "Do this next"; the parent's child card shows the goal line; the plan shown to the parent on the handover screen without changing the split. | — | Demo 2 |
| FR03 | Spend and Save jars | Partial | `ledger_entries`, `balance()`, `list_ledger_history`; confirmed balances per jar with due shown separately; the handover records the actual split; child and parent history; money moves between jars through savings deposits and withdrawals (FR14), which show as their own history rows; child Home draws Spend and Save as jars, the Save jar filling to the goal's line (counted money, a hatched band for money waiting to come out, due money as a coin outside). | Child split planning is deferred by decision. | 4 |
| FR04 | Money diary | Partial | Child records purchases (amount, optional label); undo within 24 hours as a reversing entry, shown as Undone to child and parent; purchases in both histories; a Diary tab with the jars, the purchase sheet, pending offline purchases and paged history with Undo. | Money from other sources recorded by the child, corrections beyond undo | 3, later |
| FR05 | Predict before deciding | Not started | Nothing. | What-if simulation, prompt UI | rest of pilot |
| FR06 | Interactive daily learning | **Built** | Seven-day journey of missions (6–8 steps: choices, amounts, a Spend/Save slider, sorting, matching, predictions, reasons) with instant feedback, two free hints, two tries, missed steps replayed at the end, progress kept between visits, and spaced practice from a review pool in new situations (boxes of 1, 3, 7, 14 days). ADR 0009. | — | learning |
| FR07 | AI money guide (Jarso) | **Built, behind a flag** | Claude Sonnet 5.5 answers with Claude Haiku 5.5 input and output screens (ADR 0010, 0011); "Ask Jarso" at the top of the child's Home with read-only look-ups of the child's own jars, allowance, history, rules and learning, and a saving plan for a price the child gives; figures filled in by the app from the look-ups; status lines while it works; on by default, and a parent can turn it off per child (told on the add-child form); topic, "Help me" and "Why?" entries; hint ladder that keeps the answer back until two tries; topic links and an optional check; thumbs up or down; rate limits, daily and monthly budgets and a circuit breaker. | The savings goal look-up and memory (roadmap slice 8); switch on for real families after the eval gate passes and a UK/US legal review. | guide |
| FR08 | Related learning material | **Built** | Five topic pages with an explanation, a worked example and a practice question; missions link to them after a wrong answer and back again; guide answers link to them. Opening a topic never changes progress. | — | learning, guide |
| FR09 | Guide boundaries | **Built, behind a flag** | Frozen prompt with the FR09 rules; input screen (off topic, personal details, safety, unsafe, jailbreak) and output screen; reviewed fixed copy; helplines and an emergency line for safety; contact details scrubbed; parents read every chat, flagged first; 30-day text retention; public `/safety` page; states the child's own figures but never judges or compares them, look-ups only after the input screen, parents told about the data on the add-child form, parents see what was looked at; 180 eval cases with a four-part gate. | The eval run itself (needs the key), and legal review. | guide |
| FR10 | Learning progress | **Built** | Five-question check-in before mission 1 (places, no score); skill levels Started, Practised, Got it from first-try answers, reasons and hint use; shown apart from money for the child and on the parent's learning page. | — | learning |
| FR11 | Weekly review | Not started | Nothing. | Review generation and screen | rest of pilot |
| FR12 | Return experience | Partial | Child Home opens on one next step: a reached goal (shown once, no confetti), a withdrawal a parent said yes to, then the learning order (an unfinished mission, due practice, the check-in, the next mission), a nudge to set a goal, or all done; missions resume at the step the child left; skills learned shown as counts that only go up; open requests as lines under their jar. | A manageable comeback task after missed days. | learning, later |
| FR13 | Family accounts and onboarding | **Built** | Families, members, invitations (link and short code), child PIN sign-in with lockout, rate limits, audit log, both onboarding paths. Parent settings in tabs: family, children (rename, reset PIN, remove per ADR 0007), and the parent's own details. Parent profile completion behind a blocking dialog (ADR 0008); reads stay open, actions are gated in the app. A child with money history keeps their account when removed. | Minor: child sign-out landing, nickname charset for combining marks, invitation retention job. | 1 |
| FR14 | Purchases, limits, deposits, withdrawals | **Built** | Purchases with the overspend rule (D2) and a per-child overspend switch; money rules (spending limit, withdrawal cap, auto-approve, auto-confirm; per item, week or month) with their sections on the parent's rules page; a spending-limit notice once per window. `requests` with reservations: a pending or approved withdrawal reserves Save and a pending deposit holds Spend. The child asks to take out (reason, caps, "you can take out" limit) or puts in; the parent approves or rejects, then confirms the hand-over; deposits are confirmed on receiving the cash; either side can cancel. Auto-approve skips only the approval step and auto-confirm posts at once. Posting is `post_request`, the one path to the ledger, once per request (`requests-race` e2e, pgTAP). | — | 3, 4 |
| FR15 | Emergency funds | Not started | Nothing. | `emergency` request type on the slice-4 machinery | rest of pilot |
| FR16 | Notifications | Partial: in-app only | `notifications` table written in the same transaction as the record (limit notices and request notices: `withdrawal_requested` and `deposit_requested` to the parents, `withdrawal_decided` and `deposit_decided` to the child, written by the request functions; an auto-approved or auto-confirmed request notifies no one), plus `allowance_due` and `handover_reminder` from the hourly job. In-app inbox at `/child/inbox` and `/parent/inbox` with an unread badge on the Inbox tab; opening a notice marks it read, with "Mark all as read"; notices open the record's current state. Optional Resend email adapter (invitation email only). Due badges and the parent's "Needs you" list are on screen but are not notifications; unread limit notices also appear under "Needs you", where View marks them read. | Email for notices, `notification_deliveries`, the dispatcher and the `/api/cron` fallback: moved to the final demo with web push and app install, by decision. | 5 |

## Production state (hosted database)

| Item | State |
| --- | --- |
| Migration history | Matches `supabase/migrations` on `main`. `20261031020000_requests.sql` and `20261031020001_request_functions.sql` (this branch) are applied by the Supabase GitHub integration when it merges; `pnpm db:push` is only the fallback (`docs/deploy.md`). |
| `generate-due-occurrences` | pg_cron, hourly at minute 5, succeeding. |
| `send-handover-reminders` | pg_cron, hourly at minute 7. The inbox migration creates the job and its function, so both appear when that migration is applied on merge. |
| Child money history | `ledger_entries.child_id` is `on delete restrict`, and `remove_child` keeps the account once ledger rows exist (ADR 0007). |
| Email confirmation | **Off.** Needs custom SMTP first; the confirmation template is commented out in `supabase/config.toml` until then, because the free tier rejects template changes and that stops the integration. Turn both back on before real families. |

## Milestone-one acceptance criteria, today

| Criterion | Met |
| --- | --- |
| Both onboarding paths reach parent-approved state | Yes |
| Parent sets allowance schedule and limits | Yes |
| Allowance becomes due exactly once, no balance change | Yes (pgTAP `allowance_generation`, live job) |
| Due badge on both accounts and parent reminder | Yes (badges, plus the due and 3-day reminders in the parent's inbox) |
| Handover posts cash and savings exactly once | Yes (pgTAP `handover`, `handover-race` e2e) |
| Over-limit purchase recorded and parent notified | Yes (notice row, shown in the parent's inbox) |
| Withdrawal posts only after approval and handover; reservation | Yes (pgTAP `withdrawals`, `requests` and `requests-race` e2e) |
| Deposit posts only after receipt confirmation | Yes (pgTAP, `requests` e2e) |
| Parent gets in-app notices for request and limit breach | Yes (limit and request notices in the inbox) |
| Child-initiated onboarding collects only nickname and parent email | Yes |
| Repeated or concurrent confirmations cannot duplicate | Yes (`handover-race` and `requests-race` e2e) |
| Works with push disabled | Yes |
| Unlinked account cannot act for the family | Yes (pgTAP and e2e) |

Thirteen of thirteen are met on `main` once PR B merges.

## Known follow-ups from slice 2 (non-blocking)

- **Injectable clock (D11)** in the remaining time-based functions; do it right before the slice 6 demo clock.
- **Generator timeout** leaves no `job_runs` row, because the cancelled statement rolls back the run.
- **`allowance_next_due_on`** can show a past date between an ended pause and the next hourly run. Display only; it fixes itself on the next run.
- **Module boundary:** the ledger repository reads `allowance_occurrences`; move history composition into `allowance`.
- **Date helpers** are copied in four places; move them to `@/lib`.
- **Parent home** makes about six queries per child; fine at family size.
- **ADR 0008, amended:** money functions check parenthood but not profile completion; the app gate is the enforcement.

## Tests on `main`

| Suite | Count |
| --- | --- |
| pgTAP assertions | 456 |
| Playwright e2e tests | 32, in 9 spec files |

## Cross-cutting, built

- Landing page at `/` (#34, #35): the coded hero, How it works with live demos, the jar's outline as one thread through the page, the Get started menu, SEO metadata, a sitemap, `robots.txt` and the share image. No FR's status changes with it.
- Design system from `docs/design.md`: Nunito, tokens, light and dark themes with a one-click toggle, primitives including alert dialog, sheet and tabs, brand components including light and dark wordmarks, app shell with Home and Allowance navigation.
- Delivery: CI (lint, typecheck, unit, build, gitleaks, pgTAP, e2e on a fresh Supabase), Vercel on `main`, the Supabase GitHub integration for migrations, squash-merge workflow.
- Learning: content as reviewed JSON, progress tables written only by checked functions, spaced review (ADR 0009). The guide: screened Claude pipeline, parent switch, transcripts, retention, evals and a public `/safety` page (ADR 0010).
- Security for a public repo: secret scanners, redacted session logs, CSRF guard, owner-only personal data, internal SQL helpers not callable by `anon` or `authenticated` (`generate_for_schedule` stays callable by `service_role` for the e2e fast-forward and the demo clock).

## Cross-cutting, not built

- Demo clock (D11) and the demo seed family (slice 6).
- `/api/health?deep=1`, error tracking, uptime monitor.
- Custom SMTP, the confirmation email, and the privacy notice (ADR 0008).

## Plan

Moved to `docs/roadmap.md`: what Demo 1, Demo 2 and the final demo ship, by FR, and in what order.
