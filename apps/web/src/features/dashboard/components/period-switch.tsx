import { dashboardPeriods } from "@jarso/core/dashboard";
import type { Route } from "next";
import Link from "next/link";
import { cn } from "@/lib";

/** The period pills (spec answer 3): this week by default, then the month and 3 months. */
export function PeriodSwitch({
  basePath,
  days,
  keep = {},
}: {
  basePath: string;
  days: number;
  /** Other search params to keep, such as the child filter. */
  keep?: Record<string, string>;
}) {
  return (
    <nav aria-label="Period">
      <ul className="flex gap-1 rounded-full bg-muted p-1">
        {dashboardPeriods.map((period) => {
          const selected = period.days === days;
          const href = `${basePath}?${new URLSearchParams({ ...keep, period: String(period.days) })}`;
          return (
            <li key={period.days}>
              <Link
                href={href as Route}
                scroll={false}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full px-4 font-semibold text-sm transition-colors",
                  selected ? "bg-card shadow-rest" : "text-ink-2 hover:text-foreground",
                )}
              >
                {period.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
