import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { SlowFallback } from "@/components/shell";
import { routes } from "@/config";
import { ChildAllowanceCard, runningSchedule } from "@/features/allowance";
import { getFamilyContext, getSchedule, listDueForChild } from "@/features/allowance/server";
import { PendingPurchases } from "@/features/diary";
import { getChildNickname, requireRole } from "@/features/family/server";
import { getGoalView } from "@/features/goals/server";
import { AskJarso, guideCopy } from "@/features/guide";
import { getGuideState } from "@/features/guide/server";
import { chooseHomeStep, HomeStepCard, SkillsStrip } from "@/features/learning";
import { getLearningOverview } from "@/features/learning/server";
import { JarShelf } from "@/features/ledger";
import { takeOutLimit } from "@/features/requests";
import { getAvailability, listRequests } from "@/features/requests/server";
import { getChildRules } from "@/features/rules/server";
import { fallback, logger } from "@/lib";

export const metadata: Metadata = { title: "Home" };

/** requireRole sends signed-out users to the PIN sign-in and parents to their own home. */
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
      <h1 className="rise-in text-balance text-display">{nickname ? `Hi, ${nickname}!` : "Hi!"}</h1>
      <Suspense fallback={null}>
        <HomeJarso childId={user.id} hasAllowance={allowanceMinor !== null} />
      </Suspense>
      <Suspense fallback={<div aria-hidden className="shimmer h-40 rounded-xl bg-muted" />}>
        <HomeStep childId={user.id} currency={family.currency} allowanceMinor={allowanceMinor} />
      </Suspense>
      <PendingPurchases userId={user.id} currency={family.currency} />
      <Suspense fallback={<div aria-hidden className="shimmer h-96 rounded-xl bg-muted" />}>
        <HomeShelf
          childId={user.id}
          currency={family.currency}
          allowanceMinor={allowanceMinor}
          dueMinor={due.totalMinor}
        />
      </Suspense>
      <Link
        href={routes.childRequests}
        className="-mt-3 inline-flex min-h-11 w-fit items-center justify-self-center rounded-full px-2 font-semibold text-primary text-sm underline-offset-4 hover:underline"
      >
        See your Save requests
      </Link>
      <ChildAllowanceCard
        schedule={schedule}
        dueTotalMinor={due.totalMinor}
        currency={family.currency}
      />
      <Suspense fallback={<div aria-hidden className="shimmer h-24 rounded-xl bg-muted" />}>
        <HomeSkills childId={user.id} />
      </Suspense>
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
      <HomeStepCard
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
    );
  } catch (error) {
    unstable_rethrow(error);
    logger.warn("Next step unavailable on child home", { error: errorName(error) });
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

/** Skills learned, outside the jars (invariant 11). Hides itself if learning can't load. */
async function HomeSkills({ childId }: { childId: string }) {
  try {
    const learning = await getLearningOverview(childId);
    return <SkillsStrip skills={learning.skills} />;
  } catch (error) {
    unstable_rethrow(error);
    logger.warn("Skills unavailable on child home", { error: errorName(error) });
    return null;
  }
}

/**
 * "Ask Jarso" at the top of Home, when the parent has turned Jarso on (FR07, ADR 0011). Its
 * turns stream from /api/v1/guide/turns, so this page needs no long maxDuration.
 */
async function HomeJarso({ childId, hasAllowance }: { childId: string; hasAllowance: boolean }) {
  const guide = await getGuideState(childId);
  if (!guide.available) return null;
  const { suggestions } = guideCopy;
  return (
    <AskJarso
      introNeeded={guide.introNeeded}
      suggestions={[
        suggestions.jars,
        suggestions.spent,
        hasAllowance ? suggestions.allowance : suggestions.learning,
        suggestions.saving,
      ]}
    />
  );
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function HomeSkeleton() {
  return (
    <div aria-hidden className="grid gap-6">
      <div className="shimmer h-11 w-48 rounded-lg bg-muted" />
      <div className="shimmer h-44 rounded-xl bg-muted" />
    </div>
  );
}

export default function ChildHomePage() {
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <Suspense
        fallback={
          <SlowFallback>
            <HomeSkeleton />
          </SlowFallback>
        }
      >
        <ChildHome />
      </Suspense>
    </div>
  );
}
