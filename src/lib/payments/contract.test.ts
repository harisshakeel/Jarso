// @vitest-environment node
import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { createFakePaymentProvider, FAKE_SIGNATURE_HEADER, signFakeWebhook } from "./fake";
import { createStripePaymentProvider } from "./stripe";
import type { PaymentProvider } from "./types";

type Adapter = {
  name: string;
  make: () => PaymentProvider;
  signedSucceeded: (paymentId: string) => { body: string; headers: Headers };
};

const WEBHOOK_SECRET = "whsec_contract";

const fake: Adapter = {
  name: "fake",
  make: () => createFakePaymentProvider({ hostedUrl: "https://app.test/dev/payments/fake" }),
  signedSucceeded: (paymentId) => {
    const body = JSON.stringify({
      kind: "payment",
      eventId: "evt_c",
      paymentId,
      providerRef: "fake_pi_c",
      status: "succeeded",
    });
    return { body, headers: new Headers({ [FAKE_SIGNATURE_HEADER]: signFakeWebhook(body) }) };
  },
};

const stripeClient = new Stripe("sk_test_dummy");
vi.spyOn(stripeClient.checkout.sessions, "create").mockResolvedValue({
  id: "cs_test_c",
  url: "https://stripe.test/c",
} as never);

const stripe: Adapter = {
  name: "stripe",
  make: () =>
    createStripePaymentProvider({
      secretKey: "sk_test_dummy",
      webhookSecret: WEBHOOK_SECRET,
      client: stripeClient,
    }),
  signedSucceeded: (paymentId) => {
    const body = JSON.stringify({
      id: "evt_c",
      object: "event",
      type: "payment_intent.succeeded",
      livemode: false,
      data: { object: { id: "pi_c", object: "payment_intent", metadata: { paymentId } } },
    });
    const header = stripeClient.webhooks.generateTestHeaderString({
      payload: body,
      secret: WEBHOOK_SECRET,
    });
    return { body, headers: new Headers({ "stripe-signature": header }) };
  },
};

describe.each([fake, stripe])("payment provider contract: $name", (adapter) => {
  const provider = adapter.make();

  it("has a positive integer minimum charge for GBP", () => {
    const min = provider.minimumChargeMinor("GBP");
    expect(Number.isInteger(min)).toBe(true);
    expect(min).toBeGreaterThan(0);
  });

  it("creates a hosted payment", async () => {
    const result = await provider.createHostedPayment({
      paymentId: "pay-c",
      amountMinor: 1000,
      currency: "GBP",
      customerRef: "cus_c",
      description: "Pocket money",
      successUrl: "https://app.test/ok",
      cancelUrl: "https://app.test/no",
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    expect(result.redirectUrl).not.toBe("");
    expect(result.providerRef).not.toBe("");
  });

  it("parses an adapter-signed payment succeeded webhook", async () => {
    const { body, headers } = adapter.signedSucceeded("pay-c");
    expect(await provider.parseWebhook(body, headers)).toMatchObject({
      kind: "payment",
      paymentId: "pay-c",
      status: "succeeded",
    });
  });

  it("rejects a tampered body", async () => {
    const { body, headers } = adapter.signedSucceeded("pay-c");
    await expect(provider.parseWebhook(`${body} `, headers)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});
