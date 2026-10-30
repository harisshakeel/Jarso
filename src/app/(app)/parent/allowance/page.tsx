import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SlowFallback } from "@/components/shell";
import { routes } from "@/config";
import { AllowanceOverview } from "@/features/allowance";
import { getSchedule, listDue } from "@/features/allowance/server";
import { FirstChildCard } from "@/features/family";
import { getFamily, listChildren, requireRole } from "@/features/family/server";

export const metadata: Metadata = { title: "Allowance" };

async function OverviewContent() {
  const { membership } = await requireRole("parent", routes.parentAllowanceOverview);
  if (!membership) redirect(routes.parentSetup);
  const [family, children] = await Promise.all([getFamily(), listChildren()]);
  if (!family) redirect(routes.parentSetup);
  if (children.length === 0) return <FirstChildCard />;

  const rows = await Promise.all(
    children.map(async (child) => {
      const [schedule, due] = await Promise.all([getSchedule(child.id), listDue(child.id)]);
      return { childId: child.id, nickname: child.nickname, schedule, dueCount: due.length };
    }),
  );
  return (
    <div className="rise-in">
      <AllowanceOverview rows={rows} currency={family.currency} />
    </div>
  );
}

export default function AllowanceOverviewPage() {
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <h1 className="text-h1">Allowance</h1>
      <Suspense
        fallback={
          <SlowFallback>
            <div aria-hidden className="shimmer h-40 rounded-xl bg-muted" />
          </SlowFallback>
        }
      >
        <OverviewContent />
      </Suspense>
    </div>
  );
}
