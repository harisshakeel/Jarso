"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";

export type PageTab = { value: string; label: string; content: ReactNode };

type PageTabsProps = {
  tabs: PageTab[];
  /** The open tab on load, from the page's `?tab=` (validated by the page). */
  defaultValue: string;
  label: string;
};

/**
 * Splits a long page into a few tabs above their panel. The open tab is kept in `?tab=` with
 * history.replaceState, so a reload or a shared link reopens it without a server round trip.
 * Panels are rendered by the server and passed in; only the open one is mounted.
 */
export function PageTabs({ tabs, defaultValue, label }: PageTabsProps) {
  return (
    <Tabs
      defaultValue={defaultValue}
      onValueChange={(value) => {
        const url = new URL(window.location.href);
        url.searchParams.set("tab", String(value));
        window.history.replaceState(null, "", url);
      }}
      className="gap-6"
    >
      <TabsList aria-label={label} className="w-full rounded-full group-data-horizontal/tabs:h-11">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className="rounded-full font-semibold text-ink-2 dark:text-ink-2"
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="grid gap-6 text-base">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
