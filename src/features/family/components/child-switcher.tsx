import { cn } from "cn";
import type { Route } from "next";
import Link from "next/link";
import { routes } from "@/config";
import type { ChildSummary } from "../types";

type ChildSwitcherProps = { children: ChildSummary[]; activeChildId?: string };

/** In-page anchor to the child's row on the parent home. Later slices point this at /parent/[childId]. */
const childHref = (id: string) => `${routes.parent}#child-${id}` as Route;

/**
 * Pill tabs for picking one of the parent's children (spec D12). Selected chip uses the
 * secondary tokens (design.md §2.4), plus `aria-current` so colour is not the only signal.
 */
export function ChildSwitcher({ children, activeChildId }: ChildSwitcherProps) {
  return (
    <nav aria-label="Your children" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-2">
        {children.map((child) => {
          const active = child.id === activeChildId;
          return (
            <li key={child.id}>
              <Link
                href={childHref(child.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full border px-4 font-bold transition-colors",
                  active
                    ? "border-transparent bg-secondary text-secondary-foreground"
                    : "border-hairline-strong text-foreground hover:bg-muted",
                )}
              >
                {child.nickname}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
