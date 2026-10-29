import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { routes } from "@/config";
import { ChildAllowanceCard } from "@/features/allowance";
import { getFamilyContext, getSchedule, listDueForChild } from "@/features/allowance/server";
import { getChildNickname, requireRole } from "@/features/family/server";
import { NextStepCard } from "@/features/learning";
import { getLearningOverview } from "@/features/learning/server";
import { HistoryList, Jars } from "@/features/ledger";
import { getHistory, getJars } from "@/features/ledger/server";
import { logger } from "@/lib";

export const metadata: Metadata = { title: "Home" };

/** requireRole sends signed-out users to the PIN sign-in and parents to their own home. */
async function ChildHome() {
  const { user } = await requireRole("child", routes.child);
  const [nickname, family, jars, history, schedule, due] = await Promise.all([
    getChildNickname(),
    getFamilyContext(),
    getJars(user.id),
    getHistory(user.id),
    getSchedule(user.id),
    listDueForChild(user.id),
  ]);
  return (
    <>
      <h1 className="rise-in text-balance text-display">{nickname ? `Hi, ${nickname}!` : "Hi!"}</h1>
      <Suspense fallback={<div aria-hidden className="shimmer h-40 rounded-xl bg-muted" />}>
        <NextStep childId={user.id} />
      </Suspense>
      <Jars jars={jars} currency={family.currency} />
      <ChildAllowanceCard
        schedule={schedule}
        dueTotalMinor={due.totalMinor}
        currency={family.currency}
      />
      <HistoryList items={history} currency={family.currency} />
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
      <Suspense fallback={<HomeSkeleton />}>
        <ChildHome />
      </Suspense>
    </div>
  );
}
