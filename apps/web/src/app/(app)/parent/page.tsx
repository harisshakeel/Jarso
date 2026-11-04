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
  type ChildLearning,
  FamilySummary,
  FamilySummarySkeleton,
  HomeLearning,
  homeSummaryFacts,
  parentPageCopy,
  slotFor,
} from "@/features/dashboard";
import { getFamilyDashboard } from "@/features/dashboard/server";
import { type ChildSummary, FirstChildCard } from "@/features/family";
import { getFamily, listChildren, requireRole } from "@/features/family/server";
import { isGuideConfigured, writeFamilySummary } from "@/features/guide/server";
import { getLearningOverview } from "@/features/learning/server";
import { type Notice, UnreadNotices } from "@/features/notifications";
import { listUnreadNotices } from "@/features/notifications/server";
import { ParentRequestItems, RequestsUnavailable, settleRequestReads } from "@/features/requests";
import { listRequestsNeedingParent } from "@/features/requests/server";
import { familyToday, logger } from "@/lib";

export const metadata: Metadata = { title: "Home" };

/** Due items Home shows before "and N more" sends the parent to the Money page. */
const HOME_DUE_LIMIT = 5;

type Kid = ChildSummary & { slot: number };

/**
 * The parent's Home (learning first since 2026-11-04), on one screen: each child's learning this
 * week (the newest lesson and how it went, what's next), then what waits on the parent, then
 * Jarso's few sentences about the week. Money in detail is the Money tab; each child in depth is
 * the Children tab.
 */
async function ParentHome() {
  const { membership } = await requireRole("parent", routes.parent);
  if (!membership) redirect(routes.parentSetup);
  const [family, children] = await Promise.all([getFamily(), listChildren()]);
  if (!family) redirect(routes.parentSetup);
  if (children.length === 0) return <FirstChildCard />;
  const today = familyToday(family.timezone);
  const kids: Kid[] = children.map((child, index) => ({ ...child, slot: slotFor(index) }));

  // Limit notices are the parent's own rows; a failed read leaves them out, never the page.
  const notices = listUnreadNotices(["limit_exceeded"]).catch((error: unknown) => {
    unstable_rethrow(error);
    logger.warn("Limit notices unavailable", { error: errorName(error) });
    return [] as Notice[];
  });

  return (
    <div className="grid gap-6">
      <Suspense fallback={<LearningSkeleton count={kids.length} />}>
        <LearningSection kids={kids} today={today} />
      </Suspense>
      <Suspense fallback={<div aria-hidden className="shimmer h-24 rounded-xl bg-muted" />}>
        <NeedsYouSection kids={kids} notices={notices} currency={family.currency} today={today} />
      </Suspense>
      <Suspense fallback={null}>
        <RequestsSection kids={kids} currency={family.currency} />
      </Suspense>
      <Suspense fallback={null}>
        <NoticesSection notices={notices} kids={kids} currency={family.currency} />
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

async function LearningSection({ kids, today }: { kids: Kid[]; today: string }) {
  const { items, unavailable } = await readLearning(kids);
  return <HomeLearning items={items} unavailable={unavailable} today={today} />;
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
  today,
}: {
  kids: Kid[];
  notices: Promise<Notice[]>;
  currency: string;
  today: string;
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
      <NeedsYou
        items={shown}
        currency={currency}
        otherCount={waitingRequests + unread.length}
        today={today}
      />
      {more > 0 ? (
        <Link
          href={routes.parentAllowanceOverview}
          className="inline-flex min-h-11 w-fit items-center font-semibold text-primary underline-offset-4 hover:underline"
        >
          {parentPageCopy.more(more)}
        </Link>
      ) : null}
      {waiting === 0 ? (
        <CoachSays coach={{ key: "parent-home" }} says={parentPageCopy.quiet} size="sm">
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
  kids: Kid[];
  currency: string;
}) {
  const ids = new Set(kids.map((child) => child.id));
  const items = (await notices).filter((notice) => ids.has(notice.childId));
  return <UnreadNotices items={items} currency={currency} />;
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

function LearningSkeleton({ count }: { count: number }) {
  return (
    <div aria-hidden className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: Math.min(count, 3) }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholders with nothing else to key on
        <div key={index} className="shimmer h-36 rounded-xl bg-muted" />
      ))}
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div aria-hidden className="grid gap-6">
      <LearningSkeleton count={2} />
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
