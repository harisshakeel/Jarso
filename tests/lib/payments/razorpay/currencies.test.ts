import { describe, expect, it } from "vitest";
import { razorpayMinimumChargeMinor } from "@/lib/payments/razorpay/currencies";

describe("razorpayMinimumChargeMinor", () => {
  it("charges INR from 100 paise, any case", () => {
    expect(razorpayMinimumChargeMinor("INR")).toBe(100);
    expect(razorpayMinimumChargeMinor("inr")).toBe(100);
  });

  it("returns null for every other currency", () => {
    expect(razorpayMinimumChargeMinor("GBP")).toBeNull();
    expect(razorpayMinimumChargeMinor("USD")).toBeNull();
    expect(razorpayMinimumChargeMinor("XYZ")).toBeNull();
  });
});
