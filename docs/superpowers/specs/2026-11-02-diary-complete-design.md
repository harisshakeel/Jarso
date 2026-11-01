# Money diary complete (FR04): what-for, money received, fixes

Date: 2026-11-02. Owner: Pratyush. Closes the last open FR (`docs/fr-audit.md`, FR04 Partial). Unblocks the FR05 prediction before a purchase. That hook is not part of this work.

## Why

FR04 needs three things `main` doesn't have yet:

1. A child can record money received from other sources ("a gift"), which counts at once.
2. Entries can be **corrected**, and the correction stays traceable. Today there is only a 24-hour undo, and only for purchases.
3. Each entry carries "the relevant jar" and a short label. Purchases have the jar but no structured "what for".

The product owner's direction: the child should record **where their money goes**, and the UI should be built around that. A child who taps "Snacks" four times this week can then see "most of your money went on snacks", and that is the learning moment. Typing free text in a form would not give them that.

## Goals

- Recording a purchase asks "what was it for?" as one tap on a chip. This is the core of the change.
- The child records money received, with who or what it came from and which jar it goes in.
- The child can fix a recent purchase or money-received line. The history shows what it was and what it is now.
- A "Where your money went" card, written as sentences, for the child and for the parent.

## Non-goals

- Categories made by the parent or the child. The list is fixed in code.
- A budget per category, or a limit per category. Money rules stay as they are.
- Charts, ledgers or tables. PR #55's rule holds: money is shown as cards and sentences.
- The FR05 prediction before a purchase. It comes next, in its own PR.
- Fixing allowance, parent gift, request, grant or payment lines. Those belong to the parent's flows.
- Moving a line to the other jar with a fix.
- Practice money. The diary writes recorded money only.

## Anti-goals (a failure even if it works)

- Judging copy about categories ("too much on games!"), comparing children, or ranking categories as good or bad.
- A parent approval step for money received. FR04 says it counts at once.
- Rewriting or deleting history. A fix is a reversal plus a new linked line (domain invariant 13).
- Making recording slower. A purchase stays one screen: amount, one tap, a button.

## Decided with the product owner

- **Layout A** (mockup in `.superpowers/brainstorm/`, `purchase-where.html`): one sheet with the amount at the top, a 3×3 grid of "What was it for?" chips, an optional name, and "Write it down".
- Playback of the purchase part, the money-received part and the corrections part was accepted as written. The details below marked *(my call)* are what was played back, plus what I settled after the review.

## Behaviour

### 1. Purchase: what was it for

- The sheet keeps its current fields and order. Between the amount and the name it adds **"What was it for?"**, a 3×3 grid of chips, each an emoji and a word. Choosing one is required. Nothing is picked until the child taps, and "Write it down" stays disabled until a chip is chosen. The button's helper text says "Pick what it was for".
- Spend categories (fixed, in this order): 🍫 Snacks `snacks`, 🎮 Games `games`, 👕 Clothes `clothes`, 🎟️ Going out `going_out`, 🎁 A gift `gift_for_someone`, ✏️ School `school`, 🚌 Travel `travel`, 📱 Apps `apps`, ✨ Other `other`.
- The name stays optional, up to 60 characters. Its placeholder follows the chip ("What snack?").
- Everything else stays the same: limits never block, the only refusal is Spend going below zero while overspend is off, the limit notice goes out once per window, and the 24-hour undo works as before.
- The offline purchase outbox (`features/offline/outbox`) carries the category with the purchase. A purchase queued before this ships has no category and posts as `other`.

### 2. Money received

- On Diary, next to the existing "Spent money" action, a **"Got money"** action opens a sheet with the same shape:
  - amount
  - **"Where did it come from?"**: a 3×2 grid of chips, one required: 👪 Family `family`, 🎂 Birthday `birthday`, 🧹 Did a job `job`, 🏷️ Sold something `sold`, 🪙 Found it `found`, ✨ Other `other`
  - **"Which jar?"**: two jar buttons, Spend chosen by default. When Save is chosen, a line appears: "Give the cash to your parent to keep."
  - an optional name ("Nani's birthday")
  - "Write it down"
- It posts at once as a `gift_in` entry in the chosen jar, with `source_type = 'diary'`. No request is made and no rule applies. Balances, the goal line and the goal-reached moment update through the existing derivations.
- The parents get a `money_received` notice in the inbox: "Aria wrote down £20.00 from Birthday." They can open it and read it, but there is nothing to approve. A push goes out through the existing FR16 path.
- Received money can be undone within 24 hours, like a purchase. The undo is refused when taking the money out would push Spend below zero while overspend is off, or would push Save below what open withdrawals have reserved. The copy says why, kindly.
- Money received needs a connection *(my call)*. The sheet uses the same online guard as the other non-queued actions.

### 3. Fix a line

- Tapping one of the child's own purchase or money-received lines on Diary opens its detail. It offers **"Fix this"** while the line is fixable, and Undo while undo is allowed.
- Fixable means: kind `purchase` or `gift_in`, `source_type = 'diary'`, not undone, not already replaced, and first written no more than **7 days** ago *(my call)*. For a line that has been fixed before, the 7 days count from the first line in the chain.
- In "Fix this" the child can change the amount, the category and the name. The jar can't be changed, and the screen says so: "To move money between jars, put it in or take it out."
- Saving the fix runs one transaction under the child's ledger lock:
  1. it writes a `reversal` of the current line, the same way undo does;
  2. it writes a new line of the same kind and jar with the new values, linked to the line it replaces;
  3. it applies the same balance guards as recording and undo (Spend can't go below zero while overspend is off; Save can't go below the reserved amount);
  4. for a purchase, it runs `evaluate_spend_limits` on the new line, so a fix that crosses a limit sends the notice once, as a new purchase would.
  A fix that changes nothing is refused as "Nothing changed".
- History shows only the current line, with a small "Fixed · was £5.00 · Snacks" note. Tapping the note shows the earlier versions, greyed out. The reversal and the replaced lines never appear as lines of their own in either history, and they never add up twice in balances, the weekly review or the category card.
- Undo on a fixed line undoes the current line. The 24 hours count from the first line in the chain.
- The parents get an `entry_corrected` notice only when the amount changes: "Aria fixed a purchase: £5.00 → £3.50." A change of category or name alone sends no notice.
- Fixes need a connection *(my call)*.

### 4. Where your money went

- A card on the child's Diary tab, below the jars, covering this week (Monday to Sunday, the same window as the weekly review):
  - one headline sentence: "Most of your spending went on 🍫 Snacks: £7.50."
  - up to three more sentences: "Then 🎮 Games: £4.00. 🚌 Travel: £2.00." Anything else is summed as "and £1.50 on other things."
  - a money-in line when there was any: "You got £20.00 (🎂 Birthday)."
  - an empty state when nothing has been spent: "Nothing spent this week yet."
- The parent sees the same card on the child's page, on the money tab from #58 if it has merged, otherwise under the child's history.
- The copy is neutral and states facts only. No judging words, no comparing with other children, no "too much", no percentages of the allowance.
- The weekly review (FR11) gets one optional line: "This week most went on Snacks." Everything else in the review stays as it is.
- Jarso (FR07) sees the category on history look-ups, so a child can ask "what did I spend most on?". This only adds a field to the existing read-only tool output. The frozen FR09 prompt doesn't change.

## Data and backend (constraints for the builder)

- Money stays in integer minor units. Recorded money and practice money never mix.
- `ledger_entries` gets:
  - `category text`, nullable, with a check that ties the allowed values to the kind (spend keys only for `purchase`, received keys only for `gift_in`, null for every other kind except `reversal`, which copies the category of the line it reverses).
  - `corrects_entry_id uuid` referencing `ledger_entries(id)`, unique where not null, set only on the new line a fix writes. The chain is walked through this column.
- Existing purchases have no category. They are read as `other`, so there's no backfill.
- New or changed security definer functions follow the existing pattern (an internal `_at(p_now)` seam with no grants, a public wrapper, `JA403` for missing or foreign entries, `22023` for invalid input, an advisory lock per child):
  - `record_purchase(...)` gains `p_category`. Keep the old signature or drop it in the same migration, whichever keeps the offline outbox and the generated types consistent.
  - `record_money_received(p_child_id, p_amount_minor, p_jar, p_category, p_label, p_idempotency_key)`
  - `undo_purchase` widens to cover `gift_in` with the balance guard. It can be renamed `undo_diary_entry` with the old name kept as an alias, *(my call)*.
  - `correct_diary_entry(p_entry_id, p_amount_minor, p_category, p_label, p_idempotency_key)`
- New notification kinds: `money_received` and `entry_corrected`, with `source_type = 'ledger_entry'`. The kind check constraint is replaced the same way earlier migrations did it.
- RLS doesn't change: ledger writes still go only through definer functions. The parent's existing read of the child's ledger shows the new columns. There are no new tables.
- `list_ledger_history`, or the TypeScript layer over it, has to hide reversal and replaced lines that belong to a fix chain, and return the "was" values for the note. Undo's existing "Undone" display stays as it is for plain undos.
- The category card is computed in TypeScript from the week's history in `features/diary` (or `features/ledger`, if that's where the week read already is), the same way `features/review/build.ts` does it. No new SQL aggregate is needed at about 60 users.
- Zod schemas: category enums live in `features/diary/schemas.ts` and are exported for the outbox. The label stays at most 60 characters.
- Tests: pgTAP for each new function (guards, the chain, idempotency, the 7-day and 24-hour windows, the notice only when the amount changes, the category check), unit tests for the card's sentences and the chain display, and e2e for recording with a chip, money received into Save, and a fix that shows "was".

## Left to the builder

- The exact chip emoji and copy tweaks within `docs/design.md` §voice.
- Whether the detail view is a sheet or a page, as long as it matches how the Diary tab works today.
- How the migration is split.
- Where the "Got money" action sits next to "Spent money", as long as both can be reached with one tap from Diary.

## Settled after the builder check *(all my calls)*

1. **Time on a fix.** The reversal and the new line both keep the **original line's `occurred_at`**. A fix replaces the line where it was: same week, same place in history, same limit window. `created_at` records when the fix happened. Paging on `occurred_at` doesn't change.
2. **Windows count from `created_at`.** Both the 24-hour undo and the 7-day fix count from the `created_at` of the first line in the chain, not from `occurred_at`. That way a purchase synced late from the offline outbox gets its full undo and fix time. This changes the current undo, which uses `occurred_at`, and the pgTAP tests are updated to match.
3. **No second limit notice from a fix.** The item-limit dedupe key uses the first entry in the chain (`spend_limit:item:<root_id>`). Week and month keys already dedupe per window. A fix can still send a notice when it is the first thing to cross a limit.
4. **Notices across undo and fix.**
   - Undoing money received sends no new notice. Notices open the record's current state (the FR16 pattern), so a `money_received` notice opened after an undo shows the line as Undone, and one opened after a fix shows the current version.
   - `money_received` points at the line it was sent for, and `entry_corrected` at the new line. Both open the parent's history page for the child, which always shows the current line, so the inbox never has to walk the chain.
   - `entry_corrected` covers both kinds, and its copy follows the kind: "Aria fixed a purchase: £5.00 → £3.50" / "Aria fixed money they got: £20.00 → £15.00". It is sent only when the amount changes.
5. **Weekly review counts diary money received.** `HistoryItem` gets a kind for diary money received, and `weekMoney` adds it to `receivedMinor`. That matches the FR11 wording ("received" already lists gifts) and keeps the review in line with the new card.
6. **The card's money-in line covers all money in this week**, by source: "You got £30.00: £10.00 allowance, £20.00 🎂 Birthday." Allowance, parent gifts and extra money use their existing names, and diary lines use their chip. With three or more sources, the two biggest are named and the rest go in "and £x from other places".
