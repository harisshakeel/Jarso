import { JarIllustration } from "@/components/jar";
import { PurchaseSheet } from "@/features/diary";
import { GoalSheet, type GoalView } from "@/features/goals";
import {
  type Availability,
  PutInSheet,
  type SavingsRequest,
  TakeOutSheet,
} from "@/features/requests";
import { describeRuleForChild, type MoneyRule } from "@/features/rules";
import { formatMoney } from "@/lib";
import { jarCapacity } from "../jar-scale";

type JarShelfProps = {
  currency: string;
  userId: string;
  availability: Availability;
  /** The child's money rules; the ones about Save are listed in the sheets. */
  rules: MoneyRule[];
  goal: GoalView;
  allowanceMinor: number | null;
  /** Allowance money due but not handed over yet. Never inside a jar. */
  dueMinor: number;
  /** Pending and approved requests, shown under the jar they affect. */
  openRequests: SavingsRequest[];
};

/** A request in the child's words, under its jar (spec §6.1). */
function requestChip(request: SavingsRequest, money: (minor: number) => string): string {
  const amount = money(request.amountMinor);
  if (request.kind === "deposit") return `${amount} to Save · give it to your parent`;
  return request.status === "approved"
    ? `${amount} from Save · your parent said yes`
    : `${amount} asked from Save · waiting for your parent`;
}

/**
 * Child Home's two jars (FR03, FR02): Spend and Save side by side. With a goal, a full Save jar
 * means the goal is reached; due money floats outside the jars. Every amount is also in text.
 */
export function JarShelf({
  currency,
  userId,
  availability,
  rules,
  goal,
  allowanceMinor,
  dueMinor,
  openRequests,
}: JarShelfProps) {
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const ruleLines = (kinds: MoneyRule["kind"][]) =>
    rules.filter((rule) => kinds.includes(rule.kind)).map((r) => describeRuleForChild(r, currency));

  const { spendMinor, saveMinor, reservedSaveMinor } = availability;
  const countedMinor = Math.max(saveMinor - reservedSaveMinor, 0);
  const shared = jarCapacity({ spendMinor, saveMinor, allowanceMinor, currency });
  const saveCapacity = goal ? goal.goal.targetMinor : shared;
  const takeOutLimit = availability.takeOutLimitMinor ?? availability.availableSaveMinor;
  const deposits = openRequests.filter((r) => r.kind === "deposit");
  const withdrawals = openRequests.filter((r) => r.kind === "withdrawal");

  return (
    <section aria-label="Your jars" className="grid gap-4">
      {dueMinor > 0 ? (
        <p className="justify-self-center rounded-full border border-cyan-700 border-dashed px-3 py-1 font-semibold text-cyan-700 text-sm dark:border-cyan-300 dark:text-cyan-300">
          {money(dueMinor)} on its way · waiting for a parent
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-4">
        <section
          aria-label="Spend jar"
          className="grid content-start justify-items-center gap-2 text-center"
        >
          <JarIllustration jar="spend" capacityMinor={shared} filledMinor={spendMinor} />
          <h2 className="font-bold text-h3 text-primary">Spend</h2>
          <p className="money font-extrabold text-money-l">{money(spendMinor)}</p>
          <p className="text-ink-2 text-sm">Cash you have</p>
          {deposits.map((r) => (
            <p key={r.id} className="text-ink-2 text-sm">
              {requestChip(r, money)}
            </p>
          ))}
          <div className="grid w-full gap-2">
            <PurchaseSheet currency={currency} userId={userId} variant="outline" />
            <PutInSheet
              currency={currency}
              availableSpendMinor={availability.availableSpendMinor}
              ruleLines={ruleLines(["deposit_auto_confirm"])}
            />
          </div>
        </section>
        <section
          aria-label="Save jar"
          className="grid content-start justify-items-center gap-2 text-center"
        >
          <JarIllustration
            jar="save"
            capacityMinor={saveCapacity}
            filledMinor={countedMinor}
            reservedMinor={reservedSaveMinor}
            goal={goal ? { emoji: goal.goal.emoji } : null}
          />
          <h2 className="font-bold text-gold-text text-h3">Save</h2>
          <p className="money font-extrabold text-money-l">{money(saveMinor)}</p>
          <p className="text-ink-2 text-sm">Kept by your parent</p>
          {goal ? <GoalLines goal={goal} money={money} reservedMinor={reservedSaveMinor} /> : null}
          {withdrawals.map((r) => (
            <p key={r.id} className="text-ink-2 text-sm">
              {requestChip(r, money)}
            </p>
          ))}
          <div className="grid w-full gap-2">
            <TakeOutSheet
              currency={currency}
              limitMinor={takeOutLimit}
              ruleLines={ruleLines(["withdrawal_cap", "withdrawal_auto_approve"])}
            />
            <GoalSheet
              goal={goal?.goal ?? null}
              currency={currency}
              allowanceMinor={allowanceMinor}
              saveMinor={saveMinor}
              reservedMinor={reservedSaveMinor}
            />
          </div>
        </section>
      </div>
      <ul
        aria-label="What the jars show"
        className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-ink-2 text-sm"
      >
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-sm bg-gold" />
          Counts toward your goal
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-3 rounded-sm bg-[repeating-linear-gradient(45deg,var(--color-gold-400)_0_3px,transparent_3px_8px)]"
          />
          Waiting to come out
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-3 rounded-full border border-cyan-700 border-dashed dark:border-cyan-300"
          />
          On its way
        </li>
      </ul>
    </section>
  );
}

function GoalLines({
  goal: { goal, progress },
  money,
  reservedMinor,
}: {
  goal: NonNullable<GoalView>;
  money: (minor: number) => string;
  reservedMinor: number;
}) {
  return (
    <div className="grid gap-1 text-sm">
      <p className="font-semibold">
        {goal.emoji} {goal.name}, {money(goal.targetMinor)}.
      </p>
      {/* With money waiting to come out, Save and "to go" don't add up unless we say this. */}
      {reservedMinor > 0 && !progress.reached ? (
        <p>{money(progress.countedMinor)} counts toward it</p>
      ) : null}
      {progress.reached ? (
        <p className="font-bold">Goal reached</p>
      ) : progress.paymentsLeft === null ? (
        <>
          <p>{money(progress.remainingMinor)} to go</p>
          <p className="text-ink-2">
            Set how much you'll save each time to see how long it'll take
          </p>
        </>
      ) : (
        <p>
          {money(progress.remainingMinor)} to go · about {progress.paymentsLeft} more{" "}
          {progress.paymentsLeft === 1 ? "allowance" : "allowances"} at {money(goal.planMinor ?? 0)}{" "}
          each
        </p>
      )}
    </div>
  );
}
