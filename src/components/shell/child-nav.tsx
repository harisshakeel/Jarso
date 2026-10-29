"use client";

import { HomeIcon } from "lucide-react";
import { routes } from "@/config";
import { BottomNav, type BottomNavItem } from "./bottom-nav";

// Icons are components, which can't cross the server → client boundary, so the tabs live here.
// design.md §5: Home · Jars · Diary · Learn · Inbox; later slices add the rest as they ship.
const items: BottomNavItem[] = [{ href: routes.child, label: "Home", icon: HomeIcon }];

/** The child's tab bar. */
export function ChildNav() {
  return <BottomNav items={items} label="Child" />;
}
