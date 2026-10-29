import type { Metadata } from "next";
import { Suspense } from "react";
import { routes } from "@/config";
import { AllowanceForm, AllowanceSummary } from "@/features/allowance";
import { getSchedule } from "@/features/allowance/server";
import { loadChild } from "../load-child";
import { FormSkeleton, PageShell } from "../page-shell";

export const metadata: Metadata = { title: "Allowance" };

/** Manage one child's allowance: change, pause, resume or stop it, or set one up. */
async function AllowanceContent({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const { child, currency, today } = await loadChild(childId, routes.parentAllowance(childId));
  const schedule = await getSchedule(childId);
  const running = schedule && schedule.status !== "stopped" ? schedule : null;

  return (
    <PageShell
      title="Allowance"
      back={{ href: routes.parentChild(childId), label: child.nickname }}
    >
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
    </PageShell>
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
