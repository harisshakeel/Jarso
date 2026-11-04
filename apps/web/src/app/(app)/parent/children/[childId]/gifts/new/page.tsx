import type { Metadata } from "next";
import { Suspense } from "react";
import { routes } from "@/config";
import { GiftForm } from "@/features/allowance";
import { parentPageCopy } from "@/features/dashboard";
import { paymentCopy } from "@/features/payments";
import { paymentsEnabled } from "@/features/payments/server";
import { loadChild } from "../../load-child";
import { FormSkeleton, PageShell } from "../../page-shell";

export const metadata: Metadata = { title: "Give a gift" };

async function NewGiftContent({
  params,
  searchParams,
}: {
  params: Promise<{ childId: string }>;
  searchParams: Promise<{ amount?: string | string[] }>;
}) {
  const { childId } = await params;
  const { amount } = await searchParams;
  const { child, currency, today } = await loadChild(childId, routes.parentGiftNew(childId));
  return (
    <PageShell
      title={parentPageCopy.giftFor(child.nickname)}
      intro={parentPageCopy.giftNewIntro}
      back={{ href: routes.parentChild(childId), label: child.nickname }}
    >
      <GiftForm
        childId={childId}
        nickname={child.nickname}
        currency={currency}
        today={today}
        defaultAmount={typeof amount === "string" ? amount : undefined}
      />
      {paymentsEnabled() ? (
        <p className="text-ink-2 text-sm">{paymentCopy.autoChargeLater}</p>
      ) : null}
    </PageShell>
  );
}

export default function NewGiftPage({
  params,
  searchParams,
}: PageProps<"/parent/children/[childId]/gifts/new">) {
  return (
    <Suspense
      fallback={
        <PageShell title="Gift">
          <FormSkeleton />
        </PageShell>
      }
    >
      <NewGiftContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}
