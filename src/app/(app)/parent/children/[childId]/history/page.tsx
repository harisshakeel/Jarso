import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui";
import { routes } from "@/config";
import { HistoryList, historyParamsSchema } from "@/features/ledger";
import { getHistoryPage } from "@/features/ledger/server";
import { loadChild } from "../load-child";
import { FormSkeleton, PageShell } from "../page-shell";

export const metadata: Metadata = { title: "History" };

type Props = PageProps<"/parent/children/[childId]/history">;

async function HistoryContent({ params, searchParams }: Props) {
  const { childId } = await params;
  const { before } = historyParamsSchema.parse(await searchParams);
  const { child, currency } = await loadChild(childId, routes.parentChildHistory(childId));
  const { items, olderBefore } = await getHistoryPage(childId, before);
  const path = routes.parentChildHistory(childId);
  return (
    <PageShell
      title={`${child.nickname}'s history`}
      back={{ href: routes.parentChild(childId), label: child.nickname }}
    >
      <HistoryList items={items} currency={currency} skippedLabel="Not given" showMinor="always" />
      {before || olderBefore ? (
        <nav aria-label="History pages" className="flex flex-wrap justify-between gap-3">
          {before ? (
            <Link href={path} className={buttonVariants({ variant: "outline" })}>
              Back to newest
            </Link>
          ) : null}
          {olderBefore ? (
            <Link
              href={`${path}?before=${encodeURIComponent(olderBefore)}` as Route}
              className={buttonVariants({ variant: "outline" })}
            >
              Show older
            </Link>
          ) : null}
        </nav>
      ) : null}
    </PageShell>
  );
}

export default function ChildHistoryPage(props: Props) {
  return (
    <Suspense
      fallback={
        <PageShell title="History">
          <FormSkeleton />
        </PageShell>
      }
    >
      <HistoryContent {...props} />
    </Suspense>
  );
}
