# 0019. The allowance carries a planned Spend/Save split

- Status: Accepted
- Date: 2026-11-07

## Context

The kid rework (spec `2026-11-06-mobile-kid-rework-design.md`, parent onboarding step 5, "Decided" item 2) asks the parent to say, when they set the allowance, how it divides into Spend and Save. Until now the split existed only at handover time: the handover form was prefilled from the share of the child's last handover (`prefillSplit`), and the first handover was all Spend. The goal-gradient idea in the spec wants a default Save share from day one, and the child's intro (plan 8) needs a real Save amount for "about N weeks".

Money rules still hold: money is integer minor units, nothing reaches a jar until a parent confirms a handover, and the handover may differ from the plan (the parent can give less, or split it another way).

## Decision

1. **Store the Save part, never a percentage.** `allowance_schedules.save_minor` (nullable `bigint`, `0..amount_minor` by constraint). Spend is never stored: it is always `amount − save`, so the two parts add up to the amount exactly, for every amount, with no rounding at read time. Rejected: a percentage (each amount needs its own rounding, and a changed amount silently changes the money), and storing both parts (they can drift apart).
2. **Due items carry the split.** `allowance_occurrences.save_minor` is copied from the schedule when the period is generated, like `amount_minor` (D6). A later change to the schedule never changes an item already due. `list_due_for_parent` returns it (null for gifts).
3. **Null means "no plan".** Schedules made before this, and callers that don't send a split, keep `save_minor = null`; their handover is prefilled from the last handover as before. `0` is an explicit "all Spend".
4. **Rounding.** The editor offers shares (All Spend, 10 %, 25 %, 50 %) and a typed Save amount. A share's Save is `floor(amount × share / 100)` rounded **down to a whole currency unit** (whole coins and notes at a cash handover), and Spend gets the rest. A typed Save is taken exactly, in minor units, and must be `≤ amount`. A new allowance starts at 25 % (the spec's default head start; the same quarter plan 8 used for its suggested plan).
5. **Writes.** `create_allowance` and `change_allowance` gain a last parameter `p_save_minor bigint default null` (the old four-argument functions are dropped, so there is one function each and older phone builds that send four named arguments still work). On change, a null keeps the current Save when it still fits the new amount and clears it otherwise. Both functions refuse a Save that is negative or over the amount (`22023`) and log it in `audit_log`.
6. **The plan prefills, the handover decides.** The handover form, the card auto charge and the in-app card payment prefill with the item's planned split when it has one (`handoverPrefill` in `@jarso/core/allowance`), else with `prefillSplit` (last time's share). `checkSplit` and `confirm_handover` are unchanged: the parent can still change both numbers, give less, or mark it not given. A plan is never money: it posts nothing and is never part of a balance.
7. **The child may read it.** `save_minor` is added to the column grant on `allowance_schedules` (it is not a payment detail). The child's intro uses it: `suggestedPlan` is the planned Save when it is more than 0, else a quarter of the allowance as before.

## Consequences

- Every new allowance has a Save part by default; existing families see no change until a parent edits the allowance (the editor then shows 25 % for a schedule with no plan, and saving stores it).
- `create_allowance`, `change_allowance` and `list_due_for_parent` are dropped and recreated in one migration (new parameter, new result column), so their grants are restated there.
- The allowance-day plan on the child's Home (Jarso's "put some in Save" card) still works from the Spend part actually handed over; with a planned Save it simply has less to suggest.
- The split is per schedule, not per child: a stopped and re-created allowance starts again at the default.
