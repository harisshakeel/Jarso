import { describe, expect, it } from "vitest";
import { currencyForLocale } from "./currency";

describe("currencyForLocale", () => {
  it.each([
    ["en-GB", "GBP"],
    ["en-US", "USD"],
    ["hi-IN", "INR"],
    ["en-AU", "AUD"],
    ["fr-CA", "CAD"],
    ["ja-JP", "JPY"],
    ["de-DE", "EUR"],
    ["ja", "JPY"],
    ["pt-BR", "GBP"],
    ["", "GBP"],
    ["not a locale", "GBP"],
  ])("%s → %s", (locale, expected) => {
    expect(currencyForLocale(locale)).toBe(expected);
  });
});
