import { describe, expect, it } from "vitest";
import { paymentCopy } from "@/features/payments/copy";
import type { SavedCard } from "@/features/payments/types";

const card = { brand: "visa", last4: "4242" };
const saved = (provider: SavedCard["provider"]): SavedCard => ({ provider, label: provider, card });
const empty = (provider: SavedCard["provider"]): SavedCard => ({
  provider,
  label: provider,
  card: null,
});

describe("paymentCopy.savedCardTitle", () => {
  it("is singular for exactly one saved card, even with another provider listed", () => {
    expect(paymentCopy.savedCardTitle([saved("stripe"), empty("razorpay")])).toBe("Saved card");
  });

  it("is plural for several saved cards", () => {
    expect(paymentCopy.savedCardTitle([saved("stripe"), saved("razorpay")])).toBe("Saved cards");
  });

  it("is plural when no card is saved yet", () => {
    expect(paymentCopy.savedCardTitle([empty("stripe"), empty("razorpay")])).toBe("Saved cards");
  });
});
