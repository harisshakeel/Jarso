# Domain

Source of truth for product scope: [`REQUIREMENTS.md`](../REQUIREMENTS.md). This doc maps it onto the codebase.

Jarso teaches children aged **11–14** to manage pocket money. v1: one child profile, one currency, two jars (Spend, Save), one active savings goal. Jarso **records and teaches** — it never holds or moves real money.

## Glossary

| Term | Meaning |
| --- | --- |
| Allowance | Expected pocket money (amount + frequency). Only enters a balance when marked **received**. |
| Practice money | Fictional money for learning. Never mixed with recorded money. |
| Recorded money | Real pocket money the child logs. |
| Jar | `spend` or `save` bucket with a balance derived from ledger entries. |
| Transfer | Move between jars. **Not income.** |
| Goal | Item + price the child saves toward; progress = Save jar vs price. |
| Diary entry | Received money or purchase: amount, label, jar. Correctable/undoable. |
| Mission | 2–3 minute daily learning activity in the 7-day journey. |
| Guide | AI money helper with strict topic and safety boundaries. |

## Planned feature modules

| Module (`src/features/…`) | Requirements | Notes |
| --- | --- | --- |
| `auth`, `profiles` ✅ | FR01 (profile) | Exists. Extend profile with currency + allowance. |
| `allowance` | FR01 | Amount, frequency, "mark received". |
| `ledger` | FR03, FR04 | Append-only money movements; balances derived. Single source of truth for jars + diary. |
| `jars` | FR03 | Allocation preview/confirm, transfers. Reads `ledger`. |
| `goals` | FR02, FR05 | Goal, plan, payments-remaining estimate, what-if simulation (no writes). |
| `diary` | FR04 | UI over `ledger` entries: add, correct, undo. |
| `learning` | FR06, FR08, FR10 | Missions, topics, spaced review, progress (separate from money). |
| `guide` | FR07, FR09 | AI chat via Claude API; server-only; guarded prompts, rate limits, safety handling. |
| `reviews` | FR11, FR12 | Weekly summary, next-step recommendation, resume state. |

## Invariants (enforce in DB + services, test them)

1. Money is integer **minor units**. No floats anywhere in money math.
2. Practice and recorded money never combine in a balance, total, or goal.
3. Transfers between jars do not change total income.
4. Spending from Spend does not change the savings estimate when future save contributions are unchanged (FR05).
5. Simulations ("predict before deciding", alternatives) never write recorded data.
6. Learning progress is independent of money saved; rewards recognise understanding, not wealth (FR12).
7. Guide never asks for personal/account info, recommends investments, or tells the child to buy something (FR09).
