import { afterEach, describe, expect, it, vi } from "vitest";

const PAYMENT_KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
] as const;

async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  return (await import("@/config/env.server")).serverEnv;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("serverEnv payment keys", () => {
  it("treats blank keys as unset instead of failing to start", async () => {
    const env = await load(Object.fromEntries(PAYMENT_KEYS.map((name) => [name, ""])));
    for (const name of PAYMENT_KEYS) expect(env[name]).toBeUndefined();
  });

  it("still refuses a live Razorpay key id", async () => {
    await expect(load({ RAZORPAY_KEY_ID: "rzp_live_XXXXXXXXXXXXXX" })).rejects.toThrow(
      /Razorpay test-mode key id/,
    );
  });
});
