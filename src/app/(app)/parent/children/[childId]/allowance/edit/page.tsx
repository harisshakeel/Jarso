import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonVariants, Card, CardContent } from "@/components/ui";
import { routes } from "@/config";
import { AllowanceForm } from "@/features/allowance";
import { getSchedule } from "@/features/allowance/server";
import { loadChild } from "../../load-child";
import { FormSkeleton, PageShell } from "../../page-shell";

export const metadata: Metadata = { title: "Change allowance" };

async function EditContent({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const { child, currency, today } = await loadChild(childId, routes.parentAllowanceEdit(childId));
  const schedule = await getSchedule(childId);
  const title = `Allowance for ${child.nickname}`;

  if (!schedule || schedule.status === "stopped") {
    return (
      <PageShell title={title}>
        <Card className="rise-in">
          <CardContent className="grid gap-4">
            <p>There's no allowance running. Set one up instead.</p>
            <Link href={routes.parentAllowance(childId)} className={buttonVariants({ size: "lg" })}>
              Set up an allowance
            </Link>
          </CardContent>
        </Card>
      </PageShell>
    );
  }
  return (
    <PageShell title={title}>
      <AllowanceForm childId={childId} currency={currency} today={today} initial={schedule} />
    </PageShell>
  );
}

export default function EditAllowancePage({
  params,
}: PageProps<"/parent/children/[childId]/allowance/edit">) {
  return (
    <Suspense
      fallback={
        <PageShell title="Allowance">
          <FormSkeleton />
        </PageShell>
      }
    >
      <EditContent params={params} />
    </Suspense>
  );
}
