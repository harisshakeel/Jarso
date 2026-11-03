import type { Metadata } from "next";
import { redirect, unstable_rethrow } from "next/navigation";
import type { CSSProperties } from "react";
import { Suspense } from "react";
import { z } from "zod";
import { PageContainer, PageHeader } from "@/components/layout";
import { SlowFallback } from "@/components/shell";
import { routes } from "@/config";
import { mergeDue, NeedsYou } from "@/features/allowance";
import { listDue } from "@/features/allowance/server";
import {
  ActivityList,
  CalloutsCard,
  CategoryCompare,
  ChildFilter,
  ChildTiles,
  callouts,
  categoryComparison,
  categorySentence,
  dashboardTotals,
  FamilySummary,
  FamilySummarySkeleton,
  FamilyTotals,
  filterHref,
  MoneyChart,
  mergeActivity,
  moneyChart,
  moneyChartSentence,
  PeriodSwitch,
  periodOf,
  type SummaryFacts,
  scopeChildren,
  slotFor,
  summaryFacts,
  TimelineCard,
  timeline,
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

export const metadata: Metadata = { title: "Your family" };

type Props = PageProps<"/parent">;

const rise = (index: number) => ({ "--rise-index": index }) as CSSProperties;

// `child` is a child's id or "all"; anything that isn't one of this family's children reads as
// everyone. `period` is 7, 30 or 90 days; anything else is the week.
const paramsSchema = z.object({
  child: z.string().max(64).optional().catch(undefined),
  period: z.coerce.number().int().optional().catch(undefined),
});

/**
 * The parent's Home (spec 2026-11-02): who needs the parent first, then the family's money as
 * one picture, each child one tap away. A filter at the top re-scopes the whole page to one
 * child. The shell and the filter render from two light reads; "Needs you" and the dashboard
 * stream in on their own.
 */
async function ParentHome({ searchParams }: Pick<Props, "searchParams">) {
  const { membership } = await requireRole("parent", routes.parent);
  if (!membership) redirect(routes.parentSetup);
  const [family, children, raw] = await Promise.all([getFamily(), listChildren(), searchParams]);
  if (!family) redirect(routes.parentSetup);
  if (children.length === 0) return <FirstChildCard />;

  const params = paramsSchema.parse(raw);
  const days = periodOf(params.period ?? 7).days;
  const current = children.some((child) => child.id === params.child)
    ? (params.child ?? null)
    : null;
  const scoped = scopeChildren(children, current);
  const keepPeriod = { period: String(days) };
  const keepChild: Record<string, string> = params.child ? { child: params.child } : {};

  // Limit notices are the parent's own rows; a failed read leaves them out, never the page.
  const notices = listUnreadNotices(["limit_exceeded"]).catch((error: unknown) => {
    unstable_rethrow(error);
    logger.warn("Limit notices unavailable", { error: errorName(error) });
    return [] as Notice[];
  });

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChildFilter
          basePath={routes.parent}
          items={children.map((child, index) => ({ ...child, slot: slotFor(index) }))}
          current={current}
          explicit={params.child !== undefined}
          keep={keepPeriod}
        />
        <PeriodSwitch basePath={routes.parent} days={days} keep={keepChild} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="rise-in">
          <Suspense fallback={<div aria-hidden className="shimmer h-32 rounded-xl bg-muted" />}>
            <NeedsYouSection scoped={scoped} notices={notices} currency={family.currency} />
          </Suspense>
        </div>
        <div className="grid gap-6">
          <div className="rise-in" style={rise(1)}>
            <Suspense fallback={null}>
              <RequestsSection scoped={scoped} currency={family.currency} />
            </Suspense>
          </div>
          <div className="rise-in" style={rise(1)}>
            <Suspense fallback={null}>
              <NoticesSection notices={notices} scoped={scoped} currency={family.currency} />
            </Suspense>
          </div>
        </div>
      </div>
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard days={days} current={current} keepPeriod={keepPeriod} />
      </Suspense>
    </div>
  );
}

/**
 * Everything due across the scoped children, oldest first. Requests and limit notices are listed
 * beside it; they count here so "All caught up." only shows when nothing waits.
 */
async function NeedsYouSection({
  scoped,
  notices,
  currency,
}: {
  scoped: ChildSummary[];
  notices: Promise<Notice[]>;
  currency: string;
}) {
  const ids = new Set(scoped.map((child) => child.id));
  const [perChild, requests, unread] = await Promise.all([
    Promise.all(scoped.map(async (child) => ({ child, due: await listDue(child.id) }))),
    Promise.allSettled(scoped.map((child) => listRequestsNeedingParent(child.id))),
    notices,
  ]);
  const waitingRequests = requests.reduce(
    (sum, result) => sum + (result.status === "fulfilled" ? result.value.length : 0),
    0,
  );
  const waitingNotices = unread.filter((notice) => ids.has(notice.childId)).length;
  return (
    <NeedsYou
      items={mergeDue(perChild)}
      currency={currency}
      otherCount={waitingRequests + waitingNotices}
    />
  );
}

/** Unread limit notices for the scoped children; View marks each read. */
async function NoticesSection({
  notices,
  scoped,
  currency,
}: {
  notices: Promise<Notice[]>;
  scoped: ChildSummary[];
  currency: string;
}) {
  const ids = new Set(scoped.map((child) => child.id));
  const items = (await notices).filter((notice) => ids.has(notice.childId));
  return <UnreadNotices items={items} currency={currency} />;
}

/** Take-outs and put-ins waiting on a parent. A child whose read fails gets a calm line; the rest still show. */
async function RequestsSection({ scoped, currency }: { scoped: ChildSummary[]; currency: string }) {
  const results = await Promise.allSettled(
    scoped.map((child) => listRequestsNeedingParent(child.id)),
  );
  const { items, failed } = settleRequestReads(
    scoped.map((child) => child.nickname),
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

/**
 * The family's money (spec answers 2 to 9): Jarso's summary, the chart and the totals, what's
 * worth knowing, spending by category, the next two weeks, the children and one merged activity list. Every
 * section is built from one read per child; with a child picked, every section is about them.
 */
async function Dashboard({
  days,
  current,
  keepPeriod,
}: {
  days: number;
  current: string | null;
  keepPeriod: Record<string, string>;
}) {
  const data = await getFamilyDashboard(days);
  if (!data) return null;
  const { currency, today } = data;
  const scoped = scopeChildren(data.children, current);
  const picked = current ? (scoped[0] ?? null) : null;
  const window = windowFor(days, today);
  const period = periodOf(days);
  const chart = moneyChart(scoped, days, today);
  const rows = categoryComparison(scoped, window);
  const hrefs = Object.fromEntries(
    data.children.map((child) => [child.id, filterHref(routes.parent, child.id, keepPeriod)]),
  );
  const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  return (
    <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
      {isGuideConfigured() ? (
        <Suspense
          fallback={
            <div className="lg:col-span-3">
              <FamilySummarySkeleton />
            </div>
          }
        >
          <SummarySection facts={summaryFacts(scoped, window, currency, today)} />
        </Suspense>
      ) : null}
      <div className="rise-in lg:col-span-2" style={rise(2)}>
        <MoneyChart
          chart={chart}
          currency={currency}
          hrefs={hrefs}
          sentence={moneyChartSentence(chart, currency)}
          split={chart.splitAt ? { before: capital(period.before), now: period.label } : null}
        />
      </div>
      <div className="rise-in" style={rise(2)}>
        <FamilyTotals
          totals={dashboardTotals(scoped, today)}
          currency={currency}
          who={picked?.nickname ?? null}
        />
      </div>
      <div className="rise-in" style={rise(3)}>
        <CalloutsCard
          items={callouts(scoped, window, currency)}
          currency={currency}
          period={period.now}
        />
      </div>
      <div className="rise-in" style={rise(3)}>
        <CategoryCompare
          rows={rows}
          days={days}
          currency={currency}
          sentence={categorySentence(rows, days, currency, picked?.nickname ?? null)}
          slot={picked?.slot ?? null}
        />
      </div>
      <div className="rise-in" style={rise(3)}>
        <TimelineCard events={timeline(scoped, today, currency)} />
      </div>
      <div className="rise-in lg:col-span-3" style={rise(4)}>
        <ChildTiles items={data.children} currency={currency} />
      </div>
      <div className="rise-in lg:col-span-2" style={rise(4)}>
        <ActivityList
          items={mergeActivity(scoped, 8)}
          currency={currency}
          seeAllHref={picked ? routes.parentChildHistory(picked.id) : null}
        />
      </div>
    </div>
  );
}

/** Jarso's summary of what the page shows; nothing at all, not even a grid row, without one. */
async function SummarySection({ facts }: { facts: SummaryFacts }) {
  const text = await writeFamilySummary(facts);
  if (!text) return null;
  return (
    <div className="rise-in lg:col-span-3" style={rise(2)}>
      <FamilySummary text={text} />
    </div>
  );
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function DashboardSkeleton() {
  return (
    <div aria-hidden className="grid gap-6 lg:grid-cols-3">
      <div className="shimmer h-72 rounded-xl bg-muted lg:col-span-2" />
      <div className="shimmer h-72 rounded-xl bg-muted" />
      <div className="shimmer h-48 rounded-xl bg-muted" />
      <div className="shimmer h-48 rounded-xl bg-muted" />
      <div className="shimmer h-48 rounded-xl bg-muted" />
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div aria-hidden className="grid gap-6">
      <div className="shimmer h-11 w-72 rounded-full bg-muted" />
      <div className="shimmer h-32 rounded-xl bg-muted" />
      <DashboardSkeleton />
    </div>
  );
}

export default function ParentHomePage({ searchParams }: Props) {
  return (
    <PageContainer width="wide" className="gap-6">
      <PageHeader title="Your family" />
      <Suspense
        fallback={
          <SlowFallback>
            <HomeSkeleton />
          </SlowFallback>
        }
      >
        <ParentHome searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}
