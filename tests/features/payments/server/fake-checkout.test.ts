// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ fakeOn: true }));

vi.mock("@/config", () => ({ clientEnv: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" } }));
vi.mock("@/lib/payments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payments")>()),
  getPaymentProviderById: vi.fn((id: string) => (id === "fake" && state.fakeOn ? { id } : null)),
}));
vi.mock("@/features/payments/server/webhooks", () => ({ handleProviderEvent: vi.fn() }));

const webhooks = await import("@/features/payments/server/webhooks");
const { completeFakeCheckoutAction } = await import("@/features/payments/server/fake-checkout");

const REF = "6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
const input = {
  mode: "payment" as const,
  ref: REF,
  outcome: "pay" as const,
  success: "/parent?card=returned",
  cancel: "/parent?card=cancelled",
};

beforeEach(() => {
  vi.clearAllMocks();
  state.fakeOn = true;
});

describe("completeFakeCheckoutAction", () => {
  it("applies the fake event when the fake provider is on", async () => {
    const result = await completeFakeCheckoutAction(null, input);
    expect(result).toEqual({ ok: true, data: { returnTo: "/parent?card=returned" } });
    expect(webhooks.handleProviderEvent).toHaveBeenCalledWith(
      "fake",
      expect.objectContaining({ kind: "payment", paymentId: REF, status: "succeeded" }),
    );
  });

  it("is NOT_FOUND when the fake provider is off, even with others on", async () => {
    state.fakeOn = false;
    const result = await completeFakeCheckoutAction(null, input);
    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(webhooks.handleProviderEvent).not.toHaveBeenCalled();
  });
});
