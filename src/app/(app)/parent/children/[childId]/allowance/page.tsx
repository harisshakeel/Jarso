import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui";
import { routes } from "@/config";
import { AllowanceForm, AllowanceSummary, DueList, GiftList } from "@/features/allowance";
import { getSchedule, listDue, listGifts } from "@/features/allowance/server";
import { HistoryList, Jars } from "@/features/ledger";
import { getHistory, getJars } from "@/features/ledger/server";
import { loadChild } from "../load-child";
import { FormSkeleton, PageShell } from "../page-shell";

export const metadata: Metadata = { title: "Allowance" };

async function AllowanceContent({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const { child, currency, today } = await loadChild(childId, routes.parentAllowance(childId));
  const [schedule, due, gifts] = await Promise.all([
    getSchedule(childId),
    listDue(childId),
    listGifts(childId),
  ]);
  const running = schedule && schedule.status !== "stopped" ? schedule : null;
  const upcoming = gifts.filter((gift) => gift.giveOn > today);

  return (
    <PageShell title={`Allowance for ${child.nickname}`}>
      <DueList childId={childId} items={due} currency={currency} />
      {running ? (
        <AllowanceSummary
          childId={childId}
          nickname={child.nickname}
          currency={currency}
          today={today}
          schedule={running}
        />
      ) : (
        <AllowanceForm childId={childId} currency={currency} today={today} />
      )}
      <GiftList childId={childId} gifts={upcoming} currency={currency} />
      {running ? (
        <Link
          href={routes.parentGiftNew(childId)}
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          Give a one-time gift
        </Link>
      ) : null}
      <Suspense fallback={<FormSkeleton />}>
        <ChildMoney childId={childId} currency={currency} />
      </Suspense>
    </PageShell>
  );
}

/** The child's jars and history as the parent sees them (exact amounts). */
async function ChildMoney({ childId, currency }: { childId: string; currency: string }) {
  const [jars, history] = await Promise.all([getJars(childId), getHistory(childId)]);
  return (
    <>
      <Jars jars={jars} currency={currency} showMinor="always" />
      <HistoryList
        items={history}
        currency={currency}
        skippedLabel="Not given"
        showMinor="always"
      />
    </>
  );
}

export default function AllowancePage({
  params,
}: PageProps<"/parent/children/[childId]/allowance">) {
  return (
    <Suspense
      fallback={
        <PageShell title="Allowance">
          <FormSkeleton />
        </PageShell>
      }
    >
      <AllowanceContent params={params} />
    </Suspense>
  );
}
