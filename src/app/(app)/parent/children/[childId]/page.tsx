import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { SlowFallback } from "@/components/shell";
import { routes } from "@/config";
import { DueList, GiftList, ParentAllowanceCard, upcomingGifts } from "@/features/allowance";
import { getSchedule, listDue, listGifts } from "@/features/allowance/server";
import { GuideCard } from "@/features/guide";
import { countFlaggedChats, getGuideAccess } from "@/features/guide/server";
import { LearningSummaryCard } from "@/features/learning";
import { getLearningOverview } from "@/features/learning/server";
import { Jars, RecentHistory } from "@/features/ledger";
import { getHistory, getJars } from "@/features/ledger/server";
import { ParentRequestItems } from "@/features/requests";
import { listRequestsNeedingParent } from "@/features/requests/server";
import { logger } from "@/lib";
import { loadChild } from "./load-child";
import { FormSkeleton, PageShell } from "./page-shell";

export const metadata: Metadata = { title: "Your child" };

const back = { href: routes.parent, label: "Your family" };

async function ChildContent({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const { child, currency, today } = await loadChild(childId, routes.parentChild(childId));
  const [jars, due, schedule, gifts] = await Promise.all([
    getJars(childId),
    listDue(childId),
    getSchedule(childId),
    listGifts(childId),
  ]);
  const upcoming = upcomingGifts(gifts, today);

  return (
    <PageShell title={child.nickname} back={back} wide>
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="grid gap-6">
          <Jars jars={jars} currency={currency} showMinor="always" />
          <Suspense fallback={null}>
            <ChildRequests childId={childId} nickname={child.nickname} currency={currency} />
          </Suspense>
          <DueList childId={childId} items={due} currency={currency} />
          <ParentAllowanceCard childId={childId} schedule={schedule} currency={currency} />
          <Link
            href={routes.parentRules(childId)}
            className="inline-flex min-h-11 w-fit items-center rounded-full px-2 font-semibold text-primary underline-offset-4 hover:underline"
          >
            Money rules
          </Link>
          <div className="grid gap-3">
            <GiftList childId={childId} gifts={upcoming} currency={currency} />
            <Link
              href={routes.parentGiftNew(childId)}
              className="inline-flex min-h-11 w-fit items-center gap-1 rounded-full px-2 font-semibold text-primary underline-offset-4 hover:underline"
            >
              <PlusIcon aria-hidden className="size-5" />
              Give a gift
            </Link>
          </div>
          <Suspense fallback={<div aria-hidden className="shimmer h-32 rounded-xl bg-muted" />}>
            <ChildLearning childId={childId} nickname={child.nickname} />
          </Suspense>
          <Suspense fallback={null}>
            <ChildGuide childId={childId} nickname={child.nickname} />
          </Suspense>
        </div>
        <Suspense fallback={<div aria-hidden className="shimmer h-64 rounded-xl bg-muted" />}>
          <ChildHistory childId={childId} currency={currency} />
        </Suspense>
      </div>
    </PageShell>
  );
}

/** Take-outs and put-ins waiting on a parent, next to what is due. */
async function ChildRequests({
  childId,
  nickname,
  currency,
}: {
  childId: string;
  nickname: string;
  currency: string;
}) {
  const requests = await listRequestsNeedingParent(childId);
  return (
    <ParentRequestItems
      items={requests.map((request) => ({ nickname, request }))}
      currency={currency}
    />
  );
}

/** Learning streams on its own and hides itself on error, so money stays visible. */
async function ChildLearning({ childId, nickname }: { childId: string; nickname: string }) {
  try {
    const learning = await getLearningOverview(childId);
    return (
      <LearningSummaryCard
        overview={learning}
        nickname={nickname}
        href={routes.parentChildLearning(childId)}
      />
    );
  } catch (error) {
    unstable_rethrow(error);
    logger.warn("Learning card unavailable", {
      error: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
}

/** The money guide switch and flagged chats, when the guide runs on this deployment. */
async function ChildGuide({ childId, nickname }: { childId: string; nickname: string }) {
  try {
    const access = await getGuideAccess(childId);
    if (!access.configured) return null;
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

/** The newest few history lines as the parent sees them (exact amounts). */
async function ChildHistory({ childId, currency }: { childId: string; currency: string }) {
  const history = await getHistory(childId);
  return (
    <RecentHistory
      items={history}
      currency={currency}
      skippedLabel="Not given"
      showMinor="always"
      seeAllHref={routes.parentChildHistory(childId)}
    />
  );
}

export default function ChildPage({ params }: PageProps<"/parent/children/[childId]">) {
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
      <ChildContent params={params} />
    </Suspense>
  );
}
