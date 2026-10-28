# Jarso — Functional Requirements

Jarso helps children aged **11–14** learn to manage pocket money through savings goals, everyday decisions, interactive lessons, and an AI money guide.

The first version supports **one child profile, one currency, two money jars, and one active savings goal**.

## FR01 — Profile and allowance setup

- The child can create a simple profile and enter their starting money.
- They can set their expected allowance amount and frequency.
- They can practise with fictional money or record pocket money they receive.
- Practice money stays separate from recorded money.
- Expected allowance enters the balance only when marked as received.

## FR02 — Personal savings goal

- The child can choose something they want and enter its price.
- The app shows the amount saved, amount remaining, and progress toward the goal.
- The child can choose how much to save from each allowance.
- The app estimates the number of allowance payments needed and updates this estimate when the plan changes.

## FR03 — Spend and Save jars

- The child can divide their allowance between **Spend** and **Save**.
- Each jar displays its current balance.
- The child can preview an allocation before confirming it.
- They can move money between jars and see how that affects their goal.
- Transfers between jars must not count as new income.

## FR04 — Money diary

- The child can record received money and purchases.
- Each entry includes an amount, a short label, and the relevant jar.
- Entries can be reviewed, corrected, or undone.
- Balances and goal progress update accordingly.

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

The initial topics are:

1. Spending within your balance.
2. Splitting an allowance.
3. Saving toward a goal.
4. Understanding purchase tradeoffs.
5. Changing a plan when circumstances change.

## FR07 — AI money guide

- The child can ask money-related questions at any point.
- The guide provides short, age-appropriate explanations and concrete examples.
- It can explain the current lesson, allocation, or savings decision.
- During exercises, it encourages an attempt before offering progressively stronger hints.
- Basic conceptual questions receive a direct answer.
- The guide can offer a short follow-up activity to check understanding.

## FR08 — Related learning material

- Relevant answers offer a link or topic card to appropriate learning material.
- Each topic contains an explanation, a worked example, and an opportunity to practise.
- The child can explore a topic and return to their unfinished activity.
- Asking questions or opening material does not automatically mark a skill as learned.

## FR09 — Guide boundaries

- Answers stay focused on Jarso's money-learning topics and reviewed material.
- Unrelated requests receive a brief redirection toward relevant learning.
- The guide acknowledges uncertainty or missing information.
- It does not request sensitive personal or account information, recommend specific investments, or instruct the child to make purchases.
- Safety concerns receive a supportive response and appropriate guidance toward help.

## FR10 — Learning progress

- The child answers a few starting questions before receiving lesson help.
- Later reviews use unfamiliar examples to check independent understanding.
- Progress reflects correct calculations, sound explanations, and reduced reliance on hints.
- Learning progress is displayed separately from money saved.

## FR11 — Weekly review

- The app summarises money received, spent, saved, and progress toward the goal.
- It explains how a decision affected the child's plan.
- It highlights demonstrated understanding and a topic worth practising again.
- The review includes a fresh question about a previously learned concept.

## FR12 — Return experience

- The app preserves goals, balances, and unfinished activities.
- Each visit offers a clear next step: a mission, goal review, or practice activity.
- After missed days, the child can resume with a manageable task.
- Recognition rewards understanding and thoughtful decisions rather than the amount of money available.

## Initial scope

Jarso records and teaches money decisions. It does not hold or transfer money. Live fund tracking, real investments, bank connections, and investment-return projections are outside the first version.
