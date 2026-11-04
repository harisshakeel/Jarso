import type { Metadata, Route } from "next";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { SlowFallback } from "@/components/shell";
import { routes } from "@/config";
import { ActivityList, mergeActivity, parentPageCopy } from "@/features/dashboard";
import { getFamilyDashboard } from "@/features/dashboard/server";
import { getFamily, requireRole } from "@/features/family/server";
import { InboxList, inboxParamsSchema, momentsCopy, PushToggle } from "@/features/notifications";
import { listNotices } from "@/features/notifications/server";
import { logger } from "@/lib";

export const metadata: Metadata = { title: "Notifications" };

type Props = PageProps<"/parent/inbox">;

/** Lines of recent activity Notifications shows. */
const ACTIVITY_LIMIT = 15;

/**
 * The parent's Notifications (Inbox until 2026-11-04): every notice under "Messages", and beside
 * it the family's recent activity, moved here from Money, grouped by day with each line tagged
 * with its child. Phones show the messages first. Older pages of notices skip the activity.
 */
async function InboxContent({ searchParams }: Pick<Props, "searchParams">) {
  await requireRole("parent", routes.parentInbox);
  const { before } = inboxParamsSchema.parse(await searchParams);
  const [family, page] = await Promise.all([getFamily(), listNotices(undefined, before)]);
  const moreHref = page.nextBefore
    ? (`${routes.parentInbox}?before=${encodeURIComponent(page.nextBefore)}` as Route)
    : null;
  return (
    <>
      <h1 className="text-balance text-h1">{parentPageCopy.inbox}</h1>
      <PushToggle hideWhenOn />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:gap-8">
        <section aria-labelledby="messages-title" className="grid gap-2">
          <h2 id="messages-title" className="text-h3">
            {momentsCopy.notices}
          </h2>
          <InboxList
            items={page.items}
            currency={family?.currency ?? "USD"}
            viewer="parent"
            moreHref={moreHref}
          />
        </section>
        {before ? null : (
          <Suspense fallback={<div aria-hidden className="shimmer h-72 rounded-xl bg-muted" />}>
            <ActivitySection />
          </Suspense>
        )}
      </div>
    </>
  );
}

/** Money across the family over the last month; if it can't load, the messages still show. */
async function ActivitySection() {
  try {
    const data = await getFamilyDashboard(30);
    if (!data) return null;
    return (
      <div className="lg:sticky lg:top-20">
        <ActivityList
          items={mergeActivity(data.children, ACTIVITY_LIMIT)}
          currency={data.currency}
          seeAllHref={null}
          today={data.today}
        />
      </div>
    );
  } catch (error) {
    unstable_rethrow(error);
    logger.warn("Activity unavailable on notifications", {
      error: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
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

export default function ParentInboxPage({ searchParams }: Props) {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6">
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
