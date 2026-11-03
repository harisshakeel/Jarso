"use client";

import { cn } from "cn";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * The signed-in person at the foot of the sidebar, as a link to their settings page. It is the
 * only way to that page from the sidebar, so it lights up like a tab while the page is open.
 */
export function RailLink({
  href,
  label,
  className,
  children,
}: {
  href: Route;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const active = usePathname().startsWith(href);
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(className, active && "bg-muted text-foreground")}
    >
      {children}
    </Link>
  );
}
