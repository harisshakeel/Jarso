# Domain

Source of truth for product scope: [`REQUIREMENTS.md`](../REQUIREMENTS.md). This doc maps it onto the codebase.

Jarso teaches children aged **11–14** to manage pocket money, with a linked parent setting the allowance and confirming every handover. Pilot: parent + child roles, one currency, two jars (Spend, Save), one active savings goal per child. Jarso **records and teaches**: it never holds or moves real money. Jarso, the AI money guide (FR07, FR09), is in the pilot behind the `FEATURE_GUIDE` flag and a per-child parent switch. Children and parents use the same backend from the web app (`apps/web`) and the Expo phone app (`apps/mobile`).

**Core rule: allowance, savings-deposit, savings-withdrawal and emergency money count only once a parent has confirmed the handover.** Due allowances and pending requests are tracked separately and never appear in a balance. Gifts and other money the child records count immediately.

## Glossary

| Term | Meaning |
| --- | --- |
| Parent / Child | The two roles. A parent manages only children linked to them; a child sees only their own data. |
| Family link | Parent–child relationship with an approval status. A child has no app access until approved. Child-initiated onboarding stores only a nickname and the parent's email until then. Approval records the parent's guardian consent (timestamp and consenting parent). A parent can have several linked children. |
| Allowance | Parent-set amount + frequency (weekly/monthly/quarterly/annual). |
| Due allowance | One scheduled occurrence, created automatically, awaiting handover. Shows a due badge. Not balance. |
| Handover confirmation | Parent's one-screen record of cash given to the child (→ Spend) and amount kept as savings (→ Save). The only way allowance reaches a balance. |
| Card handover | A second way for the parent to hand over a due allowance or gift: pay the full amount by card through a payment provider (Stripe or Razorpay, test mode; the parent picks one, and several can be on at once). Posts the same ledger rows as cash, with `method = card`. A test-mode showcase; real payments are not in the pilot (ADR 0013). |
| Payment | One card payment for one due occurrence or gift: `pending` → `requires_action` → `succeeded`, or `failed` / `canceled` / `expired`; `succeeded_unapplied` when the card payment landed after the item was already handed over, closed or cancelled (nothing posts). |
| Auto charge | A per-schedule and per-gift toggle. When an item falls due after the toggle was turned on, Jarso charges the parent's saved card once, at the provider the toggle recorded (a parent holds one saved card per provider). A failed attempt leaves the item due and notifies the parent; there is no retry. |
| Gift (from a parent) | One-time extra money the parent initiates, optionally dated in the future, with a note. Hidden from the child until handed over, then shown in history. Posts as `parent_gift_in` on handover confirmation. No shortfall. |
| Gift (from others) | Money the child records receiving from other sources (FR04). Child-recorded, counts immediately, kind `gift_in`. Not the same as a parent gift. Its inbox notice to the parents is `money_received` (amount, category, jar). |
| Paused / stopped allowance | Paused: no period falling in the pause becomes due, and skipped periods are not paid later; resumes after a set date or when the parent resumes it. Stopped: schedule ended for good. Occurrences already due stay due in both cases. The child sees the state and the parent's optional message. |
| Planned split | How each allowance divides into Spend and Save, set by the parent with the allowance (ADR 0019): the Save part is stored, Spend is the rest. A new allowance starts at 25 % to Save (rounded down to a whole currency unit). Each due allowance carries the split it had when it fell due, and the handover opens prefilled with it; without one, the handover is prefilled from the previous handover. The parent still decides at handover, and the child's allowance-day plan suggests what to move into Save. |
| Practice money | Fictional money for learning. Never mixed with recorded money. |
| Recorded money | Money tracked in Jarso's ledger (confirmed handovers, gifts, purchases, grants). |
| Jar | `spend` (cash the child holds) or `save` (money the parent keeps). Balance derived from ledger entries. |
| Transfer | Move between jars. **Not income.** Spend → Save is a savings deposit; Save → Spend is a savings withdrawal. Both are requests. |
| Savings deposit | Request to move cash from Spend to Save: `pending` → `confirmed` (parent received the cash), or `cancelled` / `rejected`. Posts only at confirmation, unless the parent's auto-confirm rule covers it or the parent set jar moves to "just tell me" (`child_settings.jar_moves_approval = notify`: posts at once, `auto`, and the parent gets a `jar_moved` notice). |
| Purchase | Spend recorded by the child. Limits never block it (only the Spend-below-zero rule can, unless the parent allows overspending); breaking a spending limit sends the parent a notice. |
| Spending limit | Parent-set threshold (per purchase, per week or per month) that triggers a limit notice. Never blocks a purchase. |
| Savings withdrawal | Request to take money from Save: `pending` → `approved` → `handed_over`, or `rejected`. Posts only at handover, unless the parent set jar moves to "just tell me" (`notify`: recorded as `handed_over` at once under the caps, `auto`, with a `jar_moved` notice to the parent). Pending and approved amounts are **reserved**. |
| Money rule | Parent-set rule for a child, one of four kinds: spending limit, withdrawal cap, auto-approve withdrawals, auto-confirm deposits. Each can be per item, per week and per month, at most one per kind and period. All off by default. |
| Auto-approve | A withdrawal that fits every auto-approve rule is approved at once. It still waits for the parent's handover before posting. |
| Auto-confirm | A deposit that fits every auto-confirm rule posts at once, without the parent confirming receipt. A parent-chosen exception (P6). |
| Held (Spend) | Spend money tied up by a pending deposit. Still in the balance; excluded from what the child can spend or deposit again. |
| Reserved | Save money tied up by a pending or approved withdrawal. Still in the balance; excluded from goal progress and from the withdrawal cap. |
| Emergency grant | Extra money requested by the child; same approve → handover flow. Its own ledger kind. |
| Goal | Item + price the child saves toward; progress = confirmed Save balance vs price. |
| Diary entry | Received money or purchase: amount, label, jar and a category (a fixed list: spending on snacks, games, clothes, going out, a gift, school, travel, apps, other; received from family, birthday, a job, a sale, found, other). Correctable/undoable via reversing entries. |
| Fix chain | A fixed line is a reversal of the old line plus a new line with the same kind, jar and `occurred_at`, linked by `corrects_entry_id`. The first line of the chain (the root) sets the windows: undo within 24 hours and fix within 7 days of its `created_at`. Only the newest line is live; earlier versions are read through `list_entry_versions`. |
| Mission | 2–3 minute daily learning activity in the 7-day journey: 6–8 steps (choices, amounts, a Spend/Save slider, sorting, matching, predictions, reasons) with fictional amounts, instant feedback, two free hints, and the steps missed first time replayed once at the end. The next mission unlocks when the previous one is done; there is no day gate. |
| Topic | One of the five FR06 topics, with a page that explains, works an example and offers one practice question (FR08). Opening it never changes progress. |
| Check-in | Five starting questions before mission 1 (FR10). Places, doesn't test: no score is shown and nothing is locked. |
| Practice | One-minute spaced review: one question per due skill from the review pool, in a new situation, at most five per set. Boxes of 1, 3, 7 and 14 days. |
| Skill level | Per skill: Started (seen in a mission), Practised (right in a mission), Got it (right without hints in a review). Learning progress, never shown next to money. |
| Notification | Inbox item (+ optional web or phone push) pointing at a record: due reminder, limit notice, request, decision, money received, a fixed entry, a jar move, a failed card charge, a parent note, Jarso noticed. Never authoritative. |
| Guide | AI money helper (Claude) with strict topic and safety boundaries (ADR 0010). On for each child by default; a parent can turn it off at any time and can read every chat. |
| Jar moves approval | Per-child parent setting `child_settings.jar_moves_approval`: `ask` (the default: each savings deposit and withdrawal waits for the parent) or `notify` ("just tell me": the move posts at once under the money rules and the parent gets a `jar_moved` notice). |
| Allowance-day plan | On the child's Home on the day an allowance lands, Jarso proposes how much of the Spend part to put into Save: enough to keep the goal on track, or 30 % as a saving habit when there is no goal, never more than 60 % of the allowance in Save. Pure arithmetic, no model. One tap records it as an ordinary savings deposit, so the jar moves approval applies. |
| Match | "Match their saving": the parent adds money straight to the child's Save, recorded as a parent gift handed over at once with the note "Matching your saving". |
| Parent note | A short note (at most 140 characters) a parent sends a child from the dashboard. It lands in the child's Notifications as a `parent_note` notice; the notice row is the note. |
| Jarso noticed | The weekly nudge: each Sunday (17:00 UTC) each approved child gets at most one note about their own money, picked in code from one signal, with a matching notice to each parent. Where Jarso is on and within budget, Claude Haiku may reword the child's line, and the reworded line is kept only if it passes the output screen. A child gets at most one nudge in 6 days. |
| Quiet hours | From 21:00 to 07:00 in the family's timezone a child's push notices are held; the first sweep at or after 07:00 sends them, two or more as one summary push. The inbox gets every notice at once. Fixed, shown to the child as information. |
| Sparks | Points a child earns for recorded actions, awarded inside the database: a diary log 10, the daily check-in 5, a lesson step 15, a savings deposit 20, a goal milestone 25, a goal reached 100. Daily caps (3 logs, 1 check-in, 20 steps, 2 saves) and once-for-life keys bound them. Never money (invariant 20). |
| Level | 1 to 10, from the child's Sparks total (0, 100, 250, 450 … 3,200), each with a name from "Jar Starter" to "Jar Legend". |
| Badge | One of 23 fixed achievements for logs, check-ins, streaks, saves, missions, goals and levels (`child_badges`). Earned once and kept. |
| Streak (days in a row) | Days in a row with activity. In Learn, days in a row with any learning, worked out from the results and never called lost. In progress, active days in a row with one rest day each week covering a single missed day. |
| Points | Learning points for answers: 10 for a first try with no hints, 6 with help, 2 for trying. Shown with the child's personal bests, never on a leaderboard. |
| Jarso look | The mascot's lid colour and outfit, which the child picks; outfits unlock by level. |
| Buddy | One of the four coaches (Pip, Bo, Zuzu, Nell) who appear in lessons and on the child's screens. The child picks one as their own buddy in the welcome tour. |
| Welcome tour | The child's first visit: their buddy walks them round Home and each tab, one thing at a time, with recorded voices. It only opens tabs and never changes money. Saved in `child_tours`; the child can replay it. |
| Lesson film | The animated intro of a mission on the web, with each spoken line a recorded voice file and the browser's own voice as the fallback. |

## Module map

Each module keeps one name across layers: pure rules, schemas and copy in `packages/core/src/<name>` (`@jarso/core/<name>`), Supabase reads and writes shared by both apps in `packages/data/src/<name>` (`@jarso/data/<name>`), web components and server code in `apps/web/src/features/<name>`, and phone screens' pieces in `apps/mobile/src/features/<name>`. The layers each module has are listed as core (c), data (d) and web (w).

| Module | Layers | Requirements | Responsibility |
| --- | --- | --- | --- |
| `auth` | c, w | FR13 | Sessions and the data access layer (`requireUser`, `assertUser`, `requireRole`), parent email sign-in and sign-up. |
| `profiles` | c, d, w | FR13 | Display name and the parent's own details (date of birth, country, gender; 18 or over). **Role and family links are assigned server-side only and never appear in a user-writable schema such as `updateProfileSchema`.** |
| `family` | c, d, w | FR13 | Families, members, invitations both ways, child accounts and PINs, approval, child sign-in, rename and remove. Basis of all cross-user RLS. |
| `allowance` | c, d, w | FR01, FR03 | Schedules, due occurrences (unique per schedule and period), pause, stop, not given, parent gifts, match, and the handover that writes the ledger. |
| `ledger` | c, d, w | FR03, FR04 | Append-only money entries with an explicit `kind`; jars, balances, history, the jar graph and "where your money went". Single source of truth for money. |
| `diary` | c, d, w | FR04 | The child's purchases and money received, with categories, fix and undo over ledger entries. Fixing a line with a new amount sends the parents an `entry_corrected` notice; a category or name change alone is quiet. |
| `requests` | c, d, w | FR03, FR14, FR15 | Savings deposits, savings withdrawals and emergency requests: decision, then handover or receipt confirmation posts to the ledger. Reserves Save for pending and approved withdrawals; holds Spend for pending deposits. Also the allowance-day plan card. |
| `rules` | c, d, w | FR14 | Money rules (spending limit, withdrawal cap, auto-approve, auto-confirm), the overspend switch and the jar moves approval. Limits are evaluated after a purchase is recorded and raise limit notices. |
| `goals` | c, d, w | FR02, FR05 | One active goal per child with name, emoji, price and the child's plan; counted progress (Save − reserved), payments left, the coin staircase, and predict before deciding (no writes). |
| `learning` | c, d, w | FR06, FR08, FR10, FR12 | Missions, topics, hints, spaced review, check-in, skill levels, points, days in a row, personal bests, coaches and lesson films. Content as JSON in `packages/content` (ADR 0009); progress separate from money. |
| `review` | c, w | FR11 | The weekly review, built in code from the week's history, the goal, skill progress and the review pool, with one fresh question. |
| `progress` | c, d | FR12 | Sparks, levels, badges, the forgiving streak and the Jarso look. The award engine lives in Postgres triggers; nothing here touches money. |
| `mascot` | c | FR12 | Jarso the mascot: moods, lid colours, outfits unlocked by level, and the jar's drawing geometry. |
| `tour` | c, d, w | FR12 | The child's welcome tour: steps, words (`@jarso/content/tour`), the buddy's recorded voices, and saving the buddy and the finish. |
| `dashboard` | c, d, w | FR01, FR03, FR04, FR10 | The parent's Home, Money and Children views: family totals, the money chart, spending by category, what's coming up, the family board of missions, jars and goals, merged activity, and the facts behind Jarso's family summary. Never ranks one child against another. |
| `notifications` | c, d, w | FR16 | The in-app inbox, parent notes, web push (ADR 0012) and phone push through Expo, quiet hours, per-phone push settings, and the invitation email adapter. Push is an at-most-once copy of the inbox row (`pushed_at`), sent after commit; failure never affects records. |
| `payments` | c, d, w | FR01 | Card handover and auto charge over `@/lib/payments` (Stripe, Razorpay, test mode): pay by card on the web, native payment sheets on the phone, saved cards, the webhook state machine and the auto-charge run. Never posts to the ledger itself; `apply_payment` does (ADR 0013, 0014, 0018). |
| `guide` | c, d, w | FR07, FR09 | Jarso, the AI guide on the Claude API: screened pipeline, read-only look-ups, drafts a tap confirms, the allowance-day plan, photo price check, Jarso noticed, memories, rate limits, budget, safety handling, parent switch and transcripts (ADR 0010, 0011). |
| `offline` | c, w | FR04, FR06 | Network resilience: online-only actions with time limits, and the device outbox for purchases and lesson answers, with its storage behind ports each app implements. |
| `landing` | w | | The public landing page. |
| `config`, `lib` | c | | Shared ground: countries, currencies and helplines; money, dates, errors, logger and timed fetch. Import no feature. |

## Invariants (enforce in DB + services, test them)

1. Money is integer **minor units**. No floats anywhere in money math.
2. Practice and recorded money never combine in a balance, total, or goal.
3. Allowance, parent-gift, savings-deposit, savings-withdrawal and emergency money reach the ledger only through a parent's handover or receipt confirmation. Due and pending amounts never count as balance. Gifts the child records post immediately. The one exception is a deposit the parent's auto-confirm rule covers (P6).
4. Each scheduled occurrence is created once and confirmed at most once. Each request posts at most once. Every balance-changing write carries an idempotency key.
5. Pending, approved-not-handed-over, cancelled and rejected requests never touch the ledger. Handover and its ledger entry commit together. A "just tell me" move is the one request that posts in the same transaction it is created in; it is still a request row (`auto`), so every count and limit sees it.
6. Limits never block a purchase. A limit breach produces a notice, not a rejection. Separately, a purchase that would take Spend below zero is refused unless the parent allows overspending (D2). A purchase saved on the device keeps the time it was made, from its age on the server clock (up to 7 days back, `docs/architecture.md` 10.1), so a backdated purchase counts in that past spend-limit window and can avoid that window's notice. This is an accepted trade-off for a self-reported diary.
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
17. An allowance's planned split always adds up to its amount (Save `0..amount`, Spend the rest) and is never money: it only prefills the handover, posts nothing and never counts in a balance.
17. A pending parent gift is invisible to the child: no row, count, total or date reaches a child session. Enforced by RLS (`parent_gifts` is readable by parents only) and by keeping parent-only aggregates out of child reach. A given gift reaches the child only as its ledger rows, labelled with the note.
18. The guide never asks for personal or account information, recommends investments, products or shops, or tells the child to buy something (FR09). Enforced by its prompt, an input screen, an output screen and fixed copy, and tested by the eval gate (ADR 0010). It never writes money or records itself: it can prepare a goal or an action, and only the user's tap runs it, through the same service as the app's form (ADR 0011, amendment of 2026-11-03).
19. A card payment posts to the ledger at most once, through the same source lock as a cash handover, and only on a success the provider itself reports: a verified webhook event, or the provider's authenticated response to the server's own auto-charge request (`chargeSaved`). Never from the browser's success redirect. The success redirect, a retried or out-of-order webhook, a double click and an auto charge racing a manual payment cannot post twice. An item gets at most one automatic charge attempt. The child never sees card details, payment state or a failed charge.
20. Sparks are never money (2026-11-06). They live in `spark_events` and `child_progress`, never in `ledger_entries`, and no balance, total or goal counts them. They come only from recorded actions (a diary log, a savings deposit, a lesson step, a milestone of a real goal, the daily check-in), never from practice: practice rows never reach the award engine. They are never clawed back: undoing or fixing a diary line, or a refused request, leaves the Sparks and badges already earned. Each award happens once for life (`source_key` is unique per child) and within daily caps, so repeating an action earns little: the caps bound how many logs and saves pay each day. Sparks are not money, and the daily log and save caps bound how many pay; a goal reached pays at most once in any rolling 7 days, and the `goal_reached` badge means real saving, not a target moved down. Every award is best effort: a failure never blocks or reverses a money or lesson write.
21. Progress is private to the child's family: the child and their parents read Sparks, level, streak and badges; only the child reads the per-day activity. Nothing about it reaches another family, and a child's streak is forgiving (one rest day a week), never a penalty.
