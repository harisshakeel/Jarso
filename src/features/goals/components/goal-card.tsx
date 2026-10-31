import { Card, CardContent } from "@/components/ui";
import { formatMoney } from "@/lib";
import type { GoalView } from "../types";
import { GoalSheet } from "./goal-sheet";

type GoalCardProps = {
  view: GoalView;
  currency: string;
  allowanceMinor: number | null;
  saveMinor: number;
  reservedMinor: number;
};

/**
 * The child's goal on Home (FR02): what it is, what is saved, what is left and about how many
 * allowances to go. The jar Home (PR E) later draws this as the Save jar's goal line.
 */
export function GoalCard({
  view,
  currency,
  allowanceMinor,
  saveMinor,
  reservedMinor,
}: GoalCardProps) {
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const sheet = (
    <GoalSheet
      goal={view?.goal ?? null}
      currency={currency}
      allowanceMinor={allowanceMinor}
      saveMinor={saveMinor}
      reservedMinor={reservedMinor}
    />
  );

  if (!view) {
    return (
      <Card>
        <CardContent className="grid gap-3">
          <p className="eyebrow">My goal</p>
          <p className="font-bold text-h3">Something to save for?</p>
          <p className="text-ink-2">Pick something you want and see how long it'll take.</p>
          <div className="flex">{sheet}</div>
        </CardContent>
      </Card>
    );
  }

  const { goal, progress } = view;
  // Floor, so the bar is never full while money is still to go.
  const percent = progress.reached ? 100 : Math.floor(progress.fillRatio * 100);
  return (
    <Card>
      <CardContent className="grid gap-3">
        <p className="eyebrow">My goal</p>
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-bold text-h3">
            {goal.emoji} {goal.name}
          </p>
          <p className="money font-bold">{money(goal.targetMinor)}</p>
        </div>
        <div
          role="progressbar"
          aria-label={`Saved toward ${goal.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-3.5 overflow-hidden rounded-full bg-teal-100 dark:bg-teal-900"
        >
          <div className="h-full rounded-full bg-gold" style={{ width: `${percent}%` }} />
        </div>
        {progress.reached ? (
          <p className="font-bold">Goal reached</p>
        ) : (
          <>
            <p>
              {money(progress.countedMinor)} saved. {money(progress.remainingMinor)} to go.
            </p>
            <p className="text-ink-2">
              {progress.paymentsLeft === null
                ? "Set how much you'll save each time to see how long it'll take."
                : `About ${progress.paymentsLeft} more ${progress.paymentsLeft === 1 ? "allowance" : "allowances"} at ${money(goal.planMinor ?? 0)} each time.`}
            </p>
          </>
        )}
        <div className="flex">{sheet}</div>
      </CardContent>
    </Card>
  );
}
