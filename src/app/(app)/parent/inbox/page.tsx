import type { Metadata, Route } from "next";
import { Suspense } from "react";
import { SlowFallback } from "@/components/shell";
import { routes } from "@/config";
import { getFamily, requireRole } from "@/features/family/server";
import { InboxList, inboxParamsSchema, PushToggle } from "@/features/notifications";
import { listNotices } from "@/features/notifications/server";

export const metadata: Metadata = { title: "Inbox" };

type Props = PageProps<"/parent/inbox">;

async function InboxContent({ searchParams }: Pick<Props, "searchParams">) {
  await requireRole("parent", routes.parentInbox);
  const { before } = inboxParamsSchema.parse(await searchParams);
  const [family, page] = await Promise.all([getFamily(), listNotices(undefined, before)]);
  const moreHref = page.nextBefore
    ? (`${routes.parentInbox}?before=${encodeURIComponent(page.nextBefore)}` as Route)
    : null;
  return (
    <>
      <h1 className="text-balance text-display">Inbox</h1>
      <PushToggle />
      <InboxList
        items={page.items}
        currency={family?.currency ?? "USD"}
        viewer="parent"
        moreHref={moreHref}
      />
    </>
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

export default function ParentInboxPage({ searchParams }: Props) {
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
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
