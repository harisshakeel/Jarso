"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui";

const subscribe = () => () => {};
/** False on the server and during hydration, true afterwards (the theme is unknown until then). */
const useMounted = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

/**
 * One-click light/dark toggle for the header (design.md §12). The first visit follows the
 * device; after that the last choice sticks. The icon shows the current theme.
 */
export function ThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const isDark = resolvedTheme === "dark";
  const next = isDark ? "light" : "dark";
  // The server can't know the theme, so the icon waits for mount too: picking it from
  // `resolvedTheme` during hydration rendered a moon where the server sent a sun.
  const Icon = mounted && isDark ? MoonIcon : SunIcon;

  return (
    <Button
      variant="ghost"
      size="icon"
      data-slot="theme-switch"
      aria-label={mounted ? `Switch to ${next} theme` : "Theme"}
      onClick={() => setTheme(next)}
    >
      {/* Same size icon before and after mount, so nothing shifts. */}
      <Icon aria-hidden className={mounted ? undefined : "invisible"} />
    </Button>
  );
}
