import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { Suspense } from "react";
import { z } from "zod";
import { PageContainer, PageHeader } from "@/components/layout";
import { SlowFallback } from "@/components/shell";
import { routes } from "@/config";
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
  parentPageCopy,
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
import { FirstChildCard } from "@/features/family";
import { getFamily, listChildren, requireRole } from "@/features/family/server";
import { isGuideConfigured, writeFamilySummary } from "@/features/guide/server";

export const metadata: Metadata = { title: "Children" };

type Props = PageProps<"/parent/children">;

const rise = (index: number) => ({ "--rise-index": index }) as CSSProperties;

// `child` is a child's id or "all"; anything that isn't one of this family's children reads as
// everyone. `period` is 7, 30 or 90 days; anything else is the week.
const paramsSchema = z.object({
  child: z.string().max(64).optional().catch(undefined),
  period: z.coerce.number().int().optional().catch(undefined),
});

/**
 * Children (2026-11-04): the family's money as one picture, each child one tap away, with the
 * filter at the top re-scoping the whole page to one child. What needs the parent right now
 * lives on Home; this page is where they look around. The shell and the filter render from two
 * light reads; the dashboard streams in on its own.
 */
async function ChildrenContent({ searchParams }: Pick<Props, "searchParams">) {
  const { membership } = await requireRole("parent", routes.parentChildren);
  if (!membership) redirect(routes.parentSetup);
  const [family, children, raw] = await Promise.all([getFamily(), listChildren(), searchParams]);
  if (!family) redirect(routes.parentSetup);
  if (children.length === 0) return <FirstChildCard />;

  const params = paramsSchema.parse(raw);
  const days = periodOf(params.period ?? 7).days;
  const current = children.some((child) => child.id === params.child)
    ? (params.child ?? null)
    : null;
  const keepPeriod = { period: String(days) };
  const keepChild: Record<string, string> = params.child ? { child: params.child } : {};

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChildFilter
          basePath={routes.parentChildren}
          items={children.map((child, index) => ({ ...child, slot: slotFor(index) }))}
          current={current}
          explicit={params.child !== undefined}
          keep={keepPeriod}
        />
        <PeriodSwitch basePath={routes.parentChildren} days={days} keep={keepChild} />
      </div>
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard days={days} current={current} keepPeriod={keepPeriod} />
      </Suspense>
    </div>
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
    data.children.map((child) => [
      child.id,
      filterHref(routes.parentChildren, child.id, keepPeriod),
    ]),
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

function ChildrenSkeleton() {
  return (
    <div aria-hidden className="grid gap-6">
      <div className="shimmer h-11 w-72 rounded-full bg-muted" />
      <DashboardSkeleton />
    </div>
  );
}

export default function ChildrenPage({ searchParams }: Props) {
  return (
    <PageContainer width="wide" className="gap-6">
      <PageHeader title={parentPageCopy.children} />
      <Suspense
        fallback={
          <SlowFallback>
            <ChildrenSkeleton />
          </SlowFallback>
        }
      >
        <ChildrenContent searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}
