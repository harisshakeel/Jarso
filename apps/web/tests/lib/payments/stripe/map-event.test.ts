// @vitest-environment node
import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { mapFailureCode, mapStripeEvent } from "@/lib/payments/stripe/map-event";
import checkoutAsyncPaymentFailed from "./fixtures/checkout-async-payment-failed.json";
import checkoutAsyncPaymentSucceeded from "./fixtures/checkout-async-payment-succeeded.json";
import checkoutPaymentCompleted from "./fixtures/checkout-payment-completed.json";
import checkoutPaymentExpired from "./fixtures/checkout-payment-expired.json";
import checkoutSetupCompleted from "./fixtures/checkout-setup-completed.json";
import checkoutSetupExpired from "./fixtures/checkout-setup-expired.json";
import customerCreated from "./fixtures/customer-created.json";
import paymentIntentCanceled from "./fixtures/payment-intent-canceled.json";
import paymentIntentFailed from "./fixtures/payment-intent-failed.json";
import paymentIntentRequiresAction from "./fixtures/payment-intent-requires-action.json";
import paymentIntentSucceeded from "./fixtures/payment-intent-succeeded.json";
import setupIntentSucceeded from "./fixtures/setup-intent-succeeded.json";

const asEvent = (fixture: unknown) => structuredClone(fixture) as unknown as Stripe.Event;
const setupIntent = {
  status: "succeeded",
  payment_method: { id: "pm_1", card: { brand: "visa", last4: "4242" } },
} as unknown as Stripe.SetupIntent;
const retrieve = vi.fn(async () => setupIntent);

describe("mapStripeEvent", () => {
  it("maps a paid payment Checkout Session", async () => {
    expect(await mapStripeEvent(asEvent(checkoutPaymentCompleted), retrieve)).toMatchObject({
      kind: "payment",
      paymentId: "pay-1",
      status: "succeeded",
      providerRef: "cs_test_pay",
    });
  });

  it("maps a delayed payment that succeeded", async () => {
    expect(await mapStripeEvent(asEvent(checkoutAsyncPaymentSucceeded), retrieve)).toMatchObject({
      kind: "payment",
      paymentId: "pay-1",
      status: "succeeded",
      providerRef: "cs_test_pay",
    });
  });

  it("maps a delayed payment that failed, with the 'other' failure code", async () => {
    expect(await mapStripeEvent(asEvent(checkoutAsyncPaymentFailed), retrieve)).toMatchObject({
      kind: "payment",
      paymentId: "pay-1",
      status: "failed",
      failureCode: "other",
    });
  });

  it("ignores delayed payment events for a setup session", async () => {
    const event = asEvent(checkoutAsyncPaymentSucceeded);
    (event.data.object as Stripe.Checkout.Session).mode = "setup";
    expect(await mapStripeEvent(event, retrieve)).toBeNull();
  });

  it("ignores an unpaid session", async () => {
    const event = asEvent(checkoutPaymentCompleted);
    (event.data.object as Stripe.Checkout.Session).payment_status = "unpaid";
    expect(await mapStripeEvent(event, retrieve)).toBeNull();
  });

  it("maps a completed setup session with the card from the SetupIntent", async () => {
    expect(await mapStripeEvent(asEvent(checkoutSetupCompleted), retrieve)).toMatchObject({
      kind: "setup",
      setupId: "setup-1",
      methodRef: "pm_1",
      card: { brand: "visa", last4: "4242" },
    });
    expect(retrieve).toHaveBeenCalledWith("seti_1");
  });

  it("maps expired sessions", async () => {
    expect(await mapStripeEvent(asEvent(checkoutPaymentExpired), retrieve)).toMatchObject({
      kind: "payment",
      status: "expired",
    });
    expect(await mapStripeEvent(asEvent(checkoutSetupExpired), retrieve)).toMatchObject({
      kind: "setup_failed",
      setupId: "setup-4",
      reason: "expired",
    });
  });

  it("maps a PaymentIntent that carries our paymentId", async () => {
    expect(await mapStripeEvent(asEvent(paymentIntentSucceeded), retrieve)).toMatchObject({
      kind: "payment",
      paymentId: "pay-2",
      status: "succeeded",
      providerRef: "pi_test_1",
    });
  });

  it("ignores a PaymentIntent without our paymentId (Checkout's own)", async () => {
    const event = asEvent(paymentIntentSucceeded);
    (event.data.object as Stripe.PaymentIntent).metadata = {};
    expect(await mapStripeEvent(event, retrieve)).toBeNull();
  });

  it("maps a failed PaymentIntent with its failure code", async () => {
    expect(await mapStripeEvent(asEvent(paymentIntentFailed), retrieve)).toMatchObject({
      status: "failed",
      failureCode: "insufficient_funds",
    });
  });

  it("treats requires_action as a failure needing authentication", async () => {
    expect(await mapStripeEvent(asEvent(paymentIntentRequiresAction), retrieve)).toMatchObject({
      status: "failed",
      failureCode: "authentication_required",
    });
  });

  it("ignores other events", async () => {
    expect(await mapStripeEvent(asEvent(customerCreated), retrieve)).toBeNull();
  });
});

/** The fixture as an in-app PaymentIntent or SetupIntent: `metadata.jarsoInApp = "1"`. */
function inApp(fixture: unknown): Stripe.Event {
  const event = asEvent(fixture);
  const object = event.data.object as { metadata?: Record<string, string> };
  object.metadata = { ...object.metadata, jarsoInApp: "1" };
  return event;
}

describe("mapStripeEvent, in-app intents", () => {
  it("ignores payment_failed for an in-app intent", async () => {
    expect(await mapStripeEvent(inApp(paymentIntentFailed), retrieve)).toBeNull();
  });

  it("ignores requires_action for an in-app intent", async () => {
    expect(await mapStripeEvent(inApp(paymentIntentRequiresAction), retrieve)).toBeNull();
  });

  it("still fails an auto-charge intent on payment_failed", async () => {
    expect(await mapStripeEvent(asEvent(paymentIntentFailed), retrieve)).toMatchObject({
      kind: "payment",
      status: "failed",
    });
  });

  it("still fails an auto-charge intent on requires_action", async () => {
    expect(await mapStripeEvent(asEvent(paymentIntentRequiresAction), retrieve)).toMatchObject({
      status: "failed",
      failureCode: "authentication_required",
    });
  });

  it("ends an in-app payment on succeeded", async () => {
    expect(await mapStripeEvent(inApp(paymentIntentSucceeded), retrieve)).toEqual({
      kind: "payment",
      eventId: "evt_5",
      paymentId: "pay-2",
      providerRef: "pi_test_1",
      status: "succeeded",
    });
  });

  it("maps payment_intent.canceled for an in-app intent", async () => {
    expect(await mapStripeEvent(asEvent(paymentIntentCanceled), retrieve)).toEqual({
      kind: "payment",
      eventId: "evt_9",
      paymentId: "pay-9",
      providerRef: "pi_test_9",
      status: "canceled",
    });
  });

  it("ignores payment_intent.canceled without the marker", async () => {
    const event = asEvent(paymentIntentCanceled);
    (event.data.object as Stripe.PaymentIntent).metadata = { paymentId: "pay-9" };
    expect(await mapStripeEvent(event, retrieve)).toBeNull();
  });

  it("maps setup_intent.succeeded for an in-app setup", async () => {
    const retrieveSetup = vi.fn(async () => setupIntent);
    expect(await mapStripeEvent(asEvent(setupIntentSucceeded), retrieveSetup)).toEqual({
      kind: "setup",
      eventId: "evt_10",
      setupId: "set-1",
      methodRef: "pm_1",
      card: { brand: "visa", last4: "4242" },
    });
    expect(retrieveSetup).toHaveBeenCalledWith("seti_1");
  });

  it("fails an in-app setup whose intent has no card", async () => {
    const retrieveSetup = vi.fn(
      async () => ({ status: "succeeded", payment_method: null }) as unknown as Stripe.SetupIntent,
    );
    expect(await mapStripeEvent(asEvent(setupIntentSucceeded), retrieveSetup)).toEqual({
      kind: "setup_failed",
      eventId: "evt_10",
      setupId: "set-1",
      reason: "failed",
    });
  });

  it("ignores setup_intent.succeeded from a hosted setup", async () => {
    const retrieveSetup = vi.fn(async () => setupIntent);
    const event = asEvent(setupIntentSucceeded);
    (event.data.object as Stripe.SetupIntent).metadata = { setupId: "set-1" };
    expect(await mapStripeEvent(event, retrieveSetup)).toBeNull();
    expect(retrieveSetup).not.toHaveBeenCalled();
  });

  it("ignores setup_intent.setup_failed", async () => {
    const event = asEvent(setupIntentSucceeded);
    (event as { type: string }).type = "setup_intent.setup_failed";
    expect(await mapStripeEvent(event, retrieve)).toBeNull();
  });
});

describe("mapFailureCode", () => {
  it.each([
    [["authentication_required"], "authentication_required"],
    [["expired_card"], "expired_card"],
    [["card_declined", "insufficient_funds"], "insufficient_funds"],
    [["card_declined", "generic_decline"], "declined"],
    [["processing_error"], "other"],
  ] as const)("%j -> %s", (args, expected) => {
    expect(mapFailureCode(...args)).toBe(expected);
  });
});
