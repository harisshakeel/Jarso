import { beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "@/lib";
import type { PaymentProvider } from "@/lib/payments";
import { createFakePaymentProvider } from "@/lib/payments/fake";

vi.mock("@/lib/payments", () => ({ getPaymentProviderById: vi.fn() }));
vi.mock("@/features/payments/server/repository", () => ({
  cancelPayment: vi.fn(),
  expirePayment: vi.fn(),
}));

const payments = await import("@/lib/payments");
const repo = await import("@/features/payments/server/repository");
const { endLivePayment } = await import("@/features/payments/server/end-payment");

const ADMIN = { kind: "admin" } as never;
let provider: PaymentProvider;

const inApp = { id: "pay-1", provider: "fake" as const, providerRef: "fake_pi_pay-1", inApp: true };

beforeEach(() => {
  vi.clearAllMocks();
  provider = createFakePaymentProvider({ hostedUrl: "http://localhost:3000/dev/payments/fake" });
  vi.mocked(payments.getPaymentProviderById).mockImplementation((id) =>
    id === "fake" ? provider : null,
  );
});

describe("endLivePayment", () => {
  it("expires the payment, then cancels its in-app intent", async () => {
    const cancel = vi.spyOn(provider, "cancelInAppPayment");
    await endLivePayment(ADMIN, inApp, "expired");
    expect(repo.expirePayment).toHaveBeenCalledWith(ADMIN, "pay-1");
    expect(cancel).toHaveBeenCalledWith("fake_pi_pay-1");
    expect(vi.mocked(repo.expirePayment).mock.invocationCallOrder[0]).toBeLessThan(
      cancel.mock.invocationCallOrder[0] ?? 0,
    );
    expect(repo.cancelPayment).not.toHaveBeenCalled();
  });

  it("cancels the payment and its in-app intent", async () => {
    const cancel = vi.spyOn(provider, "cancelInAppPayment");
    await endLivePayment(ADMIN, inApp, "canceled");
    expect(repo.cancelPayment).toHaveBeenCalledWith(ADMIN, "pay-1");
    expect(cancel).toHaveBeenCalledWith("fake_pi_pay-1");
  });

  it("keeps going when Stripe refuses to cancel an intent that already succeeded", async () => {
    const error = vi.spyOn(logger, "error").mockImplementation(() => {});
    const raw = new Error("sk_test_should_never_be_logged");
    vi.spyOn(provider, "cancelInAppPayment").mockRejectedValue(raw);

    await expect(endLivePayment(ADMIN, inApp, "expired")).resolves.toBeUndefined();

    expect(repo.expirePayment).toHaveBeenCalledWith(ADMIN, "pay-1");
    expect(error).toHaveBeenCalledWith("Could not cancel the in-app payment at the provider", {
      paymentId: "pay-1",
      provider: "fake",
    });
    expect(JSON.stringify(error.mock.calls)).not.toContain("sk_test_should_never_be_logged");
    error.mockRestore();
  });

  it("does not call the provider for a hosted payment", async () => {
    const cancel = vi.spyOn(provider, "cancelInAppPayment");
    await endLivePayment(
      ADMIN,
      { id: "pay-2", provider: "fake", providerRef: "fake_cs_pay-2", inApp: false },
      "canceled",
    );
    expect(repo.cancelPayment).toHaveBeenCalledWith(ADMIN, "pay-2");
    expect(cancel).not.toHaveBeenCalled();
  });

  it("does not call the provider when the in-app payment has no intent yet", async () => {
    const cancel = vi.spyOn(provider, "cancelInAppPayment");
    await endLivePayment(ADMIN, { ...inApp, providerRef: null }, "expired");
    expect(repo.expirePayment).toHaveBeenCalledWith(ADMIN, "pay-1");
    expect(cancel).not.toHaveBeenCalled();
  });

  it("skips the provider call when that provider is off", async () => {
    await endLivePayment(ADMIN, { ...inApp, provider: "stripe" }, "expired");
    expect(repo.expirePayment).toHaveBeenCalledWith(ADMIN, "pay-1");
  });
});
