// Money helpers. Money is integer minor units end to end; parsing works on
// strings so no float ever touches a stored amount.

const DEFAULT_LOCALE = "en-GB";
const SYMBOL_LOCALES = ["en", "en-GB", "en-US", "en-IN", "en-AU", "en-CA", "ja-JP"];

/** Number of minor-unit digits for a currency (GBP 2, JPY 0). */
export function minorDigits(currency: string): number {
  return (
    new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
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
