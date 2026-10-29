import type { Metadata } from "next";
import { Suspense } from "react";
import { routes } from "@/config";
import { RulesForm } from "@/features/rules";
import { getChildRules } from "@/features/rules/server";
import { loadChild } from "../load-child";
import { FormSkeleton, PageShell } from "../page-shell";

export const metadata: Metadata = { title: "Money rules" };

async function RulesContent({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const { child, currency } = await loadChild(childId, routes.parentRules(childId));
  const rules = await getChildRules(childId);

  return (
    <PageShell
      title="Money rules"
      intro={`Set how ${child.nickname} spends. Limits send you a note. They never stop a purchase.`}
      back={{ href: routes.parentChild(childId), label: child.nickname }}
    >
      <RulesForm childId={childId} nickname={child.nickname} currency={currency} rules={rules} />
    </PageShell>
  );
}

export default function RulesPage({ params }: PageProps<"/parent/children/[childId]/rules">) {
  return (
    <Suspense
      fallback={
        <PageShell title="Money rules">
          <FormSkeleton />
        </PageShell>
      }
    >
      <RulesContent params={params} />
    </Suspense>
  );
}
