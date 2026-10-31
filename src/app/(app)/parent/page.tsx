import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect, unstable_rethrow } from "next/navigation";
import type { CSSProperties } from "react";
import { Suspense } from "react";
import { SlowFallback } from "@/components/shell";
import { routes } from "@/config";
import {
  ChildOverviewCard,
  type DueItem,
  mergeDue,
  NeedsYou,
  type Schedule,
} from "@/features/allowance";
import { getSchedule, listDue } from "@/features/allowance/server";
import { type ChildSummary, FirstChildCard } from "@/features/family";
import { getFamily, listChildren, requireRole } from "@/features/family/server";
import type { JarBalances } from "@/features/ledger";
import { getJars } from "@/features/ledger/server";
import {
  ParentRequestItems,
  RequestsUnavailable,
  type SavingsRequest,
  settleRequestReads,
} from "@/features/requests";
import { listRequestsNeedingParent } from "@/features/requests/server";
import { logger } from "@/lib";

export const metadata: Metadata = { title: "Your family" };

const rise = (index: number) => ({ "--rise-index": index }) as CSSProperties;

/** One child's reads, started together and awaited where each section needs them. */
type ChildReads = {
  child: ChildSummary;
  due: Promise<DueItem[]>;
  jars: Promise<JarBalances>;
  requests: Promise<SavingsRequest[]>;
  schedule: Promise<Schedule | null>;
};

async function ParentHome() {
  const { membership } = await requireRole("parent", routes.parent);
  if (!membership) redirect(routes.parentSetup);
  const [family, children] = await Promise.all([getFamily(), listChildren()]);
  if (!family) redirect(routes.parentSetup);

  if (children.length === 0) return <FirstChildCard />;

  // Each service runs once per child; "Needs you" and each card stream in as their reads land.
  const reads: ChildReads[] = children.map((child) => ({
    child,
    due: listDue(child.id),
    jars: getJars(child.id),
    requests: listRequestsNeedingParent(child.id),
    schedule: getSchedule(child.id),
  }));

  return (
    <>
      <div className="rise-in">
        <Suspense fallback={<div aria-hidden className="shimmer h-32 rounded-xl bg-muted" />}>
          <NeedsYouSection reads={reads} currency={family.currency} />
        </Suspense>
      </div>
      <div className="rise-in" style={rise(1)}>
        <Suspense fallback={null}>
          <RequestsSection reads={reads} currency={family.currency} />
        </Suspense>
      </div>
      <section aria-labelledby="children-title" className="rise-in grid gap-3" style={rise(2)}>
        <h2 id="children-title" className="text-h2">
          Children
        </h2>
        <ul className="grid gap-4 md:grid-cols-2">
          {reads.map((read) => (
            <li key={read.child.id}>
              <Suspense fallback={<div aria-hidden className="shimmer h-36 rounded-xl bg-muted" />}>
                <ChildCard read={read} currency={family.currency} />
              </Suspense>
            </li>
          ))}
        </ul>
        <p className="flex flex-wrap items-center text-sm">
          <Link
            href={routes.parentNewChild}
            className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline"
          >
            <PlusIcon aria-hidden className="size-4" />
            Add a child
          </Link>
          <span aria-hidden className="px-2 text-muted-foreground">
            ·
          </span>
          <Link
            href={routes.invite}
            className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline"
          >
            Accept an invitation
          </Link>
        </p>
      </section>
    </>
  );
}

/** Everything due across the family, oldest first. */
async function NeedsYouSection({ reads, currency }: { reads: ChildReads[]; currency: string }) {
  const perChild = await Promise.all(
    reads.map(async ({ child, due }) => ({ child, due: await due })),
  );
  return <NeedsYou items={mergeDue(perChild)} currency={currency} />;
}

/** Take-outs and put-ins waiting on a parent. A child whose read fails gets a calm line; the rest still show. */
async function RequestsSection({ reads, currency }: { reads: ChildReads[]; currency: string }) {
  const results = await Promise.allSettled(reads.map(({ requests }) => requests));
  const { items, failed } = settleRequestReads(
    reads.map(({ child }) => child.nickname),
    results,
  );
  for (const result of results) {
    if (result.status !== "rejected") continue;
    unstable_rethrow(result.reason);
    logger.warn("Parent requests unavailable", {
      error: result.reason instanceof Error ? result.reason.name : typeof result.reason,
    });
  }
  return (
    <>
      <ParentRequestItems items={items} currency={currency} />
      {failed.length > 0 ? <RequestsUnavailable names={failed} /> : null}
    </>
  );
}

async function ChildCard({ read, currency }: { read: ChildReads; currency: string }) {
  const [due, jars, schedule] = await Promise.all([read.due, read.jars, read.schedule]);
  return (
    <ChildOverviewCard
      childId={read.child.id}
      nickname={read.child.nickname}
      spendMinor={jars.spend}
      saveMinor={jars.save}
      schedule={schedule}
      dueCount={due.length}
      currency={currency}
    />
  );
}

function HomeSkeleton() {
  return (
    <div aria-hidden className="grid gap-6">
      <div className="shimmer h-32 rounded-xl bg-muted" />
      <div className="shimmer h-8 w-40 rounded-lg bg-muted" />
      <div className="shimmer h-36 rounded-xl bg-muted" />
    </div>
  );
}

export default function ParentHomePage() {
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <h1 className="text-h1">Your family</h1>
      <Suspense
        fallback={
          <SlowFallback>
            <HomeSkeleton />
          </SlowFallback>
        }
      >
        <ParentHome />
      </Suspense>
    </div>
  );
}
