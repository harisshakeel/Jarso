import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SlowFallback } from "@/components/shell";
import { buttonVariants } from "@/components/ui";
import { routes } from "@/config";
import { getFamilyContext } from "@/features/allowance/server";
import { PendingPurchases, PurchaseSheet, UndoButton } from "@/features/diary";
import { requireRole } from "@/features/family/server";
import { HistoryList, historyParamsSchema, Jars } from "@/features/ledger";
import { getHistoryPage, getJars } from "@/features/ledger/server";

export const metadata: Metadata = { title: "Diary" };

/** The child's money diary (FR04): record a purchase, see every line, undo for 24 hours. */
async function Diary({ searchParams }: PageProps<"/child/diary">) {
  const { user } = await requireRole("child", routes.childDiary);
  const { before } = historyParamsSchema.parse(await searchParams);
  const [family, page, jars] = await Promise.all([
    getFamilyContext(),
    getHistoryPage(user.id, before),
    getJars(user.id),
  ]);
  return (
    <>
      <h1 className="rise-in text-h1">Diary</h1>
      <Jars jars={jars} currency={family.currency} />
      <PurchaseSheet currency={family.currency} userId={user.id} />
      <PendingPurchases userId={user.id} currency={family.currency} />
      <HistoryList
        items={page.items}
        currency={family.currency}
        renderAction={(item) =>
          item.canUndo && item.entryId ? (
            <UndoButton entryId={item.entryId} label={item.label} />
          ) : null
        }
      />
      {before || page.olderBefore ? (
        <nav aria-label="Diary pages" className="flex flex-wrap justify-between gap-3">
          {before ? (
            <Link
              href={routes.childDiary}
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              Back to newest
            </Link>
          ) : null}
          {page.olderBefore ? (
            <Link
              href={`${routes.childDiary}?before=${encodeURIComponent(page.olderBefore)}` as Route}
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              Show older
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}

export default function DiaryPage(props: PageProps<"/child/diary">) {
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <Suspense
        fallback={
          <SlowFallback>
            <div aria-hidden className="shimmer h-64 rounded-xl bg-muted" />
          </SlowFallback>
        }
      >
        <Diary {...props} />
      </Suspense>
    </div>
  );
}
