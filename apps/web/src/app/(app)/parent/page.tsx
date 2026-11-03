import { cn } from "cn";
import { PlusIcon } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect, unstable_rethrow } from "next/navigation";
import type { CSSProperties } from "react";
import { Suspense } from "react";
import { z } from "zod";
import { PageContainer, PageHeader, PageSkeleton } from "@/components/layout";
import { SlowFallback } from "@/components/shell";
import { buttonVariants, Card, CardContent, Skeleton } from "@/components/ui";
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
import { isGuideConfigured, listGuideChats } from "@/features/guide/server";
import { getLearningOverview } from "@/features/learning/server";
import { JarGraph, jarCapacity, RecentHistory } from "@/features/ledger";
import { getBalanceHistory, getHistory } from "@/features/ledger/server";
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
import { ChildWeekCard, familyGrid, weekBounds, weekMoney } from "@/features/review";
import { fallback, familyToday, logger } from "@/lib";

export const metadata: Metadata = { title: "Your family" };

type Props = PageProps<"/parent">;

const paramsSchema = z.object({ child: z.uuid().optional() });

/** One child's reads, started together and awaited where each section needs them. */
type ChildReads = {
  child: ChildSummary;
  due: Promise<DueItem[]>;
  availability: Promise<Availability>;
  goal: Promise<GoalView>;
  requests: Promise<SavingsRequest[]>;
  schedule: Promise<Schedule | null>;
};

async function ParentHome({ searchParams }: Pick<Props, "searchParams">) {
  const { membership } = await requireRole("parent", routes.parent);
  if (!membership) redirect(routes.parentSetup);
  const [family, children] = await Promise.all([getFamily(), listChildren()]);
  if (!family) redirect(routes.parentSetup);

  if (children.length === 0) {
    return (
      <>
        <PageHeader title="Your family" />
        <FirstChildCard />
      </>
    );
  }

  // Each service runs once per child; "Needs you" and each card stream in as their reads land.
  const reads: ChildReads[] = children.map((child) => ({
    child,
    due: listDue(child.id),
    availability: getAvailability(child.id),
    // The goal line is a nice-to-have; the fallback is attached now, so a failure is never unhandled.
    goal: fallback(getGoalView(child.id), null, "Goal on parent home"),
    requests: listRequestsNeedingParent(child.id),
    schedule: getSchedule(child.id),
  }));
  // Limit notices are the parent's own rows; a failed read leaves them out, never the page.
  const notices = listUnreadNotices(["limit_exceeded"]).catch((error: unknown) => {
    unstable_rethrow(error);
    logger.warn("Limit notices unavailable", { error: errorName(error) });
    return [] as Notice[];
  });

  const today = familyToday(family.timezone);
  // The child shown in detail: from ?child= when it is one of the family's, else the first.
  const wanted = paramsSchema.safeParse(await searchParams).data?.child;
  const selected = reads.find((read) => read.child.id === wanted) ?? reads[0];

  const guideOn = isGuideConfigured();
  const several = reads.length > 1;
  const two = familyGrid(reads.length, 2);
  const three = familyGrid(reads.length, 3);

  // Layout A (design.md §10): "Needs you" first, then one grid of a compact card per child and
  // the selected child's graph, history and week (?child=, a switcher in the header when there
  // are several). familyGrid places the tiles in the space the cards leave, for any number of
  // children; only the selected child's tiles load.
  return (
    <>
      <PageHeader
        title="Your family"
        action={
          <>
            {several && selected ? (
              <ChildSwitcher reads={reads} selectedId={selected.child.id} />
            ) : null}
            <Suspense fallback={null}>
              <NeedsYouSection
                reads={reads}
                notices={notices}
                currency={family.currency}
                show="caughtUp"
              />
            </Suspense>
            <Link href={routes.parentNewChild} className={buttonVariants({ variant: "outline" })}>
              <PlusIcon aria-hidden />
              Add a child
            </Link>
          </>
        }
      />
      <Suspense fallback={null}>
        <NeedsYouSection
          reads={reads}
          notices={notices}
          currency={family.currency}
          show="waiting"
        />
      </Suspense>
      <Suspense fallback={null}>
        <RequestsSection reads={reads} currency={family.currency} />
      </Suspense>
      <Suspense fallback={null}>
        <NoticesSection notices={notices} currency={family.currency} />
      </Suspense>

      {selected ? (
        <section
          aria-labelledby="children-title"
          className="rise-in grid items-start gap-4 lg:grid-cols-2 lg:[grid-template-areas:var(--areas-2)] lg:[grid-template-rows:var(--rows-2)] 2xl:grid-cols-3 2xl:[grid-template-areas:var(--areas-3)] 2xl:[grid-template-rows:var(--rows-3)]"
          style={
            {
              "--areas-2": two.areas,
              "--rows-2": two.rows,
              "--areas-3": three.areas,
              "--rows-3": three.rows,
            } as CSSProperties
          }
        >
          <h2 id="children-title" className="sr-only">
            Children
          </h2>
          {reads.map((read, index) => (
            <div
              key={read.child.id}
              className={cn(
                "grid rounded-xl lg:[grid-area:var(--area)]",
                several &&
                  read === selected &&
                  "ring-2 ring-primary ring-offset-2 ring-offset-background",
              )}
              style={{ "--area": `c${index}` } as CSSProperties}
            >
              <Suspense fallback={<Skeleton className="h-44" />}>
                <ChildCard read={read} currency={family.currency} />
              </Suspense>
            </div>
          ))}
          <div className="grid lg:[grid-area:graph]">
            <Suspense fallback={<Skeleton className="h-80" />}>
              <ChildGraphTile read={selected} currency={family.currency} />
            </Suspense>
          </div>
          <div className="grid lg:[grid-area:history]">
            <Suspense fallback={<Skeleton className="h-40" />}>
              <LatestSection read={selected} currency={family.currency} />
            </Suspense>
          </div>
          <div className="grid lg:[grid-area:week]">
            <Suspense fallback={<Skeleton className="h-40" />}>
              <ChildWeekSection
                read={selected}
                currency={family.currency}
                today={today}
                guideOn={guideOn}
              />
            </Suspense>
          </div>
        </section>
      ) : null}
    </>
  );
}

/**
 * Which child the detail shows: links that keep the choice in the URL. Named "Show <name>" so
 * the child's own name stays the one link to their page.
 */
function ChildSwitcher({ reads, selectedId }: { reads: ChildReads[]; selectedId: string }) {
  return (
    <nav
      aria-label="Show a child"
      className="flex flex-wrap gap-1 justify-self-start rounded-full bg-muted p-1"
    >
      {reads.map(({ child }) => {
        const on = child.id === selectedId;
        return (
          <Link
            key={child.id}
            href={`${routes.parent}?child=${child.id}` as Route}
            scroll={false}
            aria-label={`Show ${child.nickname}`}
            aria-current={on ? "true" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center rounded-full px-4 font-semibold transition-colors",
              on
                ? "bg-card text-foreground shadow-rest"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {child.nickname}
          </Link>
        );
      })}
    </nav>
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
  show,
}: {
  reads: ChildReads[];
  notices: Promise<Notice[]>;
  currency: string;
  /** The header shows the "All caught up." chip; the panel under it shows what waits. */
  show: "caughtUp" | "waiting";
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
  const items = mergeDue(perChild);
  const waiting = items.length + waitingRequests + unread.length;
  if (show === "waiting" ? waiting === 0 : waiting > 0) return null;
  return (
    <NeedsYou items={items} currency={currency} otherCount={waitingRequests + unread.length} />
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

/**
 * One child's week in three sentences (money, learning, Jarso). Each read is a nice-to-have
 * on its own: a failed one leaves its line out, never the tile.
 */
async function ChildWeekSection({
  read,
  currency,
  today,
  guideOn,
}: {
  read: ChildReads;
  currency: string;
  today: string;
  guideOn: boolean;
}) {
  const { child } = read;
  const { weekStart } = weekBounds(today);
  const [history, learning, chats, due] = await Promise.all([
    fallback(getHistory(child.id), null, "History on parent home"),
    fallback(getLearningOverview(child.id), null, "Learning on parent home"),
    guideOn ? fallback(listGuideChats(child.id), null, "Chats on parent home") : null,
    read.due,
  ]);
  const stillDue = due.reduce((sum, item) => sum + item.amountMinor, 0);
  const current = learning?.journey.find((mission) => mission.status === "current") ?? null;
  const thisWeek = chats?.filter((chat) => chat.lastMessageAt.slice(0, 10) >= weekStart) ?? null;
  if (!history || !learning) return null;
  return (
    <ChildWeekCard
      currency={currency}
      week={{
        nickname: child.nickname,
        money: weekMoney(history, stillDue, today),
        learning: {
          daysThisWeek: learning.daysThisWeek,
          missionsDone: learning.completed.length,
          current: current ? { day: current.day, title: current.title } : null,
        },
        chats: thisWeek
          ? { count: thisWeek.length, flagged: thisWeek.filter((c) => c.flagged).length }
          : null,
      }}
      hrefs={{
        money: routes.parentChild(child.id),
        learning: routes.parentChildLearning(child.id),
        jarso: routes.parentChildGuide(child.id),
      }}
    />
  );
}

/** How the child's jars moved, as a tall bento tile. A failed read leaves the tile out. */
async function ChildGraphTile({ read, currency }: { read: ChildReads; currency: string }) {
  const balances = await fallback(
    getBalanceHistory(read.child.id),
    null,
    "Balances on parent home",
  );
  if (!balances) return null;
  return (
    <Card className="shadow-raised">
      <CardContent>
        <JarGraph
          history={balances}
          currency={currency}
          title={`How ${read.child.nickname}'s jars moved`}
          showMinor="always"
          size="compact"
        />
      </CardContent>
    </Card>
  );
}

/** The child's latest money lines, as the parent reads them, with the way to the full history. */
async function LatestSection({ read, currency }: { read: ChildReads; currency: string }) {
  const history = await fallback(getHistory(read.child.id), null, "History on parent home");
  if (!history) return null;
  return (
    <section aria-label={`${read.child.nickname}'s latest`} className="grid">
      <RecentHistory
        items={history}
        currency={currency}
        limit={4}
        skippedLabel="Not given"
        showMinor="always"
        seeAllHref={routes.parentChildHistory(read.child.id)}
        emptyLine={`${read.child.nickname}'s money story starts here.`}
      />
    </section>
  );
}

async function ChildCard({ read, currency }: { read: ChildReads; currency: string }) {
  const [due, availability, schedule] = await Promise.all([
    read.due,
    read.availability,
    read.schedule,
  ]);
  const goal = await read.goal;
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

export default function ParentHomePage({ searchParams }: Props) {
  return (
    <PageContainer width="wide" className="gap-6">
      <Suspense
        fallback={
          <SlowFallback>
            <PageSkeleton />
          </SlowFallback>
        }
      >
        <ParentHome searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}
