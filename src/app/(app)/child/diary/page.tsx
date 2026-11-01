import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SlowFallback } from "@/components/shell";
import { buttonVariants } from "@/components/ui";
import { routes } from "@/config";
import { getFamilyContext } from "@/features/allowance/server";
import { EntryDetail, PendingPurchases, PurchaseSheet, ReceivedSheet } from "@/features/diary";
import { requireRole } from "@/features/family/server";
import { HistoryList, historyParamsSchema, WhereItWentCard, whereItWent } from "@/features/ledger";
import { getHistoryPage, getHistorySince, getJars } from "@/features/ledger/server";
import { fallback, formatMoney, startOfWeek } from "@/lib";

export const metadata: Metadata = { title: "Diary" };

/** The child's money diary (FR04): record a purchase, see every line, undo for 24 hours. */
async function Diary({ searchParams }: PageProps<"/child/diary">) {
  const { user } = await requireRole("child", routes.childDiary);
  const { before } = historyParamsSchema.parse(await searchParams);
  const [family, page, jars] = await Promise.all([
    getFamilyContext(),
    getHistoryPage(user.id, before),
    // A nice extra: if the balance fails, purchases, history and Undo still work.
    fallback(getJars(user.id), null, "Jars on the diary"),
  ]);
  // Also a nice extra: the card is skipped if this week's lines fail to load.
  const week = await fallback(
    getHistorySince(user.id, startOfWeek(family.today)),
    null,
    "Where your money went",
  );
  return (
    <>
      <h1 className="rise-in text-h1">Diary</h1>
      {jars ? (
        <section aria-label="Spend jar" className="text-lg">
          You have{" "}
          <span className="money font-extrabold">
            {formatMoney(jars.spend, family.currency, { showMinor: "nonzero" })}
          </span>{" "}
          in Spend.
        </section>
      ) : null}
      {week ? <WhereItWentCard view={whereItWent(week, family.today, family.currency)} /> : null}
      <PurchaseSheet currency={family.currency} userId={user.id} />
      <ReceivedSheet currency={family.currency} />
      <PendingPurchases userId={user.id} currency={family.currency} />
      <HistoryList
        items={page.items}
        currency={family.currency}
        renderAction={(item) =>
          (item.canFix || item.canUndo || item.fixedFrom) && item.entryId ? (
            <EntryDetail item={item} currency={family.currency} />
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
