"use client";

import { BellIcon, HomeIcon, SparklesIcon, UsersIcon, WalletIcon } from "lucide-react";
import type { ReactNode } from "react";
import { routes } from "@/config";
import { BottomNav, type BottomNavItem } from "./bottom-nav";
import { NavBrand } from "./nav-brand";

// Icons are components, which can't cross the server → client boundary, so the tabs live here.
// design.md §5: Home · Children · Money · Jarso · Notifications (Inbox until 2026-11-04, which
// now also holds the family's recent activity). Settings is the person at the foot of the
// sidebar; on phones the header avatar opens it. Children stays lit on the child pages
// (/parent/children/…); Money (/parent/allowance) holds allowances and spending. The
// parent area is calmer: one tone, Jarso keeps its grape.
const items: BottomNavItem[] = [
  { href: routes.parent, label: "Home", icon: HomeIcon },
  { href: routes.parentChildren, label: "Children", icon: UsersIcon },
  { href: routes.parentAllowanceOverview, label: "Money", icon: WalletIcon },
  { href: routes.parentJarso, label: "Jarso", icon: SparklesIcon, tone: "grape" },
  { href: routes.parentInbox, label: "Notifications", icon: BellIcon },
];

/** The parent's navigation. `unread` badges the Notifications tab. */
export function ParentNav({ unread, footer }: { unread?: number; footer?: ReactNode }) {
  return (
    <BottomNav
      items={items.map((item) =>
        item.href === routes.parentInbox ? { ...item, count: unread } : item,
      )}
      label="Parent"
      outside={[routes.parentSettings]}
      brand={<NavBrand href={routes.parent} tag="Grown-ups" />}
      footer={footer}
    />
  );
}
