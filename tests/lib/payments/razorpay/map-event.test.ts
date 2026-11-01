// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  isLiveModeEvent,
  mapRazorpayEvent,
  mapRazorpayFailureCode,
  type RazorpayEvent,
} from "@/lib/payments/razorpay/map-event";
import paymentLinkCancelled from "./fixtures/payment-link-cancelled.json";
import paymentLinkExpired from "./fixtures/payment-link-expired.json";
import paymentLinkPaid from "./fixtures/payment-link-paid.json";

const asEvent = (fixture: unknown) => structuredClone(fixture) as RazorpayEvent;

describe("mapRazorpayEvent", () => {
  it("maps payment_link.paid to a succeeded payment", () => {
    expect(mapRazorpayEvent(asEvent(paymentLinkPaid), "evt_1")).toEqual({
      kind: "payment",
      eventId: "evt_1",
      paymentId: "pay-1",
      providerRef: "plink_TEST123",
      status: "succeeded",
    });
  });

  it("maps payment_link.expired to an expired payment", () => {
    expect(mapRazorpayEvent(asEvent(paymentLinkExpired), "evt_2")).toEqual({
      kind: "payment",
      eventId: "evt_2",
      paymentId: "pay-1",
      providerRef: "plink_TEST123",
      status: "expired",
    });
  });

  it("maps payment_link.cancelled to a canceled payment", () => {
    expect(mapRazorpayEvent(asEvent(paymentLinkCancelled), "evt_3")).toEqual({
      kind: "payment",
      eventId: "evt_3",
      paymentId: "pay-1",
      providerRef: "plink_TEST123",
      status: "canceled",
    });
  });

  it("accepts notes sent as an empty array", () => {
    const event = asEvent(paymentLinkPaid);
    expect(event.payload.payment_link?.entity.notes).toEqual([]);
    expect(mapRazorpayEvent(event, "evt_1")).toMatchObject({ status: "succeeded" });
  });

  it("ignores a payment link without a reference id", () => {
    const event = asEvent(paymentLinkPaid);
    const link = event.payload.payment_link?.entity;
    if (link) link.reference_id = null;
    expect(mapRazorpayEvent(event, "evt_1")).toBeNull();
  });

  it("ignores a payment_link event without a payment link entity", () => {
    const event = asEvent(paymentLinkExpired);
    event.payload = {};
    expect(mapRazorpayEvent(event, "evt_1")).toBeNull();
  });

  it("ignores events it does not act on", () => {
    expect(
      mapRazorpayEvent({ ...asEvent(paymentLinkPaid), event: "payment_link.partially_paid" }, "e"),
    ).toBeNull();
    expect(
      mapRazorpayEvent({ ...asEvent(paymentLinkPaid), event: "refund.created" }, "e"),
    ).toBeNull();
  });
});

describe("isLiveModeEvent", () => {
  it("is false for a test-mode order", () => {
    expect(isLiveModeEvent(asEvent(paymentLinkPaid))).toBe(false);
  });

  it("is true when the order's public key is a live key", () => {
    const event = asEvent(paymentLinkPaid);
    const order = event.payload.order?.entity;
    if (order) order.public_key = "rzp_live_XXXXXXXXXXXXXX";
    expect(isLiveModeEvent(event)).toBe(true);
  });

  it("is false when the event carries no order", () => {
    expect(isLiveModeEvent(asEvent(paymentLinkExpired))).toBe(false);
  });
});

describe("mapRazorpayFailureCode", () => {
  it.each([
    ["card_declined", "declined"],
    ["payment_declined", "declined"],
    ["debit_declined", "declined"],
    ["payment_risk_check_failed", "declined"],
    ["debit_instrument_blocked", "declined"],
    ["insufficient_funds", "insufficient_funds"],
    ["insufficient_fund", "insufficient_funds"],
    ["authentication_failed", "authentication_required"],
    ["incorrect_otp", "authentication_required"],
    ["otp_expired", "authentication_required"],
    ["otp_attempts_exceeded", "authentication_required"],
    ["card_expired", "expired_card"],
    ["incorrect_card_expiry_date", "expired_card"],
    ["payment_timed_out", "other"],
    ["something_new", "other"],
  ])("maps %s to %s", (reason, code) => {
    expect(mapRazorpayFailureCode(reason)).toBe(code);
  });

  it("maps a missing reason to other", () => {
    expect(mapRazorpayFailureCode(null)).toBe("other");
    expect(mapRazorpayFailureCode(undefined)).toBe("other");
  });
});
