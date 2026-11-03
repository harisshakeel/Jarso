"use client";

import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui";

export type BottomNavItem = {
  href: Route;
  label: string;
  icon: LucideIcon;
  /** Count badge (Inbox). Shown in full, never abbreviated. */
  count?: number;
  /**
   * Only in the left rail (from 1024 px), at its foot with the signed-in person (Settings);
   * phones reach it another way, so the bar stays four wide.
   */
  railOnly?: boolean;
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
 * Role-aware tab bar (design.md §5): fixed to the bottom on phones and tablets, a left rail
 * from 1024 px. The caller passes only the tabs that exist for the role.
 */
export function BottomNav({
  items,
  label = "Main",
  footer,
}: {
  items: BottomNavItem[];
  label?: string;
  /** Sits at the foot of the left rail (from 1024 px): the signed-in person. */
  footer?: ReactNode;
}) {
  const current = activeHref(usePathname(), items);
  return (
    <nav
      aria-label={label}
      data-slot="bottom-nav"
      className="fixed inset-x-0 bottom-0 z-40 border-hairline border-t bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-[16px] lg:top-14 lg:right-auto lg:flex lg:w-24 lg:flex-col lg:border-t-0 lg:border-r lg:pt-4 lg:pb-4"
    >
      <ul className="mx-auto flex h-16 max-w-xl items-stretch lg:h-auto lg:flex-col lg:gap-2">
        {items
          .filter((item) => !item.railOnly)
          .map((item) => (
            <NavTab key={item.href} item={item} active={item.href === current} />
          ))}
      </ul>
      {/* The rail's foot: Settings, then the signed-in person. */}
      <div className="mt-auto hidden lg:grid lg:gap-2">
        <ul className="grid gap-2">
          {items
            .filter((item) => item.railOnly)
            .map((item) => (
              <NavTab key={item.href} item={item} active={item.href === current} />
            ))}
        </ul>
        {footer ?? null}
      </div>
    </nav>
  );
}

function NavTab({ item, active }: { item: BottomNavItem; active: boolean }) {
  const { href, label, icon: Icon, count } = item;
  return (
    <li className="flex flex-1 lg:flex-none">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-xl font-semibold text-xs transition-colors lg:py-3",
          active ? "text-primary" : "text-muted-foreground hover:text-foreground",
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
