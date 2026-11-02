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
import { AskJarso, guideCopy } from "@/features/guide";
import { getGuideAccess, isGuideConfigured, listGuideChats } from "@/features/guide/server";
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
import { ChildWeekCard, weekBounds, weekMoney } from "@/features/review";
import { fallback, familyToday, logger } from "@/lib";

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

  // Three columns on a wide screen: what needs the parent, each child's week, the children.
  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start lg:gap-8 xl:grid-cols-3">
      <div className="grid gap-6">
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
        <div className="rise-in" style={rise(2)}>
          <Suspense fallback={null}>
            <ParentAskSection reads={reads} />
          </Suspense>
        </div>
      </div>
      <section aria-labelledby="week-title" className="rise-in grid gap-3" style={rise(2)}>
        <h2 id="week-title" className="text-h2">
          This week
        </h2>
        <div className="grid gap-4">
          {reads.map((read) => (
            <Suspense
              key={read.child.id}
              fallback={<div aria-hidden className="shimmer h-40 rounded-xl bg-muted" />}
            >
              <ChildWeekSection
                read={read}
                currency={family.currency}
                today={today}
                guideOn={isGuideConfigured()}
              />
            </Suspense>
          ))}
        </div>
      </section>
      <section aria-labelledby="children-title" className="rise-in grid gap-3" style={rise(3)}>
        <h2 id="children-title" className="text-h2">
          Children
        </h2>
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
          {reads.map((read) => (
            <li key={read.child.id}>
              <Suspense fallback={<div aria-hidden className="shimmer h-36 rounded-xl bg-muted" />}>
                <ChildCard read={read} currency={family.currency} />
              </Suspense>
            </li>
          ))}
          {reads.map((read) => (
            <li key={`latest-${read.child.id}`}>
              <Suspense fallback={<div aria-hidden className="shimmer h-32 rounded-xl bg-muted" />}>
                <LatestSection read={read} currency={family.currency} />
              </Suspense>
            </li>
          ))}
          <li>
            <Link
              href={routes.parentNewChild}
              className="flex h-full min-h-36 items-center justify-center gap-2 rounded-xl border-2 border-hairline-strong border-dashed px-4 font-semibold text-primary hover:bg-card"
            >
              <PlusIcon aria-hidden className="size-5" />
              Add a child
            </Link>
          </li>
        </ul>
      </section>
    </div>
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

/**
 * Ask Jarso about a child (ADR 0011 follow-up): the same Jarso, asking as the parent, for every
 * child Jarso is on for. Off deployments show nothing; a child Jarso is off for gets a line.
 */
async function ParentAskSection({ reads }: { reads: ChildReads[] }) {
  if (!isGuideConfigured()) return null;
  const access = await Promise.all(
    reads.map(async ({ child }) => ({
      child,
      enabled: await fallback(
        getGuideAccess(child.id).then((a) => a.enabled),
        false,
        "Guide access on parent home",
      ),
    })),
  );
  const kids = access.filter((a) => a.enabled).map((a) => a.child);
  const off = access.filter((a) => !a.enabled).map((a) => a.child);
  return (
    <div className="grid gap-3">
      {kids.length > 0 ? <AskJarso introNeeded={false} audience="parent" kids={kids} /> : null}
      {off.map((child) => (
        <p key={child.id} className="rounded-xl bg-muted p-4 text-ink-2">
          {guideCopy.parent.off(child.nickname)}{" "}
          <Link
            href={routes.parentChildGuide(child.id)}
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            {child.nickname}'s Jarso page
          </Link>
        </p>
      ))}
    </div>
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
 * One child's week in three sentences (money, learning, Jarso) and how their jars moved. Each
 * read is a nice-to-have on its own: a failed one leaves its line out, never the section.
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
  const [history, learning, chats, balances, due] = await Promise.all([
    fallback(getHistory(child.id), null, "History on parent home"),
    fallback(getLearningOverview(child.id), null, "Learning on parent home"),
    guideOn ? fallback(listGuideChats(child.id), null, "Chats on parent home") : null,
    fallback(getBalanceHistory(child.id), null, "Balances on parent home"),
    read.due,
  ]);
  const stillDue = due.reduce((sum, item) => sum + item.amountMinor, 0);
  const current = learning?.journey.find((mission) => mission.status === "current") ?? null;
  const thisWeek = chats?.filter((chat) => chat.lastMessageAt.slice(0, 10) >= weekStart) ?? null;
  return (
    <div className="grid gap-4">
      {history && learning ? (
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
      ) : null}
      {balances ? (
        <div className="rounded-xl bg-card p-4 shadow-raised">
          <JarGraph
            history={balances}
            currency={currency}
            title={`How ${child.nickname}'s jars moved`}
            showMinor="always"
          />
        </div>
      ) : null}
    </div>
  );
}

/** The child's latest money lines, as the parent reads them, with the way to the full history. */
async function LatestSection({ read, currency }: { read: ChildReads; currency: string }) {
  const history = await fallback(getHistory(read.child.id), null, "History on parent home");
  if (!history) return null;
  return (
    <section aria-label={`${read.child.nickname}'s latest`} className="grid gap-2">
      <h3 className="text-h3">{read.child.nickname}'s latest</h3>
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
    <div className="grid w-full gap-5">
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
