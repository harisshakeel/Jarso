# Domain

Source of truth for product scope: [`REQUIREMENTS.md`](../REQUIREMENTS.md). This doc maps it onto the codebase.

Jarso teaches children aged **11–14** to manage pocket money, with a linked parent setting the allowance and confirming every handover. Pilot: parent + child roles, one currency, two jars (Spend, Save), one active savings goal per child. Jarso **records and teaches** — it never holds or moves real money. The AI guide (FR07, FR09) ships in a later version.

**Core rule: allowance, savings-deposit, savings-withdrawal and emergency money count only once a parent has confirmed the handover.** Due allowances and pending requests are tracked separately and never appear in a balance. Gifts and other money the child records count immediately.

## Glossary

| Term | Meaning |
| --- | --- |
| Parent / Child | The two roles. A parent manages only children linked to them; a child sees only their own data. |
| Family link | Parent–child relationship with an approval status. A child has no app access until approved. Child-initiated onboarding stores only a nickname and the parent's email until then. Approval records the parent's guardian consent (timestamp and consenting parent). A parent can have several linked children. |
| Allowance | Parent-set amount + frequency (weekly/monthly/quarterly/annual). |
| Due allowance | One scheduled occurrence, created automatically, awaiting handover. Shows a due badge. Not balance. |
| Handover confirmation | Parent's one-screen record of cash given to the child (→ Spend) and amount kept as savings (→ Save). The only way allowance reaches a balance. |
| Gift (from a parent) | One-time extra money the parent initiates, optionally dated in the future, with a note. Hidden from the child until handed over, then shown in history. Posts as `parent_gift_in` on handover confirmation. No shortfall. |
| Gift (from others) | Money the child records receiving from other sources (FR04). Child-recorded, counts immediately, kind `gift_in`. Not the same as a parent gift. |
| Paused / stopped allowance | Paused: no period falling in the pause becomes due, and skipped periods are not paid later; resumes after a set date or when the parent resumes it. Stopped: schedule ended for good. Occurrences already due stay due in both cases. The child sees the state and the parent's optional message. |
| Planned split | *Deferred.* Child's intended Spend/Save split per allowance. In the pilot the parent decides the split at handover, prefilled from the previous handover. |
| Practice money | Fictional money for learning. Never mixed with recorded money. |
| Recorded money | Money tracked in Jarso's ledger (confirmed handovers, gifts, purchases, grants). |
| Jar | `spend` (cash the child holds) or `save` (money the parent keeps). Balance derived from ledger entries. |
| Transfer | Move between jars. **Not income.** Spend → Save is a savings deposit; Save → Spend is a savings withdrawal. Both are requests. |
| Savings deposit | Request to move cash from Spend to Save: `pending` → `confirmed` (parent received the cash), or `cancelled` / `rejected`. Posts only at confirmation, unless the parent's auto-confirm rule covers it. |
| Purchase | Spend recorded by the child. Limits never block it (only the Spend-below-zero rule can, unless the parent allows overspending); breaking a spending limit sends the parent a notice. |
| Spending limit | Parent-set threshold (per purchase, per week or per month) that triggers a limit notice. Never blocks a purchase. |
| Savings withdrawal | Request to take money from Save: `pending` → `approved` → `handed_over`, or `rejected`. Posts only at handover. Pending and approved amounts are **reserved**. |
| Money rule | Parent-set rule for a child, one of four kinds: spending limit, withdrawal cap, auto-approve withdrawals, auto-confirm deposits. Each can be per item, per week and per month, at most one per kind and period. All off by default. |
| Auto-approve | A withdrawal that fits every auto-approve rule is approved at once. It still waits for the parent's handover before posting. |
| Auto-confirm | A deposit that fits every auto-confirm rule posts at once, without the parent confirming receipt. A parent-chosen exception (P6). |
| Held (Spend) | Spend money tied up by a pending deposit. Still in the balance; excluded from what the child can spend or deposit again. |
| Reserved | Save money tied up by a pending or approved withdrawal. Still in the balance; excluded from goal progress and from the withdrawal cap. |
| Emergency grant | Extra money requested by the child; same approve → handover flow. Its own ledger kind. |
| Goal | Item + price the child saves toward; progress = confirmed Save balance vs price. |
| Diary entry | Received money or purchase: amount, label, jar. Correctable/undoable via reversing entries. |
| Mission | 2–3 minute daily learning activity in the 7-day journey: 6–8 steps (choices, amounts, a Spend/Save slider, sorting, matching, predictions, reasons) with fictional amounts, instant feedback, two free hints, and the steps missed first time replayed once at the end. The next mission unlocks when the previous one is done; there is no day gate. |
| Topic | One of the five FR06 topics, with a page that explains, works an example and offers one practice question (FR08). Opening it never changes progress. |
| Check-in | Five starting questions before mission 1 (FR10). Places, doesn't test: no score is shown and nothing is locked. |
| Practice | One-minute spaced review: one question per due skill from the review pool, in a new situation, at most five per set. Boxes of 1, 3, 7 and 14 days. |
| Skill level | Per skill: Started (seen in a mission), Practised (right in a mission), Got it (right without hints in a review). Learning progress, never shown next to money. |
| Notification | Inbox item (+ optional web push) pointing at a record: due reminder, limit notice, request, decision. Never authoritative. |
| Guide | AI money helper (Claude) with strict topic and safety boundaries (ADR 0010). Off for each child until a parent turns it on; parents can read every chat. |

## Planned feature modules

| Module (`src/features/…`) | Requirements | Notes |
| --- | --- | --- |
| `auth`, `profiles` (partial) | FR13 | Email sign-in exists. Add `role`, currency, and nickname-only child onboarding. **Role and family links are assigned server-side only and never appear in a user-writable schema such as `updateProfileSchema`.** |
| `family` | FR13 | Parent–child links, approval, onboarding from either side. Basis of all cross-user RLS. |
| `allowance` | FR01, FR03 | Schedule; cron creates due occurrences (unique per schedule + period); handover confirmation writes `ledger`. |
| `ledger` | FR03, FR04, FR14, FR15 | Append-only money entries with explicit `kind`; balances derived. Single source of truth. Written only by confirmed handovers, child-recorded entries and corrections. |
| `jars` | FR03 | Planned split preview, transfers. Reads `ledger`. |
| `requests` | FR14, FR15 | Savings deposits, savings withdrawals and emergency requests: decision, then handover or receipt confirmation posts to `ledger`. Reserves Save for pending/approved withdrawals. |
| `limits` | FR14 | Spending limits; evaluates purchases after recording and raises limit notices. |
| `goals` | FR02, FR05 | Goal, plan, payments-remaining estimate, what-if simulation (no writes). |
| `diary` | FR04 | UI over `ledger` entries: add, correct, undo. |
| `learning` ✅ | FR06, FR08, FR10 | Missions, topics, spaced review, check-in, progress (separate from money). Content as JSON (ADR 0009). |
| `reviews` | FR11, FR12 | Weekly summary, next-step recommendation, resume state. |
| `notifications` | FR16 | In-app inbox in the first milestone: due badge, handover reminders, limit, new-request and decision notices, no push needed; web push + PWA later in pilot. Sent after commit; failure never affects records. |
| `guide` ✅ | FR07, FR09 | AI chat via the Claude API; server-only; screened pipeline, rate limits, budget, safety handling, parent switch and transcripts (ADR 0010). |

## Invariants (enforce in DB + services, test them)

1. Money is integer **minor units**. No floats anywhere in money math.
2. Practice and recorded money never combine in a balance, total, or goal.
3. Allowance, parent-gift, savings-deposit, savings-withdrawal and emergency money reach the ledger only through a parent's handover or receipt confirmation. Due and pending amounts never count as balance. Gifts the child records post immediately. The one exception is a deposit the parent's auto-confirm rule covers (P6).
4. Each scheduled occurrence is created once and confirmed at most once. Each request posts at most once. Every balance-changing write carries an idempotency key.
5. Pending, approved-not-handed-over, cancelled and rejected requests never touch the ledger. Handover and its ledger entry commit together.
6. Limits never block a purchase. A limit breach produces a notice, not a rejection. Separately, a purchase that would take Spend below zero is refused unless the parent allows overspending (D2). A purchase saved on the device carries the device time (up to 7 days back, `docs/architecture.md` 10.1), so a backdated purchase counts in that past spend-limit window and can avoid that window's notice. This is an accepted trade-off for a self-reported diary.
7. A savings withdrawal never exceeds the unreserved Save balance, and a savings deposit never exceeds the Spend balance, checked at request and again at handover or confirmation. Pending and approved withdrawals reserve Save: included in the balance, excluded from goal progress and from the cap. A pending deposit holds its amount in Spend.
8. Transfers between jars do not change total income.
9. Spending from Spend does not change the savings estimate when future save contributions are unchanged (FR05).
10. Simulations ("predict before deciding", alternatives) never write recorded data.
11. Learning progress is independent of money saved; rewards recognise understanding, not wealth (FR12).
12. A family's records are visible only to that family's linked, approved members. Only the parent confirms handovers or changes parent-controlled settings.
13. Ledger history is never updated or deleted; corrections are reversing entries.
14. Notifications are derived from records; delivery failure never loses or reverses an action.
15. Role and parent–child links are assigned server-side. No user-writable input (profile update, sign-up metadata, API body) can set or change them.
16. Child-initiated onboarding stores only a nickname and the parent's email until the parent approves.
17. A pending parent gift is invisible to the child: no row, count, total or date reaches a child session. Enforced by RLS (`parent_gifts` is readable by parents only) and by keeping parent-only aggregates out of child reach. A given gift reaches the child only as its ledger rows, labelled with the note.
18. The guide never asks for personal or account information, recommends investments, products or shops, or tells the child to buy something (FR09). Enforced by its prompt, an input screen, an output screen and fixed copy, and tested by the eval gate (ADR 0010).
