import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { JarsoMark } from "@/components/brand";
import { ThemeSwitch } from "@/components/theme";
import { siteConfig } from "@/config";

type AppHeaderProps = {
  /** Where the mark links to (the signed-in user's home). */
  homeHref: Route;
  /** Optional action on the right (design.md §5), e.g. sign out; the theme switch always sits beside it. */
  action?: ReactNode;
};

/** Sticky 56 px header: mark plus name on the left, one action on the right (design.md §4, §5). */
export function AppHeader({ homeHref, action }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-hairline border-b bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-[16px]">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href={homeHref}
          className="-mx-2 flex min-h-11 items-center gap-2 rounded-full px-2 font-extrabold text-h3 text-primary"
        >
          <JarsoMark size={32} priority />
          {siteConfig.name}
        </Link>
        <div className="flex items-center gap-1">
          <ThemeSwitch />
          {action}
        </div>
      </div>
    </header>
  );
}
