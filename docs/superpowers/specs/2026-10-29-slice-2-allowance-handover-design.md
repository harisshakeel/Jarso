# Slice 2: allowance, gifts and handover (design)

Date: 2026-10-29. Status: draft for approval.

## 1. Intent

Slice 2 of the first milestone (`2026-10-28-first-milestone-design.md` §6). The parent sets up money for a child and confirms handing it over in person. Confirmed money lands in the child's Spend and Save jars, and the child can see what's coming. This is the first slice that moves numbers, so the money rules have to hold here or nowhere: income only on parent confirmation, posting exactly once, and due money never counted as balance.

No real money moves. Jarso records that a parent handed over cash; there is no payment provider.

This spec builds on the milestone spec (D1, D4–D6, D11, §4 deltas, §7 constraints, §8 testing), `REQUIREMENTS.md` FR01/FR03, `docs/domain.md` and `docs/architecture.md` §5, §7.2 and §9. It covers what this brainstorm added or changed. Where it differs from those docs, this spec wins, and the slice updates the docs to match (§9).

## 2. Goals, non-goals, anti-goals

**Goals**

- The parent sets a recurring allowance in one simple screen: amount, how often (weekly, monthly, every 3 months, yearly), and first date.
- The parent can give a **one-time gift**, now or on a future date, with an optional note. It is a surprise: the child can't see it until it's handed over.
- The parent can **change**, **pause** (until a date, or until they resume it) and **stop** the allowance. The child sees that it's paused or stopped, plus the parent's optional message.
- Due allowances appear automatically, exactly once per period. Paused periods never become due.
- The parent confirms a handover on one screen, splitting the money between Spend (cash to child) and Save (parent keeps). The split starts from the previous handover's split.
- Confirmation posts to the ledger exactly once, even after double taps, retries and concurrent calls.
- The child's home screen shows the Spend and Save jars, an allowance card (schedule, next date, due badge or paused state) and a history of allowances and gifts.
- The parent sees the due badge for each unconfirmed allowance and each due gift.

**Non-goals (this slice)**

- **Child-planned split** (FR03 "child plans and previews the split"). Deferred: later, the child will choose how to split money after it's credited. For now the parent decides the split at handover.
- **Practice money** (FR01 last bullet). Deferred to the learning section (FR05/FR06).
- Notification rows and the inbox (slice 5). This slice leaves marked call sites (milestone spec §6, slice 5 row).
- Demo clock offset and its UI (slice 6). This slice does thread an injectable `now` through every time-based function and service (D11).
- Purchases, limits, requests (slices 3–4).

**Anti-goals (failure even if it "works")**

- The child can learn about a gift before it's handed over, whether through UI, API, RLS-visible rows, badge counts or totals.
- A balance changes without a parent confirmation, or changes twice for one handover.
- Due, paused or gift-in-waiting money appears in any balance or total.
- The setup screen grows beyond amount, frequency and date (plus the note for gifts).
- Copy shown to the child about a pause or stop sounds like a punishment or alarm (design.md voice). The parent's message is theirs; Jarso's own copy stays neutral and kind.

## 3. Decisions from this brainstorm (2026-10-29)

| # | Topic | Decision |
| --- | --- | --- |
| S1 | Setup screen | Amount, "How often" chips (Weekly, Monthly, Every 3 months, Yearly, One time), first date. Summary line under the date ("Every Sunday from 2 Nov"). Weekly day = weekday of the first date. Mockup: §5.1. |
| S2 | One-time gift | Parent-initiated extra money ("the parent's grace"). Same setup screen, "One time" chip: date becomes "Give on" (defaults to today) and an optional note field appears. Any number of gifts per child. |
| S3 | Gift is a surprise | Before handover the child can't see the gift anywhere: no schedule entry, no due badge, no count. **Enforced by RLS**, not only by the UI. After handover the child sees it in history with the note, marked as a gift. |
| S4 | Gift handover | Same handover screen as allowance. Records what the parent actually gave (any positive amount, more or less than planned). **No shortfall** for gifts; shortfall (D1) applies to allowance only. |
| S5 | Gift edit/cancel | Parent can edit amount, date and note, or cancel, while not handed over. Final once handed over. |
| S6 | Split at handover | Parent decides. Prefill = the save share of the child's most recent confirmed handover (allowance or gift) applied to the current amount; the first handover is all Spend. One-tap change via slider or typed amounts. |
| S7 | Pause | Pause **through** a date (auto-resumes after it) or until the parent taps Resume. Optional message to the child. Periods whose due date falls in the pause produce no occurrence and are **not paid later**. Occurrences already due before the pause stay due. |
| S8 | Stop | Ends the schedule. No new occurrences; already-due ones stay due. Parent can set up a new allowance afterwards. Child sees "Your allowance has stopped". |
| S9 | Child view when paused | Allowance card shows a "Paused" label, "Paused until <date>. Next one: <date>" (or "until a parent resumes it"), and the parent's message if any. Mockup: §5.3. |
| S10 | Not given | The parent can mark a due allowance as **not given**. It closes without any ledger entry (status `closed`, the status the milestone spec reserved), stops its badge and reminders, and is written to `audit_log`. Final, like a confirmed handover. This refines D5: missed occurrences still stay due one by one until the parent hands over or marks them not given. |

Calls I made (correct if wrong):

- **One recurring allowance per child** at a time (active or paused); any number of gifts.
- **Day 29–31 clamp** to the month's last day (already in architecture §7.2).
- **Gifts get their own table**, not a `frequency = once` schedule. They have no periods, no generator run and no shortfall, and their child visibility rule is different. "Due" for a gift is derived (`give_on <= family today` and not given/cancelled), so no cron is needed. Their ledger entries use a new `kind = parent_gift_in` and `source_type = parent_gift`, distinct from `gift_in` (money the child records from others, FR04) and `grant_in` (emergency, FR15).
- **Messages and notes** (pause message, gift note) are plain text, max 140 characters, trimmed, shown to the child as-is (React escapes it). Optional.
- **Prefill rounding:** the saved amount is rounded down to a whole minor unit; Spend gets the rest.
- **Changing while paused** is allowed; D6 still applies (from the next occurrence).
- **Change screen** reuses the setup screen, pre-filled, with the date labelled "Next one on". That date becomes the new anchor (stored on the schedule) for period stepping, so frequency and weekday/day-of-month can change without stop-and-recreate. It must be after the last generated period's due date. Generated occurrences are untouched (D6).
- **No past dates.** First date, "Next one on" and "Give on" must be today or later (family timezone), so nothing is backfilled. Validated in Zod and in the DB function.
- **Pause starts now.** No booking a pause ahead. Pause, resume and stop first run generation for that schedule up to family-today, so everything due up to and including the pause day becomes (and stays) due, however late the hourly job is. Periods after the pause day are skipped while paused.
- **Not given in history:** the parent sees "Not given". The child sees the same date with a neutral "Skipped" and no amount, so it reads as a fact, not a judgement.

## 4. Behaviour

### 4.1 Recurring allowance

- Schedule states: `active → paused → active`, `active | paused → stopped` (terminal).
- `generate_due_occurrences(now)` (hourly, pg_cron, `job_runs`): for each `active` schedule, and for each `paused` schedule whose `paused_through` is set and past, walk periods from `next_due_on` to family-today. Insert `allowance_occurrences (schedule_id, period_key)` on conflict do nothing for periods not inside a pause window; skip the rest. Advance `next_due_on`. Auto-resume: a paused schedule with `paused_through < family today` becomes `active` in the same transaction. This must also hold if the job runs late after several missed hours or days.
- Pause windows must be remembered so a late generator run doesn't create occurrences for paused periods. *Builder's call* whether that means storing pause intervals or advancing `next_due_on` past paused periods at pause and resume time. The test is that a period falling inside a pause never becomes due, however late the generator runs.
- Resume (manual): next occurrence = first period whose due date is ≥ family today. Periods skipped while paused stay skipped.
- Change (D6): amount and frequency changes apply from the next not-yet-generated occurrence. Generated occurrences keep their `amount_minor` snapshot.
- Pause, resume, change and stop are parent-only `security definer` functions, each writing `audit_log`.

### 4.2 Gifts

- `parent_gifts` (*builder may rename*): `id, family_id, child_id, amount_minor > 0, give_on date, note text null, status (pending | given | cancelled), cash_minor, saved_minor, given_by, given_at, created_by`.
- Due = `status = pending and give_on <= family today`. The parent's badge counts due gifts together with due allowances.
- Create, edit and cancel are parent-only functions. Edit and cancel are refused once `given`.
- **RLS:** only a parent of the child can select gift rows. The child never reads `parent_gifts`; a given gift reaches the child only as its ledger rows (label = note). No direct insert, update or delete for anyone; all writes go through functions.

### 4.3 Handover

- One server function per source, or one function taking a source; *builder's call*. Both lock the row (`for update`), require that it is due, take `(cash_minor, saved_minor, idempotency_key)`, require `cash, saved >= 0` and `cash + saved > 0`, and insert one ledger entry per non-zero jar with an idempotency key. Then they mark the row confirmed/given with who and when.
- Allowance: `cash + saved <= amount_minor`; `shortfall_minor = amount − (cash + saved)` (D1).
- Gift: no upper bound against the planned amount and no shortfall (S4). *My call:* a sanity cap of 100× the planned amount guards against typos.
- Exactly once comes from the row lock, not the key: any call on a row that is no longer due returns `already_confirmed`, whatever key it carries, and the UI shows that as success. The key is required but not stored; ledger keys derive from the source row (`occurrence:<id>:spend|save`, `parent_gift:<id>:spend|save`).
- **Not given (S10):** a parent-only function locks the due occurrence, sets `closed` with who and when, posts nothing, and writes `audit_log`. It is refused for a row that isn't due, and it races safely with `confirm_handover`: exactly one wins. The handover screen offers it as a quiet secondary action ("Mark as not given", with a confirm step).

### 4.4 What each role sees

| | Parent | Child |
| --- | --- | --- |
| Recurring schedule | Amount, frequency, next date, state; change/pause/resume/stop | Amount, frequency, next date; Paused/Stopped label and message |
| Due allowance | Due badge, opens handover | Badge "₹500 waiting for a parent" + "Waiting money isn't in your jars yet." |
| Pending gift (future or due) | Listed with date and note; due badge when due; edit/cancel | **Nothing** |
| Given gift | History | History with 🎁, note, amount |
| Jars | Confirmed balances only | Confirmed balances only |
| History | Allowances (with shortfall if any) and gifts | Allowances and gifts; shortfall shown gently (*my call:* "₹400 of ₹500") |

## 5. Screens

Approved as wireframes in the brainstorm; final look per `docs/design.md`.

### 5.1 Parent: set up allowance or gift

Title "Allowance for <nickname>". Card: amount (large number, currency symbol at 60 %). Card: "How often" chips. Card: "First one on" date with summary line ("Every Sunday from 2 Nov"). With "One time": label "Give on" (default today), plus "Note for <nickname> (optional)". Primary button "Save allowance" / "Save gift".

### 5.2 Parent: hand over

Title "Hand over to <nickname>". Card: "Due <date>" + Due badge + amount (minor units always shown on parent confirmation screens, design.md). Card: split bar (teal Spend / gold Save), two jar boxes "Spend (cash to <nickname>)" and "Save (you keep)", hint "Same split as last time. Drag or type to change." Primary "Confirm I handed it over". Allowance hint: "Gave less? Enter what you gave. The rest is noted as short." Gift: same, without the shortfall hint.

### 5.3 Parent: allowance page and pause sheet

Allowance page: amount + frequency, next date, buttons "Change amount or how often", "Pause", and destructive-styled "Stop allowance" (with confirm). Pause sheet: "Until" chips "A date" / "I resume it", date input, "Message for <nickname> (optional)", explanation "No allowance falls due while paused. Missed weeks aren't paid later. Anything already due stays due.", primary "Pause". A paused allowance page shows "Resume".

### 5.4 Child: home

Spend and Save jars (confirmed balances). Allowance card: "Your allowance", "₹500 every Sunday", "Next: <date>", due badge when one is waiting, and the paused or stopped state per S9. History card: allowances and gifts, newest first.

## 6. Data and docs deltas

- `allowance_schedules`: replace `active bool` with `status (active | paused | stopped)`. Add `paused_through date null`, `pause_message text null`, and whatever §4.1 needs to remember pause windows. Partial unique index: one schedule per child where `status in (active, paused)`. Drop `planned_save_minor` for now (child plan deferred; FR02 brings it back). `frequency` stays `weekly | monthly | quarterly | annual`; the UI labels them "Weekly / Monthly / Every 3 months / Yearly".
- `ledger_entries`: add `kind parent_gift_in` and `source_type parent_gift`. `ledger_entries` and `balance()` land in this slice per the milestone spec.
- `child_settings`: planned split no longer needed here; table lands when slice 3 needs `allow_negative_spend` (*builder's call* to create it now or then).
- New `parent_gifts` table (§4.2) with RLS per operation.
- Every new table: RLS enabled, explicit per-operation policies, in the same migration; regenerate `src/types/database.types.ts`.

## 7. Constraints

Milestone spec §7 applies in full. In particular: every money-changing write is a `security definer` function in one transaction with an idempotency key and unique constraint; app code never inserts into `ledger_entries` or `allowance_occurrences` or writes gift/occurrence status directly; integer minor units; `requireUser` / `assertUser` + `assertParentOf`; Zod at every boundary; feature module(s) per the `new-feature` skill (likely `src/features/allowance` and `src/features/ledger`, *builder's call*).

## 8. Testing

DB-level (local Supabase):

- Occurrence created exactly once under generator rerun and concurrent runs; late run after a gap creates each missed period once.
- Paused periods never become due, including when the generator runs late across the whole pause; auto-resume after `paused_through`; manual resume skips past periods; stop stops generation; already-due occurrences survive pause and stop.
- D6: a change after generation leaves existing occurrence amounts unchanged.
- Handover posts exactly once under double submit (same key) and concurrent calls (different keys); over-handover rejected for allowance; shortfall stored; gift accepts more or less than planned with no shortfall.
- Due money is never in `balance()`.
- Not given: closes with no ledger entry; refused when not due; concurrent not-given + handover → exactly one succeeds.
- Past first/next/give-on dates rejected; frequency change re-anchors without touching generated occurrences.
- **Gift secrecy:** as the child, selecting pending gifts (via the table, any view or RPC) returns nothing; after handover the given gift is visible.
- Child cannot call any parent function (create/change/pause/stop schedule, create/edit/cancel gift, confirm handover). Cross-family access is denied for every new table and function.
- Day 29–31 clamping and family-timezone due dates.

Unit: period stepping and clamping, pause-window skipping, prefill split, shortfall, summary-line text.

E2E: parent sets weekly allowance → occurrence due (via `now` injection or generator call in test) → child sees badge → parent hands over with a split → both see jars. Parent schedules a gift → child sees nothing → parent hands over → child sees the gift with its note. Parent pauses with a message → child sees Paused + message.

## 9. Docs to update in this slice

- `REQUIREMENTS.md`: FR01 adds one-time gifts, pause/stop and "not given" (D5 refined by S10). FR03 marks the child-planned split as deferred (parent decides at handover). FR01 practice-money bullet moves under the learning section/later.
- `docs/domain.md`: glossary entries for gift (parent's) vs gift (from others) and paused/stopped allowance; invariant: a pending gift is invisible to the child.
- `docs/architecture.md`: §5.1 entity changes (§6 above), §7.2 handover flow covering gifts and pause, §5.2 derived values (due now includes due gifts for parents).

## 10. Left to the builder

- Table/column/function names marked *builder's call*; error code names.
- How pause windows are stored (§4.1), as long as the tests in §8 pass.
- Single vs per-source handover function.
- Exact layout within `docs/design.md`.

## 11. Risks

- **Gift secrecy leaks through aggregates.** Any parent-facing view or function that counts or sums "due" items must not be callable by the child, or must filter gifts for them. Test via the child's session, not only by table.
- **pg_cron availability** on hosted Supabase: confirm the extension is enabled before merging (milestone spec §10). The app-side `/api/cron/[job]` fallback route is deferred until a job needs app code (slice 5).
