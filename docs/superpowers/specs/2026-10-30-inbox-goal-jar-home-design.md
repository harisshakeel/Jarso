# Demo 2 — in-app inbox, savings goal and jar Home — design

Date: 2026-10-30. Covers Demo 2 slices 2, 3 and 5 in `docs/roadmap.md`. Slice 1 (deposits and withdrawals, `2026-10-29-slices-3-4-purchases-requests-design.md`) and slice 6 (demo hardening) are unchanged.

Mockup (open in a browser): `mockups/2026-10-30-jar-home.html`, child Home and parent Home, web view.

## 1. Intent

Demo 2 has to show the whole family money loop, and a product a child and a parent understand at a glance. Three things are missing: notices nobody can see, a Save jar with nothing to save toward, and a Home that is a stack of cards.

The idea that ties them together: **the jars are the screen.** The Save jar fills toward the child's goal. A full jar means the goal is reached. Money that is due floats above the jars, outside them. The inbox carries everything that needs someone's attention.

The user's direction: the child's UI must not be confusing, must be quick to grasp, and must be readable by a parent glancing over.

## 2. Goals, non-goals, anti-goals

**Goals**

- An in-app inbox for both roles, with an unread badge and handover reminders. It covers every first-milestone FR16 notice.
- One savings goal per child, with a name, an emoji, a price and the child's own plan. Progress and payments left follow FR02.
- A child Home built around two jars, and a parent Home that leads with "Needs you" and shows each child's jars.

**Non-goals (this design)**

- Email of any kind, for now. That includes Resend for notices, `notification_deliveries`, the dispatcher route and the `/api/cron` fallback. Email moves to the final demo, next to web push. This is the user's decision (2026-10-30). It costs nothing: FR16 is in-app first, and no acceptance criterion depends on email.
- Web push and app install (final demo).
- Predict before deciding and what-ifs (FR05, final demo).
- Child split planning (deferred by decision). The child's plan is an estimate only (§5.3).
- Demo clock (slice 6).

**Anti-goals: a failure even if it works**

- Streaks, "you missed a day", day-by-day grids, countdowns or anything framed as loss. The research below backs this up.
- Confetti, random rewards, points, or rewards tied to how much money a child has.
- Comparing children with each other on any child screen.
- Learning shown inside, or scored by, a money jar (invariant 11).
- A Home that needs a key or legend to be understood. The jars must read without the key; the key only confirms.

**Research behind the anti-goals** (2026-10-30)

- Duolingo moved to a single guided path because learners were unsure which step to take next ([blog](https://blog.duolingo.com/new-duolingo-home-screen-design/)).
- Children aged 6–12 drifted to "keeping the streak" and reported "streak panic" (Kuo, Zhao & Scott, IDC 2026, <https://dl.acm.org/doi/full/10.1145/3773077.3806127>).
- The ICO Children's Code, Standard 5, says children should be able to take breaks "without losing their progress".
- Rooster Money lets children personalise their goal pots.
- No study compares a ring, a bar or a jar for this age group. The jar is a design choice, not an evidence-backed one.

## 3. Constraints

- Every hard rule in CLAUDE.md applies, as do `docs/design.md` (tokens, voice, §8 motion, §11 accessibility) and the gamification rules in `docs/roadmap.md`.
- Every write that changes status or money goes through a `security definer` Postgres function, with idempotency, as in the first-milestone design §7. App code never inserts into `notifications`.
- Goal progress is computed and never stored. Counted = Save balance − reserved withdrawals. Due and pending money is never counted (FR02, invariant 7).
- Light and dark themes, AA contrast, reduced motion, and 44 px targets for the child.
- Order of work: slice 1 (requests) lands first, because the jar buttons "Move to Save" and "Take some out" and the request notices need it. Inbox and goal can then run in parallel. The jar Home goes last.

## 4. Inbox and reminders (FR16, FR01)

### 4.1 Decided

- **Use the existing `notifications` table** (migration `20261029181907`). Add kinds `allowance_due` and `handover_reminder`, and add `allowance_occurrence` as a `source_type`. **Parent gifts (`parent_gifts`) get no notices** (my call). The parent made the gift and sees it under "Needs you". The child must never learn about a pending gift (invariant 17), so gifts never reach the child's notices or the due coin on child Home.
- **Which occurrences get reminders** (my call): every occurrence whose status is still `due`, even if the schedule has since been paused or stopped, because the money is still owed. Nothing is backfilled. An occurrence already overdue at release gets its next notice on its next 3-day mark.
- **Reminder timing (D4).**
  - On the due day, the parent gets an `allowance_due` notice.
  - While the occurrence is still not handed over, they get a `handover_reminder` every 3 days after that, on days 3, 6, 9 and so on, in the family's timezone.
  - Each notice is created once: dedupe on (recipient, kind, child, `window_key` = occurrence id + date). The table already has this unique index.
- **Who gets what** (my call, the user did not object): parents get `allowance_due` and `handover_reminder`. The child gets only `allowance_due`, worded "Your £5 allowance is due. Your parent will hand it over." The child never gets reminders, so they never feel they have to chase their parent.
- **Scheduling.** The same hourly pg_cron job that runs `generate_due_occurrences` also runs reminders, either a new `send_handover_reminders()` or one combined job (*builder's call*). Follow the existing time pattern: take a `p_now` parameter (or add an `_at` variant) and use `family_today(family_id, p_now)`, so the slice 6 demo clock drives reminders too.
- **Screens.**
  - Child: `/child/inbox`. Parent: `/parent/inbox`.
  - Both show newest first, with the Inbox item component (`docs/design.md` §6). Unread rows get a teal-100 background.
  - The parent's inbox covers all their children (D12).
- **Unread badge** on the Inbox nav item for both roles (gold, ink text). The count is read on the server inside `<Suspense>` and refreshes when the user navigates. Superseded 2026-10-31: the inbox is now live over Supabase Realtime (see `docs/architecture.md` §8).
- **Read state.**
  - Opening a notice marks it read.
  - There is also a "Mark all as read" button.
  - Both go through a `security definer` function that can only set `read_at` on the caller's own rows.
- **Opening a notice shows the record as it is now**, not as it was when the notice was sent:
  - a request → its request view;
  - an occurrence → the handover screen, or "Handed over" if it already was;
  - a limit notice → the child's history.
- **Docs to update:**
  - `docs/roadmap.md`: slice 2 without email. Slice 5 becomes the jar Home in this document, which the user approved from the HTML mockup on 2026-10-30. It has no Figma step and no milestone road: the goal line on the Save jar replaces both the milestones and the ring. FR04's Demo 2 column becomes "Diary tab with history and Undo".
  - `docs/fr-audit.md`.
  - The first-milestone design: slice 5 and D13.
  - `docs/design.md`:
    - §5 navigation: no Jars or Requests tabs;
    - §6 Progress becomes the Save jar's goal line, not a ring;
    - §6 Handover sheet starts from the previous split and shows the child's plan as a note;
    - §7 `JarIllustration` props as in §6.3 below.

### 4.2 Left to the builder

- Notice copy within `docs/design.md` §9. Examples: "Maya's £5 allowance is due", "Still due: Maya's £5 allowance (6 days)".
- Pagination of the inbox list. Simple "Show more" is enough for about 60 users.
- Whether a gift's due date generates a notice.

## 5. Savings goal (FR02, FR03, FR12)

### 5.1 Data

- **New `goals` table.** One active goal per child, enforced by a partial unique index on `child_id where status = 'active'`. Columns:
  - `name`: 1–40 characters, trimmed;
  - `emoji`: one emoji from a fixed picker of about 24;
  - `target_minor`: an integer greater than 0, at most 1,000,000 minor units;
  - `plan_minor`: an integer ≥ 0, nullable, meaning "how much I'll save from each allowance";
  - `status`: `active` or `archived`;
  - `reached_at` and `celebrated_at`: timestamps;
  - `created_at` and `updated_at`.
- **Who writes** (my call): only the child creates, edits and archives their own goal, through `security definer` functions. Parents can read it. Parents cannot edit it, because it is the child's goal.
- RLS has per-operation policies. Reads are allowed for the child and their approved parents.

### 5.2 Progress

- **Counted** = Save balance − reserved withdrawals, never below 0.
- **Remaining** = max(target − counted, 0).
- **Payments left** = ceil(remaining / `plan_minor`) when the plan is above 0. Otherwise there is no estimate, and the copy says "Set how much you'll save each time to see how long it'll take". It is worded "about N more allowances" whatever the allowance frequency.
- Put these in one pure function in `features/goals` with unit tests. It is the only place progress is calculated.

### 5.3 The plan is the child's estimate only

This is the user's decision. The plan does not prefill or change the parent's handover, which still starts from the previous split. The parent sees it:

- on the child's card on parent Home;
- as one line on the handover sheet: "Maya plans to save £4 each time toward ⚽ Football boots".

Validation: if the child has an allowance schedule, the plan can't exceed the allowance amount. If they don't, any value up to the target is allowed.

### 5.4 Reaching the goal

- When counted ≥ target, set `reached_at` the first time. Reads compute this, and a function persists it idempotently.
- Child Home then shows one "Saved up. ⚽ Football boots." moment on the Do-this-next card, and sets `celebrated_at` so it shows once only.
- After that the child gets a choice: "Ask to use my savings" (a withdrawal request, slice 1) or "Set a new goal" (archives this one).
- Nothing is spent or archived automatically.
- If the balance later drops below the target, the jar simply shows less. No message is shown, and `reached_at` stays set.

### 5.5 Goal screens

- A "Set my goal" / "Change my goal" sheet from the Save jar. Fields: name, emoji picker, price, and the plan ("How much will you save each time?"). It shows a live "about N more allowances" preview as the child types. The preview is pure arithmetic and never writes.
- "Start a new goal" archives the active one, after a confirmation.

## 6. Jar Home (FR12, FR02, FR03, FR10)

### 6.1 Child Home

The mockup is the reference. From top to bottom (in the web view, the next step sits top-right):

1. **Do this next.** One card, one line, at most one button. Order (my call):
   1. the goal-reached moment, if not yet celebrated;
   2. an approved withdrawal waiting for handover ("Your parent said yes. £5 from Save, coming soon."), with no button;
   3. the existing learning order (unfinished mission, due practice, check-in, next mission);
   4. "Set a goal", if there is none;
   5. "All done for today. Want some practice?"
2. **The shelf: two jars side by side.** Both stay side by side on phones too, at about 150 px each.
   - **Spend (teal).** Balance in Money XL, the line "Cash you have", and the buttons "Record a purchase" and "Move to Save" (a deposit request).
   - **Save (gold).**
     - Balance, and the line "Kept by your parent".
     - **With a goal:** the jar's full height equals the target, with a dashed goal line at the top and the goal's emoji beside it. A solid gold fill shows counted money. A hatched band on top of it shows reserved money. Text under the jar reads "⚽ Football boots, £45. £19 to go · about 5 more allowances at £4 each".
     - **Over the target:** the jar shows full, and the text says "Goal reached".
     - Buttons: "Take some out" (a withdrawal request) and "Change my goal".
     - **Without a goal:** no goal line, and the button reads "Set a goal".
   - **Fill scale when there is no goal, and for Spend** (my call): both jars use one shared capacity, max(Spend, Save, 4 × the allowance amount, 20 major units of the family's currency, using its minor-unit exponent; no exchange rates), so the two jars compare honestly.
   - **Pending requests** (my call) appear as a status chip under the jar they affect, not in Do this next. Examples: "£5 asked from Save · waiting for your parent", and "£3 to Save · give it to your parent". This keeps Do this next to one thing the child can actually act on. On the parent side, pending requests lead "Needs you".
   - **Due money.** A dashed coin floating above the shelf, between the two jars, reading "£5 on its way · due Friday". It is never inside a jar.
   - **A small key under the shelf**, in words, for counted, waiting to come out, on its way, and the goal line.
3. **What I've learned.** A strip of skill chips, with "Got it" first. It shows counts that only go up ("3 skills learned"). It sits outside the jars on purpose. Home never shows a day-by-day grid. The existing weekly rhythm line on `/child/learn` and on the parent's learning page stays as it is (my call): it already has no loss message, so changing it is out of scope.

**What else on today's child Home goes where:**

- **"Ask the money guide":** a button in the header. It shows only when the guide is on for this child.
- **`PendingPurchases`** (the offline outbox): a banner above the shelf, shown only when something is waiting to sync.
- **`ChildAllowanceCard`:** becomes one line under the shelf, for example "£5 every Friday", or the pause message when paused. The due amount itself is the floating coin.
- **Purchase history with Undo:** moves to a new **Diary** tab, at `/child/diary`. This is the user's decision (2026-10-30).
  - It reuses `HistoryList` and `UndoButton` unchanged.
  - The "Record a purchase" sheet opens from the Spend jar and also from Diary.
  - The FR04 diary screen in the final demo (money received, corrections) grows from this page.
  - Child Home no longer shows history.

Navigation:

- **Child:** Home, Diary, Learn and Inbox. There is no Jars tab, because Home is the jars.
- **Parent:** Home, Allowance and Inbox. Requests live under "Needs you" on Home, and there is no separate tab.

### 6.2 Parent Home

1. **Needs you.** Each row carries its action inline:
   - due and overdue handovers → Hand over;
   - pending requests → Say yes / Say no, or Confirm received for deposits;
   - unread limit notices → View.

   When nothing is waiting: "All caught up."
2. **One card per child,** each with mini Spend and Save jars drawn the same way as the child's, one goal line ("⚽ Football boots · £26 of £45 · plans £4 each allowance" or "No goal yet"; "each time" wording everywhere, never a frequency word), and a link to the child's page. There is no learning score beside money: learning sits on the child's page, not on this card. This keeps invariant 11 on the parent side too.
3. Calm, per `docs/design.md` §10: no celebration and no animation beyond rise-in.

### 6.3 The jar component

- Build `JarIllustration`, per `docs/design.md` §7, from the Jarso mark: a cyan lid and a teal outline. Its props are:
  - `jar`: spend or save;
  - `capacity`, `filled` and `reserved`, in minor units;
  - `goalLine`;
  - `size`.
- It is decorative (`aria-hidden`). Every fact is also stated in text next to it, so screen readers and a parent reading quickly get the same information.
- **Motion:** after a confirmed change, the fill rises once over 500 ms and two coins drop (§8). With reduced motion it changes instantly. Nothing loops.
- **Dark theme:** the outline uses teal-300, and the fills keep their brand colours.

### 6.4 Left to the builder

- Exact sizes and breakpoints within the mockup's spirit.
- The emoji picker set (child-appropriate, no flags or people-with-skin-tone variants, to keep it simple).
- How "Move to Save" and "Take some out" open the slice 1 request sheets.
- Skeletons for each Suspense boundary.

## 7. Testing

- **DB:**
  - reminder idempotency on reruns, and only every 3 days;
  - no reminder after handover;
  - one active goal per child;
  - a parent cannot write a goal;
  - a child cannot read another child's goal or notifications;
  - `read_at` is the only field a recipient can change.
- **Unit:**
  - goal progress and payments left, with reserved, zero plan, over target and no schedule;
  - the next-step order;
  - jar fill scaling.
- **E2E:**
  - a parent sees a due notice, hands over, and the reminder stops;
  - a child sets a goal, the jar shows the goal line, and a handover moves the fill;
  - a withdrawal shows as a hatched band and is excluded from "to go";
  - the unread badge goes up and down.
- **A11y:** axe on both Homes and both inboxes, in light and dark.

## 8. Risks

- **Jar legibility at 360 px with a long goal name.** Truncate to one line under the jar. The full name stays in the goal sheet.
- **A jar fill that implies "more money is better".** Mitigation: no praise copy tied to the fill level, and celebration only for reaching a goal the child set.
- **Next-step priority conflicts with the learning order already shipped.** Keep the learning order intact inside step 3.
