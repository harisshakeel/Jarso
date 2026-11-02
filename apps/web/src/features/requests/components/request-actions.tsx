import { JarIllustration } from "@/components/jar";
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

/** Both jars share one scale here; neither has a goal line. */
const FLOOR_MINOR = 2000;

/**
 * Move my money: the two jars with the two ways between them. "Put some in Save" moves cash
 * to the parent; "Take some out" asks for Save money back. Each is a sheet with the rules that
 * apply and, with a goal, a prediction first.
 */
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
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const predict =
    goal && !goal.progress.reached
      ? {
          goal: goal.goal,
          saveMinor: availability.saveMinor,
          reservedMinor: availability.reservedSaveMinor,
        }
      : undefined;
  const capacity = Math.max(availability.spendMinor, availability.saveMinor, FLOOR_MINOR);
  return (
    <section aria-label="Your jars" className="grid gap-4 rounded-2xl bg-card p-4 shadow-raised">
      <div className="grid grid-cols-2 gap-4">
        <section aria-label="Spend jar" className="grid justify-items-center gap-1 text-center">
          <JarIllustration
            jar="spend"
            size="sm"
            capacityMinor={capacity}
            filledMinor={availability.spendMinor}
          />
          <p className="font-bold text-primary">Spend</p>
          <p className="money font-extrabold text-money-l">{money(availability.spendMinor)}</p>
          {availability.heldSpendMinor > 0 ? (
            <p className="text-ink-2">{money(availability.heldSpendMinor)} on its way to Save</p>
          ) : null}
        </section>
        <section aria-label="Save jar" className="grid justify-items-center gap-1 text-center">
          <JarIllustration
            jar="save"
            size="sm"
            capacityMinor={capacity}
            filledMinor={Math.max(availability.saveMinor - availability.reservedSaveMinor, 0)}
            reservedMinor={availability.reservedSaveMinor}
          />
          <p className="font-bold text-gold-text">Save</p>
          <p className="money font-extrabold text-money-l">{money(availability.saveMinor)}</p>
          {availability.reservedSaveMinor > 0 ? (
            <p className="text-ink-2">
              {money(availability.reservedSaveMinor)} waiting to come out
            </p>
          ) : null}
        </section>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <PutInSheet
          currency={currency}
          availableSpendMinor={availability.availableSpendMinor}
          ruleLines={lines(["deposit_auto_confirm"])}
          predict={predict}
          trigger={{ label: "Put in → Save", variant: "keycap" }}
        />
        <TakeOutSheet
          currency={currency}
          limitMinor={takeOutLimit(availability)}
          ruleLines={lines(TAKE_OUT)}
          predict={predict}
          trigger={{ label: "← Take out", variant: "outline" }}
        />
      </div>
    </section>
  );
}
