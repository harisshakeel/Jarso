// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FAKE_SIGNATURE_HEADER, type ProviderEvent, signFakeWebhook } from "@/lib/payments";

vi.mock("@/config/env.server", () => ({
  serverEnv: { PAYMENTS_ALLOW_FAKE: true },
}));

const PAYMENT_ID = "6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
const UNKNOWN_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

/** A stand-in admin client: payments has at most one row, every other read finds nothing. */
const db = vi.hoisted(() => ({
  payment: null as { id: string; provider: string; status: string } | null,
  rpc: vi.fn(async (_fn: string, _args: unknown) => ({ data: "confirmed", error: null })),
}));

vi.mock("@/lib/supabase/admin", () => {
  const builder = (table: string) => {
    const filters: Record<string, unknown> = {};
    const b = {
      select: () => b,
      update: () => b,
      upsert: () => b,
      insert: () => b,
      in: () => b,
      neq: () => b,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return b;
      },
      maybeSingle: async () => ({
        data: table === "payments" && db.payment?.id === filters.id ? db.payment : null,
        error: null,
      }),
      // biome-ignore lint/suspicious/noThenProperty: mimics a thenable PostgREST builder
      then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
    };
    return b;
  };
  return { createAdminClient: () => ({ from: builder, rpc: db.rpc }) };
});

const { POST } = await import("@/app/api/v1/payments/webhooks/[provider]/route");

const event = (paymentId: string): ProviderEvent => ({
  kind: "payment",
  eventId: `evt_${paymentId}`,
  paymentId,
  providerRef: "fake_cs_1",
  status: "succeeded",
});

function post(provider: string, body: string, signature = signFakeWebhook(body)) {
  return POST(
    new Request(`http://localhost:3000/api/v1/payments/webhooks/${provider}`, {
      method: "POST",
      headers: { "content-type": "application/json", [FAKE_SIGNATURE_HEADER]: signature },
      body,
    }),
    { params: Promise.resolve({ provider }) },
  );
}

describe("POST /api/v1/payments/webhooks/[provider]", () => {
  beforeEach(() => {
    db.payment = { id: PAYMENT_ID, provider: "fake", status: "pending" };
    db.rpc.mockClear();
  });

  it("accepts a body signed by the fake and applies the payment", async () => {
    const res = await post("fake", JSON.stringify(event(PAYMENT_ID)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { received: true } });
    expect(db.rpc).toHaveBeenCalledWith("apply_payment", { p_payment_id: PAYMENT_ID });
  });

  it("rejects a bad signature with 400", async () => {
    const res = await post("fake", JSON.stringify(event(PAYMENT_ID)), "0".repeat(64));
    expect(res.status).toBe(400);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("returns 404 for a provider that is not active", async () => {
    const res = await post("stripe", JSON.stringify(event(PAYMENT_ID)));
    expect(res.status).toBe(404);
  });

  it("returns 404 for an unknown provider", async () => {
    const res = await post("paypal", JSON.stringify(event(PAYMENT_ID)));
    expect(res.status).toBe(404);
  });

  it("answers 200 for an unknown paymentId, so the provider stops retrying", async () => {
    const res = await post("fake", JSON.stringify(event(UNKNOWN_ID)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { received: true } });
    expect(db.rpc).not.toHaveBeenCalled();
  });
});
