// Money helpers. Money is integer minor units end to end; parsing works on
// strings so no float ever touches a stored amount.

import { z } from "zod";

const DEFAULT_LOCALE = "en-GB";
const SYMBOL_LOCALES = ["en", "en-GB", "en-US", "en-IN", "en-AU", "en-CA", "ja-JP"];

/** Largest single amount Jarso records, in minor units; the database functions cap it too. */
export const MAX_AMOUNT_MINOR = 100_000_000_000;

/** Number of minor-unit digits for a currency (GBP 2, JPY 0). */
export function minorDigits(currency: string): number {
  return (
    new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

/** Minor units as a plain major-unit string for an input ("500", "5.50"). */
export function toMajorString(minor: number, currency: string): string {
  const digits = minorDigits(currency);
  return digits === 0 ? String(minor) : (minor / 10 ** digits).toFixed(digits);
}

/** Format minor units for display. `showMinor: "nonzero"` hides ".00" on whole amounts. */
export function formatMoney(
  minor: number,
  currency: string,
  opts: { showMinor?: "always" | "nonzero"; locale?: string } = {},
): string {
  const { showMinor = "always", locale = DEFAULT_LOCALE } = opts;
  const digits = minorDigits(currency);
  const factor = 10 ** digits;
  const whole = minor % factor === 0;
  const fractionDigits = showMinor === "nonzero" && whole ? 0 : digits;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(minor / factor);
}

const symbolCache = new Map<string, string[]>();

function currencySymbols(currency: string): string[] {
  const cached = symbolCache.get(currency);
  if (cached) return cached;
  const symbols = new Set<string>();
  for (const locale of SYMBOL_LOCALES) {
    for (const display of ["symbol", "narrowSymbol"] as const) {
      const part = new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        currencyDisplay: display,
      })
        .formatToParts(0)
        .find((p) => p.type === "currency");
      if (part) symbols.add(part.value);
    }
  }
  // Longest first so "A$" is removed before "$".
  const sorted = [...symbols].sort((a, b) => b.length - a.length);
  symbolCache.set(currency, sorted);
  return sorted;
}

/** Remove one currency symbol from the start or end of the text, never mid-string. */
function stripSymbol(text: string, currency: string): string {
  for (const symbol of currencySymbols(currency)) {
    if (text.startsWith(symbol)) return text.slice(symbol.length).trim();
    if (text.endsWith(symbol)) return text.slice(0, -symbol.length).trim();
  }
  return text;
}

// A comma is only ever a thousands separator; "5,50" is ambiguous and rejected.
const THOUSANDS = /^\d{1,3}(,\d{3})+(\.\d+)?$/;

/**
 * Parse a major-unit string ("5.50", "₹1,000") to minor units.
 * Returns null when invalid, negative, or more precise than the currency allows.
 */
export function parseMoney(input: string, currency: string): number | null {
  let text = stripSymbol(input.trim(), currency).replace(/[\s\u00a0\u202f]/g, "");
  if (text.includes(",")) {
    if (!THOUSANDS.test(text)) return null;
    text = text.replace(/,/g, "");
  }

  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return null;
  const [, whole, fraction = ""] = match;
  const digits = minorDigits(currency);
  if (fraction.length > digits) return null;

  const minor = Number(whole + fraction.padEnd(digits, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}

function moneyMessage(currency: string): string {
  return minorDigits(currency) > 0
    ? "Enter an amount like 5 or 5.50."
    : "Enter an amount like 500.";
}

/**
 * Zod schema for a major-unit money string -> minor units, with the family currency. Rejects
 * bad input, zero (unless `allowZero`) and anything above `MAX_AMOUNT_MINOR`. With `allowEmpty`,
 * a blank string gives null (a switched-off setting).
 */
export function moneySchema(
  currency: string,
  opts: { allowZero?: boolean; allowEmpty: true },
): z.ZodPipe<z.ZodString, z.ZodTransform<number | null, string>>;
export function moneySchema(
  currency: string,
  opts?: { allowZero?: boolean; allowEmpty?: false },
): z.ZodPipe<z.ZodString, z.ZodTransform<number, string>>;
export function moneySchema(
  currency: string,
  { allowZero = false, allowEmpty = false }: { allowZero?: boolean; allowEmpty?: boolean } = {},
) {
  const message = moneyMessage(currency);
  return z.string({ error: message }).transform((value, ctx): number | null => {
    if (allowEmpty && value.trim() === "") return null;
    const minor = parseMoney(value, currency);
    if (minor === null) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    if (minor === 0 && !allowZero) {
      ctx.addIssue({ code: "custom", message: "Enter an amount more than 0." });
      return z.NEVER;
    }
    // Above the database cap the function would refuse it with no field to point at.
    if (minor > MAX_AMOUNT_MINOR) {
      const max = formatMoney(MAX_AMOUNT_MINOR, currency, { showMinor: "nonzero" });
      ctx.addIssue({ code: "custom", message: `Enter an amount up to ${max}.` });
      return z.NEVER;
    }
    return minor;
  });
}
