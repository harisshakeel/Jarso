import type { Metadata } from "next";
import { Suspense } from "react";
import { BackLink, PageContainer, PageHeader } from "@/components/layout";
import { Skeleton } from "@/components/ui";
import { routes } from "@/config";
import { RulesForm, rulesCopy } from "@/features/rules";
import { getChildRules } from "@/features/rules/server";
import { loadChild } from "../load-child";

export const metadata: Metadata = { title: "Money rules" };

async function RulesContent({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const { child, currency } = await loadChild(childId, routes.parentRules(childId));
  const rules = await getChildRules(childId);

  return (
    <>
      <PageHeader
        back={<BackLink href={routes.parentChild(childId)}>{child.nickname}</BackLink>}
        title={rulesCopy.title}
        description={rulesCopy.intro(child.nickname)}
      />
      <RulesForm childId={childId} nickname={child.nickname} currency={currency} rules={rules} />
    </>
  );
}

/** Placeholder in the rules grid's shape, so the page does not jump when it loads. */
function RulesSkeleton() {
  return (
    <>
      <PageHeader title={rulesCopy.title} />
      <div aria-hidden className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-80" />
        <Skeleton className="h-56" />
        <Skeleton className="h-80" />
        <Skeleton className="h-56" />
      </div>
    </>
  );
}

export default function RulesPage({ params }: PageProps<"/parent/children/[childId]/rules">) {
  return (
    <PageContainer width="wide" className="gap-6">
      <Suspense fallback={<RulesSkeleton />}>
        <RulesContent params={params} />
      </Suspense>
    </PageContainer>
  );
}
