import { describe, expect, it } from "vitest";
import { isPaymentProviderId, PAYMENT_PROVIDER_IDS } from "@/lib/payments/types";

describe("payment provider ids", () => {
  it("lists every provider in display order", () => {
    expect(PAYMENT_PROVIDER_IDS).toEqual(["stripe", "razorpay", "fake"]);
  });

  it("recognises known ids only", () => {
    for (const id of PAYMENT_PROVIDER_IDS) expect(isPaymentProviderId(id)).toBe(true);
    expect(isPaymentProviderId("paypal")).toBe(false);
    expect(isPaymentProviderId("Stripe")).toBe(false);
    expect(isPaymentProviderId("")).toBe(false);
  });
});
