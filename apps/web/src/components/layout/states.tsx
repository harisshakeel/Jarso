import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui";
import { type Tone, toneIcon } from "./tone";

/**
 * Empty state (design.md §6): art or an icon in a tinted disc, one short title, one line, one
 * action. Keeps the existing copy of whatever it replaces.
 */
export function EmptyState({
  icon: Icon,
  art,
  title,
  description,
  action,
  tone = "teal",
  className,
}: {
  icon?: LucideIcon;
  art?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid justify-items-center gap-3 rounded-xl border border-hairline-strong border-dashed px-6 py-10 text-center",
        className,
      )}
    >
      {art ??
        (Icon ? (
          <span className={cn("grid size-14 place-items-center rounded-full", toneIcon[tone])}>
            <Icon aria-hidden className="size-7" />
          </span>
        ) : null)}
      {title ? <p className="font-bold text-h3">{title}</p> : null}
      {description ? <div className="max-w-md text-pretty text-ink-2">{description}</div> : null}
      {action ? <div className="mt-2 flex flex-wrap justify-center gap-3">{action}</div> : null}
    </div>
  );
}

/** Loading placeholder for a page: a header bar and `blocks` card-sized shimmers. */
export function PageSkeleton({ blocks = 2, className }: { blocks?: number; className?: string }) {
  return (
    <div className={cn("grid gap-8", className)}>
      <div className="grid gap-3">
        <Skeleton className="h-4 w-24 rounded-full" />
        <Skeleton className="h-10 w-64 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: blocks }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders, never reordered.
          <Skeleton key={i} className="h-56" />
        ))}
      </div>
    </div>
  );
}
