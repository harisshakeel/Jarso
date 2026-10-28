import { cn } from "cn";
import {
  CheckIcon,
  CircleCheckIcon,
  ClockIcon,
  GraduationCapIcon,
  HourglassIcon,
  LockIcon,
  type LucideIcon,
  XIcon,
} from "lucide-react";

/** Status treatments from design.md §2.5. Colour is never the only signal: every chip has an icon and a word. */
const statuses = {
  due: {
    icon: ClockIcon,
    label: "Due",
    className: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300",
  },
  pending: {
    icon: HourglassIcon,
    label: "Waiting",
    className: "bg-muted text-ink-2",
  },
  approved: {
    icon: CheckIcon,
    label: "Said yes",
    className: "bg-cyan-100 text-teal-800 dark:bg-cyan-900 dark:text-teal-100",
  },
  handedOver: {
    icon: CircleCheckIcon,
    label: "Handed over",
    className: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-100",
  },
  reserved: {
    icon: LockIcon,
    label: "Reserved",
    className:
      "border-dashed border-gold-700 bg-gold-100 text-gold-700 dark:border-gold dark:bg-gold-900 dark:text-gold",
  },
  closed: {
    icon: XIcon,
    label: "Closed",
    className: "bg-muted text-muted-foreground",
  },
  practice: {
    icon: GraduationCapIcon,
    label: "Practice",
    className: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300",
  },
} satisfies Record<string, { icon: LucideIcon; label: string; className: string }>;

export type ChipStatus = keyof typeof statuses;

type StatusChipProps = {
  status: ChipStatus;
  /** Overrides the default word, e.g. "Due Friday". Keep it short. */
  label?: string;
  className?: string;
};

export function StatusChip({ status, label, className }: StatusChipProps) {
  const { icon: Icon, label: fallback, className: tone } = statuses[status];
  return (
    <span
      data-slot="status-chip"
      data-status={status}
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-full border border-transparent px-2.5 font-semibold text-xs whitespace-nowrap",
        tone,
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" strokeWidth={2.25} />
      {label ?? fallback}
    </span>
  );
}
