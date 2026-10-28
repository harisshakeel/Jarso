# Domain

Source of truth for product scope: [`REQUIREMENTS.md`](../REQUIREMENTS.md). This doc maps it onto the codebase.

Jarso teaches children aged **11–14** to manage pocket money, with a linked parent setting the allowance and confirming every handover. Pilot: parent + child roles, one currency, two jars (Spend, Save), one active savings goal per child. Jarso **records and teaches** — it never holds or moves real money. The AI guide (FR07, FR09) ships in a later version.

**Core rule: a balance counts only money a parent has confirmed handing over.** Due allowances are tracked separately and never appear in a balance.

## Glossary

| Term | Meaning |
| --- | --- |
| Parent / Child | The two roles. A parent manages only children linked to them; a child sees only their own data. |
| Family link | Parent–child relationship with an approval status. A child has no app access until approved. |
| Allowance | Parent-set amount + frequency (weekly/monthly/quarterly/annual). |
| Due allowance | One scheduled occurrence, created automatically, awaiting handover. Shows a due badge. Not balance. |
| Handover confirmation | Parent's one-screen record of cash given to the child (→ Spend) and amount kept as savings (→ Save). The only way allowance reaches a balance. |
| Planned split | Child's intended Spend/Save split per allowance. Prefills the handover screen and drives goal estimates. |
| Practice money | Fictional money for learning. Never mixed with recorded money. |
| Recorded money | Money tracked in Jarso's ledger (confirmed handovers, gifts, purchases, grants). |
| Jar | `spend` (cash the child holds) or `save` (money the parent keeps). Balance derived from ledger entries. |
| Transfer | Move between jars. **Not income.** Spend → Save posts on parent's receipt confirmation; Save → Spend is a savings withdrawal. |
| Purchase | Spend recorded by the child. Always recorded; breaking a spending limit sends the parent a notice. |
| Spending limit | Parent-set threshold that triggers a limit notice. Never blocks a purchase. |
| Savings withdrawal | Request to take money from Save: `pending` → `approved` → `handed_over`, or `rejected`. Posts only at handover. |
| Emergency grant | Extra money requested by the child; same approve → handover flow. Its own ledger kind. |
| Goal | Item + price the child saves toward; progress = confirmed Save balance vs price. |
| Diary entry | Received money or purchase: amount, label, jar. Correctable/undoable via reversing entries. |
| Mission | 2–3 minute daily learning activity in the 7-day journey. |
| Notification | Inbox item (+ optional web push) pointing at a record: due reminder, limit notice, request, decision. Never authoritative. |
| Guide | *Later version.* AI money helper with strict topic and safety boundaries. |

## Planned feature modules

| Module (`src/features/…`) | Requirements | Notes |
| --- | --- | --- |
| `auth`, `profiles` ✅ | FR13 | Exists. Add role + currency to profile. |
| `family` | FR13 | Parent–child links, approval, onboarding from either side. Basis of all cross-user RLS. |
| `allowance` | FR01, FR03 | Schedule; cron creates due occurrences (unique per schedule + period); handover confirmation writes `ledger`. |
| `ledger` | FR03, FR04, FR14, FR15 | Append-only money entries with explicit `kind`; balances derived. Single source of truth. Written only by confirmed handovers, child-recorded entries and corrections. |
| `jars` | FR03 | Planned split preview, transfers. Reads `ledger`. |
| `requests` | FR14, FR15 | Savings withdrawals and emergency requests: decision, then handover posts to `ledger`. |
| `limits` | FR14 | Spending limits; evaluates purchases after recording and raises limit notices. |
| `goals` | FR02, FR05 | Goal, plan, payments-remaining estimate, what-if simulation (no writes). |
| `diary` | FR04 | UI over `ledger` entries: add, correct, undo. |
| `learning` | FR06, FR08, FR10 | Missions, topics, spaced review, progress (separate from money). |
| `reviews` | FR11, FR12 | Weekly summary, next-step recommendation, resume state. |
| `notifications` | FR16 | Inbox, due badge, handover reminders (first milestone, no push needed); web push + PWA later in pilot. Sent after commit; failure never affects records. |
| `guide` *(later)* | FR07, FR09 | AI chat via Claude API; server-only; guarded prompts, rate limits, safety handling. |

## Invariants (enforce in DB + services, test them)

1. Money is integer **minor units**. No floats anywhere in money math.
2. Practice and recorded money never combine in a balance, total, or goal.
3. Allowance, savings-withdrawal and emergency money reach the ledger only through a parent's handover confirmation. Due amounts never count as balance.
4. Each scheduled occurrence is created once and confirmed at most once. Each request posts at most once. Every balance-changing write carries an idempotency key.
5. Pending, approved-not-handed-over and rejected requests never touch the ledger. Handover and its ledger entry commit together.
6. Limits never block a purchase. A limit breach produces a notice, not a rejection.
7. A savings withdrawal never exceeds the Save balance, checked at request and again at handover.
8. Transfers between jars do not change total income.
9. Spending from Spend does not change the savings estimate when future save contributions are unchanged (FR05).
10. Simulations ("predict before deciding", alternatives) never write recorded data.
11. Learning progress is independent of money saved; rewards recognise understanding, not wealth (FR12).
12. A family's records are visible only to that family's linked, approved members. Only the parent confirms handovers or changes parent-controlled settings.
13. Ledger history is never updated or deleted; corrections are reversing entries.
14. Notifications are derived from records; delivery failure never loses or reverses an action.
15. *(When the guide ships)* Guide never asks for personal/account info, recommends investments, or tells the child to buy something (FR09).
