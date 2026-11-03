import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { type Tone, toneIcon } from "./tone";

/**
 * One figure with its label (parent dashboards, child summaries): icon in a tinted disc, the
 * label, the value large and tabular, an optional hint line. Never colour alone: the label
 * names what the number is.
 */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "teal",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3 rounded-xl bg-card p-4 shadow-rest", className)}>
      {Icon ? (
        <span
          className={cn("grid size-10 shrink-0 place-items-center rounded-full", toneIcon[tone])}
        >
          <Icon aria-hidden className="size-5" />
        </span>
      ) : null}
      <div className="grid min-w-0 gap-0.5">
        <p className="font-semibold text-muted-foreground text-sm">{label}</p>
        <p className="money truncate font-extrabold text-money-l">{value}</p>
        {hint ? <p className="text-muted-foreground text-sm">{hint}</p> : null}
      </div>
    </div>
  );
}

/** A tinted icon disc on its own (list rows, card titles). */
export function IconDisc({
  icon: Icon,
  tone = "teal",
  size = "md",
  className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const box = {
    sm: "size-8 [&_svg]:size-4",
    md: "size-10 [&_svg]:size-5",
    lg: "size-12 [&_svg]:size-6",
  }[size];
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full",
        box,
        toneIcon[tone],
        className,
      )}
    >
      <Icon aria-hidden />
    </span>
  );
}
