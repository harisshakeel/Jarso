import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { routes } from "@/config";
import { DueList, GiftList, ParentAllowanceCard } from "@/features/allowance";
import { getSchedule, listDue, listGifts } from "@/features/allowance/server";
import { Jars, RecentHistory } from "@/features/ledger";
import { getHistory, getJars } from "@/features/ledger/server";
import { loadChild } from "./load-child";
import { FormSkeleton, PageShell } from "./page-shell";

export const metadata: Metadata = { title: "Your child" };

const back = { href: routes.parent, label: "Your family" };

async function ChildContent({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const { child, currency, today } = await loadChild(childId, routes.parentChild(childId));
  const [jars, due, schedule, gifts] = await Promise.all([
    getJars(childId),
    listDue(childId),
    getSchedule(childId),
    listGifts(childId),
  ]);
  const upcoming = gifts.filter((gift) => gift.giveOn > today);

  return (
    <PageShell title={child.nickname} back={back} wide>
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="grid gap-6">
          <Jars jars={jars} currency={currency} showMinor="always" />
          <DueList childId={childId} items={due} currency={currency} />
          <ParentAllowanceCard childId={childId} schedule={schedule} currency={currency} />
          <div className="grid gap-3">
            <GiftList childId={childId} gifts={upcoming} currency={currency} />
            <Link
              href={routes.parentGiftNew(childId)}
              className="inline-flex min-h-11 w-fit items-center gap-1 rounded-full px-2 font-semibold text-primary underline-offset-4 hover:underline"
            >
              <PlusIcon aria-hidden className="size-5" />
              Give a gift
            </Link>
          </div>
        </div>
        <Suspense fallback={<div aria-hidden className="shimmer h-64 rounded-xl bg-muted" />}>
          <ChildHistory childId={childId} currency={currency} />
        </Suspense>
      </div>
    </PageShell>
  );
}

/** The newest few history lines as the parent sees them (exact amounts). */
async function ChildHistory({ childId, currency }: { childId: string; currency: string }) {
  const history = await getHistory(childId);
  return (
    <RecentHistory
      items={history}
      currency={currency}
      skippedLabel="Not given"
      showMinor="always"
      seeAllHref={routes.parentChildHistory(childId)}
    />
  );
}

export default function ChildPage({ params }: PageProps<"/parent/children/[childId]">) {
  return (
    <Suspense
      fallback={
        <PageShell title="Your child" back={back} wide>
          <FormSkeleton />
        </PageShell>
      }
    >
      <ChildContent params={params} />
    </Suspense>
  );
}
