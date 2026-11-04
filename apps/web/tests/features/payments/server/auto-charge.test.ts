import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib";
import { FAKE_METHODS, type PaymentProvider } from "@/lib/payments";
import { createFakePaymentProvider } from "@/lib/payments/fake";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({ kind: "admin" })) }));
vi.mock("@/lib/payments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payments")>()),
  getPaymentProviders: vi.fn(),
  getPaymentProviderById: vi.fn(),
}));
vi.mock("@/features/allowance/server", () => ({ getLastSplitWith: vi.fn() }));
vi.mock("@/features/payments/server/repository", () => ({
  applyPayment: vi.fn(),
  expirePayment: vi.fn(),
  failPayment: vi.fn(),
  insertPayment: vi.fn(),
  listDueAutoCharges: vi.fn(),
  listStaleLivePayments: vi.fn(),
  setPaymentProviderRef: vi.fn(),
}));

const allowance = await import("@/features/allowance/server");
const payments = await import("@/lib/payments");
const repo = await import("@/features/payments/server/repository");
const { runAutoCharges } = await import("@/features/payments/server/auto-charge");

const ADMIN = { kind: "admin" };
const NOW = new Date("2026-11-02T03:09:00.000Z");
const CHILD = "c1111111-1111-4111-8111-111111111111";
const PARENT = "p1111111-1111-4111-8111-111111111111";

const due = (id: string, methodRef: string = FAKE_METHODS.ok, amountMinor = 1000) => ({
  source: { type: "occurrence" as const, id },
  familyId: "f1111111-1111-4111-8111-111111111111",
  childId: CHILD,
  payerId: PARENT,
  amountMinor,
  currency: "GBP",
  customerRef: "fake_cus_1",
  methodRef,
  provider: "fake" as const,
});

/** A stale live payment, as the sweep lists it. */
const stale = (id: string, over: { inApp?: boolean; providerRef?: string | null } = {}) => ({
  id,
  provider: "fake" as const,
  providerRef: null,
  inApp: false,
  ...over,
});

let provider: ReturnType<typeof createFakePaymentProvider>;
/** The providers on for this test (the registry, mocked). */
let on: PaymentProvider[];

beforeEach(() => {
  vi.clearAllMocks();
  provider = createFakePaymentProvider({ hostedUrl: "http://localhost:3000/dev/payments/fake" });
  on = [provider];
  vi.mocked(payments.getPaymentProviders).mockImplementation(() => on);
  vi.mocked(payments.getPaymentProviderById).mockImplementation(
    (id) => on.find((p) => p.id === id) ?? null,
  );
  vi.mocked(repo.listStaleLivePayments).mockResolvedValue([]);
  vi.mocked(repo.listDueAutoCharges).mockResolvedValue([]);
  vi.mocked(allowance.getLastSplitWith).mockResolvedValue(null);
  vi.mocked(repo.insertPayment).mockImplementation(async (_db, row) => `pay-${row.source.id}`);
  vi.mocked(repo.setPaymentProviderRef).mockResolvedValue(true);
  vi.mocked(repo.applyPayment).mockResolvedValue("confirmed");
});

describe("runAutoCharges", () => {
  it("does nothing with payments off", async () => {
    on = [];
    expect(await runAutoCharges(NOW)).toEqual({
      attempted: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
    });
    expect(repo.listDueAutoCharges).not.toHaveBeenCalled();
  });

  it("claims each due item with an auto payment split like the last handover", async () => {
    vi.mocked(repo.listDueAutoCharges).mockResolvedValue([
      due("o1", FAKE_METHODS.ok, 1000),
      due("o2", FAKE_METHODS.ok, 500),
    ]);
    vi.mocked(allowance.getLastSplitWith)
      .mockResolvedValueOnce({ cash: 300, saved: 100 })
      .mockResolvedValueOnce(null);

    await runAutoCharges(NOW);

    expect(repo.listDueAutoCharges).toHaveBeenCalledWith(ADMIN, ["fake"], NOW, expect.any(Number));
    expect(allowance.getLastSplitWith).toHaveBeenCalledWith(ADMIN, CHILD);
    expect(repo.insertPayment).toHaveBeenCalledTimes(2);
    const expiresAt = new Date(NOW.getTime() + 30 * 60_000).toISOString();
    expect(repo.insertPayment).toHaveBeenNthCalledWith(1, ADMIN, {
      familyId: "f1111111-1111-4111-8111-111111111111",
      childId: CHILD,
      payerId: PARENT,
      provider: "fake",
      source: { type: "occurrence", id: "o1" },
      amountMinor: 1000,
      currency: "GBP",
      cashMinor: 750,
      savedMinor: 250,
      trigger: "auto",
      status: "pending",
      expiresAt,
    });
    // No last split: all to Spend.
    expect(repo.insertPayment).toHaveBeenNthCalledWith(
      2,
      ADMIN,
      expect.objectContaining({ amountMinor: 500, cashMinor: 500, savedMinor: 0, expiresAt }),
    );
  });

  it("charges each item with its own provider and its settle window", async () => {
    const slow: PaymentProvider = {
      ...createFakePaymentProvider({ hostedUrl: "http://localhost:3000/dev/payments/fake" }),
      id: "razorpay",
      label: "Razorpay",
      autoChargeSettleMinutes: 4320,
    };
    on = [provider, slow];
    vi.mocked(repo.listDueAutoCharges).mockResolvedValue([
      due("o1"),
      { ...due("o2"), provider: "razorpay", customerRef: "cust_1", methodRef: "m_2" },
    ]);
    const fakeCharge = vi.spyOn(provider, "chargeSaved");
    const slowCharge = vi.spyOn(slow, "chargeSaved").mockResolvedValue({
      providerRef: "order_2",
      status: "pending",
    });

    expect(await runAutoCharges(NOW)).toEqual({
      attempted: 2,
      succeeded: 1,
      failed: 0,
      skipped: 0,
    });

    expect(repo.listDueAutoCharges).toHaveBeenCalledWith(
      ADMIN,
      ["fake", "razorpay"],
      NOW,
      expect.any(Number),
    );
    expect(repo.insertPayment).toHaveBeenCalledWith(
      ADMIN,
      expect.objectContaining({
        source: { type: "occurrence", id: "o1" },
        provider: "fake",
        expiresAt: new Date(NOW.getTime() + 30 * 60_000).toISOString(),
      }),
    );
    expect(repo.insertPayment).toHaveBeenCalledWith(
      ADMIN,
      expect.objectContaining({
        source: { type: "occurrence", id: "o2" },
        provider: "razorpay",
        expiresAt: new Date(NOW.getTime() + 4320 * 60_000).toISOString(),
      }),
    );
    expect(fakeCharge).toHaveBeenCalledTimes(1);
    expect(fakeCharge).toHaveBeenCalledWith(expect.objectContaining({ paymentId: "pay-o1" }));
    expect(slowCharge).toHaveBeenCalledTimes(1);
    expect(slowCharge).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: "pay-o2", customerRef: "cust_1", methodRef: "m_2" }),
    );
  });

  it("skips an item whose provider is not on, without claiming it", async () => {
    vi.mocked(repo.listDueAutoCharges).mockResolvedValue([{ ...due("o1"), provider: "stripe" }]);

    expect(await runAutoCharges(NOW)).toMatchObject({ attempted: 0, skipped: 1 });
    expect(repo.insertPayment).not.toHaveBeenCalled();
  });

  it("posts a synchronous success through apply_payment and stores the provider ref", async () => {
    vi.mocked(repo.listDueAutoCharges).mockResolvedValue([due("o1")]);
    const charge = vi.spyOn(provider, "chargeSaved");

    expect(await runAutoCharges(NOW)).toEqual({
      attempted: 1,
      succeeded: 1,
      failed: 0,
      skipped: 0,
    });

    expect(charge).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: "pay-o1",
        amountMinor: 1000,
        currency: "GBP",
        customerRef: "fake_cus_1",
        methodRef: FAKE_METHODS.ok,
      }),
    );
    expect(repo.setPaymentProviderRef).toHaveBeenCalledWith(ADMIN, "pay-o1", "fake_pi_pay-o1");
    expect(repo.applyPayment).toHaveBeenCalledWith(ADMIN, "pay-o1");
    expect(repo.failPayment).not.toHaveBeenCalled();
  });

  it("still applies a success when the provider ref is already taken", async () => {
    vi.mocked(repo.listDueAutoCharges).mockResolvedValue([due("o1")]);
    vi.mocked(repo.setPaymentProviderRef).mockResolvedValue(false);

    expect(await runAutoCharges(NOW)).toMatchObject({ succeeded: 1, failed: 0 });
    expect(repo.applyPayment).toHaveBeenCalledWith(ADMIN, "pay-o1");
  });

  it("does not store an empty provider ref", async () => {
    vi.mocked(repo.listDueAutoCharges).mockResolvedValue([due("o1")]);
    vi.spyOn(provider, "chargeSaved").mockResolvedValue({ providerRef: "", status: "succeeded" });

    await runAutoCharges(NOW);
    expect(repo.setPaymentProviderRef).not.toHaveBeenCalled();
    expect(repo.applyPayment).toHaveBeenCalledWith(ADMIN, "pay-o1");
  });

  it("marks a declined card failed (which notifies the payer)", async () => {
    vi.mocked(repo.listDueAutoCharges).mockResolvedValue([due("o1", FAKE_METHODS.decline)]);

    expect(await runAutoCharges(NOW)).toEqual({
      attempted: 1,
      succeeded: 0,
      failed: 1,
      skipped: 0,
    });
    expect(repo.failPayment).toHaveBeenCalledWith(ADMIN, "pay-o1", "failed", "declined");
    expect(repo.applyPayment).not.toHaveBeenCalled();
  });

  it("uses 'other' when a failure has no code", async () => {
    vi.mocked(repo.listDueAutoCharges).mockResolvedValue([due("o1")]);
    vi.spyOn(provider, "chargeSaved").mockResolvedValue({ providerRef: "x", status: "failed" });

    await runAutoCharges(NOW);
    expect(repo.failPayment).toHaveBeenCalledWith(ADMIN, "pay-o1", "failed", "other");
  });

  it("leaves a synchronous pending result for the webhook", async () => {
    vi.mocked(repo.listDueAutoCharges).mockResolvedValue([due("o1")]);
    vi.spyOn(provider, "chargeSaved").mockResolvedValue({ providerRef: "pi_1", status: "pending" });

    expect(await runAutoCharges(NOW)).toEqual({
      attempted: 1,
      succeeded: 0,
      failed: 0,
      skipped: 0,
    });
    expect(repo.setPaymentProviderRef).toHaveBeenCalledWith(ADMIN, "pay-o1", "pi_1");
    expect(repo.applyPayment).not.toHaveBeenCalled();
    expect(repo.failPayment).not.toHaveBeenCalled();
  });

  it("skips an item another run already claimed, without charging it", async () => {
    vi.mocked(repo.listDueAutoCharges).mockResolvedValue([due("o1")]);
    vi.mocked(repo.insertPayment).mockResolvedValue(null);
    const charge = vi.spyOn(provider, "chargeSaved");

    expect(await runAutoCharges(NOW)).toEqual({
      attempted: 0,
      succeeded: 0,
      failed: 0,
      skipped: 1,
    });
    expect(charge).not.toHaveBeenCalled();
  });

  it("leaves the payment pending on a provider outage, counts it failed and carries on", async () => {
    vi.mocked(repo.listDueAutoCharges).mockResolvedValue([due("o1"), due("o2")]);
    vi.spyOn(provider, "chargeSaved")
      .mockRejectedValueOnce(
        new AppError("UNAVAILABLE", "Card payments aren't available right now."),
      )
      .mockResolvedValueOnce({ providerRef: "fake_pi_pay-o2", status: "succeeded" });

    expect(await runAutoCharges(NOW)).toEqual({
      attempted: 2,
      succeeded: 1,
      failed: 1,
      skipped: 0,
    });
    expect(repo.failPayment).not.toHaveBeenCalled();
    expect(repo.expirePayment).not.toHaveBeenCalled();
    expect(repo.applyPayment).toHaveBeenCalledTimes(1);
    expect(repo.applyPayment).toHaveBeenCalledWith(ADMIN, "pay-o2");
  });

  it.each([
    ["an amount below the provider's minimum", "GBP", 10, () => 30],
    ["a currency the card can't charge", "JPY", 1000, () => null],
  ])(
    "claims %s, then fails it so the payer hears once and it leaves selection",
    async (_name, currency, amountMinor, minimum) => {
      vi.mocked(repo.listDueAutoCharges).mockResolvedValue([
        { ...due("o1", FAKE_METHODS.ok, amountMinor), currency },
        due("o2"),
      ]);
      vi.spyOn(provider, "minimumChargeMinor").mockImplementation((c) =>
        c === currency ? minimum() : 1,
      );
      const charge = vi.spyOn(provider, "chargeSaved");

      expect(await runAutoCharges(NOW)).toEqual({
        attempted: 2,
        succeeded: 1,
        failed: 1,
        skipped: 0,
      });
      expect(repo.insertPayment).toHaveBeenCalledWith(
        ADMIN,
        expect.objectContaining({
          source: { type: "occurrence", id: "o1" },
          amountMinor,
          currency,
          trigger: "auto",
          status: "pending",
        }),
      );
      expect(repo.failPayment).toHaveBeenCalledWith(ADMIN, "pay-o1", "failed", "other");
      expect(charge).toHaveBeenCalledTimes(1);
      expect(charge).toHaveBeenCalledWith(expect.objectContaining({ paymentId: "pay-o2" }));
    },
  );

  it("skips an unchargeable item another run already claimed", async () => {
    vi.mocked(repo.listDueAutoCharges).mockResolvedValue([due("o1", FAKE_METHODS.ok, 10)]);
    vi.spyOn(provider, "minimumChargeMinor").mockReturnValue(30);
    vi.mocked(repo.insertPayment).mockResolvedValue(null);

    expect(await runAutoCharges(NOW)).toMatchObject({ attempted: 0, failed: 0, skipped: 1 });
    expect(repo.failPayment).not.toHaveBeenCalled();
  });

  it("expires stale live payments before selecting what is due", async () => {
    const order: string[] = [];
    vi.mocked(repo.listStaleLivePayments).mockImplementation(async () => {
      order.push("stale");
      return [stale("old-1"), stale("old-2")];
    });
    vi.mocked(repo.expirePayment).mockImplementation(async (_db, id) => {
      order.push(`expire:${id}`);
    });
    vi.mocked(repo.listDueAutoCharges).mockImplementation(async () => {
      order.push("due");
      return [];
    });

    await runAutoCharges(NOW);
    expect(repo.listStaleLivePayments).toHaveBeenCalledWith(ADMIN, NOW);
    expect(order).toEqual(["stale", "expire:old-1", "expire:old-2", "due"]);
  });

  it("expires stale payments and cancels in-app intents", async () => {
    vi.mocked(repo.listStaleLivePayments).mockResolvedValue([
      stale("old-1"),
      stale("old-2", { inApp: true, providerRef: "fake_pi_old-2" }),
    ]);
    const cancel = vi.spyOn(provider, "cancelInAppPayment");

    await runAutoCharges(NOW);

    expect(repo.expirePayment).toHaveBeenCalledWith(ADMIN, "old-1");
    expect(repo.expirePayment).toHaveBeenCalledWith(ADMIN, "old-2");
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith("fake_pi_old-2");
  });

  it("keeps sweeping when one stale payment can't be expired", async () => {
    vi.mocked(repo.listStaleLivePayments).mockResolvedValue([stale("old-1"), stale("old-2")]);
    vi.mocked(repo.expirePayment).mockRejectedValueOnce(new Error("deadlock"));

    await runAutoCharges(NOW);

    expect(repo.expirePayment).toHaveBeenCalledWith(ADMIN, "old-2");
  });
});
