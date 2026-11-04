"use client";

import { HomeIcon, InboxIcon, SparklesIcon, UsersIcon, WalletIcon } from "lucide-react";
import type { ReactNode } from "react";
import { routes } from "@/config";
import { BottomNav, type BottomNavItem } from "./bottom-nav";
import { NavBrand } from "./nav-brand";

// Icons are components, which can't cross the server → client boundary, so the tabs live here.
// design.md §5: Home · Children · Money · Jarso · Inbox. Settings is the person at the foot of
// the sidebar; on phones the header avatar opens it. Children stays lit on the child pages
// (/parent/children/…); Money (/parent/allowance) holds allowances, spending and activity. The
// parent area is calmer: one tone, Jarso keeps its grape.
const items: BottomNavItem[] = [
  { href: routes.parent, label: "Home", icon: HomeIcon },
  { href: routes.parentChildren, label: "Children", icon: UsersIcon },
  { href: routes.parentAllowanceOverview, label: "Money", icon: WalletIcon },
  { href: routes.parentJarso, label: "Jarso", icon: SparklesIcon, tone: "grape" },
  { href: routes.parentInbox, label: "Inbox", icon: InboxIcon },
];

/** The parent's navigation. `unread` badges the Inbox tab. */
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
