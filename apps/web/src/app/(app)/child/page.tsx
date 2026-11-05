import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { PageContainer, PageHeader, PageSkeleton } from "@/components/layout";
import { SlowFallback } from "@/components/shell";
import { Card, CardContent, Skeleton } from "@/components/ui";
import { routes } from "@/config";
import { AllowanceLine, runningSchedule } from "@/features/allowance";
import {
  getFamilyContext,
  getSchedule,
  getTodaysAllowance,
  listDueForChild,
} from "@/features/allowance/server";
import { PurchaseSheet } from "@/features/diary";
import { getChildNickname, requireRole } from "@/features/family/server";
import { GoalCard } from "@/features/goals";
import { getGoalView } from "@/features/goals/server";
import { allowancePlan } from "@/features/guide";
import { chooseHomeStep, HomeStepCard, MiniRoad, StreakBadge } from "@/features/learning";
import { getLearningOverview } from "@/features/learning/server";
import { JarShelf } from "@/features/ledger";
import { AllowancePlanCard, takeOutLimit } from "@/features/requests";
import { getAvailability, listRequests } from "@/features/requests/server";
import { getChildRules } from "@/features/rules/server";
import { fallback, logger } from "@/lib";

export const metadata: Metadata = { title: "Home" };

/**
 * The child's Home, learning first (2026-11-04): one card with the run and points as a big
 * number, the one next thing and the seven missions as a short line; then the money (jars, one
 * gold keycap to record a purchase) and the goal. How the jars moved and pending purchases
 * are on the Diary. Simpler for kids (2026-11-06): short plain lines (the pocket money, the
 * goal's progress) under clear headings, no captions under the jars, no explanation lines.
 * Ask Jarso has its own page (the Jarso tab). The week and the
 * skills live on Learn. requireRole sends signed-out users to the PIN sign-in and parents home.
 */
async function ChildHome() {
  const { user } = await requireRole("child", routes.child);
  const [nickname, family, schedule, due] = await Promise.all([
    getChildNickname(),
    getFamilyContext(),
    getSchedule(user.id),
    listDueForChild(user.id),
  ]);
  const allowanceMinor = runningSchedule(schedule)?.amountMinor ?? null;
  return (
    <>
      <PageHeader
        className="rise-in"
        title={nickname ? `Hi, ${nickname}!` : "Hi!"}
        description={<AllowanceLine schedule={schedule} currency={family.currency} />}
        action={
          <PurchaseSheet
            currency={family.currency}
            userId={user.id}
            variant="keycap-gold"
            size="xl"
          />
        }
      />
      {/* Learning leads (2026-11-04): the run, today's one next thing and the road, across the
          top. Then the jars on the left and today's plan and the goal on the right. Pending
          purchases and how the jars moved are on the Diary. Tablets stack in the same order. */}
      <Suspense fallback={<Skeleton className="h-40" />}>
        <HomeStep childId={user.id} currency={family.currency} allowanceMinor={allowanceMinor} />
      </Suspense>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-8">
        <Card tone="raised" className="rise-in">
          <CardContent>
            <Suspense fallback={<Skeleton className="h-96" />}>
              <HomeShelf
                childId={user.id}
                currency={family.currency}
                allowanceMinor={allowanceMinor}
                dueMinor={due.totalMinor}
              />
            </Suspense>
          </CardContent>
        </Card>
        <div className="grid gap-6">
          <Suspense fallback={null}>
            <HomePlan childId={user.id} currency={family.currency} />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-56" />}>
            <HomeGoal
              childId={user.id}
              currency={family.currency}
              allowanceMinor={allowanceMinor}
            />
          </Suspense>
        </div>
      </div>
    </>
  );
}

/**
 * "Do this next" (FR12, spec §6.1) streams on its own and hides itself if it can't load, so an
 * error there never takes the child's money view down with it.
 */
async function HomeStep({
  childId,
  currency,
  allowanceMinor,
}: {
  childId: string;
  currency: string;
  allowanceMinor: number | null;
}) {
  try {
    // The goal and requests only shape the step; if they fail, learning still leads.
    const [learning, goal, requests, availability] = await Promise.all([
      getLearningOverview(childId),
      fallback(getGoalView(childId), null, "Goal on child home"),
      fallback(listRequests(childId), [], "Requests on child home"),
      getAvailability(childId),
    ]);
    const approved = requests.find((r) => r.kind === "withdrawal" && r.status === "approved");
    const step = chooseHomeStep({
      goal,
      approvedWithdrawal: approved ? { amountMinor: approved.amountMinor } : null,
      learning: learning.nextStep,
    });
    return (
      <Card className="rise-in shadow-raised">
        <CardContent>
          {/* The run and points as one big block on the left, the one next thing in the middle,
              and the seven missions as a short line on the right (2026-11-04). Phones stack
              them: the run, the step, then the line. */}
          <section
            aria-label="Learning today"
            className="grid gap-5 md:grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,22rem)] lg:items-center lg:gap-8"
          >
            <StreakBadge points={learning.points} streak={learning.streak} />
            <HomeStepCard
              bare
              step={step}
              currency={currency}
              takeOutLimitMinor={takeOutLimit(availability)}
              goalSheet={{
                goal: goal?.goal ?? null,
                currency,
                allowanceMinor,
                saveMinor: availability.saveMinor,
                reservedMinor: availability.reservedSaveMinor,
              }}
            />
            <div className="md:col-span-2 lg:col-span-1">
              <MiniRoad journey={learning.journey} />
            </div>
          </section>
        </CardContent>
      </Card>
    );
  } catch (error) {
    unstable_rethrow(error);
    logger.warn("Next step unavailable on child home", { error: errorName(error) });
    return null;
  }
}

/**
 * Jarso's plan for today's pocket money: shown only on the day an allowance lands, until the
 * child takes or dismisses it. The split is worked out in code. Nice to have: it hides itself
 * if anything it needs can't load.
 */
async function HomePlan({ childId, currency }: { childId: string; currency: string }) {
  try {
    const today = await getTodaysAllowance(childId);
    if (!today) return null;
    const [availability, goal, rules] = await Promise.all([
      getAvailability(childId),
      fallback(getGoalView(childId), null, "Goal on the allowance plan"),
      fallback(getChildRules(childId), null, "Rules on the allowance plan"),
    ]);
    const openGoal = goal && !goal.progress.reached ? goal : null;
    const plan = allowancePlan({
      cashMinor: today.cashMinor,
      savedMinor: today.savedMinor,
      availableSpendMinor: availability.availableSpendMinor,
      currency,
      goal: openGoal
        ? {
            name: openGoal.goal.name,
            planMinor: openGoal.goal.planMinor,
            remainingMinor: openGoal.progress.remainingMinor,
          }
        : null,
    });
    // A decided plan still renders the card (which then shows only a choice just made on it).
    if (!plan && !today.planDecided) return null;
    return (
      <AllowancePlanCard
        occurrenceId={today.occurrenceId}
        plan={plan}
        decided={today.planDecided}
        goalName={openGoal?.goal.name ?? null}
        currency={currency}
        movesWithoutAsking={rules?.jarMovesApproval === "notify"}
      />
    );
  } catch (error) {
    unstable_rethrow(error);
    logger.warn("Allowance plan unavailable on child home", { error: errorName(error) });
    return null;
  }
}

/** The goal as a staircase of coins (FR02), or the invitation to set one. Nice to have. */
async function HomeGoal({
  childId,
  currency,
  allowanceMinor,
}: {
  childId: string;
  currency: string;
  allowanceMinor: number | null;
}) {
  try {
    const [goal, availability] = await Promise.all([
      getGoalView(childId),
      getAvailability(childId),
    ]);
    return (
      <GoalCard
        goal={goal}
        currency={currency}
        allowanceMinor={allowanceMinor}
        saveMinor={availability.saveMinor}
        reservedMinor={availability.reservedSaveMinor}
      />
    );
  } catch (error) {
    unstable_rethrow(error);
    logger.warn("Goal unavailable on child home", { error: errorName(error) });
    return null;
  }
}

/** The jars (FR03, FR02). If they can't load, say so calmly instead of failing the page. */
async function HomeShelf({
  childId,
  currency,
  allowanceMinor,
  dueMinor,
}: {
  childId: string;
  currency: string;
  allowanceMinor: number | null;
  dueMinor: number;
}) {
  try {
    // Only the balances can fail the shelf; the goal, requests and rules are nice to have.
    const [availability, rules, goal, requests] = await Promise.all([
      getAvailability(childId),
      fallback(getChildRules(childId), null, "Rules on child home"),
      fallback(getGoalView(childId), null, "Goal on child home"),
      fallback(listRequests(childId), [], "Requests on child home"),
    ]);
    return (
      <JarShelf
        currency={currency}
        userId={childId}
        availability={availability}
        rules={rules?.rules ?? []}
        goal={goal}
        allowanceMinor={allowanceMinor}
        dueMinor={dueMinor}
        openRequests={requests.filter((r) => r.status === "pending" || r.status === "approved")}
        movesWithoutAsking={rules?.jarMovesApproval === "notify"}
      />
    );
  } catch (error) {
    unstable_rethrow(error);
    logger.warn("Jars unavailable on child home", { error: errorName(error) });
    return (
      <p role="status" className="rounded-xl bg-muted p-4 text-ink-2">
        We couldn't load your jars just now. Refresh to try again.
      </p>
    );
  }
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

export default function ChildHomePage() {
  return (
    <PageContainer width="wide">
      <Suspense
        fallback={
          <SlowFallback>
            <PageSkeleton />
          </SlowFallback>
        }
      >
        <ChildHome />
      </Suspense>
    </PageContainer>
  );
}
