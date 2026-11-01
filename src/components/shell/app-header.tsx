import { SettingsIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { JarsoMark } from "@/components/brand";
import { buttonVariants } from "@/components/ui";
import { routes, siteConfig } from "@/config";

type AppHeaderProps = {
  /** Where the mark links to (the signed-in user's home). */
  homeHref: Route;
};

/**
 * Sticky 56 px header: mark plus name on the left, the settings link on the right (design.md §4,
 * §5). Sign out and the theme switch live in Settings, so a child never has a destructive
 * button a thumb away from Home.
 */
export function AppHeader({ homeHref }: AppHeaderProps) {
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
        <Link
          href={routes.settings}
          className={buttonVariants({ variant: "ghost", size: "icon" })}
          aria-label="Settings"
        >
          <SettingsIcon aria-hidden />
        </Link>
      </div>
    </header>
  );
}
