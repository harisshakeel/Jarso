import { describeRuleForChild, type MoneyRule } from "@/features/rules";
import { formatMoney } from "@/lib";
import type { Availability } from "../types";
import { PutInSheet } from "./put-in-sheet";
import { TakeOutSheet } from "./take-out-sheet";

type RequestActionsProps = {
  availability: Availability;
  currency: string;
  /** The child's money rules; the ones about Save are listed in the sheets. */
  rules: MoneyRule[];
};

const TAKE_OUT: MoneyRule["kind"][] = ["withdrawal_cap", "withdrawal_auto_approve"];

/** "Take out" and "Put in" for the Save jar, with a line for money still on its way. */
export function RequestActions({ availability, currency, rules }: RequestActionsProps) {
  const lines = (kinds: MoneyRule["kind"][]) =>
    rules
      .filter((rule) => kinds.includes(rule.kind))
      .map((rule) => describeRuleForChild(rule, currency));
  // `takeOutLimitMinor` is already no more than Save has free; null means no cap.
  const limitMinor = availability.takeOutLimitMinor ?? availability.availableSaveMinor;
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  return (
    <div className="grid gap-2">
      <div className="flex gap-3">
        <TakeOutSheet currency={currency} limitMinor={limitMinor} ruleLines={lines(TAKE_OUT)} />
        <PutInSheet
          currency={currency}
          availableSpendMinor={availability.availableSpendMinor}
          ruleLines={lines(["deposit_auto_confirm"])}
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
