import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SlowFallback } from "@/components/shell";
import { buttonVariants, Card, CardContent } from "@/components/ui";
import { routes } from "@/config";
import { getFamilyContext } from "@/features/allowance/server";
import {
  diaryCopy,
  EntryDetail,
  PendingPurchases,
  PurchaseSheet,
  ReceivedSheet,
} from "@/features/diary";
import { requireRole } from "@/features/family/server";
import {
  DiaryHighlightsStrip,
  diaryHighlights,
  HistoryList,
  historyParamsSchema,
  JarGraph,
} from "@/features/ledger";
import {
  getBalanceHistory,
  getHistoryPage,
  getHistorySince,
  getJars,
} from "@/features/ledger/server";
import { fallback, formatMoney, startOfWeek } from "@/lib";

export const metadata: Metadata = { title: "Diary" };

/**
 * The child's money diary (FR04): record a purchase, see every line, undo for 24 hours. Since
 * 2026-11-04, one column: what's in Spend and the two record buttons on top, this week's
 * highlights as three figures, pending purchases, how the jars moved, then every line in full
 * rows under its day.
 */
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
    "Diary highlights",
  );
  return (
    <>
      <header className="rise-in flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-h1">{diaryCopy.heading}</h1>
          {jars ? (
            // Just the jar and the amount (2026-11-06, simpler for kids): it drops as soon as a
            // buy is written down, even offline.
            <section
              aria-label={diaryCopy.spendJarLabel}
              className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 font-semibold text-primary"
            >
              {diaryCopy.spendChip}
              <span className="money font-extrabold text-lg">
                {formatMoney(jars.spend, family.currency, { showMinor: "nonzero" })}
              </span>
            </section>
          ) : null}
        </div>
        <div className="grid w-full gap-3 sm:flex sm:w-auto sm:items-center">
          <PurchaseSheet currency={family.currency} userId={user.id} />
          <ReceivedSheet currency={family.currency} />
        </div>
      </header>
      {week ? (
        <DiaryHighlightsStrip
          view={diaryHighlights(week, family.today)}
          currency={family.currency}
        />
      ) : null}
      <PendingPurchases userId={user.id} currency={family.currency} />
      <Suspense fallback={<div aria-hidden className="shimmer h-64 rounded-xl bg-muted" />}>
        <DiaryGraph childId={user.id} currency={family.currency} />
      </Suspense>
      <div className="grid gap-6">
        <HistoryList
          items={page.items}
          currency={family.currency}
          today={family.today}
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
                href={
                  `${routes.childDiary}?before=${encodeURIComponent(page.olderBefore)}` as Route
                }
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                Show older
              </Link>
            ) : null}
          </nav>
        ) : null}
      </div>
    </>
  );
}

/**
 * How the jars moved (moved from Home on 2026-11-04): the ride sits right above the lines that
 * made it. Nice to have: if it can't load, the diary goes on without it.
 */
async function DiaryGraph({ childId, currency }: { childId: string; currency: string }) {
  const history = await fallback(getBalanceHistory(childId), null, "Jar graph on the diary");
  if (!history) return null;
  return (
    <Card>
      <CardContent>
        <JarGraph history={history} currency={currency} />
      </CardContent>
    </Card>
  );
}

export default function DiaryPage(props: PageProps<"/child/diary">) {
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6">
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
