import type { Metadata } from "next";
import Link from "next/link";
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
  return <WeekCard review={review} currency={family.currency} titleAs="h1" />;
}

export default function WeekPage() {
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <Link
        href={routes.childLearn}
        className="-mb-2 inline-flex min-h-11 w-fit items-center rounded-full px-2 font-semibold text-primary underline-offset-4 hover:underline"
      >
        Back to Learn
      </Link>
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
