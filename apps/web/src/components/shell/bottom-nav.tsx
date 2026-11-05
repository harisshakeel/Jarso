"use client";

import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { type Tone, toneActive } from "@/components/layout";
import { Badge } from "@/components/ui";

export type BottomNavItem = {
  href: Route;
  label: string;
  icon: LucideIcon;
  /** Section colour of the active pill (design.md §2.7). Defaults to teal. */
  tone?: Tone;
  /** Count badge (Inbox). Shown in full, never abbreviated. */
  count?: number;
  /**
   * Only in the sidebar (from 768 px), at its foot just above the signed-in person; phones reach
   * it another way, so the bar stays five wide.
   */
  railOnly?: boolean;
  /** What the welcome tour calls this tab (`data-tour`), so it can glow. */
  tour?: string;
};

const matches = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

/** The deepest tab containing the current path, so Home (/child) is not lit on /child/inbox. */
function activeHref(pathname: string, items: BottomNavItem[]) {
  return items
    .filter((item) => matches(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

/**
 * The app's one navigation (design.md §5), role-aware: a bottom tab bar on phones, a left sidebar
 * from 768 px (icons over labels), widening to icon-and-label rows from 1024 px. The current
 * section is a tinted pill in its own colour, so "where am I" never relies on colour alone: the
 * pill, the filled icon and `aria-current` all say it. The caller passes only the role's tabs.
 */
export function BottomNav({
  items,
  label = "Main",
  outside = [],
  brand,
  footer,
}: {
  items: BottomNavItem[];
  label?: string;
  /** Pages no tab owns (settings, reached from the footer): no tab lights up on them. */
  outside?: Route[];
  /** Sits at the top of the sidebar (from 768 px): the mark, linking home. */
  brand?: ReactNode;
  /** Sits at the foot of the sidebar (from 768 px): the signed-in person. */
  footer?: ReactNode;
}) {
  const pathname = usePathname();
  const current = outside.some((href) => matches(pathname, href))
    ? undefined
    : activeHref(pathname, items);
  const tabs = items.filter((item) => !item.railOnly);
  const railOnly = items.filter((item) => item.railOnly);
  return (
    // The sidebar box exists from 768 px; below that it dissolves and the nav is the bottom bar.
    // The brand sits outside <nav> so the nav's links are only the tabs.
    <div className="contents md:fixed md:inset-y-0 md:left-0 md:z-40 md:flex md:w-24 md:flex-col md:border-hairline md:border-r md:bg-card md:px-2 md:py-5 lg:w-64 lg:px-4">
      {brand ? <div className="hidden md:mb-6 md:block">{brand}</div> : null}
      <nav
        aria-label={label}
        data-slot="bottom-nav"
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-hairline border-t bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-[16px]",
          "md:static md:flex md:flex-1 md:flex-col md:border-t-0 md:bg-transparent md:pb-0 md:backdrop-blur-none",
        )}
      >
        <ul className="mx-auto flex h-16 max-w-xl items-stretch gap-1 px-1 md:mx-0 md:h-auto md:max-w-none md:flex-col md:px-0">
          {tabs.map((item) => (
            <NavTab key={item.href} item={item} active={item.href === current} />
          ))}
        </ul>
        {/* The sidebar's foot: rail-only tabs, then the signed-in person. */}
        {railOnly.length > 0 || footer ? (
          <div className="mt-auto hidden pt-4 md:grid md:gap-1">
            {railOnly.length > 0 ? (
              <ul className="grid gap-1">
                {railOnly.map((item) => (
                  <NavTab key={item.href} item={item} active={item.href === current} />
                ))}
              </ul>
            ) : null}
            {footer ?? null}
          </div>
        ) : null}
      </nav>
    </div>
  );
}

function NavTab({ item, active }: { item: BottomNavItem; active: boolean }) {
  const { href, label, icon: Icon, count, tone = "teal", tour } = item;
  return (
    <li className="flex flex-1 md:flex-none">
      <Link
        href={href}
        data-tour={tour}
        aria-current={active ? "page" : undefined}
        className={cn(
          "my-1.5 flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-2xl font-semibold text-xs transition-colors",
          "md:my-0 md:py-2.5 md:text-sm",
          "lg:min-h-12 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-base",
          active
            ? cn(toneActive[tone], "font-bold")
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <span className="relative">
          <Icon
            aria-hidden
            className="size-6"
            fill={active ? "currentColor" : "none"}
            fillOpacity={active ? 0.18 : undefined}
          />
          {count ? (
            <Badge variant="count" className="absolute -top-1.5 -right-3">
              {count.toLocaleString("en")}
              <span className="sr-only"> new</span>
            </Badge>
          ) : null}
        </span>
        {label}
      </Link>
    </li>
  );
}
