import type { Metadata } from "next";
import { Suspense } from "react";
import { routes } from "@/config";
import { GiftForm } from "@/features/allowance";
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
      title={`Gift for ${child.nickname}`}
      intro="A one-time gift."
      back={{ href: routes.parentChild(childId), label: child.nickname }}
    >
      <GiftForm
        childId={childId}
        nickname={child.nickname}
        currency={currency}
        today={today}
        defaultAmount={typeof amount === "string" ? amount : undefined}
      />
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
        <PageShell title="Allowance">
          <FormSkeleton />
        </PageShell>
      }
    >
      <NewGiftContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}
