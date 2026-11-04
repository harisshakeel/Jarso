import type { Metadata } from "next";
import Link from "next/link";
import { redirect, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { CoachSays } from "@/components/brand";
import { PageContainer, PageHeader } from "@/components/layout";
import { SlowFallback } from "@/components/shell";
import { routes } from "@/config";
import { mergeDue, NeedsYou } from "@/features/allowance";
import { listDue } from "@/features/allowance/server";
import {
  ChildRow,
  FamilySummary,
  FamilySummarySkeleton,
  parentPageCopy,
  type SummaryFacts,
  summaryFacts,
  ThisWeekStrip,
  windowFor,
} from "@/features/dashboard";
import { getFamilyDashboard } from "@/features/dashboard/server";
import { type ChildSummary, FirstChildCard } from "@/features/family";
import { getFamily, listChildren, requireRole } from "@/features/family/server";
import { isGuideConfigured, writeFamilySummary } from "@/features/guide/server";
import { type Notice, UnreadNotices } from "@/features/notifications";
import { listUnreadNotices } from "@/features/notifications/server";
import { ParentRequestItems, RequestsUnavailable, settleRequestReads } from "@/features/requests";
import { listRequestsNeedingParent } from "@/features/requests/server";
import { logger } from "@/lib";

export const metadata: Metadata = { title: "Home" };

/** Due items Home shows before "and N more" sends the parent to Children. */
const HOME_DUE_LIMIT = 5;

/**
 * The parent's Home (2026-11-04): only what needs the parent right now, on one screen. One row
 * of children (each a tap away, plus Add a child), Jarso's one line, then what is waiting
 * (handovers, requests, limit notices), then this week in three figures. Nothing waiting shows
 * one calm line. Looking around (charts, categories, how each child is doing) is the Children
 * tab.
 */
async function ParentHome() {
  const { membership } = await requireRole("parent", routes.parent);
  if (!membership) redirect(routes.parentSetup);
  const [family, children] = await Promise.all([getFamily(), listChildren()]);
  if (!family) redirect(routes.parentSetup);
  if (children.length === 0) return <FirstChildCard />;

  // Limit notices are the parent's own rows; a failed read leaves them out, never the page.
  const notices = listUnreadNotices(["limit_exceeded"]).catch((error: unknown) => {
    unstable_rethrow(error);
    logger.warn("Limit notices unavailable", { error: errorName(error) });
    return [] as Notice[];
  });

  return (
    <div className="grid gap-5">
      <ChildRow items={children} />
      {isGuideConfigured() ? (
        <Suspense fallback={<FamilySummarySkeleton />}>
          <SummarySection />
        </Suspense>
      ) : null}
      <Suspense fallback={<div aria-hidden className="shimmer h-32 rounded-xl bg-muted" />}>
        <NeedsYouSection kids={children} notices={notices} currency={family.currency} />
      </Suspense>
      <Suspense fallback={null}>
        <RequestsSection kids={children} currency={family.currency} />
      </Suspense>
      <Suspense fallback={null}>
        <NoticesSection notices={notices} kids={children} currency={family.currency} />
      </Suspense>
      <Suspense fallback={<div aria-hidden className="shimmer h-20 rounded-xl bg-muted" />}>
        <ThisWeekSection />
      </Suspense>
    </div>
  );
}

/** Jarso's one line about the week, from the same facts Children uses. Nothing without one. */
async function SummarySection() {
  const data = await getFamilyDashboard(7);
  if (!data) return null;
  const facts: SummaryFacts = summaryFacts(
    data.children,
    windowFor(7, data.today),
    data.currency,
    data.today,
  );
  const text = await writeFamilySummary(facts);
  return text ? <FamilySummary text={text} /> : null;
}

/**
 * Everything due across the family, oldest first, at most a few; requests and limit notices
 * count here so "All caught up." only shows when nothing waits. With nothing waiting, the quiet
 * line and the way to Children.
 */
async function NeedsYouSection({
  kids,
  notices,
  currency,
}: {
  kids: ChildSummary[];
  notices: Promise<Notice[]>;
  currency: string;
}) {
  const [perChild, requests, unread] = await Promise.all([
    Promise.all(kids.map(async (child) => ({ child, due: await listDue(child.id) }))),
    Promise.allSettled(kids.map((child) => listRequestsNeedingParent(child.id))),
    notices,
  ]);
  const waitingRequests = requests.reduce(
    (sum, result) => sum + (result.status === "fulfilled" ? result.value.length : 0),
    0,
  );
  const due = mergeDue(perChild);
  const shown = due.slice(0, HOME_DUE_LIMIT);
  const more = due.length - shown.length;
  const waiting = due.length + waitingRequests + unread.length;
  return (
    <div className="grid gap-3">
      <NeedsYou items={shown} currency={currency} otherCount={waitingRequests + unread.length} />
      {more > 0 ? (
        <Link
          href={routes.parentChildren}
          className="inline-flex min-h-11 w-fit items-center font-semibold text-primary underline-offset-4 hover:underline"
        >
          {parentPageCopy.more(more)}
        </Link>
      ) : null}
      {waiting === 0 ? (
        <CoachSays coach={{ key: "parent-home" }} says={parentPageCopy.quiet}>
          <Link
            href={routes.parentChildren}
            className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline"
          >
            {parentPageCopy.lookAround}
          </Link>
        </CoachSays>
      ) : null}
    </div>
  );
}

/** Unread limit notices; View marks each read. */
async function NoticesSection({
  notices,
  kids,
  currency,
}: {
  notices: Promise<Notice[]>;
  kids: ChildSummary[];
  currency: string;
}) {
  const ids = new Set(kids.map((child) => child.id));
  const items = (await notices).filter((notice) => ids.has(notice.childId));
  return <UnreadNotices items={items} currency={currency} />;
}

/** Take-outs and put-ins waiting on a parent. A child whose read fails gets a calm line; the rest still show. */
async function RequestsSection({ kids, currency }: { kids: ChildSummary[]; currency: string }) {
  const results = await Promise.allSettled(
    kids.map((child) => listRequestsNeedingParent(child.id)),
  );
  const { items, failed } = settleRequestReads(
    kids.map((child) => child.nickname),
    results,
  );
  for (const result of results) {
    if (result.status !== "rejected") continue;
    unstable_rethrow(result.reason);
    logger.warn("Parent requests unavailable", { error: errorName(result.reason) });
  }
  return (
    <>
      <ParentRequestItems items={items} currency={currency} />
      {failed.length > 0 ? <RequestsUnavailable names={failed} /> : null}
    </>
  );
}

/** This week in three figures: handed over, still to hand over, and the next thing coming. */
async function ThisWeekSection() {
  const data = await getFamilyDashboard(7);
  if (!data) return null;
  return <ThisWeekStrip kids={data.children} currency={data.currency} today={data.today} />;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function HomeSkeleton() {
  return (
    <div aria-hidden className="grid gap-5">
      <div className="shimmer h-20 rounded-xl bg-muted" />
      <div className="shimmer h-32 rounded-xl bg-muted" />
      <div className="shimmer h-20 rounded-xl bg-muted" />
    </div>
  );
}

export default function ParentHomePage() {
  return (
    <PageContainer width="wide" className="gap-5">
      <PageHeader title={parentPageCopy.family} />
      <Suspense
        fallback={
          <SlowFallback>
            <HomeSkeleton />
          </SlowFallback>
        }
      >
        <ParentHome />
      </Suspense>
    </PageContainer>
  );
}
