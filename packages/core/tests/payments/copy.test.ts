import type { SavedCard } from "@jarso/core/payments";
import { paymentCopy } from "@jarso/core/payments";
import { describe, expect, it } from "vitest";

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

describe("paymentCopy for the phone's card sheet", () => {
  it("has the exact strings the phone shows", () => {
    expect(paymentCopy).toMatchObject({
      confirming: "Checking the payment…",
      stillConfirming: "Still confirming with the bank. The jars update as soon as it's through.",
      payAgain: "Pay again",
      cancelPayment: "Cancel card payment",
      cancelled: "Card payment cancelled.",
      fakeTitle: "Test card (dev build)",
      fakeDetail: "No card is charged. Pick what the card does.",
      fakePay: "Pay",
      fakeDecline: "Decline",
      fakeSaveOk: "Save a card that works",
      fakeSaveDecline: "Save a card that declines",
    });
  });
});
