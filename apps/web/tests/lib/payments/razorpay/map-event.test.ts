// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  failedPaymentOrderToFetch,
  isLiveModeEvent,
  mapRazorpayEvent,
  mapRazorpayFailureCode,
  type RazorpayEvent,
  type RazorpayOrder,
  setupCardToFetch,
} from "@/lib/payments/razorpay/map-event";
import orderFetchedCharge from "./fixtures/order-fetched-charge.json";
import orderPaidCharge from "./fixtures/order-paid-charge.json";
import orderPaidSetup from "./fixtures/order-paid-setup.json";
import paymentCapturedCharge from "./fixtures/payment-captured-charge.json";
import paymentFailedCharge from "./fixtures/payment-failed-charge.json";
import paymentLinkCancelled from "./fixtures/payment-link-cancelled.json";
import paymentLinkExpired from "./fixtures/payment-link-expired.json";
import paymentLinkPaid from "./fixtures/payment-link-paid.json";

const asEvent = (fixture: unknown) => structuredClone(fixture) as RazorpayEvent;
/** The charge order as `orders.fetch` returns it: Jarso set its notes server-side. */
const chargeOrder = () => structuredClone(orderFetchedCharge) as RazorpayOrder;
const note = (notes: unknown) => (notes as Record<string, string>).jarsoCharge;

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

describe("mapRazorpayEvent for saved cards", () => {
  const payment = (event: RazorpayEvent) => event.payload.payment?.entity ?? {};

  it("maps order.paid for a save-card order to a saved card", () => {
    expect(mapRazorpayEvent(asEvent(orderPaidSetup), "evt_4")).toEqual({
      kind: "setup",
      eventId: "evt_4",
      setupId: "set-1",
      methodRef: "cust_TEST123:token_TEST123:pay_TESTAUTH1",
      card: { brand: "visa", last4: "1111" },
    });
  });

  it.each(["token_id", "customer_id"])("fails the setup when the payment has no %s", (key) => {
    const event = asEvent(orderPaidSetup);
    delete payment(event)[key];
    expect(mapRazorpayEvent(event, "evt_4")).toEqual({
      kind: "setup_failed",
      eventId: "evt_4",
      setupId: "set-1",
      reason: "failed",
    });
  });

  it("fails the setup when the event carries no payment", () => {
    const event = asEvent(orderPaidSetup);
    delete event.payload.payment;
    expect(mapRazorpayEvent(event, "evt_4")).toMatchObject({ kind: "setup_failed" });
  });

  it("fails the setup when the card is still unknown", () => {
    const event = asEvent(orderPaidSetup);
    delete payment(event).card;
    expect(mapRazorpayEvent(event, "evt_4")).toMatchObject({ kind: "setup_failed" });
  });

  it("maps order.paid for an auto charge to a succeeded payment", () => {
    expect(mapRazorpayEvent(asEvent(orderPaidCharge), "evt_5")).toEqual({
      kind: "payment",
      eventId: "evt_5",
      paymentId: "pay-9",
      providerRef: "order_TESTCHARGE1",
      status: "succeeded",
    });
  });

  it("ignores order.paid for an order Jarso did not tag (a Payment Link's order)", () => {
    const event = asEvent(paymentLinkPaid);
    event.event = "order.paid";
    expect(mapRazorpayEvent(event, "evt_6")).toBeNull();
  });

  it("ignores payment.captured: auto charges settle from order.paid only", () => {
    expect(mapRazorpayEvent(asEvent(paymentCapturedCharge), "evt_7")).toBeNull();
    expect(
      mapRazorpayEvent(asEvent(paymentCapturedCharge), "evt_7", { order: chargeOrder() }),
    ).toBeNull();
  });

  it("maps payment.failed to a failed payment named by the fetched order's notes", () => {
    expect(
      mapRazorpayEvent(asEvent(paymentFailedCharge), "evt_8", { order: chargeOrder() }),
    ).toEqual({
      kind: "payment",
      eventId: "evt_8",
      paymentId: "pay-9",
      providerRef: "order_TESTCHARGE1",
      status: "failed",
      failureCode: "declined",
    });
  });

  it("names the payment from the order's notes, never the payment's", () => {
    const event = asEvent(paymentFailedCharge);
    payment(event).notes = { jarsoCharge: "someone-elses-payment" };
    expect(mapRazorpayEvent(event, "evt_8", { order: chargeOrder() })).toMatchObject({
      paymentId: "pay-9",
    });
  });

  it("ignores payment.failed whose order was not fetched", () => {
    expect(mapRazorpayEvent(asEvent(paymentFailedCharge), "evt_8")).toBeNull();
  });

  it.each([
    ["payment.captured", paymentCapturedCharge],
    ["payment.failed", paymentFailedCharge],
  ])("ignores %s with forged payment notes when the order has no jarsoCharge", (_n, fixture) => {
    const event = asEvent(fixture);
    expect(note(payment(event).notes)).toBe("pay-9");
    const order = { ...chargeOrder(), notes: [] as unknown[] };
    expect(mapRazorpayEvent(event, "evt_9", { order })).toBeNull();
    expect(
      mapRazorpayEvent(event, "evt_9", { order: { ...order, notes: { other: "x" } } }),
    ).toBeNull();
  });

  it("ignores payment.failed when the fetched order is a different order", () => {
    const order = { ...chargeOrder(), id: "order_OTHER" };
    expect(mapRazorpayEvent(asEvent(paymentFailedCharge), "evt_9", { order })).toBeNull();
  });

  it("ignores a charge payment without an order id", () => {
    const event = asEvent(paymentFailedCharge);
    delete payment(event).order_id;
    expect(mapRazorpayEvent(event, "evt_9", { order: chargeOrder() })).toBeNull();
  });
});

describe("mapRazorpayEvent for in-app payments", () => {
  const payment = (event: RazorpayEvent) => event.payload.payment?.entity ?? {};

  it("maps order.paid for an in-app order to a succeeded payment", () => {
    const event = asEvent(orderPaidCharge);
    const order = event.payload.order?.entity;
    if (!order) throw new Error("fixture has no order");
    order.notes = { jarsoPay: "pay-3" };
    expect(mapRazorpayEvent(event, "evt_10")).toEqual({
      kind: "payment",
      eventId: "evt_10",
      paymentId: "pay-3",
      providerRef: order.id,
      status: "succeeded",
    });
  });

  it("ignores payment.failed for an in-app order so the parent can retry", () => {
    const event = asEvent(paymentFailedCharge);
    const orderId = payment(event).order_id as string;
    expect(
      mapRazorpayEvent(event, "evt_11", { order: { id: orderId, notes: { jarsoPay: "pay-3" } } }),
    ).toBeNull();
  });

  it("ignores jarsoPay on the payment's own notes", () => {
    const event = asEvent(orderPaidCharge);
    const order = event.payload.order?.entity;
    if (!order) throw new Error("fixture has no order");
    order.notes = [];
    payment(event).notes = { jarsoPay: "pay-3" };
    expect(mapRazorpayEvent(event, "evt_12")).toBeNull();
  });
});

describe("failedPaymentOrderToFetch", () => {
  it("names the order of a failed payment", () => {
    expect(failedPaymentOrderToFetch(asEvent(paymentFailedCharge))).toBe("order_TESTCHARGE1");
  });

  it("is null for a failed payment without an order id", () => {
    const event = asEvent(paymentFailedCharge);
    delete event.payload.payment?.entity.order_id;
    expect(failedPaymentOrderToFetch(event)).toBeNull();
  });

  it("is null for other events, payment.captured among them", () => {
    expect(failedPaymentOrderToFetch(asEvent(paymentCapturedCharge))).toBeNull();
    expect(failedPaymentOrderToFetch(asEvent(orderPaidCharge))).toBeNull();
    expect(failedPaymentOrderToFetch(asEvent(paymentLinkPaid))).toBeNull();
  });
});

describe("setupCardToFetch", () => {
  it("is null when the save-card payment already names its card", () => {
    expect(setupCardToFetch(asEvent(orderPaidSetup))).toBeNull();
  });

  it("names the payment to fetch when its card is missing", () => {
    const event = asEvent(orderPaidSetup);
    delete event.payload.payment?.entity.card;
    expect(setupCardToFetch(event)).toBe("pay_TESTAUTH1");
  });

  it("is null for other events", () => {
    const event = asEvent(orderPaidCharge);
    delete event.payload.payment?.entity.card;
    expect(setupCardToFetch(event)).toBeNull();
    expect(setupCardToFetch(asEvent(paymentLinkPaid))).toBeNull();
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
