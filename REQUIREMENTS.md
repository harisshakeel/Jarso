# Jarso — Functional Requirements

Jarso helps children aged **11–14** learn to manage pocket money through savings goals, everyday decisions, interactive lessons, and parent involvement. A parent sets the allowance and confirms every handover; the child makes the decisions.

The pilot is a responsive web app. It supports **one currency, two money jars (Spend and Save), and one active savings goal per child**.

Jarso records and teaches money decisions. It does not hold, transfer, deposit, or withdraw real money. Every balance is a recorded number.

**A balance counts only money a parent has confirmed handing over.** Spend is the cash the child holds. Save is the money the parent keeps for the child. Money that is due but not yet handed over is shown as due, never as balance.

## Delivery

### First milestone — one complete family flow

One parent and one child can complete, without push notifications:

1. Onboarding and parent approval (FR13).
2. Parent–child linking (FR13).
3. Allowance schedule setup (FR01).
4. An allowance falling due on schedule, with the due badge and reminder (FR01, FR16).
5. Parent handover confirmation posting the allowance to Spend and Save (FR01, FR03).
6. A purchase recorded by the child, and a limit notice to the parent when it breaks a limit (FR14).
7. A savings withdrawal request, parent decision, and handover (FR14).
8. Correct due amounts, balances, and request status for both accounts.

### Rest of the pilot

FR02–FR06, FR10–FR12, emergency funds (FR15), web push and app install (FR16).

### Later versions

- AI money guide and its boundaries (FR07–FR09). FR08 topic material without the guide stays in the pilot.
- Native mobile apps.
- Real payments, bank connections, live fund tracking, investments, and investment-return projections.

## FR01 — Allowance schedule and handover

- The parent sets the allowance amount and frequency: weekly, monthly, quarterly, or annual.
- Each scheduled occurrence becomes **due** automatically, exactly once, including when the scheduler retries or runs late.
- A due allowance does not change any balance.
- The parent confirms the handover on one screen, entering how much went to the child as cash (Spend) and how much the parent keeps as savings (Save). The screen starts from the child's planned split (FR03).
- Confirmation posts the occurrence exactly once, including after repeated taps or retries. Until then it stays due.
- Both parent and child see a due badge on each unconfirmed allowance. The parent receives a reminder while an allowance stays unconfirmed.
- The child sees the schedule, what is due, the next due date, and the confirmed allowance history.
- The child cannot change the amount, frequency, or confirm a handover.
- The child can also practise with fictional money. Practice money stays separate from recorded money.

## FR02 — Personal savings goal

- The child can choose something they want and enter its price.
- The app shows the amount saved, amount remaining, and progress toward the goal. Saved means confirmed in Save; due money is not counted.
- The child can plan how much to save from each allowance.
- The app estimates the number of allowance payments needed from the plan and updates this estimate when the plan changes.

## FR03 — Spend and Save jars

- **Spend** is cash the child holds. **Save** is money the parent keeps for the child.
- The child can plan and preview how each allowance should be split. The plan prefills the parent's handover screen; the parent's confirmation records the actual split.
- Each jar displays its confirmed balance. Due allowances are shown separately.
- The child can see how a planned split or transfer affects their goal.
- Moving money from Spend to Save means the child hands cash to the parent. It posts when the parent confirms receiving it.
- Moving money from Save to Spend is a savings withdrawal (FR14).
- Transfers between jars do not count as new income.

## FR04 — Money diary

- The child can record purchases and money received from other sources (for example a gift).
- Each entry includes an amount, a short label, and the relevant jar.
- Purchases are always recorded, whatever the limits (FR14).
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
- A child cannot use the app until the linked parent's approval is recorded.
- The parent–child link and its approval status are stored.
- A parent can view and manage only children linked to them.
- A child can access only their own information and actions.
- Every permission is enforced on the server. One family can never see or change another family's records.
- Only the minimum data needed is collected about the child.

## FR14 — Purchases, limits, and savings withdrawals

### Purchases

- The parent can set spending limits for the child.
- A purchase is always recorded when the child enters it. Limits never block it.
- When a purchase breaks a limit, the parent receives a notice showing the purchase and the limit.

### Savings withdrawals

- Taking money out of Save is a request to the parent, with the amount and a short reason.
- The parent approves or rejects it. Both see the current status: pending, approved (waiting for handover), handed over, or rejected.
- Approval alone does not move money. The withdrawal posts, exactly once, when the parent confirms handing the cash over.
- Rejection leaves balances unchanged.
- A withdrawal never exceeds the Save balance, checked when requested and again at handover.

## FR15 — Emergency funds

- The child can ask their linked parent for extra money, with a short reason.
- The parent approves or rejects the request. Both see the current status.
- An approved grant posts, exactly once, when the parent confirms handing it over. It is recorded as a separate kind of entry from the allowance.
- Rejection leaves balances unchanged.

## FR16 — Notifications

- Parents and children have an in-app notification inbox that is kept between visits.
- The inbox covers due allowances, handover reminders, limit notices, requests, and decisions.
- The due badge and the parent's handover reminder ship in the first milestone and work without push.
- Web push is offered for the same events, after the user grants permission.
- The app can be installed on compatible devices.
- Every essential action works when push is unavailable, denied, disabled, or missed.
- A notification opens the current state of its request or record.
- Requests and records are the source of truth. Failed delivery never loses a request or reverses a completed action.

## Money rules

- Only a parent's handover confirmation adds allowance, savings-withdrawal, or emergency money to a balance.
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
- A savings withdrawal posts only after approval and handover. Rejection changes nothing.
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

- Pilot countries and the parental verification process. Email confirmation alone has not been shown to be enough.
- Handover amounts different from the due amount: does the shortfall stay due, or does confirmation close the occurrence?
- Reminder timing: when the first reminder fires and how often it repeats.
- Supported spending limit types (for example per purchase or per week).
- A purchase larger than the Spend balance: allow a negative balance, or ask for a correction?
- Whether money from other sources (gifts) needs parent confirmation to count.
- Allowance schedule rules: start date, mid-cycle changes, and several missed occurrences piling up.
- Which jar receives an emergency grant.
- Whether a parent can link more than one child in the pilot.
- Pilot duration and success thresholds.
