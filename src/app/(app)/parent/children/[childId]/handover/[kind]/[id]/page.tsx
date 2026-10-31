import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { buttonVariants, Card, CardContent } from "@/components/ui";
import { routes } from "@/config";
import { HandoverForm, handoverParamsSchema, prefillSplit } from "@/features/allowance";
import { getLastSplit, listDue } from "@/features/allowance/server";
import { planNote } from "@/features/goals";
import { getGoalView } from "@/features/goals/server";
import {
  CardCancelledReturn,
  CardReturnedBanner,
  cardReturnParamsSchema,
  PaymentStatusNote,
} from "@/features/payments";
import { getCardPaymentState, paymentsEnabled } from "@/features/payments/server";
import { logger } from "@/lib";
import { loadChild } from "../../../load-child";
import { FormSkeleton, PageShell } from "../../../page-shell";

export const metadata: Metadata = { title: "Hand over" };

async function HandoverContent({
  params,
  searchParams,
}: {
  params: Promise<{ childId: string; kind: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { childId, ...rest } = await params;
  const parsed = handoverParamsSchema.safeParse(rest);
  if (!parsed.success) notFound();
  const { kind, id } = parsed.data;
  const { child, currency } = await loadChild(childId, routes.parentHandover(childId, kind, id));
  const back = { href: routes.parentChild(childId), label: child.nickname };
  const cardReturn = paymentsEnabled()
    ? cardReturnParamsSchema.parse(await searchParams).card
    : undefined;
  const returnedFromCard = cardReturn === "returned";
  // Backed out of the hosted checkout: cancel it from the client, after render.
  const cancelledCard =
    cardReturn === "cancelled" ? (
      <CardCancelledReturn childId={childId} kind={kind} id={id} />
    ) : null;
  const [due, last, goalView, card] = await Promise.all([
    listDue(childId),
    getLastSplit(childId),
    // The goal note is a nice-to-have: a failed read must never block a handover.
    getGoalView(childId).catch((error: unknown) => {
      unstable_rethrow(error);
      logger.warn("Goal note unavailable", { error });
      return null;
    }),
    // Card payments are optional too: with them off, or a failed read, cash handover is unchanged.
    paymentsEnabled()
      ? getCardPaymentState(childId, {
          type: kind === "allowance" ? "occurrence" : "parent_gift",
          id,
        }).catch((error: unknown) => {
          unstable_rethrow(error);
          logger.warn("Card payment state unavailable", { error });
          return null;
        })
      : null,
  ]);
  const item = due.find((d) => d.kind === kind && d.id === id);

  if (!item) {
    return (
      <PageShell title={`Hand over to ${child.nickname}`} back={back}>
        {cancelledCard}
        {card?.lastOutcome?.status === "succeeded_unapplied" ? (
          <PaymentStatusNote state={card} />
        ) : returnedFromCard ? (
          <CardReturnedBanner handled />
        ) : null}
        <Card className="rise-in">
          <CardContent className="grid gap-4">
            <p className="font-bold">Already handled</p>
            <Link href={routes.parentChild(childId)} className={buttonVariants({ size: "lg" })}>
              Back to {child.nickname}
            </Link>
          </CardContent>
        </Card>
      </PageShell>
    );
  }
  return (
    <PageShell title={`Hand over to ${child.nickname}`} back={back}>
      {cancelledCard}
      {returnedFromCard ? <CardReturnedBanner /> : null}
      <HandoverForm
        kind={item.kind}
        id={item.id}
        childId={childId}
        nickname={child.nickname}
        currency={currency}
        amountMinor={item.amountMinor}
        dueOn={item.dueOn}
        note={item.note}
        prefill={prefillSplit(item.amountMinor, last)}
        hasPrevious={last !== null}
        goalNote={planNote(child.nickname, goalView?.goal ?? null, currency)}
        card={card}
      />
      {item.kind === "gift" ? (
        <Link
          href={routes.parentGiftEdit(childId, item.id)}
          className="justify-self-center font-semibold text-ink-2 text-sm underline underline-offset-4 hover:text-foreground"
        >
          Change or cancel this gift
        </Link>
      ) : null}
    </PageShell>
  );
}

export default function HandoverPage({
  params,
  searchParams,
}: PageProps<"/parent/children/[childId]/handover/[kind]/[id]">) {
  return (
    <Suspense
      fallback={
        <PageShell title="Hand over">
          <FormSkeleton />
        </PageShell>
      }
    >
      <HandoverContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}
