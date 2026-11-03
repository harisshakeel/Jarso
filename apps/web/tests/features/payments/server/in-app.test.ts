import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prefillSplit } from "@/features/allowance";
import { paymentCopy } from "@/features/payments";
import { AppError } from "@/lib";
import type { PaymentProvider } from "@/lib/payments";
import { createFakePaymentProvider } from "@/lib/payments/fake";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ kind: "user" })) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({ kind: "admin" })) }));
vi.mock("@/features/auth/server", () => ({ assertUser: vi.fn() }));
vi.mock("@/features/family/server", () => ({
  assertParentCanRead: vi.fn(),
  assertParentOf: vi.fn(),
  assertRole: vi.fn(),
  getFamily: vi.fn(),
  listChildren: vi.fn(),
}));
vi.mock("@/features/allowance/server", () => ({ getLastSplitWith: vi.fn() }));
vi.mock("@/lib/payments", () => ({
  getPaymentProviders: vi.fn(),
  getPaymentProviderById: vi.fn(),
  paymentsEnabled: vi.fn(),
}));
vi.mock("@/features/payments/server/repository", () => ({
  cancelPayment: vi.fn(),
  clearAutoChargeBy: vi.fn(),
  clearSavedCard: vi.fn(),
  expirePayment: vi.fn(),
  failSetup: vi.fn(),
  findAutoChargeTargetChildId: vi.fn(),
  findCustomer: vi.fn(),
  findLatestPayment: vi.fn(),
  findLivePayment: vi.fn(),
  findPaymentById: vi.fn(),
  findPaymentSource: vi.fn(),
  findSetupForParent: vi.fn(),
  insertCustomer: vi.fn(),
  insertPayment: vi.fn(),
  insertSetup: vi.fn(),
  setAutoChargeFor: vi.fn(),
  setPaymentHosted: vi.fn(),
  setPaymentInApp: vi.fn(),
  setPendingSplit: vi.fn(),
  setSetupProviderRef: vi.fn(),
}));
vi.mock("@/features/payments/server/webhooks", () => ({ handleProviderEvent: vi.fn() }));

const allowance = await import("@/features/allowance/server");
const family = await import("@/features/family/server");
const payments = await import("@/lib/payments");
const repo = await import("@/features/payments/server/repository");
const service = await import("@/features/payments/server/service");

const ADMIN = { kind: "admin" };
const APP = "http://localhost:3000";
const NOW = new Date("2026-11-03T10:00:00Z");
const MIN = 60_000;

const parent = { id: "parent-1", email: "p@example.com" };
const childId = "child-1";
const occurrenceId = "0b7e8f40-9d1a-4b2c-8e3f-1a2b3c4d5e6f";
const occurrence = {
  type: "occurrence" as const,
  id: occurrenceId,
  childId,
  familyId: "fam-1",
  amountMinor: 1000,
  open: true,
  dueOn: "2026-11-03",
};
const customer = { customerRef: "fake_cus_parent-1", methodRef: null, card: null };

let provider: ReturnType<typeof createFakePaymentProvider>;
let on: PaymentProvider[];

const otherProvider = (over: Partial<PaymentProvider> = {}): PaymentProvider => ({
  ...createFakePaymentProvider({ hostedUrl: `${APP}/dev/payments/fake` }),
  id: "stripe",
  label: "Stripe",
  ...over,
});

/** A live in-app payment for the item, paid by `parent` with the fake provider. */
const liveInApp = (over: Record<string, unknown> = {}) => ({
  id: "pay-old",
  trigger: "manual" as const,
  provider: "fake" as const,
  status: "pending" as const,
  payerId: parent.id,
  expiresAt: new Date(NOW.getTime() + 20 * MIN).toISOString(),
  redirectUrl: null,
  inApp: true,
  providerRef: "fake_pi_old",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  provider = createFakePaymentProvider({ hostedUrl: `${APP}/dev/payments/fake` });
  on = [provider];
  vi.mocked(payments.getPaymentProviders).mockImplementation(() => on);
  vi.mocked(payments.getPaymentProviderById).mockImplementation(
    (id) => on.find((p) => p.id === id) ?? null,
  );
  vi.mocked(payments.paymentsEnabled).mockImplementation(() => on.length > 0);
  vi.mocked(family.assertParentOf).mockResolvedValue(parent);
  vi.mocked(family.assertParentCanRead).mockResolvedValue(parent);
  vi.mocked(family.assertRole).mockResolvedValue({ user: parent, membership: null });
  vi.mocked(family.getFamily).mockResolvedValue({
    id: "fam-1",
    code: "ABC234",
    currency: "GBP",
    timezone: "UTC",
  });
  vi.mocked(family.listChildren).mockResolvedValue([{ id: childId, nickname: "Sam" }]);
  vi.mocked(allowance.getLastSplitWith).mockResolvedValue(null);
  vi.mocked(repo.findPaymentSource).mockResolvedValue(occurrence);
  vi.mocked(repo.findLivePayment).mockResolvedValue(null);
  vi.mocked(repo.findLatestPayment).mockResolvedValue(null);
  vi.mocked(repo.findCustomer).mockResolvedValue(customer);
  vi.mocked(repo.insertPayment).mockResolvedValue("pay-1");
  vi.mocked(repo.setPaymentInApp).mockResolvedValue(true);
  vi.mocked(repo.insertSetup).mockResolvedValue("setup-1");
  vi.mocked(repo.findAutoChargeTargetChildId).mockResolvedValue(childId);
  vi.mocked(repo.setAutoChargeFor).mockResolvedValue("ok");
});

afterEach(() => {
  vi.useRealTimers();
});

async function rejects(work: Promise<unknown>, code: string, message?: string) {
  const error = await work.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
  if (message) expect((error as AppError).message).toBe(message);
  return error as AppError;
}

const payInApp = (
  over: Partial<{ cashMinor: number; savedMinor: number; provider: PaymentProvider["id"] }> = {},
) =>
  service.startInAppPayment({
    kind: "allowance",
    id: occurrenceId,
    provider: "fake",
    cashMinor: 600,
    savedMinor: 400,
    ...over,
  });

describe("startInAppPayment", () => {
  it("starts an in-app payment and returns the provider's sheet", async () => {
    const result = await payInApp();

    expect(family.assertParentOf).toHaveBeenCalledWith(childId);
    expect(repo.insertPayment).toHaveBeenCalledWith(
      ADMIN,
      expect.objectContaining({
        inApp: true,
        trigger: "manual",
        status: "pending",
        provider: "fake",
        amountMinor: 1000,
        cashMinor: 600,
        savedMinor: 400,
      }),
    );
    expect(repo.setPaymentInApp).toHaveBeenCalledWith(ADMIN, "pay-1", "fake_pi_pay-1");
    expect(repo.setPaymentHosted).not.toHaveBeenCalled();
    expect(result).toEqual({
      paymentId: "pay-1",
      expiresAt: new Date(NOW.getTime() + 31 * MIN).toISOString(),
      sheet: { provider: "fake", mode: "payment", ref: "pay-1" },
    });
  });

  it("prefills the split when the phone sends none", async () => {
    vi.mocked(allowance.getLastSplitWith).mockResolvedValue({ cash: 1, saved: 1 });
    const expected = prefillSplit(1000, { cash: 1, saved: 1 });

    await service.startInAppPayment({ kind: "allowance", id: occurrenceId, provider: "fake" });

    expect(allowance.getLastSplitWith).toHaveBeenCalledWith({ kind: "user" }, childId);
    expect(repo.insertPayment).toHaveBeenCalledWith(
      ADMIN,
      expect.objectContaining({ cashMinor: expected.cash, savedMinor: expected.saved }),
    );
  });

  it("refuses a split that is not the full amount", async () => {
    await rejects(
      payInApp({ cashMinor: 100, savedMinor: 100 }),
      "VALIDATION",
      paymentCopy.fullAmount,
    );
    expect(repo.insertPayment).not.toHaveBeenCalled();
  });

  it("refuses a provider that has no in-app sheet", async () => {
    on = [otherProvider({ inApp: false })];
    await rejects(payInApp({ provider: "stripe" }), "NOT_FOUND", paymentCopy.off);
    expect(repo.insertPayment).not.toHaveBeenCalled();
  });

  it("refuses an item that isn't due any more", async () => {
    vi.mocked(repo.findPaymentSource).mockResolvedValue({ ...occurrence, open: false });
    await rejects(payInApp(), "CONFLICT", paymentCopy.notDue);
  });

  it("reuses the live in-app payment of the same provider", async () => {
    vi.mocked(repo.findLivePayment).mockResolvedValue(liveInApp());
    const resume = vi.spyOn(provider, "resumeInAppPayment");

    const result = await payInApp();

    expect(repo.insertPayment).not.toHaveBeenCalled();
    expect(repo.setPendingSplit).toHaveBeenCalledWith(ADMIN, "pay-old", {
      cashMinor: 600,
      savedMinor: 400,
    });
    expect(resume).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: "pay-old", providerRef: "fake_pi_old" }),
    );
    expect(result).toEqual({
      paymentId: "pay-old",
      expiresAt: liveInApp().expiresAt,
      sheet: { provider: "fake", mode: "payment", ref: "pay-old" },
    });
  });

  it("does not hand another parent's live in-app payment to this parent", async () => {
    vi.mocked(repo.findLivePayment).mockResolvedValue(liveInApp({ payerId: "parent-2" }));
    await rejects(payInApp(), "CONFLICT", paymentCopy.inProgress);
    expect(repo.insertPayment).not.toHaveBeenCalled();
  });

  it("expires a past-window in-app payment, cancels its intent, and starts a new one", async () => {
    vi.mocked(repo.findLivePayment).mockResolvedValue(
      liveInApp({ expiresAt: new Date(NOW.getTime() - MIN).toISOString() }),
    );
    const cancel = vi.spyOn(provider, "cancelInAppPayment");

    await payInApp();

    expect(repo.expirePayment).toHaveBeenCalledWith(ADMIN, "pay-old");
    expect(cancel).toHaveBeenCalledWith("fake_pi_old");
    expect(vi.mocked(repo.expirePayment).mock.invocationCallOrder[0]).toBeLessThan(
      cancel.mock.invocationCallOrder[0] ?? 0,
    );
    expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(repo.insertPayment).mock.invocationCallOrder[0] ?? 0,
    );
    expect(repo.insertPayment).toHaveBeenCalledTimes(1);
  });

  it("cancels a live hosted checkout when the phone starts in-app", async () => {
    vi.mocked(repo.findLivePayment).mockResolvedValue(
      liveInApp({
        id: "pay-hosted",
        inApp: false,
        providerRef: "fake_cs_pay-hosted",
        redirectUrl: "https://checkout.example/h",
      }),
    );
    const cancel = vi.spyOn(provider, "cancelInAppPayment");

    await payInApp();

    expect(repo.cancelPayment).toHaveBeenCalledWith(ADMIN, "pay-hosted");
    expect(cancel).not.toHaveBeenCalled();
    expect(repo.insertPayment).toHaveBeenCalledWith(
      ADMIN,
      expect.objectContaining({ inApp: true }),
    );
  });

  it("cancels a live in-app payment, and its intent, when the web starts hosted", async () => {
    vi.mocked(repo.findLivePayment).mockResolvedValue(liveInApp());
    const cancel = vi.spyOn(provider, "cancelInAppPayment");
    const hosted = vi.spyOn(provider, "createHostedPayment");

    await service.startCardPayment({
      kind: "allowance",
      id: occurrenceId,
      provider: "fake",
      cashMinor: 1000,
      savedMinor: 0,
    });

    expect(repo.cancelPayment).toHaveBeenCalledWith(ADMIN, "pay-old");
    expect(cancel).toHaveBeenCalledWith("fake_pi_old");
    expect(hosted).toHaveBeenCalledTimes(1);
  });

  it("answers CONFLICT while an in-app payment is still opening", async () => {
    vi.mocked(repo.findLivePayment).mockResolvedValue(liveInApp({ providerRef: null }));
    await rejects(payInApp(), "CONFLICT", paymentCopy.inProgress);
    expect(repo.cancelPayment).not.toHaveBeenCalled();
    expect(repo.insertPayment).not.toHaveBeenCalled();
  });

  it("answers CONFLICT while an auto charge is in flight", async () => {
    vi.mocked(repo.findLivePayment).mockResolvedValue(
      liveInApp({ trigger: "auto", inApp: false, providerRef: "fake_pi_auto" }),
    );
    await rejects(payInApp(), "CONFLICT", paymentCopy.inProgress);
    expect(repo.cancelPayment).not.toHaveBeenCalled();
  });

  it("sends a parallel tap to the winner's sheet", async () => {
    vi.mocked(repo.insertPayment).mockResolvedValue(null);
    vi.mocked(repo.findLivePayment)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(liveInApp({ id: "pay-winner", providerRef: "fake_pi_pay-winner" }));
    const resume = vi.spyOn(provider, "resumeInAppPayment");

    const result = await payInApp();

    expect(resume).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: "pay-winner", providerRef: "fake_pi_pay-winner" }),
    );
    expect(result.paymentId).toBe("pay-winner");
    expect(repo.cancelPayment).not.toHaveBeenCalled();
  });

  it("frees the item when the provider fails to create the intent", async () => {
    const unavailable = new AppError("UNAVAILABLE", "Card payments aren't available right now.");
    vi.spyOn(provider, "createInAppPayment").mockRejectedValue(unavailable);

    await rejects(payInApp(), "UNAVAILABLE");
    expect(repo.cancelPayment).toHaveBeenCalledWith(ADMIN, "pay-1");
    expect(repo.setPaymentInApp).not.toHaveBeenCalled();
  });
});
