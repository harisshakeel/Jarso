# Jarso — Functional Requirements

Jarso helps children aged **11–14** learn to manage pocket money through savings goals, everyday decisions, interactive lessons, and parent involvement. A parent sets the allowance and confirms every handover; the child makes the decisions.

The pilot is a responsive web app. It supports **one currency, two money jars (Spend and Save), and one active savings goal per child**.

Jarso records and teaches money decisions. It does not hold, transfer, deposit, or withdraw real money. Every balance is a recorded number.

**Allowance, savings-deposit, savings-withdrawal and emergency money count toward a balance only once a parent has confirmed handing it over.** Spend is the cash the child holds. Save is the money the parent keeps for the child. Money that is due or requested but not yet handed over is shown as due or pending, never as balance. Money the child receives from other sources, such as a gift, is recorded by the child and counts immediately (FR04).

## Delivery

### First milestone — one complete family flow

One parent and one child can complete, without push notifications:

1. Onboarding and parent approval (FR13).
2. Parent–child linking (FR13).
3. Allowance schedule setup (FR01).
4. An allowance falling due on schedule, with the due badge and reminder (FR01, FR16).
5. Parent handover confirmation posting the allowance to Spend and Save (FR01, FR03).
6. A purchase recorded by the child, and a limit notice to the parent when it breaks a limit (FR14, FR16).
7. A savings withdrawal request, the parent's new-request notice and decision, and the handover; and a savings deposit confirmed by the parent on receiving the cash (FR14, FR16).
8. Correct due amounts, balances, and request status for both accounts.

### Rest of the pilot

FR02–FR06, FR08, FR10–FR12, emergency funds (FR15), web push and app install (FR16).

### Later versions

- AI money guide and its boundaries (FR07–FR09). FR08 topic material without the guide stays in the pilot.
- Practice money with the learning section (FR05/FR06). Practice money stays separate from recorded money.
- Native mobile apps.
- Real payments, bank connections, live fund tracking, investments, and investment-return projections.

## FR01 — Allowance schedule and handover

- The parent sets the allowance amount and frequency: weekly, monthly, quarterly, or annual.
- Each scheduled occurrence becomes **due** automatically, exactly once, including when the scheduler retries or runs late.
- A due allowance does not change any balance.
- The parent confirms the handover on one screen, entering how much went to the child as cash (Spend) and how much the parent keeps as savings (Save). The screen starts from the split of the previous handover (FR03).
- Confirmation posts the occurrence exactly once, including after repeated taps or retries. Until then it stays due.
- Both parent and child see a due badge on each unconfirmed allowance. The parent receives a reminder while an allowance stays unconfirmed.
- The child sees the schedule, what is due, the next due date, and the confirmed allowance history.
- The child cannot change the amount, frequency, or confirm a handover.
- The parent can give a **one-time gift**, now or on a future date, with an optional note. It uses the same handover screen, and the parent records what was actually given, more or less than planned, with no shortfall.
- A gift is a surprise: until the parent hands it over, the child cannot see it anywhere, including in counts and totals. Once handed over it appears in the child's history with its note. The parent can edit or cancel a gift until it is handed over.
- The parent can change, pause and stop the allowance. A pause runs through a date or until the parent resumes it, with an optional message for the child. Periods that fall in a pause never become due and are not paid later. Occurrences already due stay due. Stopping ends the schedule, and the parent can set up a new one afterwards. The child sees that the allowance is paused or stopped, with the parent's message.
- The parent can mark a due allowance as **not given**. It closes with no balance change, its badge and reminders stop, and the action is recorded. It is final, like a confirmed handover. The child sees a neutral "Skipped" with no amount.

## FR02 — Personal savings goal

- The child can choose something they want and enter its price.
- The app shows the amount saved, amount remaining, and progress toward the goal. Saved means confirmed in Save less any reserved withdrawals (FR14); due and pending money is not counted.
- The child can plan how much to save from each allowance.
- The app estimates the number of allowance payments needed from the plan and updates this estimate when the plan changes.

## FR03 — Spend and Save jars

- **Spend** is cash the child holds. **Save** is money the parent keeps for the child.
- The child can plan and preview how each allowance should be split. *Deferred: the parent decides the split at handover in the pilot.* The handover screen starts from the previous handover's split, and the parent's confirmation records the actual split.
- Each jar displays its confirmed balance. Due allowances are shown separately.
- The child can see how a planned split or transfer affects their goal.
- Moving money from Spend to Save is a savings deposit: the child hands cash to the parent. It is a request (FR14) that posts when the parent confirms receiving the cash, or at once if the parent's auto-confirm rule covers it.
- Moving money from Save to Spend is a savings withdrawal request (FR14). It posts when the parent hands the cash over. An auto-approve rule only skips the approval step.
- Transfers between jars do not count as new income.

## FR04 — Money diary

- The child can record purchases and money received from other sources (for example a gift).
- Each entry includes an amount, a short label, and the relevant jar.
- Limits never block a purchase. The only refusal is a purchase that would take Spend below zero while overspending is not allowed (FR14).
- Entries can be reviewed, corrected, or undone. Corrections stay traceable in the history.
- Balances and goal progress update accordingly.
- The linked parent can see the diary.

## FR05 — Predict before deciding

- Before a decision affecting savings, the app asks the child to predict its effect.
- It then reveals the outcome with a simple explanation.
- The child can explore alternative choices without changing recorded money.
- Spending from the Spend jar leaves the savings estimate unchanged when future savings contributions remain unchanged.

## FR06 — Interactive daily learning

- The app provides an initial seven-day learning journey.
- Each mission takes approximately two to three minutes.
- Activities involve making choices, calculating amounts, predicting outcomes, and explaining reasoning.
- Feedback and hints help the child work through difficulties.
- Previously learned concepts return in different situations after a gap.
- Mission progress is kept between visits.

The initial topics are:

1. Spending within your balance.
2. Splitting an allowance.
3. Saving toward a goal.
4. Understanding purchase tradeoffs.
5. Changing a plan when circumstances change.

## FR07 — AI money guide *(later version)*

- The child can ask money-related questions at any point.
- The guide provides short, age-appropriate explanations and concrete examples.
- It can explain the current lesson, allocation, or savings decision.
- During exercises, it encourages an attempt before offering progressively stronger hints.
- Basic conceptual questions receive a direct answer.
- The guide can offer a short follow-up activity to check understanding.

## FR08 — Related learning material

- Each topic contains an explanation, a worked example, and an opportunity to practise.
- Missions and reviews link to the relevant topic. Once the guide ships, its answers do too.
- The child can explore a topic and return to their unfinished activity.
- Opening material does not automatically mark a skill as learned.

## FR09 — Guide boundaries *(later version, binding when FR07 ships)*

- Answers stay focused on Jarso's money-learning topics and reviewed material.
- Unrelated requests receive a brief redirection toward relevant learning.
- The guide acknowledges uncertainty or missing information.
- It does not request sensitive personal or account information, recommend specific investments, or instruct the child to make purchases.
- Safety concerns receive a supportive response and appropriate guidance toward help.

## FR10 — Learning progress

- The child answers a few starting questions before the first mission.
- Later reviews use unfamiliar examples to check independent understanding.
- Progress reflects correct calculations, sound explanations, and reduced reliance on hints.
- Learning progress is displayed separately from money saved.

## FR11 — Weekly review

- The app summarises money received, spent, saved, still due, and progress toward the goal.
- It explains how a decision affected the child's plan.
- It highlights demonstrated understanding and a topic worth practising again.
- The review includes a fresh question about a previously learned concept.

## FR12 — Return experience

- The app preserves goals, balances, and unfinished activities.
- Each visit offers a clear next step: a mission, goal review, practice activity, or pending request.
- After missed days, the child can resume with a manageable task.
- Recognition rewards understanding and thoughtful decisions rather than the amount of money available.

## FR13 — Family accounts and onboarding

- Jarso has two roles: **parent** and **child**.
- A child may start onboarding, or a parent may onboard their child.
- A child who starts onboarding enters only a nickname and the parent's email address. The child's own email, full name and date of birth are not collected.
- The parent creates or signs in to their own account from that invitation, links the child, and approves. Until then the child account holds nothing beyond the nickname and the pending link.
- A child cannot use the app until the linked parent's approval is recorded.
- The parent–child link and its approval status are stored.
- A parent can view and manage only children linked to them.
- A child can access only their own information and actions.
- Every permission is enforced on the server. One family can never see or change another family's records.
- Only the minimum data needed is collected about the child.
- A parent records their date of birth, country and gender before using the app; a parent must be 18 or over. Until then a dialog covers every parent screen and family actions are refused. Only the parent can see these details.

## FR14 — Purchases, limits, savings deposits, and savings withdrawals

### Purchases

- The parent can set spending limits for the child.
- A purchase the child enters is recorded, and limits never block it. The one exception: a purchase that would take Spend below zero is refused unless the parent has allowed overspending.
- When a purchase breaks a limit, the parent receives a notice showing the purchase and the limit.
- The child can undo their own purchase within 24 hours of recording it. The undo is a reversing entry, so the purchase stays in history marked "Undone". The parent is not notified.

### Money rules

- The parent sets money rules per child. There are four kinds: spending limit, withdrawal cap, auto-approve withdrawals and auto-confirm deposits.
- Each kind can be set per item, per week and per month, in any combination, with at most one rule per kind and period.
- All rules are off by default.
- Spending limits only notify; they never block a purchase. A withdrawal cap stops a request above the cap.
- A withdrawal that fits every auto-approve rule set for the child is approved at once. The parent still confirms the handover before it posts, because real cash changes hands.
- A deposit that fits every auto-confirm rule posts at once, without the parent confirming receipt. This is a parent-chosen exception to "counts only after confirmation". It stays off unless the parent sets it.
- Auto-approved and auto-confirmed moves send no notice.

### Savings deposits

- Moving money from Spend to Save is a request to the parent, with the amount. It records that the child is handing cash over.
- The request is pending until the parent confirms receiving the cash, which posts it exactly once, unless the parent's auto-confirm rule covers it. The child can cancel it while pending; the parent can reject it. Cancellation and rejection leave balances unchanged.
- A deposit never exceeds the Spend balance, checked when requested and again at confirmation.
- A pending deposit holds its amount in Spend, so the same money cannot be spent or deposited twice.

### Savings withdrawals

- Taking money out of Save is a request to the parent, with the amount and a short reason.
- The parent approves or rejects it. Both see the current status: pending, approved (waiting for handover), handed over, or rejected.
- Approval alone does not move money. The withdrawal posts, exactly once, when the parent confirms handing the cash over.
- Rejection leaves balances unchanged.
- Pending and approved withdrawals are shown as **reserved**. The Save balance stays confirmed-only, but goal progress (FR02) and the withdrawal cap treat reserved money as unavailable, so two requests cannot be approved against the same money.
- A withdrawal never exceeds the unreserved Save balance, checked when requested and again at handover.

## FR15 — Emergency funds

- The child can ask their linked parent for extra money, with a short reason.
- The parent approves or rejects the request. Both see the current status.
- An approved grant posts, exactly once, when the parent confirms handing it over. It is recorded as a separate kind of entry from the allowance.
- Rejection leaves balances unchanged.

## FR16 — Notifications

- Parents and children have an in-app notification inbox that is kept between visits.
- The inbox covers due allowances, handover reminders, limit notices, new requests, and decisions.
- The inbox ships in the first milestone, in-app only: due badge, handover reminders, limit notices, new-request notices and decision notices all work without push.
- Web push is offered for the same events, after the user grants permission.
- The app can be installed on compatible devices.
- Every essential action works when push is unavailable, denied, disabled, or missed.
- A notification opens the current state of its request or record.
- Requests and records are the source of truth. Failed delivery never loses a request or reverses a completed action.

## Money rules

- Only a parent's handover confirmation adds allowance, savings-deposit, savings-withdrawal, or emergency money to a balance. Money from other sources that the child records counts immediately.
- Pending and approved requests reserve money; they never move it.
- Allowances, handovers, received money, purchases, transfers, emergency grants, and corrections are each recorded as distinct entries. The history is never rewritten.
- Each action changes a balance at most once, including after repeated taps, concurrent submissions, or network retries.
- A completed request and its balance change are always consistent.
- Balances are shown as recorded amounts, never as money held by Jarso.
- Any future real-money balance stays separate from pilot balances.

## First-milestone acceptance criteria

With one parent account and one child account:

- Child-initiated and parent-initiated onboarding both reach the parent-approved state.
- The parent can set an allowance schedule and spending limits.
- A scheduled allowance becomes due exactly once, including on retry, and does not change any balance.
- Both accounts show the due badge, and the parent gets a reminder while it stays unconfirmed.
- The parent's handover confirmation posts the entered cash and savings amounts to Spend and Save exactly once.
- A purchase over a limit is recorded and the parent gets a limit notice.
- A savings withdrawal posts only after approval and handover. Rejection changes nothing. While pending or approved it is shown as reserved and cannot be requested again.
- A savings deposit posts only after the parent confirms receiving the cash. Cancellation and rejection change nothing.
- The parent receives in-app notices for a new request and for a limit breach, with push disabled.
- Child-initiated onboarding collects only a nickname and the parent's email.
- Repeated or concurrent confirmations and decisions cannot duplicate a balance change.
- The whole flow works with push disabled.
- An unlinked account cannot view, confirm, or decide anything for the family.

## Pilot evaluation

Agree on the evaluation period, definitions, and numerical targets before launch. Measure:

- Families completing the first parent–child flow.
- Families returning weekly.
- Time from an allowance falling due to its handover confirmation, and allowances left unconfirmed.
- Children completing the seven-day journey.
- Evidence that children understand the money decisions taught, measured separately from mission completion.
- Requests left unanswered.
- Balance errors and duplicate postings.

"Most families return weekly" and "children complete the first few missions" are proposed measures, not final thresholds.

## Open decisions

- Pilot countries, and stronger parental verification than email confirmation plus the guardian-consent checkbox.
- Which jar receives an emergency grant.
- Pilot duration and success thresholds.

### Decided for the pilot (2026-10-28)

- **Handover shortfall.** Confirmation closes the occurrence. The shortfall (due less cash plus saved) is stored on the occurrence and shown in history. A handover larger than the due amount is rejected.
- **Purchase larger than Spend.** Refused unless the parent has allowed overspending for that child (off by default). When refused, the child sees a friendly explanation. When allowed, Spend may go negative and is shown clearly. Spending limits still never block.
- **Spending limit types.** Per purchase, per week and per month, in any combination, at most one active of each type per child.
- **Reminders.** The first notice is the day the allowance falls due, then a reminder every 3 days while it is still due.
- **Missed occurrences.** Each stays due separately, with no roll-up and no expiry. The parent confirms each one.
- **Schedule changes.** The parent picks the start date. Amount or frequency changes apply from the next occurrence; occurrences already due keep their amount.
- **Parent verification.** Email confirmation plus a guardian-consent checkbox ("I am this child's parent or guardian"), stored with a timestamp and the consenting parent.
- **Savings deposits** are part of the first milestone, on the same request flow as withdrawals.
- **Several children.** A parent can link more than one child. Parent Home shows every child, and each child has their own page.
- **Invitations.** Always a copyable link plus a short code the child shows the parent. Email is sent additionally only when a sending domain is configured; nothing in the pilot depends on email delivery.

### Decided for the pilot: slice 2 (2026-10-29)

- **S1 Setup screen.** Amount, a "How often" choice (Weekly, Monthly, Every 3 months, Yearly, One time) and a first date, with a summary line such as "Every Sunday from 2 Nov". The weekly day is the weekday of the first date.
- **S2 One-time gift.** A parent-initiated extra, set up on the same screen with the "One time" choice. The date becomes "Give on" and an optional note appears. A child can have any number of gifts.
- **S3 Gift is a surprise.** Before handover the child sees no schedule entry, badge, count or total for it. This is enforced in the database, not only the UI. After handover it shows in history with the note, marked as a gift.
- **S4 Gift handover.** Same screen as allowance. The parent records what was actually given, any positive amount. No shortfall for gifts.
- **S5 Gift edit and cancel.** The parent can edit amount, date and note, or cancel, until it is handed over. Final afterwards.
- **S6 Split at handover.** The parent decides. The screen starts from the save share of the child's most recent confirmed handover, applied to the current amount; the first handover is all Spend.
- **S7 Pause.** Through a date (auto-resumes after it) or until the parent resumes. Optional message to the child. Periods due during the pause produce no occurrence and are not paid later. Occurrences already due stay due.
- **S8 Stop.** Ends the schedule. No new occurrences; already-due ones stay due. The parent can set up a new allowance afterwards.
- **S9 Child view when paused.** A "Paused" label, the date it runs until and the next one (or "until a parent resumes it"), and the parent's message if any.
- **S10 Not given.** The parent can mark a due allowance as not given: it closes with no ledger entry, stops its badge and reminders, and is recorded. This refines the rule on missed occurrences above: each still stays due one by one, until the parent hands over or marks it not given.

### Decided for the pilot: slices 3 and 4 (2026-10-29)

- **P1 Purchase logging.** The child taps to record a purchase: an amount and an optional "what for". Automatic logging comes with a payment provider, later.
- **P2 Withdrawals and deposits log themselves.** The ledger rows are written when the money moves: parent handover, receipt confirmation, or auto-confirm. The child never records them.
- **P3 Save is a pretend account.** For now. A real bank account through a payment provider comes later. The step that moves the money is one function so a provider can call it.
- **P4 Money rules are flexible.** Four rule kinds, each per item, per week and per month, in any combination. This extends the spending limit types decision above.
- **P5 Auto-approve.** A withdrawal that fits every auto-approve rule is approved at once. It still waits for the parent's handover before posting.
- **P6 Auto-confirm deposits.** A deposit that fits every auto-confirm rule posts at once. This is a parent-chosen exception to counting only after confirmation, and it is off unless the parent sets it.
- **P7 Anti-goals.** All four matter equally: a parent buried in notifications, a child who gives up logging, a parent who cannot work out the rules, and a wrong balance.
- **P8 Undo a purchase.** The child can undo their own purchase within 24 hours. The parent sees it marked "Undone" in history, with no notification.
