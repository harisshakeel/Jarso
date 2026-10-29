import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonVariants, Card, CardContent } from "@/components/ui";
import { routes } from "@/config";
import { CancelGiftForm, GiftForm } from "@/features/allowance";
import { listGifts } from "@/features/allowance/server";
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
  const gift = (await listGifts(childId)).find((g) => g.id === giftId);
  const title = `Allowance for ${child.nickname}`;

  if (gift?.status !== "pending") {
    return (
      <PageShell title={title}>
        <Card className="rise-in">
          <CardContent className="grid gap-4">
            <p>This gift was already handed over or cancelled.</p>
            <Link href={routes.parentAllowance(childId)} className={buttonVariants({ size: "lg" })}>
              Back to {child.nickname}'s allowance
            </Link>
          </CardContent>
        </Card>
      </PageShell>
    );
  }
  return (
    <PageShell title={title} intro="Change this gift.">
      <GiftForm
        childId={childId}
        nickname={child.nickname}
        currency={currency}
        today={today}
        initial={gift}
      />
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
        <PageShell title="Allowance">
          <FormSkeleton />
        </PageShell>
      }
    >
      <EditGiftContent params={params} />
    </Suspense>
  );
}
