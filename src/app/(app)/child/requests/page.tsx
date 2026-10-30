import type { Metadata } from "next";
import { Suspense } from "react";
import { SlowFallback } from "@/components/shell";
import { routes } from "@/config";
import { getFamilyContext } from "@/features/allowance/server";
import { requireRole } from "@/features/family/server";
import { RequestActions, RequestList } from "@/features/requests";
import { getAvailability, listRequests } from "@/features/requests/server";
import { getChildRules } from "@/features/rules/server";

export const metadata: Metadata = { title: "Save requests" };

async function RequestsContent() {
  const { user } = await requireRole("child", routes.childRequests);
  const [family, availability, rules, requests] = await Promise.all([
    getFamilyContext(),
    getAvailability(user.id),
    getChildRules(user.id),
    listRequests(user.id),
  ]);
  return (
    <>
      <h1 className="text-balance text-display">Save requests</h1>
      <RequestActions availability={availability} currency={family.currency} rules={rules.rules} />
      <RequestList requests={requests} currency={family.currency} timeZone={family.timezone} />
    </>
  );
}

function RequestsSkeleton() {
  return (
    <div aria-hidden className="grid gap-4">
      <div className="shimmer h-12 rounded-xl bg-muted" />
      <div className="shimmer h-40 rounded-xl bg-muted" />
    </div>
  );
}

export default function ChildRequestsPage() {
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <Suspense
        fallback={
          <SlowFallback>
            <RequestsSkeleton />
          </SlowFallback>
        }
      >
        <RequestsContent />
      </Suspense>
    </div>
  );
}
