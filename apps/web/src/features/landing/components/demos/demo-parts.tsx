import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui";
import { cn, formatMoney } from "@/lib";

// Shared pieces for the demos (spec §3.2). Demos are pictures of the app, not the app: the
// markup inside is hidden from assistive tech and never focusable, and the figure's label says
// what the demo shows.

/** Demo amounts are whole pounds (spec §3: £ for the UK pilot). */
export const pounds = (value: number) =>
  formatMoney(Math.round(value) * 100, "GBP", { showMinor: "nonzero" });

/** Where `progress` (0 to 1) sits within one beat of a demo that runs from `from` to `to`. */
export const beat = (progress: number, from: number, to: number) =>
  Math.min(1, Math.max(0, (progress - from) / (to - from)));

/** The first part of `text`, as far as `t` (0 to 1) has typed it. */
export const typed = (text: string, t: number) =>
  text.slice(0, Math.round(Math.min(1, Math.max(0, t)) * text.length));

/** The line above a scroll-played demo: how to start, keep going, or what just happened. */
export const scrollHint = (progress: number, doneLine: string) =>
  progress >= 1 ? doneLine : progress > 0 ? "Keep scrolling." : "Scroll to play.";

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

/**
 * A demo the page plays as the visitor scrolls (How it works): a caption saying where it is, and
 * the picture below, drawn from a 0-to-1 progress the caller owns.
 */
export function ScrollStage({
  label,
  hint,
  done,
  children,
  className,
}: {
  label: string;
  hint: string;
  done: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure aria-label={label} className={cn("relative mx-auto w-full max-w-md", className)}>
      <figcaption
        className={cn(
          "mb-3 text-center font-semibold",
          done ? "text-teal-800 dark:text-teal-100" : "text-ink-2",
        )}
      >
        {hint}
      </figcaption>
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

/** A text field picture: its label, what has been typed so far, and a caret while typing. */
export function FieldPicture({
  label,
  value,
  typing,
  className,
}: {
  label: string;
  value: string;
  typing: boolean;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <span className="font-semibold text-sm">{label}</span>
      <span
        className={cn(
          "flex h-11 items-center rounded-xl border bg-card px-3 font-medium",
          typing ? "border-primary ring-2 ring-ring/30" : "border-hairline-strong",
        )}
      >
        {value}
        {typing ? (
          <span className="ml-px inline-block h-5 w-0.5 bg-foreground motion-safe:animate-[caret_1s_steps(1)_infinite]" />
        ) : null}
      </span>
    </div>
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
