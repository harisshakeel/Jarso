import { describe, expect, it } from "vitest";
import { stripeMinimumChargeMinor } from "@/lib/payments/stripe/currencies";

describe("stripeMinimumChargeMinor", () => {
  it("knows the supported currencies, any case", () => {
    expect(stripeMinimumChargeMinor("USD")).toBe(50);
    expect(stripeMinimumChargeMinor("gbp")).toBe(30);
    expect(stripeMinimumChargeMinor("EUR")).toBe(50);
    expect(stripeMinimumChargeMinor("INR")).toBe(50);
  });

  it("returns null for zero-decimal and unknown currencies", () => {
    expect(stripeMinimumChargeMinor("JPY")).toBeNull();
    expect(stripeMinimumChargeMinor("XYZ")).toBeNull();
  });
});
