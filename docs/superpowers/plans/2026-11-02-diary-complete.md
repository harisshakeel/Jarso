# Money diary complete (FR04) Implementation Plan

> **Status: shipped** in #65.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every purchase gets a "what was it for" chip, the child records money received, the child fixes a recent line with a trail you can follow, and a "Where your money went" card shows the week as sentences.

**Architecture:** One migration adds `category` and `corrects_entry_id` to `ledger_entries` and the definer functions for money received, undo (widened) and fix. History reads hide the replaced and reversal rows of a fix chain and carry the "was" values. Category constants live in `features/ledger` (the column's owner), and `features/diary` builds the sheets on top of them. The card is a pure function over `HistoryItem[]`.

**Tech Stack:** Supabase Postgres (plpgsql, pgTAP), Next.js 16 Server Actions (`createAction`), Zod, React 19 `useActionState`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-02-diary-complete-design.md` (binding: read it in full before any task).

## Global Constraints

- `CLAUDE.md` hard rules apply: feature modules, barrels, never mixing server and client in a barrel, route → service → repository, Zod on every input, `AppError` and `logger`, no `console.log`, Biome only.
- **Do not commit and do not `git add`.** Leave all work in the working tree (user rule). Where the template says "Commit", read it as "stop and report".
- **No Docker and no local Supabase.** Never `db reset` or `supabase start`. DB work runs against the hosted project:
  - load env in a subshell with `set -a; . ./.env.local.remote.bak; set +a`, and never print it or read it into chat;
  - run `supabase migration list --linked` first, then `supabase db push --linked --dry-run`;
  - **ask the user before the real `db push --linked`**;
  - then `supabase test db --linked` and `pnpm db:types:linked`.
- Unit tests live in `tests/`, mirroring `src/`, and import via `@/…`.
- Money is integer minor units. The diary writes `mode = 'recorded'` only.
- Copy is in the docs/design.md §9 voice: short, kind, no judging words, no comparing children, no percentages of the allowance.
- Spend category keys and order: `snacks` 🍫 Snacks, `games` 🎮 Games, `clothes` 👕 Clothes, `going_out` 🎟️ Going out, `gift_for_someone` 🎁 A gift, `school` ✏️ School, `travel` 🚌 Travel, `apps` 📱 Apps, `other` ✨ Other.
- Received category keys and order: `family` 👪 Family, `birthday` 🎂 Birthday, `job` 🧹 Did a job, `sold` 🏷️ Sold something, `found` 🪙 Found it, `other` ✨ Other.
- Windows: undo is 24 h and fix is 7 days, **both counted from the `created_at` of the first line in the chain**. A fix's reversal and its new line keep the original `occurred_at`.
- Before reporting, run `pnpm lint && pnpm typecheck && pnpm vitest run <touched test paths>`. If the suite runs out of memory, add `--pool=forks --maxWorkers=2`.

## Review Focus

1. **Double counting a fixed line.** After a fix, balances, the weekly review, the card and the limit window totals must count only the current line. Test: in Task 1, the pgTAP test checks that after a fix `balance()` equals the start minus the new amount. In Task 3, a unit test checks that history returns one item for a chain of 3.
2. **Undoing money received when Spend has since been spent.** Got £20, spent £15, undo is refused, and the balance doesn't go below zero. Test: Task 1 pgTAP `undo_diary_entry` returns `not_enough_spend` in that case.
3. **A purchase queued offline before this ships** (no `category` in its payload) must still post. Test: Task 2, the outbox route test posts a purchase payload without `category` and expects `category: "other"` to reach `recordPurchase`.
4. **Fixing a line that's already been replaced, from a stale tab.** The second fix of the same old id must be refused, not branch the chain. Test: Task 1 pgTAP, a second `correct_diary_entry` on the replaced id returns `not_fixable`.
5. **A line that synced late from offline.** A purchase with `occurred_at` 6 days back but `created_at` now can still be undone and fixed. Test: Task 1 pgTAP with `record_purchase_at` and a back-dated `p_occurred_at`.

---

### Task 1: Migration: categories, fix chain, money received, notices

Use the `db-migration` skill. Read `20261029183422_purchases.sql`, `20261030130002_device_occurred_at.sql` (current `record_purchase`), `20261031020000_requests.sql` (`reserved_save`, `held_spend`) and `20261031064410_payments.sql` (the current `list_ledger_history` v3 and the `notifications_kind_check`) first.

**Files:**
- Create: `supabase/migrations/<ts>_diary_complete.sql` (via `pnpm db:migration diary_complete`)
- Create: `supabase/tests/database/diary_complete.test.sql`
- Modify: `supabase/tests/database/purchases.test.sql` (undo window now runs from `created_at`; calls to the new `record_purchase` signature)
- Modify: `src/types/database.types.ts` (regenerated)

**Interfaces (Produces):**
- `ledger_entries.category text null`. The check ties it to the kind: spend keys when `kind = 'purchase'`, received keys when `kind = 'gift_in' and source_type = 'diary'`, any key or null when `kind = 'reversal'`, and null otherwise. Existing rows stay null.
- `ledger_entries.corrects_entry_id uuid null references ledger_entries(id)`, with a unique partial index where it is not null.
- `diary_chain_root(p_entry_id uuid) returns ledger_entries`: internal with no grants. It walks `corrects_entry_id` back to the first line.
- `record_purchase(p_child_id uuid, p_amount_minor bigint, p_label text, p_idempotency_key text, p_occurred_at timestamptz default null, p_category text default 'other') returns jsonb`. Drop the 5-arg version, and do the same for `record_purchase_at`, which gains `p_category`. A null `p_category` means `'other'`. The returned shapes don't change.
- `record_money_received(p_child_id uuid, p_amount_minor bigint, p_jar text, p_category text, p_label text, p_idempotency_key text) returns jsonb` and the `_at(..., p_now)` seam:
  - writes `{status:'recorded', entry_id}`, with key `received:<child>:<key>`;
  - the kind is `gift_in`, the direction `in`, and `source_type = 'diary'`;
  - sends `notify_parents(child, 'money_received', 'ledger_entry', entry, null, {amount_minor, category, jar})`.
  - The same child, approved-member and input checks as purchases apply. It raises `22023` for a jar outside spend/save or a category that isn't a received key.
- `undo_diary_entry(p_entry_id uuid) returns text` and its `_at` seam. It returns `'undone' | 'already_undone' | 'too_late' | 'not_enough_spend' | 'not_enough_save'`.
  - It covers `purchase` and diary `gift_in`, and works on the current line of a chain. A replaced line raises `22023`.
  - The window is `root.created_at >= p_now - 24h`.
  - Undoing a `gift_in` refuses with `not_enough_spend` when it would break the overspend rule, using the same formula as `record_purchase` with the amount taken out. It refuses with `not_enough_save` when `balance(save) - amount < reserved_save`.
  - The reversal keeps the line's `occurred_at`.
  - `undo_purchase(p_entry_id)` stays as a thin alias that returns the same text. Grants match the old ones.
- `correct_diary_entry(p_entry_id uuid, p_amount_minor bigint, p_category text, p_label text, p_idempotency_key text) returns jsonb` and its `_at` seam. It returns one of:
  - `{status:'fixed', entry_id}`
  - `{status:'unchanged'}`
  - `{status:'not_fixable'}` when the line is replaced, undone, not a diary purchase or gift_in, or older than 7 days from the root's `created_at`
  - `{status:'not_enough_spend', free_minor}` or `{status:'not_enough_save'}`

  Lock order: the entry `for no key update`, then the child's ledger advisory lock (the same as undo). It writes the reversal (key `reversal:<id>`, the original `occurred_at`) and then the new line (key `fix:<child>:<key>`, the same kind, jar and `occurred_at`, `corrects_entry_id = p_entry_id`).
  - For a purchase, it runs `evaluate_spend_limits(new)`.
  - When the amount changed, it sends `notify_parents(child, 'entry_corrected', 'ledger_entry', new, null, {kind, old_amount_minor, amount_minor})`.
  - A repeated key returns the first result.
- `evaluate_spend_limits`: the item key becomes `'spend_limit:item:' || diary_chain_root(id).id`.
- `notifications_kind_check` = the current list plus `'money_received', 'entry_corrected'`.
- `list_ledger_history` v4: it is v3 plus these columns:
  - `category text`, `corrects_entry_id uuid`
  - `replaced boolean` (exists a row whose `corrects_entry_id = id`)
  - `window_from timestamptz` (the root's `created_at`)
  - `prev_amount_minor bigint`, `prev_category text`, `prev_label text` (from the row `corrects_entry_id` points at)
- `list_entry_versions(p_entry_id uuid) returns table(id uuid, amount_minor bigint, category text, label text, created_at timestamptz)`, oldest first, for the whole chain. The caller must be the child or a parent of the child, otherwise `JA403`.
- Re-apply revoke/grant for every new or replaced function, following the grants block in `20261031064410_payments.sql`. The `_at` seams and `diary_chain_root` get no grants.

- [ ] **Step 1: Write `diary_complete.test.sql`.** Use `_helpers.psql` the same way `purchases.test.sql` does. Assertions, at minimum:
  - `record_purchase` with `p_category => 'snacks'` stores `snacks`, and with no category stores `other`.
  - The category check rejects `'snacks'` on a `gift_in`.
  - `record_money_received` to save raises `balance(save)` at once, and writes one `money_received` row per parent.
  - Review Focus 2: received 2000, purchase 1500, then `undo_diary_entry(received)` returns `not_enough_spend`.
  - Undo of received money into Save is refused with `not_enough_save` while a withdrawal reserves the money.
  - A fix from 500 to 350 returns `fixed`, the balance drops by 350 net of the start (Review Focus 1), `list_ledger_history` marks the old row `replaced` and shows `prev_amount_minor = 500` on the new row, and one `entry_corrected` row exists.
  - A fix that changes only the category returns `fixed` and writes no `entry_corrected` row.
  - Identical values return `unchanged`.
  - Review Focus 4: a second fix of the replaced id returns `not_fixable`.
  - Fix at root `created_at` + 7 days + 1 s returns `not_fixable`. Undo at + 24 h + 1 s returns `too_late`.
  - Review Focus 5: `record_purchase_at(..., p_now => now() - 6 days)` can still be undone and fixed now.
  - A fix over the item limit on a purchase already notified writes no second `limit_exceeded` row.
  - A parent calling `correct_diary_entry` raises `JA403`, and so does a different child.
- [ ] **Step 2: Write the migration** to the Interfaces above. Keep the comment style of the source migrations (`comment on function … 'Internal, no grants…'`).
- [ ] **Step 3: Update `purchases.test.sql`** for the new `record_purchase` signature and the `created_at` undo window.
- [ ] **Step 4: Dry run.** `supabase migration list --linked` should show the local and remote in step except the new file. `supabase db push --linked --dry-run` should list only `<ts>_diary_complete.sql`.
- [ ] **Step 5: Stop and ask the user** to approve the hosted push. Once they approve, run `supabase db push --linked`, then `supabase test db --linked`, and expect every file to PASS. Then run `pnpm db:types:linked`.
- [ ] **Step 6: Report.** Do not commit.

### Task 2: Categories, diary schemas, repository, service, actions, outbox

**Files:**
- Create: `src/features/ledger/categories.ts` (client-safe). Export it from `src/features/ledger/index.ts`.
- Modify: `src/features/diary/{schemas,types,copy}.ts`, `src/features/diary/server/{repository,service,actions,index}.ts`, `src/features/diary/index.ts`
- Modify: `src/app/api/v1/outbox/route.ts` (pass `category`)
- Test: `tests/features/ledger/categories.test.ts`, `tests/features/diary/schemas.test.ts`, `tests/features/diary/server/service.test.ts`, `tests/app/api/v1/outbox/route.test.ts`

**Interfaces:**
- Consumes: the Task 1 RPCs and generated types.
- Produces, from `@/features/ledger`:
  - `SPEND_CATEGORIES`, `RECEIVED_CATEGORIES`: `readonly { key, emoji, label }[]` in the Global Constraints order
  - `type SpendCategory`, `type ReceivedCategory`
  - `categoryOf(key: string | null, kind: "purchase" | "received"): { key; emoji; label }`, which falls back to `other`
- Produces, from `@/features/diary`:
  - `purchaseSchema(currency)`, which now has `category: spendCategorySchema.default("other")` (the default covers Review Focus 3)
  - `receivedSchema(currency)` → `{ amountMinor, jar: "spend" | "save", category: ReceivedCategory, label?, idempotencyKey }`
  - `fixSchema(currency)` → `{ entryId, amountMinor, category: string, label?, idempotencyKey }`. Which category set is valid is decided in SQL by kind, and the client sends one from the right set.
  - `undoSchema`, unchanged
  - Types: `ReceivedResult = { status: "recorded"; entryId: string }`, `UndoResult = "undone" | "already_undone" | "too_late" | "not_enough_spend" | "not_enough_save"`, and `FixResult = { status: "fixed"; entryId } | { status: "unchanged" } | { status: "not_fixable" } | { status: "not_enough_spend"; freeMinor } | { status: "not_enough_save" }`
  - Actions: `recordMoneyReceivedAction`, `undoDiaryEntryAction` (rename `undoPurchaseAction`, and update `UndoButton`), `correctDiaryEntryAction`, `listEntryVersionsAction`. Each one calls `refresh()`, and the write actions also call `pushAfterNotices()` (as `features/requests/server/actions.ts` does).
- Produces, from `@/features/diary/server`:
  - `recordPurchase(input & { category })`
  - `recordMoneyReceived(input)`
  - `undoDiaryEntry(entryId)`, which keeps the existing `too_late` → `AppError("CONFLICT", …)` and returns the other results
  - `correctDiaryEntry(input)`
  - `listEntryVersions(entryId)` → `{ id, amountMinor, category, label, createdAt }[]`
- Copy in `copy.ts`:
  - `notEnoughSaveMessage = "Some of your Save is waiting to come out, so this can't be undone right now."`
  - `notFixableMessage = "This one can't be fixed any more."`
  - `unchangedMessage = "Nothing changed."`

- [ ] **Step 1: Write the failing tests.**
  - `categories.test.ts`: 9 spend keys and 6 received keys in order, and `categoryOf(null, "purchase").key === "other"`.
  - `schemas.test.ts`:
    - `purchaseSchema` without `category` parses to `category: "other"`, and rejects `"birthday"`;
    - `receivedSchema` rejects a missing category and `jar: "both"`;
    - `fixSchema` requires a uuid `entryId`.
  - `service.test.ts`:
    - `recordMoneyReceived` maps the RPC args `p_jar` and `p_category`;
    - `correctDiaryEntry` maps each status, including `free_minor` → `freeMinor`;
    - `undoDiaryEntry("too_late")` throws `CONFLICT`.
  - `route.test.ts`: a queued purchase payload without `category` reaches `recordPurchase` with `category: "other"`.
- [ ] **Step 2:** Run `pnpm vitest run tests/features/ledger/categories.test.ts tests/features/diary tests/app/api/v1/outbox`. Expect FAIL.
- [ ] **Step 3: Implement** to the Interfaces. The repository is the only place that names the RPCs. Services call `assertRole("child")` for writes and `assertUser()` for `listEntryVersions`, because the SQL checks ownership.
- [ ] **Step 4:** Run the same tests and `pnpm typecheck`. Expect PASS.
- [ ] **Step 5: Report.** Do not commit.

### Task 3: History carries categories, fixes and windows

**Files:**
- Modify: `src/features/ledger/types.ts`, `src/features/ledger/server/{repository,service,index}.ts`
- Modify: `src/features/review/server/service.ts` (use the moved `getHistorySince`)
- Test: `tests/features/ledger/server/service.test.ts`

**Interfaces (Produces):**
- `HistoryItem` gains:
  - kind `"received"`
  - `category: string | null` (purchase and received only)
  - `jar: Jar | null` (received only, otherwise null)
  - `canFix: boolean`
  - `fixedFrom: { amountMinor: number; category: string | null; label: string } | null`
- `canUndo` and `canFix` count from `window_from` (24 h and 7 d against the server clock), and only when the line is not undone and not replaced.
- Replaced rows are dropped. Reversal rows stay hidden as today. A received line is diary `gift_in`, where `entryId` is the row id.
- `getHistorySince(childId: string, weekStart: string): Promise<HistoryItem[]>`, moved from `features/review/server/service.ts` (`historySince`) into `features/ledger/server/service.ts` and exported from `@/features/ledger/server`. The review service imports it.

- [ ] **Step 1: Write the failing tests** with mocked `listLedgerRows` rows.
  - A chain of 3 (two replaced and reversed, one current, the current `prev_amount_minor = 500`) gives one item, with `fixedFrom.amountMinor === 500` and `undone === false` (Review Focus 1).
  - A diary `gift_in` gives `kind: "received"` with `jar: "save"`.
  - A purchase with `window_from` 6 days ago and `occurredAt` 6 days ago has `canUndo === false` and `canFix === true`.
  - With `window_from` 1 h ago and `occurredAt` 6 days ago, `canUndo === true` (Review Focus 5).
  - A purchase with null category gives `category: null`. The UI maps it to `other`.
- [ ] **Step 2:** Run `pnpm vitest run tests/features/ledger/server`. Expect FAIL.
- [ ] **Step 3: Implement.** Map the new columns in `listLedgerRows` and build the items in `service.ts`. Update the `HistoryItem` doc comment.
- [ ] **Step 4:** Run `pnpm vitest run tests/features/ledger tests/features/review && pnpm typecheck`. Expect PASS.
- [ ] **Step 5: Report.**

### Task 4: Purchase sheet with "What was it for?"

**Files:**
- Create: `src/features/diary/components/category-chips.tsx`: `CategoryChips({ options, value, onChange, legend }: { options: readonly {key;emoji;label}[]; value: string | null; onChange(key: string): void; legend: string })`. It is a `fieldset` of radio-style toggles in a 3-column grid with ≥ 44 px targets and a hidden `<input name="category">`, following the chip styles in docs/design.md.
- Modify: `src/features/diary/components/purchase-sheet.tsx`
- Test: `tests/features/diary/components/purchase-sheet.test.tsx`, `tests/features/diary/components/category-chips.test.tsx`

**Interfaces:**
- `PurchaseDraft` gains `category?: string`.
- The payload sent to the outbox includes `category`.

- [ ] **Step 1: Write the failing tests.**
  - The submit button is disabled and shows the helper "Pick what it was for" until a chip is pressed.
  - Pressing "🍫 Snacks" sends a payload with `category: "snacks"`.
  - The name placeholder follows the chip: snacks → "What snack?", and other → "What was it?". The builder picks the rest in the same pattern.
  - Chips are reachable with the keyboard, and Space and Enter select one.
  - Existing tests still pass. Their payload expectations gain `category`.
- [ ] **Step 2:** Run `pnpm vitest run tests/features/diary/components`. Expect FAIL.
- [ ] **Step 3: Implement.** The order is amount, chips (legend "What was it for?"), the name labelled "Name it (optional)", then a button with the copy "Write it down".
- [ ] **Step 4:** Run the same tests. Expect PASS.
- [ ] **Step 5: Report.**

### Task 5: "Got money" sheet

**Files:**
- Create: `src/features/diary/components/received-sheet.tsx`, which exports `ReceivedSheet({ currency }: { currency: string })`
- Modify: `src/features/diary/index.ts`, and `src/app/(app)/child/diary/page.tsx` (put the trigger next to `PurchaseSheet`, both one tap from Diary)
- Test: `tests/features/diary/components/received-sheet.test.tsx`

**Interfaces:**
- Consumes: `recordMoneyReceivedAction`, `RECEIVED_CATEGORIES`, `CategoryChips`, and the `runOnline` used by `UndoButton` (same guard).

- [ ] **Step 1: Write the failing tests.**
  - The trigger reads "Got money".
  - The chips use the legend "Where did it come from?", and nothing is chosen at first.
  - The jar defaults to Spend. Choosing Save shows "Give the cash to your parent to keep."
  - Submitting sends `{ amount, jar, category, label, idempotencyKey }`. A success toast reads "Saved. Nice one.".
  - Offline gives the `offlineCopy.offline` notice and sends nothing.
- [ ] **Step 2:** Run the test. Expect FAIL.
- [ ] **Step 3: Implement** with `useActionState`, the same shape as `PurchaseForm`.
- [ ] **Step 4:** Run the test. Expect PASS.
- [ ] **Step 5: Report.**

### Task 6: Line detail: Fix this, Undo, earlier versions

**Files:**
- Create: `src/features/diary/components/entry-detail.tsx`, which exports `EntryDetail({ item, currency }: { item: HistoryItem; currency: string })`. It is a bottom sheet opened by tapping the line.
- Create: `src/features/diary/components/fix-form.tsx`
- Modify: `src/features/ledger/components/history-list.tsx`:
  - show the chip emoji before the label (`categoryOf`);
  - show the "Fixed · was £5.00 · Snacks" note when `fixedFrom` is set (amount and category only where they changed, name otherwise);
  - add a `received` verb, "Got".
- Modify: `src/app/(app)/child/diary/page.tsx`: `renderAction` renders `EntryDetail` when `item.canFix || item.canUndo || item.fixedFrom`.
- Delete or keep `undo-button.tsx`. It is kept only if used elsewhere (grep). `EntryDetail` carries Undo.
- Test: `tests/features/diary/components/entry-detail.test.tsx`, `tests/features/ledger/components/history-list.test.tsx`

- [ ] **Step 1: Write the failing tests.**
  - "Fix this" shows only when `canFix`, and Undo only when `canUndo`.
  - The fix form starts with the line's amount, category and name, and shows no jar picker. The line "To move money between jars, put it in or take it out." is present.
  - Saving `unchanged` shows "Nothing changed.", and `not_fixable` shows `notFixableMessage`.
  - "Earlier versions" calls `listEntryVersionsAction` and lists the older versions greyed out, oldest last.
  - In `history-list`, an item with `fixedFrom: {amountMinor: 500, category: "snacks", label: ""}` and a new amount of 350 renders the "Fixed · was £5.00" note. A received item renders the "Got" verb and the 🎂 emoji.
- [ ] **Step 2:** Run the tests. Expect FAIL.
- [ ] **Step 3: Implement.** The fix form uses `CategoryChips` with the right set for the kind. Undo errors map `not_enough_spend` to `notEnoughSpendMessage(0, currency)`-style copy, and `not_enough_save` to `notEnoughSaveMessage`.
- [ ] **Step 4:** Run the tests. Expect PASS.
- [ ] **Step 5: Report.**

### Task 7: "Where your money went" card

**Files:**
- Create: `src/features/ledger/where-it-went.ts` (pure). It exports `whereItWent(history: readonly HistoryItem[], today: string, currency: string): WhereItWent`.
- Create: `src/features/ledger/components/where-it-went-card.tsx`, which exports `WhereItWentCard({ view }: { view: WhereItWent })`
- Modify: `src/features/ledger/index.ts`, `src/app/(app)/child/diary/page.tsx` (the card below the jar line, fed by `getHistorySince(user.id, startOfWeek(today))`), `src/app/(app)/parent/children/[childId]/history/page.tsx` (the card above `HistoryList`)
- Test: `tests/features/ledger/where-it-went.test.ts`, `tests/features/ledger/components/where-it-went-card.test.tsx`

**Interfaces (Produces):** `type WhereItWent = { spent: { headline: string; rest: string[] } | null; moneyIn: string | null; empty: string | null }`. The week is Monday to Sunday (`startOfWeek` and `addDays` from `@/lib`, the same as `features/review/build.ts`). It skips undone items. It groups purchases by `categoryOf(item.category, "purchase")`, ordered by total desc and then by category order.

- [ ] **Step 1: Write the failing tests** (GBP, `today = "2026-11-04"`):
  - Snacks 350 + 400 and Games 400 give the headline `"Most of your spending went on 🍫 Snacks: £7.50."` and the rest `["Then 🎮 Games: £4.00."]`.
  - Five categories give a headline, two "Then" lines, and the line `"And £1.50 on other things."` (the rest is summed).
  - No purchases give `empty = "Nothing spent this week yet."` and `spent = null`.
  - Money in from allowance 1000 and received birthday 2000 gives `"You got £30.00: £20.00 🎂 Birthday, £10.00 allowance."`. With three or more sources, the two biggest are named and the rest are summed as `"and £x from other places"`.
  - An undone purchase and an item from last week are ignored.
  - A grep-style test checks that no output string contains "too much", "only", "%" or a comparative.
- [ ] **Step 2:** Run the tests. Expect FAIL.
- [ ] **Step 3: Implement.** The money formatting is `formatMoney(minor, currency, { showMinor: "nonzero" })` on the child side. The card is a plain card with sentences, with no chart or table (PR #55).
- [ ] **Step 4:** Run `pnpm vitest run tests/features/ledger && pnpm typecheck`. Expect PASS.
- [ ] **Step 5: Report.**

### Task 8: Notices, weekly review, Jarso

**Files:**
- Modify: `src/features/notifications/{types,links}.ts`, `src/features/review/{build,types}.ts`, `src/features/review/components/week-card.tsx`, and `src/features/guide/server/tools.ts` (`get_money_history`)
- Test: `tests/features/notifications/links.test.ts` (create it if it's missing, mirroring the existing notification tests), `tests/features/review/build.test.ts`, the guide tools test for `get_money_history` (find it with `grep -rl get_money_history tests`)

**Interfaces:**
- `NoticeKind` gains `"money_received" | "entry_corrected"`. Both open `routes.parentChildHistory(childId)` for parents through the existing `ledger_entry` branch.
- `noticeText`:
  - `money_received` → title `` `${name} wrote down ${amount} from ${categoryOf(payload.category,"received").label}` ``, detail `"Added to Spend."` or `"Added to Save."` by `payload.jar`
  - `entry_corrected` → title `` `${name} fixed a purchase` `` or `` `${name} fixed money they got` `` by `payload.kind`, detail `` `${old} → ${amount}` `` from `old_amount_minor` and `amount_minor`
- `weekMoney` adds `received` items to `receivedMinor`.
- `WeeklyReview` gains `topCategory: { emoji: string; label: string } | null`, and the card shows `"This week most went on Snacks."` when it is set.
- `get_money_history` lines gain `category` (the label text), and `HISTORY_KIND` gains `received: "money received"`. The frozen FR09 prompt doesn't change.

- [ ] **Step 1: Write the failing tests.**
  - The exact `noticeText` strings for both kinds, with payload `{amount_minor: 2000, category: "birthday", jar: "spend"}` → "Aria wrote down £20.00 from Birthday" / "Added to Spend.".
  - `{kind: "purchase", old_amount_minor: 500, amount_minor: 350}` → "Aria fixed a purchase" / "£5.00 → £3.50".
  - `weekMoney` counts a received item.
  - `topCategory` is null when nothing was spent.
  - The guide tool line includes `category: "Snacks"` for a snacks purchase.
- [ ] **Step 2:** Run the tests. Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run `pnpm vitest run tests/features/notifications tests/features/review tests/features/guide && pnpm typecheck`. Expect PASS.
- [ ] **Step 5: Report.**

### Task 9: End to end, docs, full check

**Files:**
- Modify: `tests/e2e/purchases.spec.ts` (choose a chip before saving), and create `tests/e2e/diary.spec.ts`
- Modify: `docs/fr-audit.md` (FR04 → Built, and FR05's "what's missing" note now points to the diary being ready), `docs/domain.md` (category, fix chain, the `money_received` and `entry_corrected` notices), `docs/database.md` (the new columns and functions), `docs/roadmap.md` (Final demo, Diary complete: Built), `docs/api.md` if it lists actions
- Modify: `.gitignore` (add `.superpowers/`)

- [ ] **Step 1: Write `diary.spec.ts`.**
  - The child records £3.50 Snacks, and the line shows 🍫.
  - "Got money" £20 Birthday into Save raises the Save jar by £20.
  - Fix the snacks line to £3.00, and history shows "Fixed · was £3.50".
  - The card reads "Most of your spending went on 🍫 Snacks: £3.00."
  - The parent's inbox has "wrote down £20.00 from Birthday" and "fixed a purchase".

  Follow `tests/e2e/helpers.ts` for setting up the family. **The e2e stack expects local Supabase.** Ask the user how they want e2e run against the hosted project before running it, and don't start Docker.
- [ ] **Step 2: Update the docs** listed above, in their existing voice.
- [ ] **Step 3:** Run `pnpm check && pnpm build`. Expect PASS. Report the e2e results, or say that e2e was skipped and why.
- [ ] **Step 4:** Run the `verify` skill, then request a code review (the `code-reviewer` agent, plus `supabase-architect` on the migration). Report to the user and **ask before committing**. When they say commit, split the commits by task (user rule), using Conventional Commits.
