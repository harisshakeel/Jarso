import { cn } from "cn";
import type * as React from "react";

/** Loading block: surface-2 with the shimmer band (design.md §6, §8). Decorative. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("shimmer rounded-xl bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
