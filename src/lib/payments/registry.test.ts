import { beforeEach, describe, expect, it, vi } from "vitest";

type Env = Record<string, unknown>;

const warn = vi.hoisted(() => vi.fn());

async function load(env: Env) {
  vi.resetModules();
  vi.doMock("../logger", () => ({ logger: { warn, info: vi.fn(), error: vi.fn() } }));
  vi.doMock("@/config/env.server", () => ({
    serverEnv: { PAYMENTS_PROVIDER: "none", PAYMENTS_ALLOW_FAKE: false, ...env },
  }));
  vi.doMock("@/config", () => ({ clientEnv: { NEXT_PUBLIC_APP_URL: "https://app.test" } }));
  return import("./registry");
}

const stripeKeys = { STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_x" };

describe("payment provider registry", () => {
  beforeEach(() => {
    vi.resetModules();
    warn.mockClear();
  });

  it("is off when PAYMENTS_PROVIDER is none", async () => {
    const r = await load({});
    expect(r.paymentProviderName()).toBeNull();
    expect(r.getPaymentProvider()).toBeNull();
  });

  it("uses stripe only with both keys", async () => {
    expect((await load({ PAYMENTS_PROVIDER: "stripe", ...stripeKeys })).paymentProviderName()).toBe(
      "stripe",
    );
    const r = await load({ PAYMENTS_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk_test_x" });
    expect(r.paymentProviderName()).toBeNull();
    expect(r.getPaymentProvider()).toBeNull();
  });

  it("refuses the fake without its opt-in", async () => {
    expect((await load({ PAYMENTS_PROVIDER: "fake" })).paymentProviderName()).toBeNull();
  });

  it("refuses the fake on Vercel production", async () => {
    const r = await load({
      PAYMENTS_PROVIDER: "fake",
      PAYMENTS_ALLOW_FAKE: true,
      VERCEL_ENV: "production",
    });
    expect(r.paymentProviderName()).toBeNull();
  });

  it("builds the fake once when opted in", async () => {
    const r = await load({ PAYMENTS_PROVIDER: "fake", PAYMENTS_ALLOW_FAKE: true });
    const provider = r.getPaymentProvider();
    expect(provider?.id).toBe("fake");
    expect(r.getPaymentProvider()).toBe(provider);
    expect(r.getPaymentProviderById("fake")).toBe(provider);
  });

  it("looks up by id only for the active provider", async () => {
    const r = await load({ PAYMENTS_PROVIDER: "stripe", ...stripeKeys });
    expect(r.getPaymentProviderById("fake")).toBeNull();
    expect(r.getPaymentProviderById("stripe")?.id).toBe("stripe");
  });

  it("warns once when stripe is chosen but its keys are missing, and stays off", async () => {
    const r = await load({ PAYMENTS_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk_test_x" });
    expect(r.getPaymentProvider()).toBeNull();
    expect(r.getPaymentProvider()).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/stripe/i);
    // Names which keys are missing, never their values.
    expect(JSON.stringify(warn.mock.calls[0])).not.toContain("sk_test_x");
  });

  it("does not warn when payments are off or configured", async () => {
    (await load({})).getPaymentProvider();
    (await load({ PAYMENTS_PROVIDER: "stripe", ...stripeKeys })).getPaymentProvider();
    expect(warn).not.toHaveBeenCalled();
  });
});
