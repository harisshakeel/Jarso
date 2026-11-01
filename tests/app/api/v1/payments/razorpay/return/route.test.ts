// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ razorpayOn: true }));

vi.mock("@/config/env.server", () => ({
  get serverEnv() {
    return env.razorpayOn
      ? {
          PAYMENTS_ALLOW_FAKE: false,
          RAZORPAY_KEY_ID: "rzp_test_XXXXXXXXXXXXXX",
          RAZORPAY_KEY_SECRET: "test-key-secret",
          RAZORPAY_WEBHOOK_SECRET: "test-webhook-secret",
        }
      : { PAYMENTS_ALLOW_FAKE: false };
  },
}));

const APP = "http://localhost:3000";
const SUCCESS = `${APP}/parent/settings?card=saved`;
const CANCEL = `${APP}/parent/settings?card=cancelled`;

async function load() {
  vi.resetModules();
  return import("@/app/api/v1/payments/razorpay/return/route");
}

function returnUrl(success = SUCCESS, cancel = CANCEL) {
  const url = new URL(`${APP}/api/v1/payments/razorpay/return`);
  url.searchParams.set("success", success);
  url.searchParams.set("cancel", cancel);
  return url.toString();
}

/** Checkout's form post, sent from Razorpay's own origin. */
function checkoutPost(url: string, fields: Record<string, string>) {
  return new Request(url, {
    method: "POST",
    headers: { origin: "https://api.razorpay.com" },
    body: new URLSearchParams(fields),
  });
}

const success = {
  razorpay_payment_id: "pay_TEST123",
  razorpay_order_id: "order_TEST123",
  razorpay_signature: "not-checked-here",
};

describe("POST /api/v1/payments/razorpay/return", () => {
  beforeEach(() => {
    env.razorpayOn = true;
  });

  it("sends the parent to the success URL when Checkout posts a payment id", async () => {
    const { POST } = await load();
    const res = await POST(checkoutPost(returnUrl(), success));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(SUCCESS);
  });

  it("sends the parent to the cancel URL when Checkout posts an error", async () => {
    const { POST } = await load();
    const res = await POST(
      checkoutPost(returnUrl(), {
        "error[code]": "BAD_REQUEST_ERROR",
        "error[description]": "Payment failed",
      }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(CANCEL);
  });

  it("sends the parent to the cancel URL for a body that is not a form", async () => {
    const { POST } = await load();
    const res = await POST(new Request(returnUrl(), { method: "POST", body: "{}" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(CANCEL);
  });

  it.each([
    ["success", "https://evil.example/parent"],
    ["success", "//evil.example/parent"],
    ["cancel", "javascript:alert(1)"],
    ["cancel", "/parent/settings"],
  ])("sends the parent to /parent when %s is %s", async (key, bad) => {
    const { POST } = await load();
    const url = key === "success" ? returnUrl(bad, CANCEL) : returnUrl(SUCCESS, bad);
    const res = await POST(checkoutPost(url, success));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${APP}/parent`);
  });

  it("sends the parent to /parent when the return URLs are missing", async () => {
    const { POST } = await load();
    const res = await POST(checkoutPost(`${APP}/api/v1/payments/razorpay/return`, success));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${APP}/parent`);
  });

  it("is not found while Razorpay is off", async () => {
    env.razorpayOn = false;
    const { POST } = await load();
    const res = await POST(checkoutPost(returnUrl(), success));
    expect(res.status).toBe(404);
  });
});
