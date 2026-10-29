# First milestone — design

Date: 2026-10-28. Status: draft for approval.

## 1. Intent

Ship the REQUIREMENTS.md **first milestone**: one parent and one child complete the whole family money loop, without push, demo-ready in **1–2 weeks**. It is the product's first real proof that the money rules (handover-only income, reservations, exactly-once posting, family isolation) hold end to end, and it is what hackathon judges will watch.

Sources this spec builds on and does not repeat: `REQUIREMENTS.md` (scope, FR text, acceptance criteria), `docs/domain.md` (glossary, invariants 1–16), `docs/architecture.md` (entity model §5, auth §6, flows §7, notifications §8, scheduling §9), ADRs 0004–0006, `docs/design.md` (UI). Where this spec differs from those, this spec wins and the docs are updated in slice 0.

## 2. Goals, non-goals, anti-goals

**Goals**

- Both onboarding paths reach the parent-approved state.
- Allowance schedule → due occurrence (exactly once) → due badge + reminders → handover posts to Spend/Save exactly once.
- Purchase recording with per-purchase / weekly / monthly limit notices.
- Savings withdrawal: request → approve/reject → handover, with reservation.
- Savings deposit: request → parent confirms receipt (or child cancels / parent rejects), capped by Spend.
- A parent can manage several children (child switcher).
- A demo clock lets judges watch allowances fall due and reminders fire live.
- In-app inbox for both roles, plus parent email for the notice types in architecture §8.
- Every first-milestone acceptance criterion in REQUIREMENTS.md has an automated test.

**Non-goals (this milestone)**

- Emergency funds, goals, full diary (correct/undo), missions, learning content, weekly review, practice money UI, web push, PWA install, AI guide.
- Multi-currency, OAuth sign-in, admin tooling.

**Anti-goals (failure even if it "works")**

- Any path where a balance changes twice, or changes without a parent confirmation (except a child-recorded purchase).
- Any read or write across families, including via a crafted request or sign-up metadata.
- Collecting child data beyond nickname (+ PIN hash) and the parent's email.
- Discouraging, shaming or alarming copy for the child (design.md voice).

## 3. Decisions made in brainstorming (2026-10-28)

These resolve REQUIREMENTS.md "Open decisions" for the pilot.

| # | Topic | Decision |
| --- | --- | --- |
| D1 | Handover amount ≠ due amount | Confirmation **closes** the occurrence. `shortfall_minor = due − (cash + saved)` is stored on the occurrence and shown in history. Over-handover (cash + saved > due) is rejected. |
| D2 | Purchase larger than Spend balance | **Blocked unless the parent has allowed overspending** for that child (`allow_negative_spend`, default off). When blocked, the child sees a friendly explanation (not enough in Spend; record money received or ask a parent). When allowed, Spend may go negative and is shown clearly. Spending limits still never block (FR14 / invariant 6 unchanged). This refines FR14 "always recorded": limits never block, only the balance rule can. |
| D3 | Spending limit types | `per_purchase`, `per_week`, `per_month`. Any combination, at most one active of each type per child. |
| D4 | Reminder timing | First notice the day the occurrence falls due (`due`), then a `reminder` **every 3 days** while still due. |
| D5 | Missed occurrences | Each stays due separately. No roll-up, no expiry. Parent confirms each. |
| D6 | Schedule changes | Parent picks `starts_on` at creation. Amount/frequency changes apply from the **next** occurrence; already-due occurrences keep their amount. |
| D7 | Parent verification | Supabase email confirmation **plus** a guardian-consent checkbox ("I am this child's parent or guardian"), stored with timestamp and consenting parent. Stronger verification is post-pilot. |
| D8 | Delivery shape | Vertical slices, one PR each, each demoable and tested (§6). |
| D9 | Docs | REQUIREMENTS.md "Open decisions" and docs/architecture.md updated to match (slice 0). |
| D10 | Savings deposits | **In** this milestone (they are a first-milestone acceptance criterion), built in slice 4 on the same request machinery as withdrawals. |
| D11 | Demo time | **Clock override.** Every time-based function and service takes an injectable `now`. A per-family clock offset lets a parent fast-forward their own family's time, enabled only when `FEATURE_DEMO_CLOCK` is on (§4). |
| D12 | Several children | Yes. Parent screens are scoped by child id in the route, with a child switcher in the parent shell. Badges and inbox aggregate across the parent's children. |
| D13 | Email | No verified sending domain yet. Invitations always produce a **copyable link + short code** the child shows the parent; email is sent additionally only when Resend is configured. Neither the demo nor any acceptance criterion depends on email delivery. |

Calls I made after the builder check (correct if wrong):

- **Pre-approval child (child-initiated):** no auth user and no session exist before the parent accepts. Submitting nickname + parent email creates only a pending `invitations` row and shows a stateless "show this to your parent" screen with the link and code. The child signs in for the first time after the parent accepts and sets the PIN. "Unapproved child cannot use the app" is therefore enforced by the child having no credentials. The unauthenticated form is rate-limited per IP and per parent email (`usage_counters`).
- **Accepting into an existing family:** if the accepting parent already belongs to a family, the child joins that family (D12); otherwise a family is created.
- **Currency:** one currency per family, chosen at family creation from a short list, default from the browser locale. Minor-unit digits come from `Intl.NumberFormat(...).resolvedOptions().maximumFractionDigits`, so zero-decimal currencies (e.g. JPY) work. Seeds and fixtures use a 2-decimal currency.

## 4. Changes to the architecture as written

Deltas from docs/architecture.md; everything else stands as written.

- `allowance_occurrences`: add `amount_minor` (snapshot of the schedule amount when generated, so D6 holds) and `shortfall_minor bigint not null default 0`. `confirm_handover` requires `cash + saved <= amount_minor`, `cash, saved >= 0`, `cash + saved > 0`; sets status `confirmed`. (The `closed` status is unused in this milestone.)
- `spending_limits.type`: add `per_month`. Partial unique index on `(child_id, type) where active`.
- New per-child settings: `allow_negative_spend boolean not null default false`. Stored on a `child_settings` table keyed by `child_id` (parent-writable via function, child-readable). *Builder may place it elsewhere if simpler, as long as only a parent of the child can change it and the change is written to `audit_log`.*
- `record_entry(kind = purchase)`: inside the same transaction, lock the child's spend balance (advisory lock on child id), and if `balance(spend) - amount < 0` and not `allow_negative_spend`, raise `AppError`-mapped code `insufficient_spend`. Limit evaluation unchanged (after insert, notice only).
- Limit windows: week = Monday 00:00 to Sunday 24:00, month = calendar month, both in the **family's timezone**. `families.timezone text not null` (IANA name), set at family creation from the parent's browser, defaulting to `UTC`. *(My call.)*
- Due dates: `generate_due_occurrences` computes `due_on` in the family timezone. Monthly/quarterly/annual on day 29–31 clamp to the month's last day. *(My call.)*
- Reminders: `send_handover_reminders` emits a `reminder` when `today - due_on` is a positive multiple of 3 (family timezone), idempotent on `(occurrence_id, reminder_date)`. The `families.settings` reminder interval is fixed at 3 for now.
- Demo clock (D11): `families.clock_offset interval not null default '0'`. A helper `family_now(family_id)` returns `now() + clock_offset`; every time-based function (`generate_due_occurrences`, `send_handover_reminders`, `evaluate_limits` windows, request timestamps shown to users) uses it. A parent-only action "advance time by N days" (and "reset") updates the offset and immediately runs generation and reminders for that family. The action and its UI exist only when `FEATURE_DEMO_CLOCK` (validated in `env.server.ts`) is on; the DB function also refuses unless a `demo_clock_enabled` flag on the family is set, which only the seed or the flagged action sets. Ledger `occurred_at` uses family time; `created_at` stays real time for audit. Offsets only move forward.
- Requests (D10): `requests.type in ('deposit','withdrawal')` this milestone. Deposit: `pending → completed | cancelled | rejected`; `complete_request` posts `deposit_out` (spend) + `deposit_in` (save) together; Spend cap checked at request and at completion. Deposits never take Spend below zero, even when `allow_negative_spend` is on.
- Guardian consent: `family_members` gains `consent_at timestamptz` and `consent_by uuid` for child rows; `approve_member` / `create_child_account` require consent and set both.
- Profiles: current migration has `full_name` filled from sign-up metadata by `handle_new_user`. The trigger must never read `role` or family data from metadata (invariant 15). Child profiles are created by `create_child_account` with no `full_name`. Rename `full_name` → `display_name` per architecture §5.1 or keep it; *builder's call*, but update `updateProfileSchema` accordingly and keep `role`/`nickname` out of it.

## 5. User-visible flows

Screens follow architecture §14 and docs/design.md (mobile-first, child voice). Copy for blocked purchases, rejections and reminders must be encouraging, never shaming.

**Parent**: sign up / log in → create family (timezone captured) → add child (nickname + PIN + consent) *or* accept a child's invitation from email (sign up/in, consent, set PIN) → see family code to give the child → allowance setup (amount, frequency, start date) → limits & overspend toggle → home: due allowances with badges, pending requests → handover sheet (prefilled from child's planned split; shortfall shown live) → request decision (approve / reject) → handover for approved withdrawal → inbox.

**Child**: start onboarding (nickname + parent email only) → "waiting for your parent" screen → sign in with family code + nickname + PIN → home: Spend and Save balances, due allowances (badge, not balance), next due date, allowance history → set planned split → record purchase (blocked message when D2 applies) → request withdrawal (amount + reason; available = Save − reserved) → see status (pending / approved / handed over / rejected) → inbox.

## 6. Slices

Each slice: migration(s) with RLS and per-operation policies, regenerated types, feature module(s) per `new-feature` skill, screens, unit + integration tests for its invariants, e2e for its happy path, `pnpm check` green, own PR.

| Slice | Content | Done when |
| --- | --- | --- |
| **0. Docs** | Update REQUIREMENTS.md open decisions (D1–D7), architecture §4 deltas above, domain.md invariant 6 note for D2. | Docs merged. |
| **1. Family & onboarding** | `families`, `family_members`, `invitations`, `child_credentials`, `audit_log`, profile `role`; functions `create_child_account`, `create_invitation`, `accept_invitation`, `set_child_pin`, `verify_child_pin`; RLS helpers `is_approved_member`, `is_parent_of`, `is_self`; DAL `requireRole`, `assertParentOf`; child PIN sign-in (ADR 0004); invitation link + short code (D13), optional email via Resend adapter; rate limit on the child form; parent shell with child switcher (D12) + child shell; currency picker. | Both onboarding paths reach approved; unapproved child cannot use app; PIN lockout after 5 failures; unlinked parent sees nothing. |
| **2. Ledger, allowance, handover** | `ledger_entries`, `balance()`, `allowance_schedules`, `allowance_occurrences`, `child_settings` (planned split lives on schedule), `generate_due_occurrences` (pg_cron hourly + `job_runs`), `confirm_handover`; jars read view; schedule setup; handover sheet; child planned split. | Occurrence created exactly once under rerun; due never in balance; handover posts exactly once under double submit and concurrent calls; shortfall recorded; D6 holds. |
| **3. Purchases & limits** | `record_entry(purchase)` with D2 rule, `spending_limits` (D3), `evaluate_limits`, overspend toggle, record-purchase screen, limits screen. | Over-limit purchase recorded + notice row created; overspend blocked when off, allowed when on; windows respect family timezone. |
| **4. Withdrawals & deposits** | `requests` (withdrawal + deposit, D10), `reserved_save()`, `available_save()`, `create_request`, `decide_request`, `complete_request`; child request screen; parent decision + handover. | Posts only on handover; reject/no handover changes nothing; reserved shown; cap checked at request and handover; second request against same money refused; concurrent approvals cannot overdraw. Deposit posts only on receipt confirmation; cancel/reject change nothing; Spend cap at request and confirmation. |
| **5. Inbox & reminders** | `notifications`, `notification_deliveries`; inbox UI + unread badge both roles; `send_handover_reminders` (D4); dispatcher route + Resend email for parent types, hourly batching; deep links to current record state. Notification rows for slices 2–4 are inserted by their functions from slice 5 on (slices 2–4 leave a clearly marked call site or the builder orders migrations so `notifications` lands first — *builder's call*). | All FR16 first-milestone notices appear with push disabled and email failing; delivery failure never affects records. |
| **6. Demo hardening** | Demo clock (D11; the `now` parameter is threaded from slice 2 on, the offset + UI land here), seed script for one demo family with two children (no real data), full e2e of the milestone flow, acceptance-criteria checklist ticked against tests, design polish pass. | Every REQUIREMENTS.md first-milestone acceptance criterion maps to a passing test. |

Recommended order is as listed; slices 3 and 4 are independent after 2.

## 7. Constraints

- All CLAUDE.md hard rules (feature modules, barrels, layering, `requireUser`/`assertUser`, Cache Components + Suspense, migrations-only schema, RLS per operation, Zod everywhere, `AppError`, no `process.env` outside config, Biome).
- Every money-changing write is a `security definer` Postgres function, one transaction, with an idempotency key and a unique constraint; app code never inserts into `ledger_entries`, `allowance_occurrences`, `requests` status columns, or `notifications` directly.
- Concurrency: functions lock the row being transitioned (`select … for update`) and, for cap checks, serialize per child (advisory lock). Tests must include concurrent double-submit.
- Integer minor units; `formatMinor()` / `Money` for display.
- Public repo: no secrets in code, seeds, logs or fixtures; Resend key via `env.server.ts`.
- One hosted Supabase project for the demo; local `supabase start` for development and CI.

## 8. Testing

- **DB-level** (against local Supabase in CI): each invariant touched by a slice — exactly-once generation, exactly-once posting under parallel calls, reservation cap, cross-family access denied for every table and function, role/link not settable via profile update or sign-up metadata.
- **Unit**: pure helpers (period keys, due-date clamping, limit windows, shortfall, formatting).
- **E2E (Playwright)**: per-slice happy path; slice 6 runs the full milestone flow with two browser contexts (parent, child).

## 9. Left to the builder

- Exact table/column names where §4 marks *builder's call*, function signatures, error code names.
- Screen layout details within docs/design.md.
- Whether invitation tokens are emailed links only or also short codes.
- How the Resend adapter is stubbed in tests and CI.

## 10. Risks

- **Child session minting** (generateLink + verifyOtp) is the least-proven piece; spike it first in slice 1.
- **pg_cron on hosted Supabase**: confirm the extension is enabled on the project before slice 2; app-side `/api/cron/[job]` fallback exists per architecture §9.
- **Timeline**: if slice 5 runs late, ship the inbox and reminders without email; email is not a first-milestone acceptance criterion.
- **Demo clock in production**: it is a time-travel control on a shared hosted project. Kept safe by the env flag, the per-family DB flag, forward-only offsets, and scoping to the caller's own family. Turn the flag off after the hackathon.
- **Parent sign-up confirmation email** still goes through Supabase Auth's built-in mailer, which is heavily rate-limited. For the demo, pre-create the demo parents in the seed; configure custom SMTP before inviting real families.
