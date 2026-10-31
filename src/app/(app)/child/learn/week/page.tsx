import type { Metadata } from "next";
import { Suspense } from "react";
import { SlowFallback } from "@/components/shell";
import { routes } from "@/config";
import { getFamilyContext } from "@/features/allowance/server";
import { requireRole } from "@/features/family/server";
import { WeekCard } from "@/features/review";
import { getWeeklyReview } from "@/features/review/server";

export const metadata: Metadata = { title: "Your week" };

async function WeekContent() {
  const { user } = await requireRole("child", routes.childWeek);
  const [family, review] = await Promise.all([getFamilyContext(), getWeeklyReview(user.id)]);
  return <WeekCard review={review} currency={family.currency} />;
}

export default function WeekPage() {
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <Suspense
        fallback={
          <SlowFallback>
            <div aria-hidden className="shimmer h-72 rounded-xl bg-muted" />
          </SlowFallback>
        }
      >
        <WeekContent />
      </Suspense>
    </div>
  );
}
