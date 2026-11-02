"use client";

import { CalendarClockIcon, HomeIcon, InboxIcon, SettingsIcon, SparklesIcon } from "lucide-react";
import type { ReactNode } from "react";
import { routes } from "@/config";
import { BottomNav, type BottomNavItem } from "./bottom-nav";

// Icons are components, which can't cross the server → client boundary, so the tabs live here.
// design.md §5: Home · Allowance · Inbox, and Settings in the left rail only; on phones the header
// avatar opens it.
// Home stays lit on the child pages (/parent/children/…); Allowance is the deeper match on its tab.
const items: BottomNavItem[] = [
  { href: routes.parent, label: "Home", icon: HomeIcon },
  { href: routes.parentAllowanceOverview, label: "Allowance", icon: CalendarClockIcon },
  { href: routes.parentJarso, label: "Jarso", icon: SparklesIcon },
  { href: routes.parentInbox, label: "Inbox", icon: InboxIcon },
  { href: routes.parentSettings, label: "Settings", icon: SettingsIcon, railOnly: true },
];

/** The parent's tab bar. `unread` badges the Inbox tab. */
export function ParentNav({ unread, footer }: { unread?: number; footer?: ReactNode }) {
  return (
    <BottomNav
      items={items.map((item) =>
        item.href === routes.parentInbox ? { ...item, count: unread } : item,
      )}
      label="Parent"
      footer={footer}
    />
  );
}
