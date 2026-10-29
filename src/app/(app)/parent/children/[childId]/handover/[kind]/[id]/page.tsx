import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonVariants, Card, CardContent } from "@/components/ui";
import { routes } from "@/config";
import { HandoverForm, prefillSplit } from "@/features/allowance";
import { getLastSplit, listDue } from "@/features/allowance/server";
import { loadChild } from "../../../load-child";
import { FormSkeleton, PageShell } from "../../../page-shell";

export const metadata: Metadata = { title: "Hand over" };

async function HandoverContent({
  params,
}: {
  params: Promise<{ childId: string; kind: string; id: string }>;
}) {
  const { childId, kind, id } = await params;
  const { child, currency } = await loadChild(childId, `/parent/children/${childId}/allowance`);
  const [due, last] = await Promise.all([listDue(childId), getLastSplit(childId)]);
  const item = due.find((d) => d.kind === kind && d.id === id);

  if (!item) {
    return (
      <PageShell title={`Hand over to ${child.nickname}`}>
        <Card className="rise-in">
          <CardContent className="grid gap-4">
            <p className="font-bold">Already handled</p>
            <Link href={routes.parentAllowance(childId)} className={buttonVariants({ size: "lg" })}>
              Back to {child.nickname}'s allowance
            </Link>
          </CardContent>
        </Card>
      </PageShell>
    );
  }
  return (
    <PageShell title={`Hand over to ${child.nickname}`}>
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
      />
    </PageShell>
  );
}

export default function HandoverPage({
  params,
}: PageProps<"/parent/children/[childId]/handover/[kind]/[id]">) {
  return (
    <Suspense
      fallback={
        <PageShell title="Hand over">
          <FormSkeleton />
        </PageShell>
      }
    >
      <HandoverContent params={params} />
    </Suspense>
  );
}
