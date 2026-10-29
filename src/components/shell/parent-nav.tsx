"use client";

import { HomeIcon } from "lucide-react";
import { routes } from "@/config";
import { BottomNav, type BottomNavItem } from "./bottom-nav";

// Icons are components, which can't cross the server → client boundary, so the tabs live here.
// design.md §5: Home · Requests · Allowance · Inbox; later slices add the rest as they ship.
const items: BottomNavItem[] = [{ href: routes.parent, label: "Home", icon: HomeIcon }];

/** The parent's tab bar. */
export function ParentNav() {
  return <BottomNav items={items} label="Parent" />;
}
