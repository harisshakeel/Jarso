import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SlowFallback } from "@/components/shell";
import { routes } from "@/config";
import { runningSchedule } from "@/features/allowance";
import { getFamilyContext, getSchedule } from "@/features/allowance/server";
import { requireRole } from "@/features/family/server";
import { GoalSheet, GoalStaircase, goalCopy } from "@/features/goals";
import { getGoalView } from "@/features/goals/server";
import { getAvailability } from "@/features/requests/server";
import { formatMoney } from "@/lib";

export const metadata: Metadata = { title: "Your goal" };

/** The goal's own page (FR02): the full staircase, the figures, and the way to change the goal. */
async function GoalContent() {
  const { user } = await requireRole("child", routes.childGoal);
  const [family, goal, availability, schedule] = await Promise.all([
    getFamilyContext(),
    getGoalView(user.id),
    getAvailability(user.id),
    getSchedule(user.id),
  ]);
  const money = (minor: number) => formatMoney(minor, family.currency, { showMinor: "nonzero" });
  const sheet = (
    <GoalSheet
      goal={goal?.goal ?? null}
      currency={family.currency}
      allowanceMinor={runningSchedule(schedule)?.amountMinor ?? null}
      saveMinor={availability.saveMinor}
      reservedMinor={availability.reservedSaveMinor}
    />
  );
  if (!goal) {
    return (
      <div className="grid justify-items-center gap-4 rounded-2xl bg-card p-6 text-center shadow-raised">
        <p className="text-balance text-lg">{goalCopy.card.empty}</p>
        {sheet}
      </div>
    );
  }
  return (
    <div className="grid gap-6">
      <p className="text-center font-semibold text-h3">
        {goalCopy.card.title(goal.goal.emoji, goal.goal.name, money(goal.goal.targetMinor))}
      </p>
      <GoalStaircase goal={goal.goal} progress={goal.progress} currency={family.currency} />
      <div className="flex justify-center">{sheet}</div>
    </div>
  );
}

export default function GoalPage() {
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <div className="grid gap-2">
        <Link
          href={routes.child}
          className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full px-2 font-semibold text-primary underline-offset-4 hover:underline"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          Home
        </Link>
        <h1 className="text-balance text-h1">{goalCopy.card.heading}</h1>
      </div>
      <Suspense
        fallback={
          <SlowFallback>
            <div aria-hidden className="shimmer h-72 rounded-xl bg-muted" />
          </SlowFallback>
        }
      >
        <GoalContent />
      </Suspense>
    </div>
  );
}
