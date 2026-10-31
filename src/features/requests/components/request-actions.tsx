import type { GoalView } from "@/features/goals";
import { describeRuleForChild, type MoneyRule } from "@/features/rules";
import { formatMoney } from "@/lib";
import { takeOutLimit } from "../limit";
import type { Availability } from "../types";
import { PutInSheet } from "./put-in-sheet";
import { TakeOutSheet } from "./take-out-sheet";

type RequestActionsProps = {
  availability: Availability;
  currency: string;
  /** The child's money rules; the ones about Save are listed in the sheets. */
  rules: MoneyRule[];
  /** With an unreached goal, the sheets ask the child to predict the effect first (FR05). */
  goal?: GoalView;
};

const TAKE_OUT: MoneyRule["kind"][] = ["withdrawal_cap", "withdrawal_auto_approve"];

/** "Take out" and "Put in" for the Save jar, with a line for money still on its way. */
export function RequestActions({
  availability,
  currency,
  rules,
  goal = null,
}: RequestActionsProps) {
  const lines = (kinds: MoneyRule["kind"][]) =>
    rules
      .filter((rule) => kinds.includes(rule.kind))
      .map((rule) => describeRuleForChild(rule, currency));
  const limitMinor = takeOutLimit(availability);
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const predict =
    goal && !goal.progress.reached
      ? {
          goal: goal.goal,
          saveMinor: availability.saveMinor,
          reservedMinor: availability.reservedSaveMinor,
        }
      : undefined;
  return (
    <div className="grid gap-2">
      <div className="flex gap-3">
        <TakeOutSheet
          currency={currency}
          limitMinor={limitMinor}
          ruleLines={lines(TAKE_OUT)}
          predict={predict}
        />
        <PutInSheet
          currency={currency}
          availableSpendMinor={availability.availableSpendMinor}
          ruleLines={lines(["deposit_auto_confirm"])}
          predict={predict}
        />
      </div>
      {availability.reservedSaveMinor > 0 ? (
        <p className="text-ink-2 text-sm">
          {money(availability.reservedSaveMinor)} waiting to come out
        </p>
      ) : null}
      {availability.heldSpendMinor > 0 ? (
        <p className="text-ink-2 text-sm">
          {money(availability.heldSpendMinor)} waiting to go into Save
        </p>
      ) : null}
    </div>
  );
}
