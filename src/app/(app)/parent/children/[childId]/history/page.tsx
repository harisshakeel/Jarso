import type { Metadata } from "next";
import { Suspense } from "react";
import { routes } from "@/config";
import { HistoryList } from "@/features/ledger";
import { getHistory } from "@/features/ledger/server";
import { loadChild } from "../load-child";
import { FormSkeleton, PageShell } from "../page-shell";

export const metadata: Metadata = { title: "History" };

async function HistoryContent({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const { child, currency } = await loadChild(childId, routes.parentChildHistory(childId));
  const history = await getHistory(childId);
  return (
    <PageShell
      title={`${child.nickname}'s history`}
      back={{ href: routes.parentChild(childId), label: child.nickname }}
    >
      <HistoryList
        items={history}
        currency={currency}
        skippedLabel="Not given"
        showMinor="always"
      />
    </PageShell>
  );
}

export default function ChildHistoryPage({
  params,
}: PageProps<"/parent/children/[childId]/history">) {
  return (
    <Suspense
      fallback={
        <PageShell title="History">
          <FormSkeleton />
        </PageShell>
      }
    >
      <HistoryContent params={params} />
    </Suspense>
  );
}
