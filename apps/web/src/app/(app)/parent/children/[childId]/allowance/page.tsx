import { GiftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { routes } from "@/config";
import {
  AllowanceForm,
  AllowanceSummary,
  DueList,
  GiftList,
  runningSchedule,
  upcomingGifts,
} from "@/features/allowance";
import { getSchedule, listDue, listGifts } from "@/features/allowance/server";
import { scopeChildren, ThisWeekStrip, TimelineCard, timeline } from "@/features/dashboard";
import { getFamilyDashboard } from "@/features/dashboard/server";
import { Jars } from "@/features/ledger";
import { getJars } from "@/features/ledger/server";
import { AutoChargeToggle, paymentCopy } from "@/features/payments";
import { getAutoChargeCard } from "@/features/payments/server";
import { fallback } from "@/lib";
import { loadChild } from "../load-child";
import { FormSkeleton, PageShell } from "../page-shell";

export const metadata: Metadata = { title: "Allowance" };

/**
 * One child's allowance and everything handed over (2026-11-04: moved here from the child's
 * Money tab and the Money page, so the money coming in lives in one place). On the left what
 * needs the parent now, the handovers due, and the allowance itself (change, pause, resume or
 * stop it, or set one up). On the right their jars, this week in three figures, the next two
 * weeks and the gifts planned. Handing over, saving a gift or an allowance come back here.
 */
async function AllowanceContent({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const { child, currency, today } = await loadChild(childId, routes.parentAllowance(childId));
  const [schedule, autoChargeCards, due, gifts, jars] = await Promise.all([
    getSchedule(childId),
    getAutoChargeCard(),
    listDue(childId),
    listGifts(childId),
    getJars(childId),
  ]);
  const running = runningSchedule(schedule);

  return (
    <PageShell
      title="Allowance"
      back={{ href: routes.parentChildMoney(childId), label: child.nickname }}
      wide
    >
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="grid gap-6">
          <DueList childId={childId} items={due} currency={currency} />
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
        </div>
        <div className="grid gap-6">
          <Jars
            jars={jars}
            currency={currency}
            showMinor="always"
            allowanceMinor={running?.amountMinor ?? null}
          />
          <Suspense fallback={<div aria-hidden className="shimmer h-40 rounded-xl bg-muted" />}>
            <WeekAndComingUp childId={childId} />
          </Suspense>
          <div className="grid gap-3">
            <Link
              href={routes.parentGiftNew(childId)}
              className="flex min-h-11 items-center gap-3 rounded-xl border border-hairline bg-card px-4 py-3 font-semibold hover:bg-muted"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gold-100 text-gold-700">
                <GiftIcon aria-hidden className="size-5" />
              </span>
              Give a gift
            </Link>
            <GiftList childId={childId} gifts={upcomingGifts(gifts, today)} currency={currency} />
          </div>
        </div>
      </div>
    </PageShell>
  );
}

/**
 * This week for this child (handed over, still to hand over, the next thing) and their next two
 * weeks. Nice to have: if the family read fails, the page goes on without it.
 */
async function WeekAndComingUp({ childId }: { childId: string }) {
  const data = await fallback(getFamilyDashboard(7), null, "Week on the allowance page");
  if (!data) return null;
  const scoped = scopeChildren(data.children, childId);
  if (scoped.length === 0) return null;
  return (
    <>
      <ThisWeekStrip kids={scoped} currency={data.currency} today={data.today} />
      <TimelineCard events={timeline(scoped, data.today, data.currency)} />
    </>
  );
}

export default function AllowancePage({
  params,
}: PageProps<"/parent/children/[childId]/allowance">) {
  return (
    <Suspense
      fallback={
        <PageShell title="Allowance" wide>
          <FormSkeleton />
        </PageShell>
      }
    >
      <AllowanceContent params={params} />
    </Suspense>
  );
}
