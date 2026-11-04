import { GiftIcon, ScaleIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { PageTabs, SlowFallback } from "@/components/shell";
import { routes } from "@/config";
import {
  DueList,
  GiftList,
  ParentAllowanceCard,
  runningSchedule,
  upcomingGifts,
} from "@/features/allowance";
import { getSchedule, listDue, listGifts } from "@/features/allowance/server";
import { GuideCard } from "@/features/guide";
import { countFlaggedChats, getGuideAccess } from "@/features/guide/server";
import { CompletedMissions, LearningSummaryCard, SkillList } from "@/features/learning";
import { getLearningOverview } from "@/features/learning/server";
import { Jars, RecentHistory } from "@/features/ledger";
import { getHistory, getJars } from "@/features/ledger/server";
import { ParentRequestItems, RequestsUnavailable } from "@/features/requests";
import { listRequestsNeedingParent } from "@/features/requests/server";
import { logger } from "@/lib";
import { loadChild } from "./load-child";
import { FormSkeleton, PageShell } from "./page-shell";

export const metadata: Metadata = { title: "Your child" };

const back = { href: routes.parent, label: "Your family" };

const tabValues = ["learning", "money", "jarso"] as const;
const paramsSchema = z.object({ tab: z.enum(tabValues).catch("learning") });

type Props = PageProps<"/parent/children/[childId]">;

/**
 * One child, in three tabs so nothing stacks eight deep: Learning first (since 2026-11-04: the
 * week, the lessons and how they went, skills), then Money (jars, what needs you, the allowance,
 * rules and gifts, the recent story) and Jarso. Money flows come back to the Money tab.
 */
async function ChildContent({ params, searchParams }: Props) {
  const [{ childId }, { tab }] = await Promise.all([
    params,
    searchParams.then((sp) => paramsSchema.parse(sp)),
  ]);
  const { child, currency, today } = await loadChild(childId, routes.parentChild(childId));
  const [jars, due, schedule, gifts] = await Promise.all([
    getJars(childId),
    listDue(childId),
    getSchedule(childId),
    listGifts(childId),
  ]);
  const upcoming = upcomingGifts(gifts, today);

  const moneyTab = (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <div className="grid gap-6">
        <Jars
          jars={jars}
          currency={currency}
          showMinor="always"
          allowanceMinor={runningSchedule(schedule)?.amountMinor ?? null}
        />
        <Suspense fallback={null}>
          <ChildRequests childId={childId} nickname={child.nickname} currency={currency} />
        </Suspense>
        <DueList childId={childId} items={due} currency={currency} />
        <ParentAllowanceCard childId={childId} schedule={schedule} currency={currency} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href={routes.parentRules(childId)}
            className="flex min-h-11 items-center gap-3 rounded-xl border border-hairline bg-card px-4 py-3 font-semibold hover:bg-muted"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
              <ScaleIcon aria-hidden className="size-5" />
            </span>
            Money rules
          </Link>
          <Link
            href={routes.parentGiftNew(childId)}
            className="flex min-h-11 items-center gap-3 rounded-xl border border-hairline bg-card px-4 py-3 font-semibold hover:bg-muted"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gold-100 text-gold-700">
              <GiftIcon aria-hidden className="size-5" />
            </span>
            Give a gift
          </Link>
        </div>
        <GiftList childId={childId} gifts={upcoming} currency={currency} />
      </div>
      <Suspense fallback={<div aria-hidden className="shimmer h-64 rounded-xl bg-muted" />}>
        <ChildHistory childId={childId} nickname={child.nickname} currency={currency} />
      </Suspense>
    </div>
  );

  const learningTab = (
    <Suspense fallback={<div aria-hidden className="shimmer h-32 rounded-xl bg-muted" />}>
      <ChildLearning childId={childId} nickname={child.nickname} />
    </Suspense>
  );

  const jarsoTab = (
    <Suspense fallback={<div aria-hidden className="shimmer h-32 rounded-xl bg-muted" />}>
      <ChildGuide childId={childId} nickname={child.nickname} />
    </Suspense>
  );

  return (
    <PageShell title={child.nickname} back={back} wide>
      <PageTabs
        label={`${child.nickname}'s sections`}
        defaultValue={tab}
        tabs={[
          { value: "learning", label: "Learning", content: learningTab },
          { value: "money", label: "Money", content: moneyTab },
          { value: "jarso", label: "Jarso", content: jarsoTab },
        ]}
      />
    </PageShell>
  );
}

/** Take-outs and put-ins waiting on a parent. A failed read shows a calm line so jars stay visible. */
async function ChildRequests({
  childId,
  nickname,
  currency,
}: {
  childId: string;
  nickname: string;
  currency: string;
}) {
  try {
    const requests = await listRequestsNeedingParent(childId);
    return (
      <ParentRequestItems
        items={requests.map((request) => ({ nickname, request }))}
        currency={currency}
      />
    );
  } catch (error) {
    unstable_rethrow(error);
    logger.warn("Child requests unavailable", {
      error: error instanceof Error ? error.name : typeof error,
    });
    return <RequestsUnavailable />;
  }
}

/** Learning streams on its own and hides itself on error, so the other tabs still work. */
async function ChildLearning({ childId, nickname }: { childId: string; nickname: string }) {
  try {
    const learning = await getLearningOverview(childId);
    return (
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="grid gap-6">
          <LearningSummaryCard
            overview={learning}
            nickname={nickname}
            href={routes.parentChildLearning(childId)}
          />
          <CompletedMissions completed={learning.completed} />
        </div>
        <SkillList progress={learning.skills} heading="Skills" />
      </div>
    );
  } catch (error) {
    unstable_rethrow(error);
    logger.warn("Learning card unavailable", {
      error: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
}

/** The Jarso switch and flagged chats, when Jarso runs on this deployment. */
async function ChildGuide({ childId, nickname }: { childId: string; nickname: string }) {
  try {
    const access = await getGuideAccess(childId);
    if (!access.configured) {
      return (
        <p className="text-ink-2">Jarso, the AI helper, is not switched on for this app yet.</p>
      );
    }
    const flagged = await countFlaggedChats(childId);
    return (
      <GuideCard
        childId={childId}
        nickname={nickname}
        enabled={access.enabled}
        flagged={flagged}
        href={routes.parentChildGuide(childId)}
      />
    );
  } catch (error) {
    unstable_rethrow(error);
    logger.warn("Guide card unavailable", {
      error: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
}

/** The newest few history lines as the parent sees them (exact amounts). Fails calmly. */
async function ChildHistory({
  childId,
  nickname,
  currency,
}: {
  childId: string;
  nickname: string;
  currency: string;
}) {
  try {
    const history = await getHistory(childId);
    return (
      <RecentHistory
        items={history}
        currency={currency}
        skippedLabel="Not given"
        showMinor="always"
        emptyLine={`${nickname}'s money story starts here.`}
        seeAllHref={routes.parentChildHistory(childId)}
      />
    );
  } catch (error) {
    unstable_rethrow(error);
    logger.warn("History unavailable on the child page", {
      error: error instanceof Error ? error.name : typeof error,
    });
    return (
      <p role="status" className="rounded-xl bg-muted p-4 text-ink-2">
        We couldn't load the history just now. Refresh to try again.
      </p>
    );
  }
}

export default function ChildPage(props: Props) {
  return (
    <Suspense
      fallback={
        <PageShell title="Your child" back={back} wide>
          <SlowFallback>
            <FormSkeleton />
          </SlowFallback>
        </PageShell>
      }
    >
      <ChildContent {...props} />
    </Suspense>
  );
}
