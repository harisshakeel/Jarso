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
vi.mock("@/lib/payments", async (importOriginal) => ({
  FAKE_METHODS: (await importOriginal<typeof import("@/lib/payments")>()).FAKE_METHODS,
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
  findSetupForWebhook: vi.fn(),
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
const auth = await import("@/features/auth/server");
const family = await import("@/features/family/server");
const webhooks = await import("@/features/payments/server/webhooks");
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
  vi.mocked(auth.assertUser).mockResolvedValue(parent);
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

  it("does not let a co-parent cancel the payer's sheet from another provider", async () => {
    on = [otherProvider(), provider];
    vi.mocked(repo.findLivePayment).mockResolvedValue(liveInApp({ payerId: "parent-2" }));
    const cancel = vi.spyOn(provider, "cancelInAppPayment");
    await rejects(payInApp({ provider: "stripe" }), "CONFLICT", paymentCopy.inProgress);
    expect(repo.cancelPayment).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("does not let a co-parent's hosted checkout cancel the payer's sheet", async () => {
    vi.mocked(repo.findLivePayment).mockResolvedValue(liveInApp({ payerId: "parent-2" }));
    await rejects(
      service.startCardPayment({
        kind: "allowance",
        id: occurrenceId,
        provider: "fake",
        cashMinor: 1000,
        savedMinor: 0,
      }),
      "CONFLICT",
      paymentCopy.inProgress,
    );
    expect(repo.cancelPayment).not.toHaveBeenCalled();
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

const PAYMENT_ID = "5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a";
const USER = { kind: "user" };

/** A payment as the user's client reads it back (RLS: the child's parents). */
const paymentRow = (over: Record<string, unknown> = {}) => ({
  id: PAYMENT_ID,
  childId,
  payerId: parent.id,
  provider: "fake" as const,
  providerRef: `fake_pi_${PAYMENT_ID}`,
  status: "pending" as const,
  failureCode: null,
  trigger: "manual" as const,
  inApp: true,
  expiresAt: new Date(NOW.getTime() + 20 * MIN).toISOString(),
  ...over,
});

describe("getPaymentStatus", () => {
  it("reads a final status", async () => {
    vi.mocked(repo.findPaymentById).mockResolvedValue(paymentRow({ status: "succeeded" }));
    expect(await service.getPaymentStatus(PAYMENT_ID)).toEqual({
      id: PAYMENT_ID,
      status: "succeeded",
      failureCode: null,
      final: true,
    });
    expect(family.assertRole).toHaveBeenCalledWith("parent");
    expect(repo.findPaymentById).toHaveBeenCalledWith(USER, PAYMENT_ID);
  });

  it("reads a live payment as not final", async () => {
    vi.mocked(repo.findPaymentById).mockResolvedValue(paymentRow());
    expect(await service.getPaymentStatus(PAYMENT_ID)).toMatchObject({
      status: "pending",
      final: false,
    });
    expect(repo.expirePayment).not.toHaveBeenCalled();
  });

  it("expires a past-window in-app payment on read", async () => {
    const past = { expiresAt: new Date(NOW.getTime() - MIN).toISOString() };
    vi.mocked(repo.findPaymentById)
      .mockResolvedValueOnce(paymentRow(past))
      .mockResolvedValueOnce(paymentRow({ ...past, status: "expired" }));
    const cancel = vi.spyOn(provider, "cancelInAppPayment");

    expect(await service.getPaymentStatus(PAYMENT_ID)).toMatchObject({
      status: "expired",
      final: true,
    });
    expect(repo.expirePayment).toHaveBeenCalledWith(ADMIN, PAYMENT_ID);
    expect(cancel).toHaveBeenCalledWith(`fake_pi_${PAYMENT_ID}`);
  });

  it("answers NOT_FOUND for a payment the caller cannot read", async () => {
    vi.mocked(repo.findPaymentById).mockResolvedValue(null);
    await rejects(service.getPaymentStatus(PAYMENT_ID), "NOT_FOUND", "We couldn't find that.");
  });

  it("answers NOT_FOUND when payments are off", async () => {
    on = [];
    await rejects(service.getPaymentStatus(PAYMENT_ID), "NOT_FOUND");
    expect(repo.findPaymentById).not.toHaveBeenCalled();
  });

  it("refuses a child", async () => {
    vi.mocked(family.assertRole).mockRejectedValue(new AppError("FORBIDDEN", "You can't do that."));
    await rejects(service.getPaymentStatus(PAYMENT_ID), "FORBIDDEN");
    expect(repo.findPaymentById).not.toHaveBeenCalled();
  });
});

describe("cancelInAppPaymentById", () => {
  it("cancels the payer's own pending in-app payment", async () => {
    vi.mocked(repo.findPaymentById).mockResolvedValue(paymentRow());
    const cancel = vi.spyOn(provider, "cancelInAppPayment");

    expect(await service.cancelInAppPaymentById(PAYMENT_ID)).toEqual({ canceled: true });
    expect(repo.cancelPayment).toHaveBeenCalledWith(ADMIN, PAYMENT_ID);
    expect(cancel).toHaveBeenCalledWith(`fake_pi_${PAYMENT_ID}`);
  });

  it.each([
    ["another parent's in-app payment", { payerId: "parent-2" }],
    ["a hosted checkout", { inApp: false }],
    ["an auto charge", { trigger: "auto", inApp: false }],
    ["a payment waiting on the bank", { status: "requires_action" }],
    ["a payment that already ended", { status: "succeeded" }],
  ])("does not cancel %s", async (_name, over) => {
    vi.mocked(repo.findPaymentById).mockResolvedValue(paymentRow(over));
    const cancel = vi.spyOn(provider, "cancelInAppPayment");

    expect(await service.cancelInAppPaymentById(PAYMENT_ID)).toEqual({ canceled: false });
    expect(repo.cancelPayment).not.toHaveBeenCalled();
    expect(repo.expirePayment).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("answers NOT_FOUND for a payment the caller cannot read", async () => {
    vi.mocked(repo.findPaymentById).mockResolvedValue(null);
    await rejects(service.cancelInAppPaymentById(PAYMENT_ID), "NOT_FOUND");
  });

  it("answers NOT_FOUND when payments are off", async () => {
    on = [];
    await rejects(service.cancelInAppPaymentById(PAYMENT_ID), "NOT_FOUND");
    expect(repo.findPaymentById).not.toHaveBeenCalled();
  });
});

describe("setAutoChargeInApp", () => {
  const scheduleId = "sched-1";
  const turnOn = {
    type: "allowance_schedule" as const,
    id: scheduleId,
    on: true,
    provider: "fake" as const,
  };

  it("opens an in-app setup with the arm target when no card is saved", async () => {
    const setup = vi.spyOn(provider, "createInAppSetup");

    expect(await service.setAutoChargeInApp(turnOn)).toEqual({
      setup: { setupId: "setup-1", sheet: { provider: "fake", mode: "setup", ref: "setup-1" } },
    });
    expect(repo.insertSetup).toHaveBeenCalledWith(ADMIN, {
      parentId: parent.id,
      provider: "fake",
      arm: { type: "allowance_schedule", id: scheduleId },
    });
    expect(setup).toHaveBeenCalledWith({ setupId: "setup-1", customerRef: customer.customerRef });
    expect(repo.setSetupProviderRef).toHaveBeenCalledWith(ADMIN, "setup-1", "fake_seti_setup-1");
    expect(repo.setAutoChargeFor).not.toHaveBeenCalled();
  });

  it("turns auto charge on without a setup when a card is saved", async () => {
    vi.mocked(repo.findCustomer).mockResolvedValue({
      ...customer,
      methodRef: "fake_pm_ok",
      card: { brand: "visa", last4: "4242" },
    });

    expect(await service.setAutoChargeInApp(turnOn)).toEqual({ setup: null });
    expect(repo.setAutoChargeFor).toHaveBeenCalledWith(
      USER,
      { type: "allowance_schedule", id: scheduleId },
      true,
      "fake",
    );
    expect(repo.insertSetup).not.toHaveBeenCalled();
  });

  it("asks Razorpay's contact before creating anything", async () => {
    on = [otherProvider({ id: "razorpay", label: "Razorpay", setupNeedsContact: true })];
    const error = await rejects(
      service.setAutoChargeInApp({ ...turnOn, provider: "razorpay" }),
      "VALIDATION",
    );
    expect(error.fieldErrors).toHaveProperty("phone");
    expect(repo.insertSetup).not.toHaveBeenCalled();
    expect(repo.insertCustomer).not.toHaveBeenCalled();
  });

  it("passes the account email and the tidied phone to Razorpay", async () => {
    const razorpay = otherProvider({ id: "razorpay", label: "Razorpay", setupNeedsContact: true });
    on = [razorpay];
    const setup = vi.spyOn(razorpay, "createInAppSetup");

    await service.setAutoChargeInApp({
      ...turnOn,
      provider: "razorpay",
      phone: "+91 98765 43210",
    });

    expect(setup).toHaveBeenCalledWith(
      expect.objectContaining({ contact: { email: parent.email, phone: "+919876543210" } }),
    );
  });

  it("refuses a provider that has no in-app sheet", async () => {
    on = [otherProvider({ inApp: false })];
    await rejects(service.setAutoChargeInApp({ ...turnOn, provider: "stripe" }), "NOT_FOUND");
    expect(repo.insertSetup).not.toHaveBeenCalled();
  });

  it("marks the setup failed when the provider fails", async () => {
    const unavailable = new AppError("UNAVAILABLE", "Card payments aren't available right now.");
    vi.spyOn(provider, "createInAppSetup").mockRejectedValue(unavailable);
    await rejects(service.setAutoChargeInApp(turnOn), "UNAVAILABLE");
    expect(repo.failSetup).toHaveBeenCalledWith(ADMIN, "setup-1");
    expect(repo.setSetupProviderRef).not.toHaveBeenCalled();
  });

  it("turns auto charge off", async () => {
    expect(
      await service.setAutoChargeInApp({ type: "parent_gift", id: "gift-1", on: false }),
    ).toEqual({ setup: null });
    expect(repo.setAutoChargeFor).toHaveBeenCalledWith(
      USER,
      { type: "parent_gift", id: "gift-1" },
      false,
      null,
    );
  });
});

describe("getInAppProviders", () => {
  it("lists only in-app providers", async () => {
    on = [otherProvider({ inApp: false }), provider];
    const occurrenceSource = { childId, kind: "allowance" as const, id: occurrenceId };

    const result = await service.getInAppProviders(occurrenceSource);

    expect(result.cards.map((card) => card.provider)).toEqual(["fake"]);
    expect(result.item?.providers.map((entry) => entry.id)).toEqual(["fake"]);
    expect(family.assertParentCanRead).toHaveBeenCalledWith(childId);
    expect(repo.findPaymentSource).toHaveBeenCalledWith(USER, {
      type: "occurrence",
      id: occurrenceId,
    });
  });

  it("has no item without one asked for", async () => {
    expect(await service.getInAppProviders()).toEqual({
      cards: [expect.objectContaining({ provider: "fake", cardSaved: false })],
      item: null,
    });
    expect(repo.findPaymentSource).not.toHaveBeenCalled();
  });

  it("is empty with payments off", async () => {
    on = [];
    expect(await service.getInAppProviders()).toEqual({ cards: [], item: null });
  });

  it("refuses a child", async () => {
    vi.mocked(family.assertRole).mockRejectedValue(new AppError("FORBIDDEN", "You can't do that."));
    await rejects(service.getInAppProviders(), "FORBIDDEN");
  });
});

describe("completeFakeInApp", () => {
  const SETUP_ID = "8b0c2a4e-5f1d-4c3b-9a7e-2d6f8e1b3c5a";

  it("completes the payer's fake payment", async () => {
    vi.mocked(repo.findPaymentById).mockResolvedValue(paymentRow());

    await service.completeFakeInApp({ mode: "payment", ref: PAYMENT_ID, outcome: "pay" });

    expect(repo.findPaymentById).toHaveBeenCalledWith(USER, PAYMENT_ID);
    expect(webhooks.handleProviderEvent).toHaveBeenCalledWith(
      "fake",
      expect.objectContaining({
        kind: "payment",
        paymentId: PAYMENT_ID,
        providerRef: `fake_pi_${PAYMENT_ID}`,
        status: "succeeded",
      }),
    );
  });

  it("fails the payer's fake payment on decline", async () => {
    vi.mocked(repo.findPaymentById).mockResolvedValue(paymentRow());
    await service.completeFakeInApp({ mode: "payment", ref: PAYMENT_ID, outcome: "fail" });
    expect(webhooks.handleProviderEvent).toHaveBeenCalledWith(
      "fake",
      expect.objectContaining({ kind: "payment", status: "failed", failureCode: "declined" }),
    );
  });

  it("refuses to complete another parent's fake payment", async () => {
    vi.mocked(repo.findPaymentById).mockResolvedValue(paymentRow({ payerId: "parent-2" }));
    await rejects(
      service.completeFakeInApp({ mode: "payment", ref: PAYMENT_ID, outcome: "pay" }),
      "FORBIDDEN",
    );
    expect(webhooks.handleProviderEvent).not.toHaveBeenCalled();
  });

  it("refuses a payment made with a real provider", async () => {
    vi.mocked(repo.findPaymentById).mockResolvedValue(paymentRow({ provider: "stripe" }));
    await rejects(
      service.completeFakeInApp({ mode: "payment", ref: PAYMENT_ID, outcome: "pay" }),
      "FORBIDDEN",
    );
    expect(webhooks.handleProviderEvent).not.toHaveBeenCalled();
  });

  it("saves the parent's own fake card setup", async () => {
    vi.mocked(repo.findSetupForWebhook).mockResolvedValue({
      id: SETUP_ID,
      parentId: parent.id,
      provider: "fake",
      status: "pending",
      arm: null,
    });

    await service.completeFakeInApp({ mode: "setup", ref: SETUP_ID, outcome: "ok" });

    expect(repo.findSetupForWebhook).toHaveBeenCalledWith(USER, SETUP_ID);
    expect(webhooks.handleProviderEvent).toHaveBeenCalledWith(
      "fake",
      expect.objectContaining({ kind: "setup", setupId: SETUP_ID }),
    );
  });

  it("refuses another parent's setup", async () => {
    vi.mocked(repo.findSetupForWebhook).mockResolvedValue({
      id: SETUP_ID,
      parentId: "parent-2",
      provider: "fake",
      status: "pending",
      arm: null,
    });
    await rejects(
      service.completeFakeInApp({ mode: "setup", ref: SETUP_ID, outcome: "ok" }),
      "FORBIDDEN",
    );
    expect(webhooks.handleProviderEvent).not.toHaveBeenCalled();
  });

  it("answers NOT_FOUND when the fake provider is off", async () => {
    on = [otherProvider()];
    await rejects(
      service.completeFakeInApp({ mode: "payment", ref: PAYMENT_ID, outcome: "pay" }),
      "NOT_FOUND",
    );
    expect(family.assertRole).not.toHaveBeenCalled();
    expect(webhooks.handleProviderEvent).not.toHaveBeenCalled();
  });
});
