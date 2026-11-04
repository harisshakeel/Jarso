import type { Metadata } from "next";
import { Suspense } from "react";
import { routes } from "@/config";
import { AllowanceForm, AllowanceSummary, runningSchedule } from "@/features/allowance";
import { getSchedule } from "@/features/allowance/server";
import { AutoChargeToggle, paymentCopy } from "@/features/payments";
import { getAutoChargeCard } from "@/features/payments/server";
import { loadChild } from "../load-child";
import { FormSkeleton, PageShell } from "../page-shell";

export const metadata: Metadata = { title: "Allowance" };

/** Manage one child's allowance: change, pause, resume or stop it, or set one up. */
async function AllowanceContent({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const { child, currency, today } = await loadChild(childId, routes.parentAllowance(childId));
  const [schedule, autoChargeCards] = await Promise.all([
    getSchedule(childId),
    getAutoChargeCard(),
  ]);
  const running = runningSchedule(schedule);

  return (
    <PageShell
      title="Allowance"
      back={{ href: routes.parentChildMoney(childId), label: child.nickname }}
    >
      {running ? (
        <>
          <AllowanceSummary
            childId={childId}
            nickname={child.nickname}
            currency={currency}
            today={today}
            schedule={running}
          />
          {autoChargeCards ? (
            <AutoChargeToggle
              target={{ type: "allowance_schedule", id: running.id }}
              on={running.autoCharge}
              provider={running.autoChargeProvider}
              mine={running.autoChargeMine}
              cards={autoChargeCards}
            />
          ) : null}
        </>
      ) : (
        <>
          <AllowanceForm childId={childId} currency={currency} today={today} />
          {autoChargeCards ? (
            <p className="text-ink-2 text-sm">{paymentCopy.autoChargeLater}</p>
          ) : null}
        </>
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
