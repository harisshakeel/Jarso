// @vitest-environment node
import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import paymentIntentSucceeded from "./fixtures/payment-intent-succeeded.json";
import { createStripePaymentProvider } from "./index";

const SECRET = "whsec_test_secret";

function setup() {
  const client = new Stripe("sk_test_dummy");
  const provider = createStripePaymentProvider({
    secretKey: "sk_test_dummy",
    webhookSecret: SECRET,
    client,
  });
  return { client, provider };
}

function signed(payload: string, secret = SECRET) {
  const { client } = setup();
  const header = client.webhooks.generateTestHeaderString({ payload, secret });
  return new Headers({ "stripe-signature": header });
}

describe("stripe parseWebhook", () => {
  it("maps a correctly signed event", async () => {
    const { provider } = setup();
    const body = JSON.stringify(paymentIntentSucceeded);
    expect(await provider.parseWebhook(body, signed(body))).toMatchObject({
      kind: "payment",
      paymentId: "pay-2",
      status: "succeeded",
    });
  });

  it("rejects a wrong signature", async () => {
    const { provider } = setup();
    const body = JSON.stringify(paymentIntentSucceeded);
    await expect(provider.parseWebhook(body, signed(body, "whsec_other"))).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("rejects live-mode events", async () => {
    const { provider } = setup();
    const body = JSON.stringify({ ...paymentIntentSucceeded, livemode: true });
    await expect(provider.parseWebhook(body, signed(body))).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});

describe("stripe createHostedPayment", () => {
  it("creates a card-only payment Checkout Session with an idempotency key", async () => {
    const { client, provider } = setup();
    const create = vi
      .spyOn(client.checkout.sessions, "create")
      .mockResolvedValue({ id: "cs_test_1", url: "https://stripe.test/c" } as never);
    const expiresAt = new Date("2026-11-01T10:00:00Z");

    const result = await provider.createHostedPayment({
      paymentId: "pay-9",
      amountMinor: 1200,
      currency: "GBP",
      customerRef: "cus_1",
      description: "Pocket money",
      successUrl: "https://app.test/ok",
      cancelUrl: "https://app.test/no",
      expiresAt,
    });

    expect(result).toEqual({ redirectUrl: "https://stripe.test/c", providerRef: "cs_test_1" });
    const [params, options] = create.mock.calls[0] as [Record<string, unknown>, unknown];
    expect(params).toMatchObject({
      mode: "payment",
      allowed_payment_method_types: ["card"],
      client_reference_id: "pay-9",
      expires_at: Math.floor(expiresAt.getTime() / 1000),
      line_items: [{ price_data: { currency: "gbp", unit_amount: 1200 } }],
    });
    expect(params).not.toHaveProperty("payment_intent_data.metadata");
    expect(options).toEqual({ idempotencyKey: "pay:pay-9" });
  });
});

describe("stripe chargeSaved", () => {
  const input = {
    paymentId: "pay-1",
    amountMinor: 500,
    currency: "GBP",
    customerRef: "cus_1",
    methodRef: "pm_1",
    description: "Pocket money",
  };

  it("turns a card error into a failed result", async () => {
    const { client, provider } = setup();
    const error = new Stripe.errors.StripeCardError({
      type: "card_error",
      code: "card_declined",
      payment_intent: { id: "pi_x" },
    } as never);
    vi.spyOn(client.paymentIntents, "create").mockRejectedValue(error);
    expect(await provider.chargeSaved(input)).toEqual({
      providerRef: "pi_x",
      status: "failed",
      failureCode: "declined",
    });
  });

  it("turns a connection error into UNAVAILABLE", async () => {
    const { client, provider } = setup();
    vi.spyOn(client.paymentIntents, "create").mockRejectedValue(
      new Stripe.errors.StripeConnectionError({ type: "api_connection_error" } as never),
    );
    await expect(provider.chargeSaved(input)).rejects.toMatchObject({
      code: "UNAVAILABLE",
      message: "Card payments aren't available right now. You can still hand over cash.",
    });
  });
});

describe("stripe ensureCustomer", () => {
  it("uses a customer-scoped idempotency key", async () => {
    const { client, provider } = setup();
    const create = vi.spyOn(client.customers, "create").mockResolvedValue({ id: "cus_1" } as never);
    expect(await provider.ensureCustomer({ parentId: "p1", email: null })).toEqual({
      customerRef: "cus_1",
    });
    expect(create.mock.calls[0]?.[1]).toEqual({ idempotencyKey: "customer:p1" });
  });
});

describe("stripe detachMethod", () => {
  it("treats an already-gone method as detached", async () => {
    const { client, provider } = setup();
    vi.spyOn(client.paymentMethods, "detach").mockRejectedValue(
      Object.assign(new Error("gone"), { code: "resource_missing" }),
    );
    await expect(provider.detachMethod("pm_1")).resolves.toBeUndefined();
  });
});
