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
  runningSchedule,
  type Schedule,
} from "@/features/allowance";
import { getSchedule, listDue } from "@/features/allowance/server";
import { type ChildSummary, FirstChildCard } from "@/features/family";
import { getFamily, listChildren, requireRole } from "@/features/family/server";
import type { GoalView } from "@/features/goals";
import { getGoalView } from "@/features/goals/server";
import { jarCapacity } from "@/features/ledger";
import { type Notice, UnreadNotices } from "@/features/notifications";
import { listUnreadNotices } from "@/features/notifications/server";
import {
  type Availability,
  ParentRequestItems,
  RequestsUnavailable,
  type SavingsRequest,
  settleRequestReads,
} from "@/features/requests";
import { getAvailability, listRequestsNeedingParent } from "@/features/requests/server";
import { logger } from "@/lib";

export const metadata: Metadata = { title: "Your family" };

const rise = (index: number) => ({ "--rise-index": index }) as CSSProperties;

/** One child's reads, started together and awaited where each section needs them. */
type ChildReads = {
  child: ChildSummary;
  due: Promise<DueItem[]>;
  availability: Promise<Availability>;
  goal: Promise<GoalView>;
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
    availability: getAvailability(child.id),
    goal: getGoalView(child.id),
    requests: listRequestsNeedingParent(child.id),
    schedule: getSchedule(child.id),
  }));
  // Limit notices are the parent's own rows; a failed read leaves them out, never the page.
  const notices = listUnreadNotices(["limit_exceeded"]).catch((error: unknown) => {
    unstable_rethrow(error);
    logger.warn("Limit notices unavailable", { error: errorName(error) });
    return [] as Notice[];
  });

  return (
    <>
      <div className="rise-in">
        <Suspense fallback={<div aria-hidden className="shimmer h-32 rounded-xl bg-muted" />}>
          <NeedsYouSection reads={reads} notices={notices} currency={family.currency} />
        </Suspense>
      </div>
      <div className="rise-in" style={rise(1)}>
        <Suspense fallback={null}>
          <RequestsSection reads={reads} currency={family.currency} />
        </Suspense>
      </div>
      <div className="rise-in" style={rise(1)}>
        <Suspense fallback={null}>
          <NoticesSection notices={notices} currency={family.currency} />
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

/**
 * Everything due across the family, oldest first. Requests and limit notices are listed just
 * below; they count here so "All caught up." only shows when nothing waits.
 */
async function NeedsYouSection({
  reads,
  notices,
  currency,
}: {
  reads: ChildReads[];
  notices: Promise<Notice[]>;
  currency: string;
}) {
  const [perChild, requests, unread] = await Promise.all([
    Promise.all(reads.map(async ({ child, due }) => ({ child, due: await due }))),
    Promise.allSettled(reads.map(({ requests }) => requests)),
    notices,
  ]);
  const waitingRequests = requests.reduce(
    (sum, result) => sum + (result.status === "fulfilled" ? result.value.length : 0),
    0,
  );
  return (
    <NeedsYou
      items={mergeDue(perChild)}
      currency={currency}
      otherCount={waitingRequests + unread.length}
    />
  );
}

/** Unread limit notices; View marks each read. */
async function NoticesSection({
  notices,
  currency,
}: {
  notices: Promise<Notice[]>;
  currency: string;
}) {
  return <UnreadNotices items={await notices} currency={currency} />;
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
  const [due, availability, schedule] = await Promise.all([
    read.due,
    read.availability,
    read.schedule,
  ]);
  // The goal line is a nice-to-have: a failed read shows the card without it.
  const goal = await read.goal.catch((error: unknown) => {
    unstable_rethrow(error);
    logger.warn("Goal unavailable on parent home", { error: errorName(error) });
    return null;
  });
  const allowanceMinor = runningSchedule(schedule)?.amountMinor ?? null;
  return (
    <ChildOverviewCard
      childId={read.child.id}
      nickname={read.child.nickname}
      spendMinor={availability.spendMinor}
      saveMinor={availability.saveMinor}
      reservedMinor={availability.reservedSaveMinor}
      capacityMinor={jarCapacity({
        spendMinor: availability.spendMinor,
        saveMinor: availability.saveMinor,
        allowanceMinor,
        currency,
      })}
      goal={goal?.goal ?? null}
      schedule={schedule}
      dueCount={due.length}
      currency={currency}
    />
  );
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
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
