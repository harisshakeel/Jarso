"use client";

import { MonitorSmartphoneIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const useMounted = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

const choices = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "Same as my phone", icon: MonitorSmartphoneIcon },
] as const;

/**
 * Three big chips for Settings (design.md §12): light, dark, or follow the device. Native radios,
 * like ChoiceChips, so arrow keys move the choice and screen readers announce the group.
 */
export function ThemeChoice() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  // The server can't know the theme; until mount nothing is drawn as chosen.
  const current = mounted ? (theme ?? "system") : null;
  return (
    <fieldset className="grid gap-2">
      <legend className="sr-only">Looks</legend>
      <div className="flex flex-wrap gap-2">
        {choices.map(({ value, label, icon: Icon }) => (
          <label key={value} className="relative cursor-pointer">
            <input
              type="radio"
              name="theme"
              value={value}
              checked={current === value}
              onChange={() => setTheme(value)}
              className="peer sr-only"
            />
            <span className="inline-flex h-11 items-center gap-2 rounded-full border border-hairline-strong bg-card px-4 font-bold transition-colors hover:bg-muted peer-checked:border-transparent peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring">
              <Icon aria-hidden className="size-5" />
              {label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
