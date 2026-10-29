# Functional requirements audit — 2026-10-29

State of main at `2f9238b` (after PRs #9, #10, #12, #13) against `REQUIREMENTS.md` and the first-milestone spec (`docs/superpowers/specs/2026-10-28-first-milestone-design.md`). Verified from the source tree, migrations, generated functions and tests, not from PR descriptions.

Legend: **Built** = usable end to end with tests · **Partial** = some code, not usable for the requirement · **Not started** · **Later** = deferred by decision.

## Per requirement

| FR | Requirement | Status | What exists | What is missing | Slice |
| --- | --- | --- | --- | --- | --- |
| FR01 | Allowance schedule and handover | Not started | Nothing. Child home shows a "jars coming soon" placeholder. | `allowance_schedules`, `allowance_occurrences`, `generate_due_occurrences` (pg_cron), `confirm_handover` with shortfall (D1), parent schedule screen per child, due list, handover sheet, child schedule and history views, due badge | 2 |
| FR02 | Personal savings goal | Not started | Nothing. | `goals` table, planned split on schedule, progress and payments-remaining estimate, goal screen | after 2 |
| FR03 | Spend and Save jars | Not started | Placeholder only. | Balances from ledger, jar cards, planned split preview, deposits (slice 4) | 2, 4 |
| FR04 | Money diary | Not started | Nothing. | `record_entry` for purchases and gifts, `reverse_entry` for corrections, diary screen, parent read view | 3 (purchases), later (gifts, corrections) |
| FR05 | Predict before deciding | Not started | Nothing. | What-if simulation in `goals` service, prompt UI | rest of pilot |
| FR06 | Interactive daily learning | Not started | Nothing. | Mission content, `mission_progress`, mission player, hints, spaced return | rest of pilot |
| FR07 | AI money guide | Later | Nothing by decision. | — | later version |
| FR08 | Related learning material | Not started | Nothing. | Topic content, topic screens, links from missions | rest of pilot |
| FR09 | Guide boundaries | Later | Rules in CLAUDE.md and agents. | — | later version |
| FR10 | Learning progress | Not started | Nothing. | Starting questions, `skill_progress`, separate display | rest of pilot |
| FR11 | Weekly review | Not started | Nothing. | `weekly_reviews`, generator job, review screen | rest of pilot |
| FR12 | Return experience | Not started | Child home greets by nickname; no next step. | Next-step logic (mission, due, pending request), resume state | with 2 and 5 |
| FR13 | Family accounts and onboarding (incl. parent profile completion, ADR 0008) | **Built** | Tables `families`, `family_members`, `invitations`, `child_credentials`, `child_pin_attempts`, `usage_counters`, `audit_log`; functions `create_family`, `register_child` (consent, atomic, invitation once), `create_invitation`, `find_invitation`, `list_my_invitations`, `set_child_pin`, `verify_child_pin` (escalating lockout, equalised timing), `hit_rate_limit`, `revoke_user_sessions`; role from `app_metadata`; RLS on every table. Screens: parent sign-up with email confirm, setup, home with family code and children, add child, invite with link + code, child start, child PIN sign-in, invitation list, child switcher; parent settings (family timezone, rename, reset PIN, remove child, display name, sign out) and child settings (theme, sign out). Tests: pgTAP 219, e2e 16, unit on schemas, DAL, service. | Hosted add-child failure resolved 2026-10-29: the Vercel deployment lacked `SUPABASE_SECRET_KEY`; verified end to end against the hosted project. Should fix: password rotation on every PIN sign-in logs the child out elsewhere; global invite cap exhaustible by one IP. Minor: child sign-out landing, nickname charset, invitation retention job. | 1 |
| FR14 | Purchases, limits, deposits, withdrawals | Not started | Nothing. | `ledger_entries` writes with D2 overspend rule, `spending_limits` (D3), `evaluate_limits`, `requests` with `reserved_save` and `available_save`, `create_request`, `decide_request`, `complete_request`; child record-purchase and request screens; parent limits, decision and handover screens | 3, 4 |
| FR15 | Emergency funds | Not started | Nothing. | Request type `emergency` on the slice 4 machinery, jar decision | rest of pilot |
| FR16 | Notifications | Partial | `sendEmail` Resend adapter (invitation email, optional). Bottom nav has one item per role. | `notifications`, `notification_deliveries`, inbox screen and unread badge, due and reminder jobs (D4, every 3 days), dispatcher route with batching, deep links; web push and PWA later | 5 |

## Cross-cutting, built

- Design system foundation from `docs/design.md`: Nunito, tokens, light and dark with theme switch, primitives (button with loading and keycap, checkbox, select, sheet, badge, dropdown, separator), brand components (mark, wordmark, status chip), app header and bottom nav, landing page.
- Auth hardening: `/auth/confirm` with `token_hash`, session read after `connection()`, `next` carried through sign-up, open-redirect guard.
- Rate limiting primitive (`hit_rate_limit`, `usage_counters`) and `audit_log`.
- CI runs local Supabase for e2e and pgTAP for migrations; Playwright refuses non-local Supabase.
- Security: scanners cover Resend keys; session logs capture VS Code prompts and subagent reports.

## Cross-cutting, not built

- `ledger_entries` and every money function. No money moves anywhere yet.
- `pg_cron`, `job_runs`, any scheduled job.
- Demo clock (D11) and the demo seed family (slice 6).
- `/api/health?deep=1`, error tracking, uptime monitor.
- Hosted setup from PR #10: confirm-signup email template, redirect URLs including `http://localhost:3000/auth/callback`, "Secure password change", deletion of leftover test users.

## Milestone-one acceptance criteria, today

| Criterion | Met |
| --- | --- |
| Both onboarding paths reach parent-approved state | Yes locally; hosted blocked by the add-child bug |
| Parent sets allowance schedule and limits | No |
| Allowance becomes due exactly once, no balance change | No |
| Due badge and parent reminder | No |
| Handover posts cash and savings exactly once | No |
| Over-limit purchase recorded and parent notified | No |
| Withdrawal posts only after approval and handover; reservation | No |
| Deposit posts only after receipt confirmation | No |
| Parent gets in-app notices for request and limit breach | No |
| Child-initiated onboarding collects only nickname and parent email | Yes |
| Repeated or concurrent confirmations cannot duplicate | No (nothing to duplicate yet) |
| Works with push disabled | Yes, trivially |
| Unlinked account cannot act for the family | Yes (pgTAP and e2e) |

Three of thirteen criteria are met. Everything else waits on the ledger.

## Plan

Order follows the spec: slice 2 unblocks everything, slices 3 and 4 are independent after it, slice 5 needs 2 to have something to notify about, slice 6 closes the milestone.

| Step | Scope | Depends on | Size |
| --- | --- | --- | --- |
| 0a | Done 2026-10-29. Add-child on hosted failed because the Vercel deployment lacked `SUPABASE_SECRET_KEY`, not because of the `.invalid` domain or password policy (GoTrue's Admin `createUser` only syntax-checks the email). Key set on Vercel; flow verified. | — | done |
| 0b | Done 2026-10-29 via `supabase config push` from `[remotes.production]` (PR #14). Email confirmation OFF for development; custom SMTP and the template remain open (docs/auth.md). | — | done |
| 2 | Ledger, allowance, handover: migrations (`ledger_entries`, `allowance_schedules`, `allowance_occurrences`, `job_runs`, pg_cron), functions (`balance`, `generate_due_occurrences`, `confirm_handover` with D1 and D5), parent allowance screen per child, due list and handover sheet, child jars and schedule, due badge; pgTAP for exactly-once; e2e due → handover. `now` injectable from here on (D11). | 0a for hosted demo | 2–3 days |
| 3 | Purchases and limits: `record_entry` with D2, `spending_limits` (D3), `evaluate_limits`, overspend toggle, child record-purchase, parent limits screen, limit notice row. | 2 | 1–2 days |
| 4 | Withdrawals and deposits: `requests`, `reserved_save`, `available_save`, `create_request`, `decide_request`, `complete_request`; child request screens; parent decisions and handover. | 2 | 1–2 days |
| 5 | Inbox and reminders: `notifications`, `notification_deliveries`, inbox and badge both roles, due and 3-day reminder jobs, dispatcher with Resend batching, deep links. FR12 next-step on both homes. | 2 (3, 4 for full coverage) | 1–2 days |
| 6 | Demo hardening: clock offset UI behind `FEATURE_DEMO_CLOCK`, seed family, full milestone e2e, acceptance checklist run on hosted. | 2–5 | 1 day |
| 7+ | Rest of pilot: goals (FR02, small after 2), gifts and corrections (FR04), emergency (FR15, small after 4), predict (FR05), learning track (FR06, FR08, FR10, FR11), push and PWA. | 6 | separate track |

Suggested split: slices 3 and 4 run in parallel on two people once slice 2 merges. Each slice is one PR with a Conventional Commits title, squash-merged after review.
