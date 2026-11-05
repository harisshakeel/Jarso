import { type GoalView, goalCopy } from "@jarso/core/goals";
import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui";
import { routes } from "@/config";
import { GoalSheet } from "./goal-sheet";
import { GoalStaircase } from "./goal-staircase";

type GoalCardProps = {
  goal: GoalView;
  currency: string;
  /** For the goal sheet's plan hint and live preview. */
  allowanceMinor: number | null;
  saveMinor: number;
  reservedMinor: number;
};

/**
 * "Your goal" on the child's Home (FR02): the compact staircase and the way to the goal's page;
 * without a goal, the invitation to set one. The Save jar itself stays a plain jar.
 */
export function GoalCard({
  goal,
  currency,
  allowanceMinor,
  saveMinor,
  reservedMinor,
}: GoalCardProps) {
  return (
    <Card className="shadow-raised">
      <CardContent>
        <section aria-label={goalCopy.card.heading} className="grid gap-3">
          {/* No visible heading since 2026-11-06 (simpler for kids): the climb says what it is;
              the region keeps its name for screen readers. */}
          <div className="flex items-center justify-end gap-3">
            {goal ? (
              <Link
                href={routes.childGoal}
                className="inline-flex min-h-11 items-center gap-1 rounded-full px-2 font-semibold text-primary underline-offset-4 hover:underline"
              >
                {goalCopy.card.seeIt}
                <ChevronRightIcon aria-hidden className="size-4" />
              </Link>
            ) : null}
          </div>
          {goal ? (
            <GoalStaircase
              goal={goal.goal}
              progress={goal.progress}
              currency={currency}
              size="compact"
            />
          ) : (
            <div className="grid justify-items-center gap-3 text-center">
              <p className="text-ink-2">{goalCopy.card.empty}</p>
              <GoalSheet
                goal={null}
                currency={currency}
                allowanceMinor={allowanceMinor}
                saveMinor={saveMinor}
                reservedMinor={reservedMinor}
              />
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
