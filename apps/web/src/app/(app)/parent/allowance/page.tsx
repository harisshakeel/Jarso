import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { Suspense } from "react";
import { z } from "zod";
import { PageContainer, PageHeader } from "@/components/layout";
import { SlowFallback } from "@/components/shell";
import { routes } from "@/config";
import { AllowanceOverview } from "@/features/allowance";
import { getSchedule, listDue } from "@/features/allowance/server";
import {
  CalloutsCard,
  CategoryCompare,
  ChildFilter,
  callouts,
  categoryComparison,
  categorySentence,
  filterHref,
  MoneyChart,
  moneyChart,
  moneyChartSentence,
  PeriodSwitch,
  parentPageCopy,
  periodOf,
  scopeChildren,
  slotFor,
  TimelineCard,
  timeline,
  windowFor,
} from "@/features/dashboard";
import { getFamilyDashboard } from "@/features/dashboard/server";
import { type ChildSummary, FirstChildCard } from "@/features/family";
import { getFamily, listChildren, requireRole } from "@/features/family/server";

export const metadata: Metadata = { title: "Money" };

type Props = PageProps<"/parent/allowance">;

const rise = (index: number) => ({ "--rise-index": index }) as CSSProperties;

// `child` is a child's id or "all"; anything that isn't one of this family's children reads as
// everyone. `period` is 7, 30 or 90 days; anything else is the week.
const paramsSchema = z.object({
  child: z.string().max(64).optional().catch(undefined),
  period: z.coerce.number().int().optional().catch(undefined),
});

/**
 * Money (2026-11-04, the Allowance tab grown up): each child's allowance in a line (each opens
 * that child's Allowance page, where handovers, this week and gifts live), then the family's
 * money as one picture (the chart, what's worth knowing, spending by category and what's coming
 * up) with the filter re-scoping it to one child. Recent activity moved to Notifications
 * (2026-11-04). Home keeps only what needs the parent; learning leads there and on Children.
 */
async function MoneyContent({ searchParams }: Pick<Props, "searchParams">) {
  const { membership } = await requireRole("parent", routes.parentAllowanceOverview);
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
      <Suspense fallback={<div aria-hidden className="shimmer h-40 rounded-xl bg-muted" />}>
        <AllowancesSection kids={children} currency={family.currency} />
      </Suspense>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChildFilter
          basePath={routes.parentAllowanceOverview}
          items={children.map((child, index) => ({ ...child, slot: slotFor(index) }))}
          current={current}
          explicit={params.child !== undefined}
          keep={keepPeriod}
        />
        <PeriodSwitch basePath={routes.parentAllowanceOverview} days={days} keep={keepChild} />
      </div>
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard days={days} current={current} keepPeriod={keepPeriod} />
      </Suspense>
    </div>
  );
}

/** Each child's allowance in a line, with Manage or Set up. */
async function AllowancesSection({ kids, currency }: { kids: ChildSummary[]; currency: string }) {
  const rows = await Promise.all(
    kids.map(async (child) => {
      const [schedule, due] = await Promise.all([getSchedule(child.id), listDue(child.id)]);
      return { childId: child.id, nickname: child.nickname, schedule, dueCount: due.length };
    }),
  );
  return (
    <section aria-labelledby="allowances-title" className="grid gap-3">
      <h2 id="allowances-title" className="text-h2">
        {parentPageCopy.allowances}
      </h2>
      <AllowanceOverview rows={rows} currency={currency} />
    </section>
  );
}

/**
 * The family's money (spec answers 2 to 9): the chart, what's worth knowing, spending by
 * category and the next two weeks. Totals left with the Home jars (2026-11-04). Every section is built from one read per
 * child; with a child picked, every section is about them.
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
      filterHref(routes.parentAllowanceOverview, child.id, keepPeriod),
    ]),
  );
  const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  return (
    <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
      <div className="rise-in lg:col-span-2" style={rise(1)}>
        <MoneyChart
          chart={chart}
          currency={currency}
          hrefs={hrefs}
          sentence={moneyChartSentence(chart, currency)}
          split={chart.splitAt ? { before: capital(period.before), now: period.label } : null}
        />
      </div>
      <div className="rise-in" style={rise(1)}>
        <CalloutsCard
          items={callouts(scoped, window, currency)}
          currency={currency}
          period={period.now}
        />
      </div>
      <div className="rise-in lg:col-span-2" style={rise(2)}>
        <CategoryCompare
          rows={rows}
          days={days}
          currency={currency}
          sentence={categorySentence(rows, days, currency, picked?.nickname ?? null)}
          slot={picked?.slot ?? null}
        />
      </div>
      <div className="rise-in" style={rise(2)}>
        <TimelineCard events={timeline(scoped, today, currency)} />
      </div>
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

export default function MoneyPage({ searchParams }: Props) {
  return (
    <PageContainer width="wide" className="gap-6">
      <PageHeader title={parentPageCopy.money} description={parentPageCopy.moneyIntro} />
      <Suspense
        fallback={
          <SlowFallback>
            <div aria-hidden className="grid gap-6">
              <div className="shimmer h-28 rounded-xl bg-muted" />
              <DashboardSkeleton />
            </div>
          </SlowFallback>
        }
      >
        <MoneyContent searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}
