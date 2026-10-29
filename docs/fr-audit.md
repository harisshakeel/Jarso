# Functional requirements audit — 2026-10-29 (slice 2 checkpoint)

State of `main` at `fa62b9f` (after PRs #18–#25: slice 2 allowance, gifts and handover, plus its review fixes) and of the hosted database, against `REQUIREMENTS.md` and the first-milestone spec (`docs/superpowers/specs/2026-10-28-first-milestone-design.md`). Verified from the source tree, migrations, tests, CI runs and the hosted catalog, not from PR descriptions.

Legend: **Built** = on `main`, usable end to end, tested, live on production · **Partial** = some pieces built, not usable for the whole requirement · **Not started** · **Later** = deferred by decision.

## Per requirement

| FR | Requirement | Status | What exists | What is missing | Slice |
| --- | --- | --- | --- | --- | --- |
| FR01 | Allowance schedule and handover | Partial: all but the reminder | Weekly, monthly, every 3 months and yearly schedules; due exactly once from the hourly `generate-due-occurrences` job; change, pause (through a date or until resumed), resume, stop; handover with the Spend/Save split starting from the last split; not given (S10); one-time gifts that stay hidden from the child until handover (S2–S5); due badges on both sides; child allowance card and history. | The parent **reminder** while an allowance stays unconfirmed (needs the FR16 inbox). | 2, 5 |
| FR02 | Personal savings goal | Not started | Nothing. | `goals`, planned split, progress and payments-remaining estimate, goal screen | rest of pilot |
| FR03 | Spend and Save jars | Partial | `ledger_entries`, `balance()`, `list_ledger_history`; confirmed balances per jar with due shown separately; the handover records the actual split; child and parent history. | Savings deposits and withdrawals (FR14, slice 4); effect on a goal (FR02). Child split planning is deferred by decision. | 4 |
| FR04 | Money diary | Not started | Only the ledger history view, which the diary will extend. | Child-recorded purchases and money from other sources that counts immediately, corrections with traceable history, the parent's view of the diary | 3, later |
| FR05 | Predict before deciding | Not started | Nothing. | What-if simulation, prompt UI | rest of pilot |
| FR06 | Interactive daily learning | **Built** | Seven-day journey of missions (6–8 steps: choices, amounts, a Spend/Save slider, sorting, matching, predictions, reasons) with instant feedback, two free hints, two tries, missed steps replayed at the end, progress kept between visits, and spaced practice from a review pool in new situations (boxes of 1, 3, 7, 14 days). ADR 0009. | — | learning |
| FR07 | AI money guide | Later | Nothing, by decision. | — | later version |
| FR08 | Related learning material | **Built** | Five topic pages with an explanation, a worked example and a practice question; missions link to them after a wrong answer and back again. Opening a topic never changes progress. | Guide answers linking to topics (with the guide). | learning |
| FR09 | Guide boundaries | Later | Rules in `CLAUDE.md` and the agents. | — | later version |
| FR10 | Learning progress | **Built** | Five-question check-in before mission 1 (places, no score); skill levels Started, Practised, Got it from first-try answers, reasons and hint use; shown apart from money for the child and on the parent's learning page. | — | learning |
| FR11 | Weekly review | Not started | Nothing. | Review generation and screen | rest of pilot |
| FR12 | Return experience | Partial | Child Home opens on one next step: an unfinished mission, due practice, the check-in, then the next mission; missions resume at the step the child left; a weekly count of learning days with no loss message. | Goal review and pending requests in the next step (need FR02 and FR14). | learning, later |
| FR13 | Family accounts and onboarding | **Built** | Families, members, invitations (link and short code), child PIN sign-in with lockout, rate limits, audit log, both onboarding paths. Parent settings in tabs: family, children (rename, reset PIN, remove per ADR 0007), and the parent's own details. Parent profile completion behind a blocking dialog (ADR 0008); reads stay open, actions are gated in the app. A child with money history keeps their account when removed. | Minor: child sign-out landing, nickname charset for combining marks, invitation retention job. | 1 |
| FR14 | Purchases, limits, deposits, withdrawals | Not started | Nothing. | Purchases with the overspend rule (D2), limits (D3), `requests` with reservations, deposits and withdrawals, screens | 3, 4 |
| FR15 | Emergency funds | Not started | Nothing. | `emergency` request type on the slice-4 machinery | rest of pilot |
| FR16 | Notifications | Partial | Optional Resend email adapter (invitation email). Due badges and the parent's "Needs you" list are on screen but are not notifications. | Notifications and deliveries, inbox and badge, due and handover reminders, dispatcher, deep links, the `/api/cron` fallback; push and PWA later | 5 |

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
| Parent sets allowance schedule and limits | Partly: schedule yes, limits not started |
| Allowance becomes due exactly once, no balance change | Yes (pgTAP `allowance_generation`, live job) |
| Due badge on both accounts and parent reminder | Partly: badges yes, reminder needs FR16 |
| Handover posts cash and savings exactly once | Yes (pgTAP `handover`, `handover-race` e2e) |
| Over-limit purchase recorded and parent notified | No |
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
- Security for a public repo: secret scanners, redacted session logs, CSRF guard, owner-only personal data, internal SQL helpers not callable by `anon` or `authenticated` (`generate_for_schedule` stays callable by `service_role` for the e2e fast-forward and the demo clock).

## Cross-cutting, not built

- Demo clock (D11) and the demo seed family (slice 6).
- `/api/health?deep=1`, error tracking, uptime monitor.
- Custom SMTP, the confirmation email, and the privacy notice (ADR 0008).

## Plan

| Step | Scope | Depends on |
| --- | --- | --- |
| 1–2 | Onboarding and family (FR13); allowance, gifts and handover (FR01, FR03 jars) | Done |
| 3 | Purchases and money received in the diary (FR04), limits and the overspend rule (FR14, D2, D3) | — |
| 4 | Savings deposits and withdrawals with reservations (FR14) | — |
| 5 | Inbox, badge, reminders, email dispatcher, `/api/cron` fallback, next step on both homes (FR16, FR12) | 3, 4 for full coverage |
| 6 | Demo clock, seed family, full milestone e2e on production | 3–5 |
| 7+ | Goals, corrections, emergency funds, predict, learning track, push and PWA | 6 |

Slices 3 and 4 can run in parallel. Every slice: one PR, CI green, squash merge; the integration applies its migrations. Before real families: custom SMTP and email confirmation back on.
