import { minorDigits } from "@/lib";
import type { Frequency, Split } from "./types";

const DEFAULT_LOCALE = "en-GB";
const ordinalRules = new Intl.PluralRules("en", { type: "ordinal" });
const ordinalSuffix: Record<string, string> = { one: "st", two: "nd", few: "rd", other: "th" };

/** `YYYY-MM-DD` as a UTC midnight Date, so formatting never shifts the day. */
function utcDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}

function format(date: Date, locale: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(date);
}

function ordinal(n: number): string {
  return `${n}${ordinalSuffix[ordinalRules.select(n)] ?? "th"}`;
}

/** `YYYY-MM-DD` as "2 Nov". */
export function formatDay(isoDate: string, locale: string = DEFAULT_LOCALE): string {
  return format(utcDate(isoDate), locale, { day: "numeric", month: "short" });
}

/** Minor units as a plain major-unit string for an input ("500", "5.50"). */
export function toMajorString(minor: number, currency: string): string {
  const digits = minorDigits(currency);
  return digits === 0 ? String(minor) : (minor / 10 ** digits).toFixed(digits);
}

/** Summary line under the date field: "Every Sunday from 2 Nov". */
export function describeSchedule(
  frequency: Frequency,
  firstOn: string,
  locale: string = DEFAULT_LOCALE,
): string {
  const date = utcDate(firstOn);
  const from = `from ${format(date, locale, { day: "numeric", month: "short" })}`;
  switch (frequency) {
    case "weekly":
      return `Every ${format(date, locale, { weekday: "long" })} ${from}`;
    case "monthly":
      return `Every month on the ${ordinal(date.getUTCDate())} ${from}`;
    case "quarterly":
      return `Every 3 months ${from}`;
    case "annual":
      return `Every year ${from}`;
  }
}

/**
 * Handover prefill: the save share of the last handover applied to this amount, saved rounded
 * down to a whole minor unit and Spend getting the rest. The first handover is all Spend.
 */
export function prefillSplit(amountMinor: number, last: Split | null): Split {
  const total = last ? last.cash + last.saved : 0;
  if (!last || total <= 0) return { cash: amountMinor, saved: 0 };
  // BigInt keeps the product exact for any safe-integer amounts.
  const saved = Number((BigInt(amountMinor) * BigInt(last.saved)) / BigInt(total));
  return { cash: amountMinor - saved, saved };
}
