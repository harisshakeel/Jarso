"use client";

import { GraduationCapIcon, HomeIcon, InboxIcon } from "lucide-react";
import { routes } from "@/config";
import { BottomNav, type BottomNavItem } from "./bottom-nav";

// Icons are components, which can't cross the server → client boundary, so the tabs live here.
// design.md §5: Home · Jars · Diary · Learn · Inbox; later slices add the rest as they ship.
const items: BottomNavItem[] = [
  { href: routes.child, label: "Home", icon: HomeIcon },
  { href: routes.childLearn, label: "Learn", icon: GraduationCapIcon },
  { href: routes.childInbox, label: "Inbox", icon: InboxIcon },
];

/** The child's tab bar. `unread` badges the Inbox tab. */
export function ChildNav({ unread }: { unread?: number }) {
  return (
    <BottomNav
      items={items.map((item) =>
        item.href === routes.childInbox ? { ...item, count: unread } : item,
      )}
      label="Child"
    />
  );
}
