import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonVariants, Card, CardContent } from "@/components/ui";
import { routes } from "@/config";
import { CancelGiftForm, GiftForm } from "@/features/allowance";
import { listGifts } from "@/features/allowance/server";
import { parentPageCopy } from "@/features/dashboard";
import { AutoChargeToggle } from "@/features/payments";
import { getAutoChargeCard } from "@/features/payments/server";
import { loadChild } from "../../../load-child";
import { FormSkeleton, PageShell } from "../../../page-shell";

export const metadata: Metadata = { title: "Change gift" };

async function EditGiftContent({
  params,
}: {
  params: Promise<{ childId: string; giftId: string }>;
}) {
  const { childId, giftId } = await params;
  const { child, currency, today } = await loadChild(
    childId,
    routes.parentGiftEdit(childId, giftId),
  );
  const [gifts, autoChargeCards] = await Promise.all([listGifts(childId), getAutoChargeCard()]);
  const gift = gifts.find((g) => g.id === giftId);
  const title = parentPageCopy.giftFor(child.nickname);
  const back = { href: routes.parentChild(childId), label: child.nickname };

  if (gift?.status !== "pending") {
    return (
      <PageShell title={title} back={back}>
        <Card className="rise-in">
          <CardContent className="grid gap-4">
            <p>This gift was already handed over or cancelled.</p>
            <Link href={routes.parentChild(childId)} className={buttonVariants({ size: "lg" })}>
              Back to {child.nickname}
            </Link>
          </CardContent>
        </Card>
      </PageShell>
    );
  }
  return (
    <PageShell title={title} intro={parentPageCopy.giftEditIntro} back={back}>
      <GiftForm
        childId={childId}
        nickname={child.nickname}
        currency={currency}
        today={today}
        initial={gift}
      />
      {autoChargeCards ? (
        <AutoChargeToggle
          target={{ type: "parent_gift", id: gift.id }}
          on={gift.autoCharge}
          provider={gift.autoChargeProvider}
          mine={gift.autoChargeMine}
          cards={autoChargeCards}
          // Auto charge never back-charges, so a gift whose day has passed can't use it.
          unavailable={gift.giveOn < today ? "overdue" : null}
        />
      ) : null}
      <CancelGiftForm childId={childId} giftId={gift.id} nickname={child.nickname} />
    </PageShell>
  );
}

export default function EditGiftPage({
  params,
}: PageProps<"/parent/children/[childId]/gifts/[giftId]/edit">) {
  return (
    <Suspense
      fallback={
        <PageShell title="Gift">
          <FormSkeleton />
        </PageShell>
      }
    >
      <EditGiftContent params={params} />
    </Suspense>
  );
}
