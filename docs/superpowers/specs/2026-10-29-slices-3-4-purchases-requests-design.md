# Slices 3 and 4: purchases, money rules, withdrawals and deposits (design)

Date: 2026-10-29. Status: draft for approval.

## 1. Intent

Slices 3 and 4 of the first milestone (`2026-10-28-first-milestone-design.md` §6). After slice 2 the child has Spend and Save jars filled by parent handovers. These two slices let money leave and move between them:

- **Slice 3:** the child records a purchase from Spend. The parent can set spending limits that never block a purchase but send the parent a notice. The parent decides whether Spend may go below zero (D2).
- **Slice 4:** the child asks to take money out of Save (withdrawal) or put cash into Save (deposit). The parent can set how much the child may withdraw and how much goes through without them.

The driving idea from this brainstorm: **parents get freedom to set restrictions however they want**, and nobody does manual bookkeeping that the system can do. Every rule is optional, per child, and can apply per item, per week or per month.

No real money moves. Save is a pretend account the parent holds; Spend is cash in the child's pocket. A payment provider (real bank account, card) comes later. When it does, (a) the "money actually moved" step of a withdrawal or deposit becomes a provider transfer instead of a parent confirming cash, and (b) purchases log themselves from card transactions. Neither is built now, but the design keeps one seam for (a) (§4.5).

This spec builds on the milestone spec (D2, D3, D10, D11, §7 constraints, §8 testing), the slice 2 design, `REQUIREMENTS.md` FR03/FR14/FR16, `docs/domain.md` and `docs/architecture.md`. Where it differs from them, this spec wins and the slices update the docs (§9).

## 2. Goals, non-goals, anti-goals

**Goals**

- The child records a purchase in two fields (amount, optional "what for") and one tap. Spend drops at once.
- The parent decides per child whether Spend may go below zero (D2, default off).
- The parent sets **money rules** per child, each optional and each per item, per week or per month:
  - **Spending limit:** a purchase over it is still recorded; the parent gets a notice.
  - **Withdrawal cap:** a withdrawal over it cannot be requested.
  - **Auto-approve withdrawals:** a withdrawal within it is approved the moment the child asks.
  - **Auto-confirm deposits:** a deposit within it lands in Save the moment the child records it.
- The child asks to withdraw from Save (amount + reason) and sees status: waiting for a parent, approved, handed over, not approved.
- The child records putting cash into Save; it lands when the parent confirms receipt, or at once under auto-confirm.
- Pending and approved withdrawals show as **reserved**; the child can only ask for unreserved Save.
- Withdrawals and deposits log themselves into history when the money moves. The child never records them by hand.
- Every money move posts exactly once under double taps, retries, and two parents acting at once.

**Non-goals (these slices)**

- Payment provider, real bank accounts, card feeds, automatic purchase logging (later).
- Purchase categories, receipts, photos.
- Inbox UI, unread badge, reminders, email (slice 5). These slices **write** notification rows (§4.6); slice 5 shows and delivers them.
- Emergency requests (FR15), gifts from others and corrections in the diary (FR04), goals (FR02). Request and rule tables are shaped so FR15 slots in.
- Child-planned split (deferred in slice 2).
- Demo clock offset UI (slice 6). `now` stays injectable (D11).

**Anti-goals (failure even if it works)**

- **Parent buried in notifications.** Auto-approved and auto-confirmed moves never notify. A spending limit notifies once per window it is crossed, not on every purchase after.
- **Child gives up logging.** Recording a purchase takes more than amount, optional label, one tap.
- **Parent can't work out the rules.** The rules screen needs explanation beyond the plain sentence on each rule.
- **A wrong balance.** Any double post, any post without the required confirmation, any withdrawal beyond unreserved Save, any deposit beyond Spend.
- Child-facing copy that scolds (over limit, not approved, overspent). Jarso's copy stays neutral and kind (design.md voice).

## 3. Decisions from this brainstorm (2026-10-29)

| # | Topic | Decision |
| --- | --- | --- |
| P1 | Purchase logging | Child taps to record (amount + optional "what for"). Automatic logging arrives with the payment provider, not now. |
| P2 | Withdrawal and deposit logging | Automatic: the ledger rows are written when the money moves (parent handover / receipt confirmation, or auto-confirm). The child never records them. |
| P3 | Save is a pretend account | For now. Later a real bank account via a payment provider. The "money moved" step is one function so a provider can call it later (§4.5). |
| P4 | Money rules are flexible | Four rule kinds (spending limit, withdrawal cap, auto-approve withdrawals, auto-confirm deposits). Each can be set per item, per week and per month, in any combination, at most one per kind and period. Extends D3, which covered spending limits only. |
| P5 | Auto-approve | A withdrawal that fits **every** auto-approve rule set for the child is approved at once. Real cash still changes hands, so it still waits for the parent's handover before posting. |
| P6 | Auto-confirm deposits | A deposit that fits every auto-confirm rule posts at once, without the parent confirming receipt. **A deliberate, parent-chosen exception** to invariant 3. Off unless the parent sets it. |
| P7 | Anti-goals | All four raised in §2 matter equally to the user. |
| P8 | Undo a purchase | The child can undo their own purchase **within 24 hours** of recording it. The parent sees the line marked "Undone" in history; no notification. |

Calls I made (correct if wrong):

- **Defaults:** no rules, overspending off. That reproduces the milestone behaviour: every withdrawal needs approval, every deposit needs receipt confirmation, the only cap is unreserved Save.
- **Windows:** week = Monday 00:00 to Sunday 24:00, month = calendar month, both in the family timezone. A request or purchase belongs to the window containing its `occurred_at`.
- **What counts toward a window:**
  - Spending limit: non-reversed purchases in the window, including the new one.
  - Withdrawal cap: withdrawals that are pending, approved or handed over in the window, plus the new one. Pending counts so the child can't queue many requests around the cap.
  - Auto-approve: withdrawals approved or handed over in the window (auto or by the parent), plus the new one.
  - Auto-confirm: deposits confirmed in the window (auto or by the parent), plus the new one.
  - Rejected and cancelled requests never count.
- **Rules apply when the child acts.** Changing a rule affects new purchases and requests only. At handover and receipt confirmation the **balance** checks (invariant 7) run again, the rules don't. A withdrawal approved last week is not refused because the parent lowered the cap since.
- **Spending limit notice fires once per window, on the purchase that first takes the total over.** Per item: every purchase over it notifies (each is its own window). If a purchase is undone and a later one crosses again in the same window, no second notice (the existing notice row for that window blocks it).
- **Undo mechanics (P8):** undo posts a `reversal` entry; it never deletes. A limit notice already sent stays. Full diary corrections stay in FR04.
- **Pending deposits hold Spend** (from the builder check). A deposit waiting for the parent's confirmation holds its amount in Spend, the mirror of `reserved_save`. `held_spend(child)` = sum of pending deposits. Purchases (D2 check) and new deposits use `balance(spend) − held_spend`; confirming a deposit re-checks against Spend minus the *other* held deposits. So a parent holding the cash can always confirm it. With overspending allowed, a purchase may take Spend below zero, but never below the held amount: held money is spoken for. The child sees "£5 waiting to go into Save".
- **One purchase crossing several spending limits** writes one notice per rule crossed (each deduped per its own window). The parent's inbox (slice 5) may group them.
- **`now` is never a caller input.** User-facing functions use `now()` internally, as in slice 2; only internal or service-role variants take `p_now` (D11), so a child can't backdate a purchase out of a limit window or the undo window.
- **Only the child records purchases** and creates requests. The parent cannot record a purchase for the child in these slices.
- **Who can cancel:** the child can cancel their own pending request. The parent can reject a pending withdrawal, or cancel an approved one before handover ("Didn't hand it over"). Both release the reservation and post nothing.
- **Handover amount is the requested amount.** No partial withdrawals or deposits. A parent who gives a different amount rejects and the child asks again.
- **Notifications table lands in slice 3** (the milestone spec left it to the builder). Slices 3 and 4 insert real rows in the same transaction as the record change (ADR 0006). Slice 5 adds deliveries, inbox and badge.
- **One rules screen per child**, with the overspend toggle on the same screen.

## 4. Behaviour

### 4.1 Purchases (slice 3)

- `record_purchase(child_id, amount_minor, label, idempotency_key)`: caller must be the child (`is_self`). Takes the child's ledger advisory lock (lock order as slice 2). Let `free = balance(spend) − held_spend` (`held_spend` is 0 until slice 4 adds deposits). If `allow_negative_spend` is off and `free − amount < 0`, refuse with a friendly code (`JA422`, *builder may rename*) and post nothing. Otherwise insert one `purchase` entry (`jar spend`, `direction out`, `source_type diary`, key `purchase:<child>:<idempotency_key>`), then evaluate spending limits (§4.3), all in one transaction.
- Retrying with the same key returns the original entry (no second row, no second notice).
- If overspending is allowed, still refuse when the purchase would take Spend below `held_spend` (held money is spoken for).
- `undo_purchase(entry_id)`: caller must be the child who owns it. Refuses non-purchase entries and purchases recorded more than 24 hours ago (P8). Inserts a `reversal` (`direction in`) entry; the existing unique index allows one reversal per entry. History (`list_ledger_history` or its caller) marks the reversed purchase "Undone" for both roles.
- Amount 1..`MAX_AMOUNT_MINOR`; label trimmed, ≤ 60 chars (*my call*), empty → null.

### 4.2 Overspending (slice 3)

- `child_settings (child_id pk, family_id, allow_negative_spend bool default false, updated_by, updated_at)`. Parent-only writes via `set_allow_negative_spend(child_id, allowed)`; audited. Child and parents can read.
- Turning it off when Spend is already negative changes nothing retroactively; further purchases are refused until Spend recovers.

### 4.3 Money rules (rules in slice 3, request kinds used from slice 4)

- `money_rules (id, family_id, child_id, kind, period, amount_minor, created_by, updated_by, updated_at)`. `kind in ('spend_limit', 'withdrawal_cap', 'withdrawal_auto_approve', 'deposit_auto_confirm')`, `period in ('item', 'week', 'month')`, unique `(child_id, kind, period)`. Turning a rule off deletes its row (audited); history of changes lives in `audit_log`.
- Writes via `set_money_rule(child_id, kind, period, amount_minor | null)` (null = off), parent-only. Reads: child and parents.
- One evaluator, `rule_window_total(child, kind, period, at)` (*builder may restructure*), used by every function that checks rules, so the counting in §3 lives in one place and is unit-testable in pgTAP.
- Slice 3 ships the table with all four kinds allowed and the screen showing the spending-limit and overspend sections. Slice 4 adds the withdrawal and deposit sections.

### 4.4 Withdrawals (slice 4)

States: `pending → approved → handed_over`; `pending → rejected`; `pending → cancelled` (child); `approved → cancelled` (parent, not handed over).

- `create_withdrawal(child_id, amount_minor, reason, idempotency_key)`: child only. Takes the ledger advisory lock. Refuses if `amount > available_save` (`available_save = balance(save) − reserved_save`) or if any withdrawal cap would be exceeded (friendly codes, the child sees which rule in plain words: "You can take out up to £15 a week. £10 is already taken out or waiting."). Inserts the request `pending`, then if it fits every auto-approve rule (and at least one exists) moves it to `approved` with `decided_by = null, auto = true`. Notices per §4.6.
- `decide_withdrawal(request_id, approve bool, note)`: parent only; locks the request; only from `pending`. Approve re-checks `available_save` (another request may have been approved meanwhile). Reject posts nothing.
- `complete_request(request_id, idempotency_key)`: parent only for withdrawals; locks the request, then takes the ledger advisory lock. Only from `approved`; `handed_over` returns `already_completed` (exactly once, like slice 2). Re-checks `amount <= balance(save) − reserved_save excluding this request`. Inserts `withdrawal_out` (Save) and `withdrawal_in` (Spend), keys `request:<id>:out|in`, `source_type request`, sets `handed_over`.
- `cancel_request(request_id)`: child for own `pending`; parent for `pending` or `approved` withdrawals. Posts nothing.
- `reserved_save(child)`: sum of `pending` + `approved` withdrawals. Shown to the child and parent; excluded from the cap and (later) goal progress.

### 4.5 Deposits (slice 4)

States: `pending → confirmed`; `pending → rejected`; `pending → cancelled` (child).

- `create_deposit(child_id, amount_minor, idempotency_key)`: child only. Ledger lock. Refuses if `amount > balance(spend) − held_spend`. Inserts `pending`; if it fits every auto-confirm rule (and at least one exists) it completes in the same transaction (posts and sets `confirmed`, `auto = true`).
- `complete_request` for a deposit: parent only; re-checks `amount <= balance(spend) − held_spend excluding this request`; inserts `deposit_out` (Spend) and `deposit_in` (Save); sets `confirmed`.
- `decide_deposit(request_id, note)` with reject only ("Didn't get it"): parent only, from `pending`; posts nothing, releases the hold, notifies the child. The decision note, for both kinds, is stored on the request.
- **Provider seam (P3):** `complete_request` is the only function that posts a request's ledger rows, for both kinds and both auto and manual paths. A future provider callback calls the same internal posting routine with a provider reference instead of a parent. Nothing provider-specific is built now.

### 4.6 Notices (rows in `notifications`)

`notifications (id, family_id, recipient_id, child_id, kind, source_type, source_id, window_key null, payload jsonb, created_at, read_at)`. RLS: recipient can select; no direct writes; inserted by the definer functions in the same transaction. Unique `(recipient_id, kind, source_type, window_key)` where `window_key` is set, so a limit notice per window is created once.

| Event | Recipient | Kind |
| --- | --- | --- |
| Purchase crosses a spending limit | each approved parent | `limit_exceeded` |
| Withdrawal needs approval (not auto-approved) | each approved parent | `withdrawal_requested` |
| Withdrawal approved by a parent / rejected | child | `withdrawal_decided` |
| Deposit waiting for receipt (not auto-confirmed) | each approved parent | `deposit_requested` |
| Deposit rejected | child | `deposit_decided` |

No notice for: auto-approved withdrawals, auto-confirmed deposits, handovers, cancellations, purchases under limits. Auto-approved withdrawals still need the parent to hand cash over; they appear in the parent's existing "Needs you" list, which is a to-do, not a notification.

### 4.7 What each role sees

| | Parent | Child |
| --- | --- | --- |
| Jars | Spend (may be negative if allowed), Save, reserved | Same, plus "available to take out" |
| Purchases | In history | Record, see in history, undo own |
| Money rules | Set per child | Read, in plain words ("You can take out up to £5 without asking") |
| Withdrawals | Needs you: approve/reject pending; hand over approved | Ask, see status, cancel pending |
| Deposits | Needs you: confirm receipt | Record, see status, cancel pending |
| Notices | Rows written (inbox in slice 5) | Rows written (inbox in slice 5) |

## 5. Screens

Final look per `docs/design.md`. Copy is draft; the builder polishes within the voice rules.

- **Child home:** existing jars gain a "Spent something?" primary action and, on the Save jar, "Take out" and "Put in". The Save jar shows "£X waiting to come out" when anything is reserved.
- **Record purchase sheet (child):** amount, "What for? (optional)", button "Save". When D2 refuses: "That's more than you have in Spend (£4.20). Record money you got first, or ask a parent." History shows each purchase with an "Undo" action.
- **Take out sheet (child):** "You can take out up to £X" (min of available Save and remaining cap), amount, "What's it for?", button "Ask". Result: "Sent to your parent" or, if auto-approved, "Approved, your parent will hand it over".
- **Put in sheet (child):** "Spend has £X", amount, button "Put in". Result: "Waiting for your parent to confirm" or, if auto-confirmed, "Added to Save".
- **Held money:** the Spend jar shows "£X waiting to go into Save" while a deposit is pending; Put in and purchase sheets use Spend minus held.
- **Child requests list:** status chips Waiting / Approved / Done / Not approved / Cancelled, cancel on Waiting.
- **Parent money rules page** (`/parent/children/[childId]/rules`): sections "Spending", "Taking money out of Save", "Putting money into Save". Each rule row is a sentence with an amount and per item / per week / per month chips, plus a switch: "Tell me when Maya spends more than [£10] [a week]", "Maya can take out at most [£30] [a month]", "Maya can take out up to [£5] [per time] without asking me", "Add deposits up to [£10] [a week] without me confirming". Overspend switch: "Let Maya's Spend go below zero". A summary line under each section ("Withdrawals over £5 come to you for approval").
- **Parent Needs you list:** gains withdrawal requests (Approve / Not now), approved withdrawals ("Hand over £10 to Maya" → confirm), and deposits ("Maya gave you £5?" → Confirm / Didn't get it).

## 6. Data and docs deltas

- New tables: `child_settings`, `money_rules`, `requests` (`kind in ('withdrawal', 'deposit')`, ready for `emergency` later; `status`, `amount_minor`, `reason`, `auto bool`, `decided_by`, `decided_at`, `completed_by`, `completed_at`, `occurred_at`, `idempotency_key` unique per child), `notifications`. RLS on each with explicit per-operation policies; all writes through `security definer` functions.
- Existing `ledger_entries` kinds `purchase`, `deposit_out/in`, `withdrawal_out/in`, `reversal` and source types `request`, `diary` are already there; no ledger schema change expected.
- Every new money-changing function follows slice 2: lock the row, then the per-child ledger advisory lock, idempotency key, `now` parameter, `JA403` unless the right role, audited.

## 7. Constraints

All CLAUDE.md hard rules and milestone spec §7. In particular: integer minor units, ledger written only by definer functions, row lock + advisory lock in slice 2's lock order, `now` injectable, notifications in the same transaction as the change, no `process.env` outside config.

## 8. Testing

- **pgTAP:** D2 refuse/allow; limit notice once per window and per item; window boundaries in a non-UTC family timezone (week crossing Sunday→Monday local, month end); cap refuses including pending; auto-approve only when every rule fits; auto-confirm posts at once and only within rules; reserved excluded from cap; two concurrent withdrawals cannot overdraw; double `complete_request` posts once; reject/cancel post nothing; deposit beyond Spend refused at request and at confirmation; cross-family access denied for every new table and function; child cannot write rules or settings; undo reverses once and is refused after 24 hours; held Spend blocks a purchase or second deposit that would leave a pending deposit unconfirmable.
- **Unit:** Zod schemas, plain-words rule descriptions, service error mapping, sheets' available-amount maths.
- **E2E:** slice 3: set limit → child records purchase over it → recorded, notice row exists; overspend off blocks, on allows. Slice 4: child asks → parent approves → hands over → jars update; auto-approve path; deposit confirm path and auto-confirm path.

## 9. Docs to update in these slices

- `REQUIREMENTS.md` FR14: money rules (P4), auto-approve (P5), auto-confirm exception (P6), undo purchase; FR03 transfers wording.
- `docs/domain.md`: glossary (money rule, auto-approve, auto-confirm), invariant 3 note for P6, invariant 7 unchanged.
- `docs/database.md`: new tables and functions.
- Milestone spec D3: points here for the extension.
- `docs/fr-audit.md`: FR01, FR03, FR14 status.

## 10. Left to the builder

- Exact table, column, function and error-code names; whether create functions are split per kind or one `create_request`.
- How `window_key` is formatted (e.g. `spend_limit:week:2026-W44`).
- Whether rule evaluation is one SQL function or inlined per caller, as long as the counting lives in one place.
- Screen layout within design.md, including whether "Needs you" groups by child.

## 11. PRs

1. **Slice 3:** `child_settings`, `money_rules` (all kinds), `notifications`, `record_purchase`, `undo_purchase`, rules screen (spending + overspend), purchase sheet and undo, docs.
2. **Slice 4:** `requests`, `reserved_save`/`available_save`, withdrawal and deposit functions, rules screen sections for withdrawals and deposits, child sheets and request list, parent Needs you items, docs.

Slice 4 depends on slice 3 (rules table, notifications). Each is one PR with a Conventional Commits title.

## 12. Risks

- **Auto-confirm undermines invariant 3** by the parent's choice. Mitigation: off by default, plain-words warning on the switch ("Deposits will count before you get the cash").
- **Rule combinations confuse parents.** Mitigation: sentence-style rows plus per-section summary; tested with a parent before slice 4 merges if possible.
- **Timezone windows** are the classic off-by-one; pgTAP covers non-UTC boundaries.
