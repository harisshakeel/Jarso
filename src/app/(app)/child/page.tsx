import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { SlowFallback } from "@/components/shell";
import { routes } from "@/config";
import { ChildAllowanceCard } from "@/features/allowance";
import { getFamilyContext, getSchedule, listDueForChild } from "@/features/allowance/server";
import { PendingPurchases, PurchaseSheet, UndoButton } from "@/features/diary";
import { getChildNickname, requireRole } from "@/features/family/server";
import { AskJarso, guideCopy } from "@/features/guide";
import { getGuideState } from "@/features/guide/server";
import { NextStepCard } from "@/features/learning";
import { getLearningOverview } from "@/features/learning/server";
import { HistoryList, Jars } from "@/features/ledger";
import { getHistory, getJars } from "@/features/ledger/server";
import { RequestActions } from "@/features/requests";
import { getAvailability } from "@/features/requests/server";
import { getChildRules } from "@/features/rules/server";
import { logger } from "@/lib";

export const metadata: Metadata = { title: "Home" };

/** requireRole sends signed-out users to the PIN sign-in and parents to their own home. */
async function ChildHome() {
  const { user } = await requireRole("child", routes.child);
  const [nickname, family, jars, history, schedule, due, availability, rules] = await Promise.all([
    getChildNickname(),
    getFamilyContext(),
    getJars(user.id),
    getHistory(user.id),
    getSchedule(user.id),
    listDueForChild(user.id),
    getAvailability(user.id),
    getChildRules(user.id),
  ]);
  return (
    <>
      <h1 className="rise-in text-balance text-display">{nickname ? `Hi, ${nickname}!` : "Hi!"}</h1>
      <Suspense fallback={null}>
        <HomeJarso childId={user.id} hasAllowance={!!schedule && schedule.status !== "stopped"} />
      </Suspense>
      <Suspense fallback={<div aria-hidden className="shimmer h-40 rounded-xl bg-muted" />}>
        <NextStep childId={user.id} />
      </Suspense>
      <Jars jars={jars} currency={family.currency} />
      <RequestActions availability={availability} currency={family.currency} rules={rules.rules} />
      <Link
        href={routes.childRequests}
        className="-mt-3 inline-flex min-h-11 w-fit items-center rounded-full px-2 font-semibold text-primary text-sm underline-offset-4 hover:underline"
      >
        See your Save requests
      </Link>
      <ChildAllowanceCard
        schedule={schedule}
        dueTotalMinor={due.totalMinor}
        currency={family.currency}
      />
      <PurchaseSheet currency={family.currency} userId={user.id} />
      <PendingPurchases userId={user.id} currency={family.currency} />
      <HistoryList
        items={history}
        currency={family.currency}
        renderAction={(item) =>
          item.canUndo && item.entryId ? (
            <UndoButton entryId={item.entryId} label={item.label} />
          ) : null
        }
      />
    </>
  );
}

/**
 * The next step (FR12) streams on its own and hides itself if learning can't load, so a learning
 * error never takes the child's money view down with it.
 */
async function NextStep({ childId }: { childId: string }) {
  try {
    const learning = await getLearningOverview(childId);
    return <NextStepCard step={learning.nextStep} />;
  } catch (error) {
    unstable_rethrow(error);
    logger.warn("Next step unavailable on child home", { error: errorName(error) });
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
