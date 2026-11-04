import type { Metadata } from "next";
import Link from "next/link";
import { redirect, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { PageContainer, PageHeader } from "@/components/layout";
import { SlowFallback } from "@/components/shell";
import { routes } from "@/config";
import { mergeDue, NeedsYou } from "@/features/allowance";
import { listDue } from "@/features/allowance/server";
import {
  type ChildLearning,
  FamilyGoalsCard,
  FamilyJarsCard,
  FamilyRoadCard,
  FamilySummary,
  FamilySummarySkeleton,
  familyRoad,
  goalPlace,
  homeSummaryFacts,
  parentPageCopy,
  slotFor,
} from "@/features/dashboard";
import { getFamilyDashboard } from "@/features/dashboard/server";
import { type ChildSummary, FirstChildCard } from "@/features/family";
import { getFamily, listChildren, requireRole } from "@/features/family/server";
import { getGoalView } from "@/features/goals/server";
import { isGuideConfigured, writeFamilySummary } from "@/features/guide/server";
import { getLearningOverview } from "@/features/learning/server";
import { getJars } from "@/features/ledger/server";
import { ParentRequestItems, RequestsUnavailable, settleRequestReads } from "@/features/requests";
import { listRequestsNeedingParent } from "@/features/requests/server";
import { fallback, familyToday, logger } from "@/lib";

export const metadata: Metadata = { title: "Home" };

/** Due items Home shows before "and N more" sends the parent to the Money page. */
const HOME_DUE_LIMIT = 5;

type Kid = ChildSummary & { slot: number };

/**
 * The parent's Home (learning first since 2026-11-04): the lesson road with every child standing
 * on their mission and their newest lesson, the family's jars and goals side by side, what waits
 * on the parent (handovers and requests; limit notices are in Notifications), and Jarso's few
 * sentences about the week. Money in detail is the Money tab; each child is on Children.
 */
async function ParentHome() {
  const { membership } = await requireRole("parent", routes.parent);
  if (!membership) redirect(routes.parentSetup);
  const [family, children] = await Promise.all([getFamily(), listChildren()]);
  if (!family) redirect(routes.parentSetup);
  if (children.length === 0) return <FirstChildCard />;
  const today = familyToday(family.timezone);
  const kids: Kid[] = children.map((child, index) => ({ ...child, slot: slotFor(index) }));

  return (
    <div className="grid gap-6">
      <Suspense fallback={<div aria-hidden className="shimmer h-44 rounded-xl bg-muted" />}>
        <RoadSection kids={kids} />
      </Suspense>
      <Suspense fallback={<BoardSkeleton />}>
        <BoardSection kids={kids} currency={family.currency} />
      </Suspense>
      <Suspense fallback={<div aria-hidden className="shimmer h-24 rounded-xl bg-muted" />}>
        <NeedsYouSection kids={kids} currency={family.currency} today={today} />
      </Suspense>
      <Suspense fallback={null}>
        <RequestsSection kids={kids} currency={family.currency} />
      </Suspense>
      {isGuideConfigured() ? (
        <Suspense fallback={<FamilySummarySkeleton />}>
          <SummarySection kids={kids} today={today} />
        </Suspense>
      ) : null}
    </div>
  );
}

/** Each child's learning, read once per child (the read is cached for the summary below). */
async function readLearning(kids: Kid[]) {
  const results = await Promise.allSettled(kids.map((kid) => getLearningOverview(kid.id)));
  const items: ChildLearning[] = [];
  const unavailable: Omit<ChildLearning, "overview">[] = [];
  results.forEach((result, index) => {
    const kid = kids[index];
    if (!kid) return;
    const who = { childId: kid.id, nickname: kid.nickname, slot: kid.slot };
    if (result.status === "fulfilled") {
      items.push({ ...who, overview: result.value });
      return;
    }
    unstable_rethrow(result.reason);
    logger.warn("Learning unavailable on parent home", { error: errorName(result.reason) });
    unavailable.push(who);
  });
  return { items, unavailable };
}

/**
 * The seven missions left to right, each child standing on theirs, and under it each child's
 * place and their newest lesson with how it went (the learning cards, folded in on 2026-11-04).
 */
async function RoadSection({ kids }: { kids: Kid[] }) {
  const { items, unavailable } = await readLearning(kids);
  return <FamilyRoadCard road={familyRoad(items)} unavailable={unavailable} />;
}

/**
 * The family's Spend and Save jars (everyone, or one child) beside the goal track. A child whose
 * jars or goal can't be read is left out of that card, never the page.
 */
async function BoardSection({ kids, currency }: { kids: Kid[]; currency: string }) {
  const rows = await Promise.all(
    kids.map(async (kid) => {
      const who = { childId: kid.id, nickname: kid.nickname, slot: kid.slot };
      const [jars, goal] = await Promise.all([
        fallback(getJars(kid.id), null, "Jars on parent home"),
        fallback(getGoalView(kid.id), null, "Goal on parent home"),
      ]);
      return { who, jars, goal };
    }),
  );
  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <FamilyJarsCard rows={rows.map(({ who, jars }) => ({ ...who, jars }))} currency={currency} />
      <FamilyGoalsCard
        places={rows.map(({ who, goal }) => goalPlace(who, goal))}
        currency={currency}
      />
    </div>
  );
}

/**
 * Everything due across the family, oldest first, at most a few; requests count here so "All
 * caught up." only shows when nothing waits. With nothing waiting, the quiet line and the way
 * to Children.
 */
async function NeedsYouSection({
  kids,
  currency,
  today,
}: {
  kids: Kid[];
  currency: string;
  today: string;
}) {
  const [perChild, requests] = await Promise.all([
    Promise.all(kids.map(async (child) => ({ child, due: await listDue(child.id) }))),
    Promise.allSettled(kids.map((child) => listRequestsNeedingParent(child.id))),
  ]);
  const waitingRequests = requests.reduce(
    (sum, result) => sum + (result.status === "fulfilled" ? result.value.length : 0),
    0,
  );
  const due = mergeDue(perChild);
  const shown = due.slice(0, HOME_DUE_LIMIT);
  const more = due.length - shown.length;
  const waiting = due.length + waitingRequests;
  if (waiting === 0) {
    // All clear: one line, the chip and a way on. No coach on a parent screen (design.md §7).
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <NeedsYou items={shown} currency={currency} otherCount={waitingRequests} today={today} />
        <Link
          href={routes.parentChildren}
          className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline"
        >
          {parentPageCopy.lookAround}
        </Link>
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      <NeedsYou items={shown} currency={currency} otherCount={waitingRequests} today={today} />
      {more > 0 ? (
        <Link
          href={routes.parentAllowanceOverview}
          className="inline-flex min-h-11 w-fit items-center font-semibold text-primary underline-offset-4 hover:underline"
        >
          {parentPageCopy.more(more)}
        </Link>
      ) : null}
    </div>
  );
}

/** Take-outs and put-ins waiting on a parent. A child whose read fails gets a calm line; the rest still show. */
async function RequestsSection({ kids, currency }: { kids: Kid[]; currency: string }) {
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

/** Jarso's few sentences about the children's learning this week, and what waits. */
async function SummarySection({ kids, today }: { kids: Kid[]; today: string }) {
  const [{ items }, data] = await Promise.all([readLearning(kids), getFamilyDashboard(7)]);
  if (!data || items.length === 0) return null;
  const text = await writeFamilySummary(
    homeSummaryFacts(items, data.children, data.currency, today),
  );
  return text ? <FamilySummary text={text} /> : null;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function BoardSkeleton() {
  return (
    <div aria-hidden className="grid gap-6 lg:grid-cols-2">
      <div className="shimmer h-64 rounded-xl bg-muted" />
      <div className="shimmer h-64 rounded-xl bg-muted" />
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div aria-hidden className="grid gap-6">
      <div className="shimmer h-44 rounded-xl bg-muted" />
      <div className="shimmer h-24 rounded-xl bg-muted" />
      <div className="shimmer h-28 rounded-xl bg-muted" />
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
