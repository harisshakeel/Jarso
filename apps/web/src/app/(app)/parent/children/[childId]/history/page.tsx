import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui";
import { routes } from "@/config";
import { parentPageCopy } from "@/features/dashboard";
import { HistoryList, historyParamsSchema, WhereItWentCard, whereItWent } from "@/features/ledger";
import { getHistoryPage, getHistorySince } from "@/features/ledger/server";
import { startOfWeek } from "@/lib";
import { loadChild } from "../load-child";
import { FormSkeleton, PageShell } from "../page-shell";

export const metadata: Metadata = { title: "History" };

type Props = PageProps<"/parent/children/[childId]/history">;

async function HistoryContent({ params, searchParams }: Props) {
  const { childId } = await params;
  const { before } = historyParamsSchema.parse(await searchParams);
  const { child, currency, today } = await loadChild(childId, routes.parentChildHistory(childId));
  const [{ items, olderBefore }, week] = await Promise.all([
    getHistoryPage(childId, before),
    getHistorySince(childId, startOfWeek(today)),
  ]);
  const path = routes.parentChildHistory(childId);
  return (
    <PageShell
      title={parentPageCopy.history(child.nickname)}
      back={{ href: routes.parentChild(childId), label: child.nickname }}
    >
      <WhereItWentCard view={whereItWent(week, today, currency, { showMinor: "always" })} />
      <HistoryList
        items={items}
        currency={currency}
        skippedLabel="Not given"
        showMinor="always"
        emptyLine={parentPageCopy.historyEmpty(child.nickname)}
      />
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
