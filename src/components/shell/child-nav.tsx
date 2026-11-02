"use client";

import {
  GraduationCapIcon,
  HomeIcon,
  InboxIcon,
  NotebookPenIcon,
  SettingsIcon,
  SparklesIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { routes } from "@/config";
import { BottomNav, type BottomNavItem } from "./bottom-nav";

// Icons are components, which can't cross the server → client boundary, so the tabs live here.
// design.md §5: Home · Diary · Learn · Jarso · News, and Me (settings) in the left rail only; on phones the
// header avatar opens it. Home is the jars, so there is no Jars tab.
const items: BottomNavItem[] = [
  { href: routes.child, label: "Home", icon: HomeIcon },
  { href: routes.childDiary, label: "Diary", icon: NotebookPenIcon },
  { href: routes.childLearn, label: "Learn", icon: GraduationCapIcon },
  { href: routes.childJarso, label: "Jarso", icon: SparklesIcon },
  { href: routes.childInbox, label: "News", icon: InboxIcon },
  { href: routes.childSettings, label: "Me", icon: SettingsIcon, railOnly: true },
];

/** The child's tab bar. `unread` badges the News tab. */
export function ChildNav({ unread, footer }: { unread?: number; footer?: ReactNode }) {
  return (
    <BottomNav
      items={items.map((item) =>
        item.href === routes.childInbox ? { ...item, count: unread } : item,
      )}
      label="Child"
      footer={footer}
    />
  );
}
