"use client";

import {
  GraduationCapIcon,
  HomeIcon,
  InboxIcon,
  NotebookPenIcon,
  SparklesIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { routes } from "@/config";
import { BottomNav, type BottomNavItem } from "./bottom-nav";
import { NavBrand } from "./nav-brand";

// Icons are components, which can't cross the server → client boundary, so the tabs live here.
// design.md §5: Home · Diary · Learn · Jarso · News. Me (settings) is the person at the foot of
// the sidebar; on phones the header avatar opens it. Home is the jars, so there is no Jars tab. Each tab has its
// section colour (design.md §2.7).
const items: BottomNavItem[] = [
  { href: routes.child, label: "Home", icon: HomeIcon, tone: "teal" },
  { href: routes.childDiary, label: "Diary", icon: NotebookPenIcon, tone: "gold" },
  { href: routes.childLearn, label: "Learn", icon: GraduationCapIcon, tone: "cyan" },
  { href: routes.childJarso, label: "Jarso", icon: SparklesIcon, tone: "grape" },
  { href: routes.childInbox, label: "News", icon: InboxIcon, tone: "teal" },
];

/** The child's navigation. `unread` badges the News tab. */
export function ChildNav({ unread, footer }: { unread?: number; footer?: ReactNode }) {
  return (
    <BottomNav
      items={items.map((item) =>
        item.href === routes.childInbox ? { ...item, count: unread } : item,
      )}
      label="Child"
      outside={[routes.childSettings]}
      brand={<NavBrand href={routes.child} />}
      footer={footer}
    />
  );
}
