import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui";
import { cn, formatMoney } from "@/lib";

// Shared pieces for the live demos (spec §3.2). Demos are pictures of the app, not the app: the
// markup inside is hidden from assistive tech and never focusable, and the figure's label says
// what the demo shows.

/** Demo amounts are whole pounds (spec §3: £ for the UK pilot). */
export const pounds = (value: number) =>
  formatMoney(Math.round(value) * 100, "GBP", { showMinor: "nonzero" });

export function DemoStage({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure aria-label={label} className={cn("relative mx-auto w-full max-w-md", className)}>
      <div aria-hidden className="pointer-events-none grid select-none gap-3">
        {children}
      </div>
    </figure>
  );
}

/** A card as the app draws it, without Card's overflow clipping so chips can float over edges. */
export function DemoCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl bg-card p-4 shadow-raised sm:p-5", className)}>{children}</div>
  );
}

/** A keycap button picture; `pressed` drops the ledge and moves it 2 px down (design.md §6). */
export function KeycapPicture({
  children,
  pressed,
  gold = false,
  className,
}: {
  children: ReactNode;
  pressed: boolean;
  gold?: boolean;
  className?: string;
}) {
  return (
    <span
      style={pressed ? { boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.5)" } : undefined}
      className={cn(
        buttonVariants({ variant: gold ? "keycap-gold" : "keycap", size: "lg" }),
        pressed && "translate-y-0.5",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A label floating over a card's edge, popping in at `shown` (0 to 1, eased by the caller). */
export function FloatingChip({
  shown,
  children,
  className,
}: {
  shown: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      style={{ opacity: Math.min(1, shown), scale: `${0.6 + 0.4 * shown}` }}
      className={cn(
        "absolute z-10 inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 font-bold text-sm shadow-raised",
        className,
      )}
    >
      {children}
    </span>
  );
}
