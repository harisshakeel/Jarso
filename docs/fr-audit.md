# Functional requirements audit — 2026-10-30 (learning and guide)

State of `main` after the slice 2 checkpoint (#18–#27) plus the learning track (#28) and the AI money guide (#29) and of the hosted database, against `REQUIREMENTS.md` (rows marked "slice 3 branch" reflect `feat/purchases-limits`) and the first-milestone spec (`docs/superpowers/specs/2026-10-28-first-milestone-design.md`). Verified from the source tree, migrations, tests, CI runs and the hosted catalog, not from PR descriptions.

Legend: **Built** = on `main`, usable end to end, tested, live on production · **Partial** = some pieces built, not usable for the whole requirement · **Not started** · **Later** = deferred by decision.

## Per requirement

| FR | Requirement | Status | What exists | What is missing | Slice |
| --- | --- | --- | --- | --- | --- |
| FR01 | Allowance schedule and handover | Partial: all but the reminder | Weekly, monthly, every 3 months and yearly schedules; due exactly once from the hourly `generate-due-occurrences` job; change, pause (through a date or until resumed), resume, stop; handover with the Spend/Save split starting from the last split; not given (S10); one-time gifts that stay hidden from the child until handover (S2–S5); due badges on both sides; child allowance card and history. | The parent **reminder** while an allowance stays unconfirmed (needs the FR16 inbox). | 2, 5 |
| FR02 | Personal savings goal | Not started | Nothing. | `goals`, planned split, progress and payments-remaining estimate, goal screen | rest of pilot |
| FR03 | Spend and Save jars | Partial | `ledger_entries`, `balance()`, `list_ledger_history`; confirmed balances per jar with due shown separately; the handover records the actual split; child and parent history. | Savings deposits and withdrawals (FR14, slice 4); effect on a goal (FR02). Child split planning is deferred by decision. | 4 |
| FR04 | Money diary | Partial (slice 3 branch) | Child records purchases (amount, optional label); undo within 24 hours as a reversing entry, shown as Undone to child and parent; purchases in both histories. | Money from other sources recorded by the child, corrections beyond undo, a dedicated diary screen | 3, later |
| FR05 | Predict before deciding | Not started | Nothing. | What-if simulation, prompt UI | rest of pilot |
| FR06 | Interactive daily learning | **Built** | Seven-day journey of missions (6–8 steps: choices, amounts, a Spend/Save slider, sorting, matching, predictions, reasons) with instant feedback, two free hints, two tries, missed steps replayed at the end, progress kept between visits, and spaced practice from a review pool in new situations (boxes of 1, 3, 7, 14 days). ADR 0009. | — | learning |
| FR07 | AI money guide | **Built, behind a flag** | Claude Opus 5.5 answers with Claude Haiku 5.5 input and output screens, context built from reviewed content by key; Home, topic, "Help me" and "Why?" entries; hint ladder that keeps the answer back until two tries; topic links and an optional check; thumbs up or down; rate limits, a daily budget and a circuit breaker (ADR 0010). | Switch on for real families after the eval gate passes and a UK/US legal review. | guide |
| FR08 | Related learning material | **Built** | Five topic pages with an explanation, a worked example and a practice question; missions link to them after a wrong answer and back again; guide answers link to them. Opening a topic never changes progress. | — | learning, guide |
| FR09 | Guide boundaries | **Built, behind a flag** | Frozen prompt with the FR09 rules; input screen (off topic, personal details, safety, unsafe, jailbreak) and output screen; reviewed fixed copy; helplines and an emergency line for safety; contact details scrubbed; parents read every chat, flagged first; 30-day text retention; public `/safety` page; 158 eval cases with a gate. | The eval run itself (needs the key), and legal review. | guide |
| FR10 | Learning progress | **Built** | Five-question check-in before mission 1 (places, no score); skill levels Started, Practised, Got it from first-try answers, reasons and hint use; shown apart from money for the child and on the parent's learning page. | — | learning |
| FR11 | Weekly review | Not started | Nothing. | Review generation and screen | rest of pilot |
| FR12 | Return experience | Partial | Child Home opens on one next step: an unfinished mission, due practice, the check-in, then the next mission; missions resume at the step the child left; a weekly count of learning days with no loss message. | Goal review and pending requests in the next step (need FR02 and FR14). | learning, later |
| FR13 | Family accounts and onboarding | **Built** | Families, members, invitations (link and short code), child PIN sign-in with lockout, rate limits, audit log, both onboarding paths. Parent settings in tabs: family, children (rename, reset PIN, remove per ADR 0007), and the parent's own details. Parent profile completion behind a blocking dialog (ADR 0008); reads stay open, actions are gated in the app. A child with money history keeps their account when removed. | Minor: child sign-out landing, nickname charset for combining marks, invitation retention job. | 1 |
| FR14 | Purchases, limits, deposits, withdrawals | Partial (slice 3 branch) | Purchases with the overspend rule (D2) and a per-child overspend switch; money rules (spending limit, withdrawal cap, auto-approve, auto-confirm; per item, week or month) with the Spending section on the parent's rules page; a spending-limit notice once per window. | `requests` with reservations, deposits and withdrawals, their rule sections and screens | 3, 4 |
| FR15 | Emergency funds | Not started | Nothing. | `emergency` request type on the slice-4 machinery | rest of pilot |
| FR16 | Notifications | Partial | `notifications` table written in the same transaction as the record (slice 3: limit notices). Optional Resend email adapter (invitation email). Due badges and the parent's "Needs you" list are on screen but are not notifications. | Notifications and deliveries, inbox and badge, due and handover reminders, dispatcher, deep links, the `/api/cron` fallback; push and PWA later | 5 |

## Production state (hosted database)

| Item | State |
| --- | --- |
| Migration history | Matches `supabase/migrations` on `main`: 19 migrations, same versions. New migrations reach production only by merging to `main`, through the Supabase GitHub integration. |
| `generate-due-occurrences` | pg_cron, hourly at minute 5, succeeding. |
| Child money history | `ledger_entries.child_id` is `on delete restrict`, and `remove_child` keeps the account once ledger rows exist (ADR 0007). |
| Email confirmation | **Off.** Needs custom SMTP first; the confirmation template is commented out in `supabase/config.toml` until then, because the free tier rejects template changes and that stops the integration. Turn both back on before real families. |

## Milestone-one acceptance criteria, today

| Criterion | Met |
| --- | --- |
| Both onboarding paths reach parent-approved state | Yes |
| Parent sets allowance schedule and limits | Yes on the slice 3 branch |
| Allowance becomes due exactly once, no balance change | Yes (pgTAP `allowance_generation`, live job) |
| Due badge on both accounts and parent reminder | Partly: badges yes, reminder needs FR16 |
| Handover posts cash and savings exactly once | Yes (pgTAP `handover`, `handover-race` e2e) |
| Over-limit purchase recorded and parent notified | Recorded with a notice row on the slice 3 branch; shown to the parent with the slice 5 inbox |
| Withdrawal posts only after approval and handover; reservation | No |
| Deposit posts only after receipt confirmation | No |
| Parent gets in-app notices for request and limit breach | No |
| Child-initiated onboarding collects only nickname and parent email | Yes |
| Repeated or concurrent confirmations cannot duplicate | Partly: handovers yes; requests not built |
| Works with push disabled | Yes |
| Unlinked account cannot act for the family | Yes (pgTAP and e2e) |

Six of thirteen are met and three are partly met. The rest need purchases and limits (slice 3), deposits and withdrawals (slice 4) and the inbox (slice 5).

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

- Design system from `docs/design.md`: Nunito, tokens, light and dark themes with a one-click toggle, primitives including alert dialog, sheet and tabs, brand components including light and dark wordmarks, app shell with Home and Allowance navigation.
- Delivery: CI (lint, typecheck, unit, build, gitleaks, pgTAP, e2e on a fresh Supabase), Vercel on `main`, the Supabase GitHub integration for migrations, squash-merge workflow.
- Learning: content as reviewed JSON, progress tables written only by checked functions, spaced review (ADR 0009). The guide: screened Claude pipeline, parent switch, transcripts, retention, evals and a public `/safety` page (ADR 0010).
- Security for a public repo: secret scanners, redacted session logs, CSRF guard, owner-only personal data, internal SQL helpers not callable by `anon` or `authenticated` (`generate_for_schedule` stays callable by `service_role` for the e2e fast-forward and the demo clock).

## Cross-cutting, not built

- Demo clock (D11) and the demo seed family (slice 6).
- `/api/health?deep=1`, error tracking, uptime monitor.
- Custom SMTP, the confirmation email, and the privacy notice (ADR 0008).

## Plan

| Step | Scope | Depends on |
| --- | --- | --- |
| 1–2 | Onboarding and family (FR13); allowance, gifts and handover (FR01, FR03 jars) | Done |
| L, G | Learning track (FR06, FR08, FR10, FR12 next step; ADR 0009) and the AI money guide behind a flag (FR07, FR09; ADR 0010) | Done; guide on for real families after the eval gate and legal review |
| 3 | Purchases and money received in the diary (FR04), limits and the overspend rule (FR14, D2, D3) | — |
| 4 | Savings deposits and withdrawals with reservations (FR14) | — |
| 5 | Inbox, badge, reminders, email dispatcher, `/api/cron` fallback, next step on both homes (FR16, FR12) | 3, 4 for full coverage |
| 6 | Demo clock, seed family, full milestone e2e on production | 3–5 |
| 7+ | Goals, corrections, emergency funds, predict, weekly review, push and PWA | 6 |

Slices 3 and 4 can run in parallel. Every slice: one PR, CI green, squash merge; the integration applies its migrations. Before real families: custom SMTP and email confirmation back on.
