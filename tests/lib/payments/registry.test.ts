import { beforeEach, describe, expect, it, vi } from "vitest";

type Env = Record<string, unknown>;

const warn = vi.hoisted(() => vi.fn());

async function load(env: Env) {
  vi.resetModules();
  vi.doMock("@/lib/logger", () => ({ logger: { warn, info: vi.fn(), error: vi.fn() } }));
  vi.doMock("@/config/env.server", () => ({
    serverEnv: { PAYMENTS_ALLOW_FAKE: false, ...env },
  }));
  vi.doMock("@/config", () => ({ clientEnv: { NEXT_PUBLIC_APP_URL: "https://app.test" } }));
  return import("@/lib/payments/registry");
}

const stripeKeys = { STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_x" };
const fakeOn = { PAYMENTS_ALLOW_FAKE: true };
const ids = (r: Awaited<ReturnType<typeof load>>) => r.getPaymentProviders().map((p) => p.id);

describe("payment provider registry", () => {
  beforeEach(() => {
    vi.resetModules();
    warn.mockClear();
  });

  it("is off with no provider keys and no fake opt-in", async () => {
    const r = await load({});
    expect(r.getPaymentProviders()).toEqual([]);
    expect(r.paymentsEnabled()).toBe(false);
    expect(r.getPaymentProviderById("stripe")).toBeNull();
    expect(r.getPaymentProviderById("fake")).toBeNull();
  });

  it("turns stripe on when both its keys are set", async () => {
    const r = await load(stripeKeys);
    expect(ids(r)).toEqual(["stripe"]);
    expect(r.paymentsEnabled()).toBe(true);
    expect(r.getPaymentProviderById("stripe")?.label).toBe("Stripe");
    expect(r.getPaymentProviderById("fake")).toBeNull();
  });

  it("refuses the fake without its opt-in", async () => {
    expect(ids(await load({}))).toEqual([]);
  });

  it("refuses the fake on Vercel production", async () => {
    const r = await load({ ...fakeOn, VERCEL_ENV: "production" });
    expect(ids(r)).toEqual([]);
    expect(r.getPaymentProviderById("fake")).toBeNull();
  });

  it("builds the fake once when opted in", async () => {
    const r = await load(fakeOn);
    const [provider] = r.getPaymentProviders();
    expect(provider?.id).toBe("fake");
    expect(provider?.label).toBe("Test card");
    expect(r.getPaymentProviders()[0]).toBe(provider);
    expect(r.getPaymentProviderById("fake")).toBe(provider);
  });

  it("runs stripe and the fake together, stripe first", async () => {
    const r = await load({ ...stripeKeys, ...fakeOn });
    expect(ids(r)).toEqual(["stripe", "fake"]);
    expect(r.getPaymentProviderById("stripe")?.id).toBe("stripe");
    expect(r.getPaymentProviderById("fake")?.id).toBe("fake");
    expect(r.getPaymentProviderById("razorpay")).toBeNull();
    expect(r.getPaymentProviderById("nope")).toBeNull();
  });

  it("creates the provider list once per server instance", async () => {
    const r = await load({ ...stripeKeys, ...fakeOn });
    expect(r.getPaymentProviders()).toBe(r.getPaymentProviders());
  });

  it("keeps a provider with some of its keys off and warns once, naming keys not values", async () => {
    const r = await load({ STRIPE_SECRET_KEY: "sk_test_x", ...fakeOn });
    expect(ids(r)).toEqual(["fake"]);
    r.getPaymentProviders();
    r.paymentsEnabled();
    r.getPaymentProviderById("stripe");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/stripe/i);
    expect(JSON.stringify(warn.mock.calls[0])).toContain("STRIPE_WEBHOOK_SECRET");
    expect(JSON.stringify(warn.mock.calls[0])).not.toContain("sk_test_x");
  });

  it("does not warn when a provider has none of its keys or all of them", async () => {
    (await load({})).getPaymentProviders();
    (await load(stripeKeys)).getPaymentProviders();
    expect(warn).not.toHaveBeenCalled();
  });
});
