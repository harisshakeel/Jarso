import type { Route } from "next";

/** Where this device remembers the parent's last filter choice (a convenience only). */
export const FILTER_KEY = "jarso:dashboard-child";
/** The `child` value for "Everyone" picked on purpose, so a remembered child doesn't come back. */
export const EVERYONE = "all";

/** The dashboard's address for a filter choice (a child id or "all"), keeping the other params. */
export function filterHref(
  basePath: string,
  child: string,
  keep: Record<string, string> = {},
): Route {
  const params = new URLSearchParams({ ...keep, child });
  return `${basePath}?${params.toString()}` as Route;
}
