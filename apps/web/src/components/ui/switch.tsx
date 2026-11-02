"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "cn";

/** On/off toggle on Base UI. Give it an `aria-label` or a wrapping label. */
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-transparent bg-muted-foreground/50 p-0.5 transition-colors after:absolute after:-inset-2 disabled:cursor-not-allowed disabled:opacity-50 data-checked:bg-primary",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="block size-5 rounded-full bg-white shadow-sm transition-transform data-checked:translate-x-5"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
