import { describe, expect, it } from "vitest";
import { jarCapacity } from "./jar-scale";

describe("jarCapacity", () => {
  it("is the biggest of the balances and four allowances", () => {
    expect(
      jarCapacity({ spendMinor: 800, saveMinor: 3100, allowanceMinor: 500, currency: "GBP" }),
    ).toBe(3100);
    expect(
      jarCapacity({ spendMinor: 800, saveMinor: 900, allowanceMinor: 500, currency: "GBP" }),
    ).toBe(2000);
  });

  it("falls back to 20 major units when there is nothing yet", () => {
    expect(
      jarCapacity({ spendMinor: 0, saveMinor: 0, allowanceMinor: null, currency: "GBP" }),
    ).toBe(2000);
    expect(jarCapacity({ spendMinor: 0, saveMinor: 0, allowanceMinor: 0, currency: "GBP" })).toBe(
      2000,
    );
  });

  it("uses the currency's own minor digits", () => {
    expect(
      jarCapacity({ spendMinor: 0, saveMinor: 0, allowanceMinor: null, currency: "JPY" }),
    ).toBe(20);
  });
});
