"use client";

import { cn } from "cn";
import { useId } from "react";
import { CategoryIcon } from "@/features/ledger";

type ChipOption = { key: string; label: string };

type CategoryChipsProps = {
  options: readonly ChipOption[];
  /** The chosen key, or null before anything is picked. */
  value: string | null;
  onChange: (key: string) => void;
  legend: string;
  /** Which list the options are from, for their icons. */
  kind: "purchase" | "received";
};

/**
 * "What was it for?" as a 3-column grid of chips (design.md §6). Native radios, so arrow keys
 * move the choice, Space picks and screen readers announce the group. The icon (the app's own
 * line icons, not emoji, since 2026-11-06) is decoration: the label names the chip. A hidden `category` input carries the key into the form.
 */
export function CategoryChips({ options, value, onChange, legend, kind }: CategoryChipsProps) {
  // The radios only group themselves; the hidden input is what the form posts.
  const group = useId();
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 font-semibold">{legend}</legend>
      <div className="grid grid-cols-3 gap-2">
        {options.map((option) => (
          <label key={option.key} className="relative cursor-pointer">
            <input
              type="radio"
              name={group}
              value={option.key}
              checked={value === option.key}
              onChange={() => onChange(option.key)}
              className="peer sr-only"
            />
            <span
              className={cn(
                "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg border border-hairline-strong px-1 py-2 text-center font-bold transition-colors hover:bg-muted",
                "peer-checked:border-transparent peer-checked:bg-secondary peer-checked:text-secondary-foreground",
                "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
              )}
            >
              <CategoryIcon category={option.key} kind={kind} className="size-6" />
              {option.label}
            </span>
          </label>
        ))}
      </div>
      <input type="hidden" name="category" value={value ?? ""} />
    </fieldset>
  );
}
