"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { cn } from "@/lib";
import { EVERYONE, FILTER_KEY, filterHref } from "../hrefs";
import { SeriesDot } from "./series";

type ChildFilterProps = {
  /** The dashboard's own path, e.g. "/parent". */
  basePath: string;
  items: { id: string; nickname: string; slot: number }[];
  /** The child the page is about, or null for everyone. */
  current: string | null;
  /** The address named a choice (a child or "all"); without one, this device's last choice applies. */
  explicit: boolean;
  /** Other search params to keep, such as the period. */
  keep?: Record<string, string>;
};

function read(): string | null {
  try {
    return window.localStorage.getItem(FILTER_KEY);
  } catch {
    return null;
  }
}

function remember(value: string) {
  try {
    window.localStorage.setItem(FILTER_KEY, value);
  } catch {
    // Private windows and blocked storage: the filter still works, it just isn't remembered.
  }
}

/**
 * "Everyone" and one chip per child, re-scoping the whole dashboard (spec answer 2). The choice
 * lives in the address, so the server reads it; this device remembers the last one and brings
 * it back when the dashboard opens without a choice.
 */
export function ChildFilter({ basePath, items, current, explicit, keep = {} }: ChildFilterProps) {
  const router = useRouter();
  const ids = items.map((child) => child.id).join(",");

  // Runs once per address: `keep` is rebuilt every render, and its values are in that address.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keep's values are in the address
  useEffect(() => {
    if (explicit) return;
    const stored = read();
    if (stored && stored !== EVERYONE && ids.split(",").includes(stored)) {
      router.replace(filterHref(basePath, stored, keep), { scroll: false });
    }
  }, [explicit, ids, basePath, router]);

  if (items.length < 2) return null;
  const chip = (selected: boolean) =>
    cn(
      "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 font-semibold transition-colors",
      selected
        ? "border-primary bg-primary text-primary-foreground"
        : "border-hairline-strong bg-card hover:bg-muted",
    );
  return (
    <nav aria-label="Show money for">
      <ul className="flex flex-wrap gap-2">
        <li>
          <Link
            href={filterHref(basePath, EVERYONE, keep)}
            aria-current={current === null ? "true" : undefined}
            onClick={() => remember(EVERYONE)}
            scroll={false}
            className={chip(current === null)}
          >
            Everyone
          </Link>
        </li>
        {items.map((child) => (
          <li key={child.id}>
            <Link
              href={filterHref(basePath, child.id, keep)}
              aria-current={current === child.id ? "true" : undefined}
              onClick={() => remember(child.id)}
              scroll={false}
              className={chip(current === child.id)}
            >
              <SeriesDot slot={child.slot} className="ring-2 ring-card" />
              {child.nickname} <span className="sr-only">only</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
