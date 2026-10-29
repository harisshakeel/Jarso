"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui";

const options = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
] as const;

const subscribe = () => () => {};
/** False on the server and during hydration, true afterwards (the theme is unknown until then). */
const useMounted = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

/** Light / Dark / System choice for the header (design.md §12). Icon button opening a radio menu. */
export function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const current = options.find((option) => option.value === theme) ?? options[2];
  const Icon = mounted ? current.icon : SunIcon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            data-slot="theme-switch"
            aria-label={mounted ? `Theme: ${current.label}` : "Theme"}
          />
        }
      >
        {/* Same size icon before and after mount, so nothing shifts. */}
        <Icon aria-hidden className={mounted ? undefined : "invisible"} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuRadioGroup value={current.value} onValueChange={(value) => setTheme(value)}>
          {options.map(({ value, label, icon: OptionIcon }) => (
            <DropdownMenuRadioItem key={value} value={value} className="min-h-11 text-base">
              <OptionIcon aria-hidden />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
