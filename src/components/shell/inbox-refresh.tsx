"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { routes } from "@/config";

const inboxPaths: string[] = [routes.childInbox, routes.parentInbox];

/** Whether a move from `previous` to `pathname` lands on an inbox page. */
export function enteredInbox(previous: string | null, pathname: string): boolean {
  return previous !== null && previous !== pathname && inboxPaths.includes(pathname);
}

/**
 * Keeps the Inbox tab count fresh. The count is read in the role layouts, which do not re-render
 * on client navigation, so refresh when the tab comes back to the front and when the user opens
 * the inbox. No polling. Offline it does nothing. Renders nothing.
 */
export function InboxRefresh() {
  const router = useRouter();
  const pathname = usePathname();
  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (enteredInbox(previous.current, pathname) && navigator.onLine !== false) router.refresh();
    previous.current = pathname;
  }, [pathname, router]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine !== false) router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);

  return null;
}
