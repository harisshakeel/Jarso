import type { CapPeriod } from "./types";

/** Offset (ms) of a time zone from UTC at an instant. */
function offsetAt(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** The UTC instant of local midnight on a calendar day in a time zone. */
function localMidnight(year: number, month: number, day: number, timeZone: string): number {
  const guess = Date.UTC(year, month, day);
  const first = guess - offsetAt(guess, timeZone);
  return guess - offsetAt(first, timeZone);
}

/**
 * Start of the ISO week (Monday) or calendar month containing `now`, in the family's time zone,
 * as an ISO instant. Mirrors the database's `rule_window_start`. Null for `item`.
 */
export function windowStart(period: CapPeriod, timeZone: string, now: Date): string | null {
  if (period === "item") return null;
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(now)
    .split("-")
    .map(Number) as [number, number, number];
  const [year, month, day] = local;
  if (period === "month")
    return new Date(localMidnight(year, month - 1, 1, timeZone)).toISOString();
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
  const sinceMonday = (weekday + 6) % 7;
  return new Date(localMidnight(year, month - 1, day - sinceMonday, timeZone)).toISOString();
}
