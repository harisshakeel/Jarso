import type { Metadata, Route } from "next";
import { Suspense } from "react";
import { SlowFallback } from "@/components/shell";
import { routes } from "@/config";
import { getFamilyContext } from "@/features/allowance/server";
import { requireRole } from "@/features/family/server";
import { getGoalView } from "@/features/goals/server";
import { getLearningOverview } from "@/features/learning/server";
import { getHistorySince } from "@/features/ledger/server";
import {
  BigMoments,
  bigMoments,
  InboxList,
  inboxCopy,
  inboxParamsSchema,
  MOMENT_DAYS,
  momentsCopy,
  PushToggle,
} from "@/features/notifications";
import { listNotices } from "@/features/notifications/server";
import { addDays, fallback } from "@/lib";

export const metadata: Metadata = { title: "Updates" };

type Props = PageProps<"/child/inbox">;

/**
 * The child's Updates (News until 2026-11-04): their big moments from the last month at the top
 * (missions finished, pocket money and gifts, a goal reached, a longest run), then every notice
 * under "Messages". Older pages of notices skip the moments.
 */
async function InboxContent({ searchParams }: Pick<Props, "searchParams">) {
  const { user } = await requireRole("child", routes.childInbox);
  const { before } = inboxParamsSchema.parse(await searchParams);
  const [family, page] = await Promise.all([getFamilyContext(), listNotices(undefined, before)]);
  const moreHref = page.nextBefore
    ? (`${routes.childInbox}?before=${encodeURIComponent(page.nextBefore)}` as Route)
    : null;
  return (
    <>
      <h1 className="text-balance text-h1">{inboxCopy.childHeading}</h1>
      <PushToggle hideWhenOn />
      {before ? null : (
        <Suspense fallback={<div aria-hidden className="shimmer h-32 rounded-xl bg-muted" />}>
          <MomentsSection childId={user.id} today={family.today} currency={family.currency} />
        </Suspense>
      )}
      <section aria-labelledby="messages-title" className="grid gap-2">
        <h2 id="messages-title" className="text-h3">
          {momentsCopy.notices}
        </h2>
        <InboxList
          items={page.items}
          currency={family.currency}
          viewer="child"
          moreHref={moreHref}
        />
      </section>
    </>
  );
}

/** The big moments: each read is a nice extra, so one failing only thins the list. */
async function MomentsSection({
  childId,
  today,
  currency,
}: {
  childId: string;
  today: string;
  currency: string;
}) {
  const [history, learning, goal] = await Promise.all([
    fallback(getHistorySince(childId, addDays(today, -MOMENT_DAYS)), [], "Moments history"),
    fallback(getLearningOverview(childId), null, "Moments learning"),
    fallback(getGoalView(childId), null, "Moments goal"),
  ]);
  return (
    <BigMoments items={bigMoments({ history, learning, goal, today, currency })} today={today} />
  );
}

function InboxSkeleton() {
  return (
    <div aria-hidden className="grid gap-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="shimmer h-16 rounded-xl bg-muted" />
      ))}
    </div>
  );
}

export default function ChildInboxPage({ searchParams }: Props) {
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <Suspense
        fallback={
          <SlowFallback>
            <InboxSkeleton />
          </SlowFallback>
        }
      >
        <InboxContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
