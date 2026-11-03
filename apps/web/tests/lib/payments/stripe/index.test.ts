// @vitest-environment node
import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { createStripePaymentProvider, STRIPE_API_VERSION } from "@/lib/payments/stripe/index";
import paymentIntentSucceeded from "./fixtures/payment-intent-succeeded.json";

const SECRET = "whsec_test_secret";

function setup() {
  const client = new Stripe("sk_test_dummy");
  const provider = createStripePaymentProvider({
    secretKey: "sk_test_dummy",
    webhookSecret: SECRET,
    publishableKey: null,
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

function inAppSetup(publishableKey: string | null = "pk_test_X") {
  const client = new Stripe("sk_test_dummy");
  const provider = createStripePaymentProvider({
    secretKey: "sk_test_dummy",
    webhookSecret: SECRET,
    publishableKey,
    client,
  });
  const ephemeral = vi
    .spyOn(client.ephemeralKeys, "create")
    .mockResolvedValue({ secret: "ek_test_1" } as never);
  return { client, provider, ephemeral };
}

const inAppInput = {
  paymentId: "pay-1",
  amountMinor: 500,
  currency: "GBP",
  customerRef: "cus_1",
  description: "Allowance for Sam",
  expiresAt: new Date("2026-11-03T10:31:00Z"),
};

describe("stripe createInAppPayment", () => {
  it("creates a card PaymentIntent marked in-app and returns the sheet", async () => {
    const { client, provider, ephemeral } = inAppSetup();
    const create = vi
      .spyOn(client.paymentIntents, "create")
      .mockResolvedValue({ id: "pi_1", client_secret: "pi_1_secret_x" } as never);

    expect(provider.inApp).toBe(true);
    expect(await provider.createInAppPayment(inAppInput)).toEqual({
      providerRef: "pi_1",
      sheet: {
        provider: "stripe",
        mode: "payment",
        publishableKey: "pk_test_X",
        customerId: "cus_1",
        ephemeralKey: "ek_test_1",
        clientSecret: "pi_1_secret_x",
      },
    });
    expect(create).toHaveBeenCalledWith(
      {
        amount: 500,
        currency: "gbp",
        customer: "cus_1",
        allowed_payment_method_types: ["card"],
        description: "Allowance for Sam",
        metadata: { paymentId: "pay-1", jarsoInApp: "1" },
      },
      { idempotencyKey: "inapp:pay-1" },
    );
    expect(ephemeral).toHaveBeenCalledWith(
      { customer: "cus_1" },
      { apiVersion: STRIPE_API_VERSION },
    );
  });

  it("is off without a publishable key and never calls Stripe", async () => {
    const { client, provider } = inAppSetup(null);
    const create = vi.spyOn(client.paymentIntents, "create");
    expect(provider.inApp).toBe(false);
    await expect(provider.createInAppPayment(inAppInput)).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("stripe resumeInAppPayment", () => {
  const input = {
    paymentId: "pay-1",
    providerRef: "pi_1",
    customerRef: "cus_1",
    amountMinor: 500,
    currency: "GBP",
    description: "Allowance for Sam",
  };

  it("returns the intent's client secret with a fresh ephemeral key", async () => {
    const { client, provider, ephemeral } = inAppSetup();
    const retrieve = vi.spyOn(client.paymentIntents, "retrieve").mockResolvedValue({
      id: "pi_1",
      status: "requires_payment_method",
      client_secret: "pi_1_secret_x",
    } as never);
    expect(await provider.resumeInAppPayment(input)).toEqual({
      provider: "stripe",
      mode: "payment",
      publishableKey: "pk_test_X",
      customerId: "cus_1",
      ephemeralKey: "ek_test_1",
      clientSecret: "pi_1_secret_x",
    });
    expect(retrieve).toHaveBeenCalledWith("pi_1");
    expect(ephemeral).toHaveBeenCalledTimes(1);
  });

  it("refuses an intent that already succeeded", async () => {
    const { client, provider } = inAppSetup();
    vi.spyOn(client.paymentIntents, "retrieve").mockResolvedValue({
      id: "pi_1",
      status: "succeeded",
      client_secret: "pi_1_secret_x",
    } as never);
    await expect(provider.resumeInAppPayment(input)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("stripe cancelInAppPayment", () => {
  it("swallows an intent that can no longer be cancelled", async () => {
    const { client, provider } = inAppSetup();
    vi.spyOn(client.paymentIntents, "cancel").mockRejectedValue(
      new Stripe.errors.StripeInvalidRequestError({
        type: "invalid_request_error",
        code: "payment_intent_unexpected_state",
      } as never),
    );
    await expect(provider.cancelInAppPayment("pi_1")).resolves.toBeUndefined();
  });

  it("turns a connection error into UNAVAILABLE", async () => {
    const { client, provider } = inAppSetup();
    vi.spyOn(client.paymentIntents, "cancel").mockRejectedValue(
      new Stripe.errors.StripeConnectionError({ type: "api_connection_error" } as never),
    );
    await expect(provider.cancelInAppPayment("pi_1")).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
  });
});

describe("stripe createInAppSetup", () => {
  it("creates an off-session SetupIntent marked in-app", async () => {
    const { client, provider } = inAppSetup();
    const create = vi
      .spyOn(client.setupIntents, "create")
      .mockResolvedValue({ id: "seti_1", client_secret: "seti_1_secret_x" } as never);
    expect(await provider.createInAppSetup({ setupId: "set-1", customerRef: "cus_1" })).toEqual({
      providerRef: "seti_1",
      sheet: {
        provider: "stripe",
        mode: "setup",
        publishableKey: "pk_test_X",
        customerId: "cus_1",
        ephemeralKey: "ek_test_1",
        clientSecret: "seti_1_secret_x",
      },
    });
    expect(create).toHaveBeenCalledWith(
      {
        customer: "cus_1",
        allowed_payment_method_types: ["card"],
        usage: "off_session",
        metadata: { setupId: "set-1", jarsoInApp: "1" },
      },
      { idempotencyKey: "inapp-setup:set-1" },
    );
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
