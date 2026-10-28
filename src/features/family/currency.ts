import { supportedCurrencies } from "@/config";

export type Currency = (typeof supportedCurrencies)[number];

export const DEFAULT_CURRENCY: Currency = "GBP";

/** Names shown in the currency picker. Static so server and browser render the same text. */
export const currencyLabels: Record<Currency, string> = {
  GBP: "British pound (£)",
  EUR: "Euro (€)",
  USD: "US dollar ($)",
  INR: "Indian rupee (₹)",
  AUD: "Australian dollar (A$)",
  CAD: "Canadian dollar (CA$)",
  JPY: "Japanese yen (¥)",
};

const euroRegions = new Set([
  "AT",
  "BE",
  "CY",
  "DE",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HR",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PT",
  "SI",
  "SK",
]);

const regionCurrency: Record<string, Currency> = {
  GB: "GBP",
  US: "USD",
  IN: "INR",
  AU: "AUD",
  CA: "CAD",
  JP: "JPY",
};

/** Best-guess currency for a BCP 47 locale (e.g. `navigator.language`); GBP when unknown. */
export function currencyForLocale(locale: string): Currency {
  try {
    const region = new Intl.Locale(locale).maximize().region;
    if (!region) return DEFAULT_CURRENCY;
    if (euroRegions.has(region)) return "EUR";
    return regionCurrency[region] ?? DEFAULT_CURRENCY;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

export function isCurrency(value: unknown): value is Currency {
  return (supportedCurrencies as readonly unknown[]).includes(value);
}
