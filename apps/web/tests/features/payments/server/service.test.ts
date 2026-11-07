import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { paymentCopy } from "@/features/payments";
import { AppError, logger } from "@/lib";
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
vi.mock("@/features/allowance/server", () => ({ getHandoverPrefillWith: vi.fn() }));
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
  findPaymentSource: vi.fn(),
  insertCustomer: vi.fn(),
  insertPayment: vi.fn(),
  insertSetup: vi.fn(),
  setAutoChargeFor: vi.fn(),
  setPaymentHosted: vi.fn(),
  setPaymentInApp: vi.fn(),
  setPendingSplit: vi.fn(),
  setSetupProviderRef: vi.fn(),
}));

const auth = await import("@/features/auth/server");
const family = await import("@/features/family/server");
const payments = await import("@/lib/payments");
const repo = await import("@/features/payments/server/repository");
const service = await import("@/features/payments/server/service");

const USER = { kind: "user" };
const ADMIN = { kind: "admin" };
const APP = "http://localhost:3000";
const NOW = new Date("2026-10-31T10:00:00Z");
const MIN = 60_000;

const parent = { id: "parent-1", email: "p@example.com" };
const childId = "child-1";
const occurrenceId = "occ-1";
const scheduleId = "sched-1";
const occurrence = {
  type: "occurrence" as const,
  id: occurrenceId,
  childId,
  familyId: "fam-1",
  amountMinor: 500,
  open: true,
  dueOn: "2026-10-31",
};
const customer = { customerRef: "fake_cus_parent-1", methodRef: null, card: null };
const savedCustomer = {
  customerRef: "fake_cus_parent-1",
  methodRef: "fake_pm_ok",
  card: { brand: "visa", last4: "4242" },
};

/** The family's currency becomes JPY, which a provider built with `noJpy` can't charge. */
const familyInJpy = () =>
  vi.mocked(family.getFamily).mockResolvedValue({
    id: "fam-1",
    code: "ABC234",
    currency: "JPY",
    timezone: "UTC",
  });
const noJpy = { minimumChargeMinor: (c: string) => (c === "JPY" ? null : 1) };

let provider: ReturnType<typeof createFakePaymentProvider>;
/** The providers on for this test (the registry, mocked). */
let on: PaymentProvider[];

/** A second provider, built from the fake, for tests with several on. */
const otherProvider = (over: Partial<PaymentProvider> = {}): PaymentProvider => ({
  ...createFakePaymentProvider({ hostedUrl: `${APP}/dev/payments/fake` }),
  id: "stripe",
  label: "Stripe",
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
  vi.mocked(repo.findPaymentSource).mockResolvedValue(occurrence);
  vi.mocked(repo.findLivePayment).mockResolvedValue(null);
  vi.mocked(repo.findLatestPayment).mockResolvedValue(null);
  vi.mocked(repo.findCustomer).mockResolvedValue(customer);
  vi.mocked(repo.insertPayment).mockResolvedValue("pay-1");
  vi.mocked(repo.insertSetup).mockResolvedValue("setup-1");
  vi.mocked(repo.findAutoChargeTargetChildId).mockResolvedValue(childId);
  vi.mocked(repo.setAutoChargeFor).mockResolvedValue("ok");
});

afterEach(() => {
  vi.useRealTimers();
});

const pay = (
  over: Partial<{ cashMinor: number; savedMinor: number; provider: PaymentProvider["id"] }> = {},
) =>
  service.startCardPayment({
    kind: "allowance",
    id: occurrenceId,
    provider: "fake",
    cashMinor: 300,
    savedMinor: 200,
    ...over,
  });

async function rejects(work: Promise<unknown>, code: string, message?: string) {
  const error = await work.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
  if (message) expect((error as AppError).message).toBe(message);
}

describe("startCardPayment", () => {
  it("inserts a manual pending payment, opens a hosted payment for it and returns its URL", async () => {
    const hosted = vi.spyOn(provider, "createHostedPayment");

    const { redirectUrl } = await pay();

    expect(family.assertParentOf).toHaveBeenCalledWith(childId);
    expect(repo.insertPayment).toHaveBeenCalledWith(ADMIN, {
      familyId: "fam-1",
      childId,
      payerId: parent.id,
      provider: "fake",
      source: { type: "occurrence", id: occurrenceId },
      amountMinor: 500,
      currency: "GBP",
      cashMinor: 300,
      savedMinor: 200,
      trigger: "manual",
      status: "pending",
      expiresAt: new Date(NOW.getTime() + 31 * MIN).toISOString(),
    });
    const base = `${APP}/parent/children/${childId}/handover/allowance/${occurrenceId}`;
    expect(hosted).toHaveBeenCalledWith({
      paymentId: "pay-1",
      amountMinor: 500,
      currency: "GBP",
      customerRef: customer.customerRef,
      description: "Allowance for Sam",
      successUrl: `${base}?card=returned`,
      cancelUrl: `${base}?card=cancelled`,
      expiresAt: new Date(NOW.getTime() + 31 * MIN),
    });
    const result = await hosted.mock.results[0]?.value;
    expect(redirectUrl).toBe(result?.redirectUrl);
    expect(repo.setPaymentHosted).toHaveBeenCalledWith(ADMIN, "pay-1", {
      providerRef: "fake_cs_pay-1",
      redirectUrl,
    });
  });

  it("describes a gift as a gift and sends it back to the gift handover", async () => {
    vi.mocked(repo.findPaymentSource).mockResolvedValue({
      ...occurrence,
      type: "parent_gift",
      id: "gift-1",
    });
    const hosted = vi.spyOn(provider, "createHostedPayment");

    await service.startCardPayment({
      kind: "gift",
      id: "gift-1",
      provider: "fake",
      cashMinor: 500,
      savedMinor: 0,
    });

    expect(repo.findPaymentSource).toHaveBeenCalledWith(USER, {
      type: "parent_gift",
      id: "gift-1",
    });
    expect(hosted).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Gift for Sam",
        successUrl: `${APP}/parent/children/${childId}/handover/gift/gift-1?card=returned`,
      }),
    );
  });

  it("reuses a live payment within its 31 minutes: same URL, no new insert", async () => {
    const first = await pay();
    vi.mocked(repo.findLivePayment).mockResolvedValue({
      id: "pay-1",
      trigger: "manual",
      provider: "fake" as const,
      status: "pending",
      payerId: parent.id,
      expiresAt: new Date(NOW.getTime() + 30 * MIN).toISOString(),
      redirectUrl: first.redirectUrl,
      inApp: false,
      providerRef: null,
    });
    vi.mocked(repo.insertPayment).mockClear();
    const hosted = vi.spyOn(provider, "createHostedPayment");

    vi.setSystemTime(new Date(NOW.getTime() + 10 * MIN));
    const second = await pay();

    expect(second.redirectUrl).toBe(first.redirectUrl);
    expect(repo.insertPayment).not.toHaveBeenCalled();
    expect(hosted).not.toHaveBeenCalled();
    expect(repo.expirePayment).not.toHaveBeenCalled();
  });

  it("reuses a live manual payment with the new split, which never goes to the provider", async () => {
    vi.mocked(repo.findLivePayment).mockResolvedValue({
      id: "pay-1",
      trigger: "manual",
      provider: "fake" as const,
      status: "pending",
      payerId: parent.id,
      expiresAt: new Date(NOW.getTime() + 20 * MIN).toISOString(),
      redirectUrl: "https://checkout.example/1",
      inApp: false,
      providerRef: null,
    });
    const hosted = vi.spyOn(provider, "createHostedPayment");

    const { redirectUrl } = await pay({ cashMinor: 100, savedMinor: 400 });

    expect(redirectUrl).toBe("https://checkout.example/1");
    expect(repo.setPendingSplit).toHaveBeenCalledWith(ADMIN, "pay-1", {
      cashMinor: 100,
      savedMinor: 400,
    });
    expect(repo.insertPayment).not.toHaveBeenCalled();
    expect(hosted).not.toHaveBeenCalled();
  });

  it("marks a live payment past its expiry as expired, then starts a new one", async () => {
    vi.mocked(repo.findLivePayment).mockResolvedValue({
      id: "pay-old",
      trigger: "manual",
      provider: "fake" as const,
      status: "pending",
      payerId: parent.id,
      expiresAt: new Date(NOW.getTime() - MIN).toISOString(),
      redirectUrl: "https://checkout.example/old",
      inApp: false,
      providerRef: null,
    });
    vi.mocked(repo.insertPayment).mockResolvedValue("pay-2");

    const { redirectUrl } = await pay();

    expect(repo.expirePayment).toHaveBeenCalledWith(ADMIN, "pay-old");
    expect(vi.mocked(repo.expirePayment).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(repo.insertPayment).mock.invocationCallOrder[0] ?? 0,
    );
    expect(repo.insertPayment).toHaveBeenCalledTimes(1);
    expect(redirectUrl).toContain("pay-2");
  });

  it("refuses while an automatic charge is in flight", async () => {
    vi.mocked(repo.findLivePayment).mockResolvedValue({
      id: "pay-auto",
      trigger: "auto",
      provider: "fake" as const,
      status: "pending",
      payerId: parent.id,
      expiresAt: null,
      redirectUrl: null,
      inApp: false,
      providerRef: null,
    });
    await rejects(pay(), "CONFLICT");
    expect(repo.insertPayment).not.toHaveBeenCalled();
  });

  it("returns the winner's URL when a parallel click inserted first", async () => {
    vi.mocked(repo.insertPayment).mockResolvedValue(null);
    vi.mocked(repo.findLivePayment)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "pay-other",
        trigger: "manual",
        provider: "fake" as const,
        status: "pending",
        payerId: parent.id,
        expiresAt: new Date(NOW.getTime() + 30 * MIN).toISOString(),
        redirectUrl: "https://checkout.example/other",
        inApp: false,
        providerRef: null,
      });

    expect((await pay()).redirectUrl).toBe("https://checkout.example/other");
  });

  it("cancels its payment row when the provider fails, so the item isn't locked", async () => {
    const unavailable = new AppError("UNAVAILABLE", "Card payments aren't available right now.");
    vi.spyOn(provider, "createHostedPayment").mockRejectedValue(unavailable);

    await rejects(pay(), "UNAVAILABLE");
    expect(repo.cancelPayment).toHaveBeenCalledWith(ADMIN, "pay-1");
    expect(repo.setPaymentHosted).not.toHaveBeenCalled();
  });

  it("refuses a split that isn't the full amount", async () => {
    await rejects(pay({ savedMinor: 100 }), "VALIDATION", "Card pays the full amount");
    expect(repo.insertPayment).not.toHaveBeenCalled();
  });

  it("refuses an amount below the provider's minimum", async () => {
    vi.spyOn(provider, "minimumChargeMinor").mockReturnValue(1000);
    await rejects(pay(), "VALIDATION", "Too small to pay by card");
    expect(repo.insertPayment).not.toHaveBeenCalled();
  });

  it("refuses an item that isn't due any more", async () => {
    vi.mocked(repo.findPaymentSource).mockResolvedValue({ ...occurrence, open: false });
    await rejects(pay(), "CONFLICT");
  });

  it("refuses a gift that isn't due yet", async () => {
    vi.mocked(repo.findPaymentSource).mockResolvedValue({
      ...occurrence,
      type: "parent_gift",
      id: "gift-1",
      dueOn: "2026-11-05",
    });
    await rejects(
      service.startCardPayment({
        kind: "gift",
        id: "gift-1",
        provider: "fake",
        cashMinor: 500,
        savedMinor: 0,
      }),
      "CONFLICT",
    );
  });

  it("refuses an item the caller can't see", async () => {
    vi.mocked(repo.findPaymentSource).mockResolvedValue(null);
    await rejects(pay(), "FORBIDDEN");
  });

  it("creates the provider customer once, when the parent has none", async () => {
    vi.mocked(repo.findCustomer).mockResolvedValue(null);
    const ensure = vi.spyOn(provider, "ensureCustomer");

    await pay();

    expect(ensure).toHaveBeenCalledWith({ parentId: parent.id, email: parent.email });
    expect(repo.insertCustomer).toHaveBeenCalledWith(ADMIN, {
      parentId: parent.id,
      provider: "fake",
      customerRef: "fake_cus_parent-1",
    });
  });
});

describe("startCardPayment: choosing a provider", () => {
  const live = {
    id: "pay-a",
    trigger: "manual" as const,
    status: "pending" as const,
    provider: "stripe" as const,
    payerId: parent.id,
    expiresAt: new Date(NOW.getTime() + 20 * MIN).toISOString(),
    redirectUrl: "https://checkout.example/a",
    inApp: false,
    providerRef: null,
  };

  it.each([
    ["a provider that is not on", "stripe" as const],
    ["an unknown provider", "nope" as PaymentProvider["id"]],
  ])("refuses %s with NOT_FOUND", async (_name, id) => {
    await rejects(pay({ provider: id }), "NOT_FOUND");
    expect(repo.findPaymentSource).not.toHaveBeenCalled();
    expect(repo.insertPayment).not.toHaveBeenCalled();
  });

  it("opens the chosen provider's checkout when several are on", async () => {
    const stripe = otherProvider();
    on = [stripe, provider];
    const fakeHosted = vi.spyOn(provider, "createHostedPayment");
    const stripeHosted = vi.spyOn(stripe, "createHostedPayment");

    await pay({ provider: "stripe" });

    expect(repo.insertPayment).toHaveBeenCalledWith(
      ADMIN,
      expect.objectContaining({ provider: "stripe" }),
    );
    expect(repo.findCustomer).toHaveBeenCalledWith(USER, parent.id, "stripe");
    expect(stripeHosted).toHaveBeenCalledTimes(1);
    expect(fakeHosted).not.toHaveBeenCalled();
  });

  it("cancels another provider's live checkout, then opens the chosen one (D7)", async () => {
    on = [otherProvider(), provider];
    vi.mocked(repo.findLivePayment).mockResolvedValueOnce(live).mockResolvedValue(null);

    const { redirectUrl } = await pay({ provider: "fake" });

    expect(repo.cancelPayment).toHaveBeenCalledWith(ADMIN, "pay-a");
    expect(vi.mocked(repo.cancelPayment).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(repo.insertPayment).mock.invocationCallOrder[0] ?? 0,
    );
    expect(repo.setPendingSplit).not.toHaveBeenCalled();
    expect(repo.insertPayment).toHaveBeenCalledWith(
      ADMIN,
      expect.objectContaining({ provider: "fake" }),
    );
    expect(redirectUrl).toContain("pay-1");
  });

  it("reuses the same provider's live checkout", async () => {
    on = [otherProvider(), provider];
    vi.mocked(repo.findLivePayment).mockResolvedValue(live);

    expect((await pay({ provider: "stripe" })).redirectUrl).toBe(live.redirectUrl);
    expect(repo.cancelPayment).not.toHaveBeenCalled();
    expect(repo.insertPayment).not.toHaveBeenCalled();
  });

  it("is a CONFLICT while an auto charge is in flight, whatever its provider", async () => {
    on = [otherProvider(), provider];
    vi.mocked(repo.findLivePayment).mockResolvedValue({
      ...live,
      trigger: "auto",
      redirectUrl: null,
    });

    await rejects(pay({ provider: "fake" }), "CONFLICT");
    expect(repo.cancelPayment).not.toHaveBeenCalled();
    expect(repo.insertPayment).not.toHaveBeenCalled();
  });

  it("is a CONFLICT while another provider's checkout waits on the bank", async () => {
    on = [otherProvider(), provider];
    vi.mocked(repo.findLivePayment).mockResolvedValue({ ...live, status: "requires_action" });

    await rejects(pay({ provider: "fake" }), "CONFLICT");
    expect(repo.cancelPayment).not.toHaveBeenCalled();
  });

  it("does not cancel the winner of a parallel click that chose another provider", async () => {
    on = [otherProvider(), provider];
    vi.mocked(repo.insertPayment).mockResolvedValue(null);
    vi.mocked(repo.findLivePayment).mockResolvedValueOnce(null).mockResolvedValueOnce(live);

    await rejects(pay({ provider: "fake" }), "CONFLICT");
    expect(repo.cancelPayment).not.toHaveBeenCalled();
  });
});

describe("cancelCardPayment", () => {
  const source = { type: "occurrence" as const, id: occurrenceId };
  const live = {
    id: "pay-1",
    trigger: "manual" as const,
    provider: "fake" as const,
    status: "pending" as const,
    payerId: parent.id,
    expiresAt: new Date(NOW.getTime() + 20 * MIN).toISOString(),
    redirectUrl: "https://checkout.example/1",
    inApp: false,
    providerRef: null,
  };

  it("cancels the parent's live manual checkout after checking they are the child's parent", async () => {
    vi.mocked(repo.findLivePayment).mockResolvedValue(live);

    await service.cancelCardPayment(childId, source);

    expect(family.assertParentOf).toHaveBeenCalledWith(childId);
    expect(vi.mocked(family.assertParentOf).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(repo.findPaymentSource).mock.invocationCallOrder[0] ?? 0,
    );
    expect(repo.findPaymentSource).toHaveBeenCalledWith(USER, source);
    expect(repo.cancelPayment).toHaveBeenCalledWith(ADMIN, "pay-1");
  });

  it.each([
    ["an auto charge", { trigger: "auto" as const, redirectUrl: null }],
    ["another parent's checkout", { payerId: "parent-2" }],
    ["a checkout waiting on the bank", { status: "requires_action" as const }],
  ])("leaves %s alone", async (_name, over) => {
    vi.mocked(repo.findLivePayment).mockResolvedValue({ ...live, ...over });
    await service.cancelCardPayment(childId, source);
    expect(repo.cancelPayment).not.toHaveBeenCalled();
  });

  it("does nothing with no live payment", async () => {
    await service.cancelCardPayment(childId, source);
    expect(repo.cancelPayment).not.toHaveBeenCalled();
  });

  it("refuses a source that belongs to another child", async () => {
    vi.mocked(repo.findPaymentSource).mockResolvedValue({ ...occurrence, childId: "child-2" });
    vi.mocked(repo.findLivePayment).mockResolvedValue(live);
    await rejects(service.cancelCardPayment(childId, source), "FORBIDDEN");
    expect(repo.cancelPayment).not.toHaveBeenCalled();
  });

  it("refuses a caller who isn't the child's parent", async () => {
    vi.mocked(family.assertParentOf).mockRejectedValue(new AppError("FORBIDDEN", "No."));
    vi.mocked(repo.findLivePayment).mockResolvedValue(live);
    await rejects(service.cancelCardPayment(childId, source), "FORBIDDEN");
    expect(repo.findPaymentSource).not.toHaveBeenCalled();
    expect(repo.cancelPayment).not.toHaveBeenCalled();
  });
});

describe("payments off", () => {
  beforeEach(() => {
    on = [];
  });

  it.each<[string, () => Promise<unknown>]>([
    ["startCardPayment", () => pay()],
    [
      "startCardSetup",
      () => service.startCardSetup({ provider: "fake", arm: null, returnTo: "/parent" }),
    ],
    [
      "setAutoCharge",
      () =>
        service.setAutoCharge({
          type: "allowance_schedule",
          id: scheduleId,
          on: true,
          provider: "fake",
          returnTo: "/parent",
        }),
    ],
    ["removeSavedCard", () => service.removeSavedCard({ provider: "fake" })],
    [
      "cancelCardPayment",
      () => service.cancelCardPayment(childId, { type: "occurrence", id: occurrenceId }),
    ],
  ])("%s throws NOT_FOUND", async (_name, run) => {
    await rejects(run(), "NOT_FOUND");
    expect(repo.insertPayment).not.toHaveBeenCalled();
    expect(repo.insertSetup).not.toHaveBeenCalled();
  });

  it("getCardPaymentState lists no providers and getSavedCards is empty", async () => {
    expect(
      await service.getCardPaymentState(childId, { type: "occurrence", id: occurrenceId }),
    ).toEqual({ providers: [], pending: null, lastOutcome: null });
    expect(family.assertParentCanRead).toHaveBeenCalledWith(childId);
    expect(await service.getSavedCards()).toEqual([]);
  });

  it("getAutoChargeCard is null, so no toggle renders", async () => {
    expect(await service.getAutoChargeCard()).toBeNull();
  });
});

describe("a provider that is not on", () => {
  it.each<[string, () => Promise<unknown>]>([
    [
      "startCardSetup",
      () => service.startCardSetup({ provider: "stripe", arm: null, returnTo: "/parent" }),
    ],
    [
      "setAutoCharge on",
      () =>
        service.setAutoCharge({
          type: "allowance_schedule",
          id: scheduleId,
          on: true,
          provider: "stripe",
          returnTo: "/parent",
        }),
    ],
    ["removeSavedCard", () => service.removeSavedCard({ provider: "stripe" })],
  ])("%s throws NOT_FOUND", async (_name, run) => {
    await rejects(run(), "NOT_FOUND");
    expect(repo.insertSetup).not.toHaveBeenCalled();
    expect(repo.setAutoChargeFor).not.toHaveBeenCalled();
    expect(repo.clearAutoChargeBy).not.toHaveBeenCalled();
  });
});

describe("setAutoCharge", () => {
  const turnOn = {
    type: "allowance_schedule" as const,
    id: scheduleId,
    on: true,
    provider: "fake" as const,
    returnTo: "/parent",
  };

  it("with no saved card, starts a save-card session that arms the toggle", async () => {
    const setup = vi.spyOn(provider, "createHostedSetup");

    const { redirectUrl } = await service.setAutoCharge(turnOn);

    expect(family.assertParentOf).toHaveBeenCalledWith(childId);
    expect(repo.insertSetup).toHaveBeenCalledWith(ADMIN, {
      parentId: parent.id,
      provider: "fake",
      arm: { type: "allowance_schedule", id: scheduleId },
    });
    expect(setup).toHaveBeenCalledWith({
      setupId: "setup-1",
      customerRef: customer.customerRef,
      successUrl: `${APP}/parent?card=saved`,
      cancelUrl: `${APP}/parent?card=cancelled`,
    });
    const hostedSetup = await setup.mock.results[0]?.value;
    expect(redirectUrl).toBe(hostedSetup?.redirectUrl);
    expect(repo.setSetupProviderRef).toHaveBeenCalledWith(ADMIN, "setup-1", "fake_seti_setup-1");
    expect(repo.setAutoChargeFor).not.toHaveBeenCalled();
  });

  it("with a saved card, turns the toggle on through set_auto_charge", async () => {
    vi.mocked(repo.findCustomer).mockResolvedValue(savedCustomer);

    expect(await service.setAutoCharge(turnOn)).toEqual({ redirectUrl: null });
    expect(repo.setAutoChargeFor).toHaveBeenCalledWith(
      USER,
      { type: "allowance_schedule", id: scheduleId },
      true,
      "fake",
    );
    expect(repo.insertSetup).not.toHaveBeenCalled();
  });

  it("uses the chosen provider's saved card when several are on", async () => {
    on = [otherProvider(), provider];
    vi.mocked(repo.findCustomer).mockImplementation(async (_db, _parent, id) =>
      id === "stripe" ? savedCustomer : customer,
    );

    expect(await service.setAutoCharge({ ...turnOn, provider: "stripe" })).toEqual({
      redirectUrl: null,
    });
    expect(repo.findCustomer).toHaveBeenCalledWith(USER, parent.id, "stripe");
    expect(repo.setAutoChargeFor).toHaveBeenCalledWith(
      USER,
      { type: "allowance_schedule", id: scheduleId },
      true,
      "stripe",
    );
  });

  it("refuses to turn on without a provider", async () => {
    await rejects(service.setAutoCharge({ ...turnOn, provider: undefined }), "VALIDATION");
    expect(repo.setAutoChargeFor).not.toHaveBeenCalled();
  });

  it("falls back to saving a card when the card went away meanwhile", async () => {
    vi.mocked(repo.findCustomer).mockResolvedValue(savedCustomer);
    vi.mocked(repo.setAutoChargeFor).mockResolvedValue("no_card");

    const { redirectUrl } = await service.setAutoCharge(turnOn);
    expect(redirectUrl).not.toBeNull();
    expect(repo.insertSetup).toHaveBeenCalled();
  });

  it("turning off needs no card and no provider", async () => {
    expect(await service.setAutoCharge({ ...turnOn, on: false, provider: undefined })).toEqual({
      redirectUrl: null,
    });
    expect(repo.findCustomer).not.toHaveBeenCalled();
    expect(repo.setAutoChargeFor).toHaveBeenCalledWith(
      USER,
      { type: "allowance_schedule", id: scheduleId },
      false,
      null,
    );
  });

  it("refuses a target the caller can't see", async () => {
    vi.mocked(repo.findAutoChargeTargetChildId).mockResolvedValue(null);
    await rejects(service.setAutoCharge(turnOn), "FORBIDDEN");
  });

  it.each([
    ["no saved card", customer],
    ["a saved card", savedCustomer],
  ])("refuses a provider that can't charge the family's currency (%s)", async (_n, saved) => {
    on = [otherProvider(noJpy), provider];
    familyInJpy();
    vi.mocked(repo.findCustomer).mockResolvedValue(saved);

    await rejects(
      service.setAutoCharge({ ...turnOn, provider: "stripe" }),
      "VALIDATION",
      paymentCopy.unsupportedCurrency,
    );
    expect(repo.insertSetup).not.toHaveBeenCalled();
    expect(repo.setAutoChargeFor).not.toHaveBeenCalled();
  });

  it("still turns off a provider that can't charge the family's currency", async () => {
    on = [otherProvider(noJpy)];
    familyInJpy();
    expect(await service.setAutoCharge({ ...turnOn, on: false, provider: undefined })).toEqual({
      redirectUrl: null,
    });
    expect(repo.setAutoChargeFor).toHaveBeenCalledWith(USER, expect.anything(), false, null);
  });
});

describe("startCardSetup", () => {
  it("keeps the return path's query", async () => {
    const setup = vi.spyOn(provider, "createHostedSetup");
    await service.startCardSetup({
      provider: "fake",
      arm: null,
      returnTo: "/parent/settings?tab=card",
    });
    expect(repo.insertSetup).toHaveBeenCalledWith(ADMIN, {
      parentId: parent.id,
      provider: "fake",
      arm: null,
    });
    expect(setup).toHaveBeenCalledWith(
      expect.objectContaining({
        successUrl: `${APP}/parent/settings?tab=card&card=saved`,
        cancelUrl: `${APP}/parent/settings?tab=card&card=cancelled`,
      }),
    );
  });

  it("saves the card with the chosen provider", async () => {
    const stripe = otherProvider();
    on = [stripe, provider];
    const setup = vi.spyOn(stripe, "createHostedSetup");

    await service.startCardSetup({ provider: "stripe", arm: null, returnTo: "/parent" });

    expect(repo.insertSetup).toHaveBeenCalledWith(ADMIN, {
      parentId: parent.id,
      provider: "stripe",
      arm: null,
    });
    expect(setup).toHaveBeenCalledTimes(1);
  });

  it("refuses a return path off the app", async () => {
    await rejects(
      service.startCardSetup({ provider: "fake", arm: null, returnTo: "//evil.example/x" }),
      "VALIDATION",
    );
  });

  it("marks the setup failed when the provider fails", async () => {
    vi.spyOn(provider, "createHostedSetup").mockRejectedValue(
      new AppError("UNAVAILABLE", "Card payments aren't available right now."),
    );
    await rejects(
      service.startCardSetup({ provider: "fake", arm: null, returnTo: "/parent" }),
      "UNAVAILABLE",
    );
    expect(repo.failSetup).toHaveBeenCalledWith(ADMIN, "setup-1");
  });

  it.each([
    ["without", null],
    ["with", { type: "allowance_schedule" as const, id: scheduleId }],
  ])("refuses a provider that can't charge the family's currency (%s arming)", async (_n, arm) => {
    const stripe = otherProvider(noJpy);
    on = [stripe, provider];
    familyInJpy();
    const setup = vi.spyOn(stripe, "createHostedSetup");

    await rejects(
      service.startCardSetup({ provider: "stripe", arm, returnTo: "/parent" }),
      "VALIDATION",
      paymentCopy.unsupportedCurrency,
    );
    expect(repo.insertSetup).not.toHaveBeenCalled();
    expect(setup).not.toHaveBeenCalled();
  });
});

describe("saving a card with a provider that needs the parent's email and phone", () => {
  const PHONE = "+919000000000";
  let razorpay: PaymentProvider;
  const arm = { type: "allowance_schedule" as const, id: scheduleId };
  const start = (over: { phone?: string } = {}) =>
    service.startCardSetup({ provider: "razorpay", arm: null, returnTo: "/parent", ...over });
  const noEmail = () => {
    const parentWithoutEmail = { ...parent, email: null };
    vi.mocked(family.assertRole).mockResolvedValue({ user: parentWithoutEmail, membership: null });
    vi.mocked(family.assertParentOf).mockResolvedValue(parentWithoutEmail);
    vi.mocked(auth.assertUser).mockResolvedValue(parentWithoutEmail);
  };
  /** The field errors of the AppError `work` rejects with (VALIDATION). */
  const fieldErrorsOf = async (work: Promise<unknown>) => {
    const error = await work.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("VALIDATION");
    return (error as AppError).fieldErrors ?? {};
  };

  beforeEach(() => {
    vi.mocked(family.getFamily).mockResolvedValue({
      id: "fam-1",
      code: "ABC234",
      currency: "INR",
      timezone: "UTC",
    });
    razorpay = otherProvider({ id: "razorpay", label: "Razorpay", setupNeedsContact: true });
    on = [razorpay, provider];
  });

  it("passes the account email and the tidied phone to the provider", async () => {
    const setup = vi.spyOn(razorpay, "createHostedSetup");
    await start({ phone: " +91 (900) 000-0000 " });
    expect(setup).toHaveBeenCalledWith(
      expect.objectContaining({ contact: { email: parent.email, phone: PHONE } }),
    );
  });

  it("refuses to save a card when the account has no email, before opening anything", async () => {
    noEmail();
    const setup = vi.spyOn(razorpay, "createHostedSetup");
    await rejects(start({ phone: PHONE }), "VALIDATION", paymentCopy.noAccountEmail("Razorpay"));
    expect(repo.insertSetup).not.toHaveBeenCalled();
    expect(repo.insertCustomer).not.toHaveBeenCalled();
    expect(setup).not.toHaveBeenCalled();
  });

  it("ignores any email sent with the request: only the account email is used", async () => {
    const setup = vi.spyOn(razorpay, "createHostedSetup");
    await service.startCardSetup({
      provider: "razorpay",
      arm: null,
      returnTo: "/parent",
      phone: PHONE,
      email: "other@example.com",
    } as Parameters<typeof service.startCardSetup>[0]);
    expect(setup).toHaveBeenCalledWith(
      expect.objectContaining({ contact: { email: parent.email, phone: PHONE } }),
    );
  });

  it("asks for the phone when none is sent, before opening anything", async () => {
    const setup = vi.spyOn(razorpay, "createHostedSetup");
    expect(Object.keys(await fieldErrorsOf(start()))).toEqual(["phone"]);
    expect(repo.insertSetup).not.toHaveBeenCalled();
    expect(repo.insertCustomer).not.toHaveBeenCalled();
    expect(setup).not.toHaveBeenCalled();
  });

  it.each([
    "12345",
    "9000000000000000",
    "+9190000000000000",
    "+91 900-ABC-0000",
    "++919000000000",
    "91+9000000000",
  ])("refuses the phone %s", async (phone) => {
    expect(Object.keys(await fieldErrorsOf(start({ phone })))).toEqual(["phone"]);
    expect(repo.insertSetup).not.toHaveBeenCalled();
  });

  it.each(["12345678", "+12345678901234", "+123456789012345", "(020) 7946-0000"])(
    "accepts the phone %s",
    async (phone) => {
      const setup = vi.spyOn(razorpay, "createHostedSetup");
      await start({ phone });
      expect(setup).toHaveBeenCalledTimes(1);
    },
  );

  it("sends no contact to a provider that doesn't need it", async () => {
    const setup = vi.spyOn(provider, "createHostedSetup");
    await service.startCardSetup({ provider: "fake", arm: null, returnTo: "/parent" });
    await service.startCardSetup({
      provider: "fake",
      arm: null,
      returnTo: "/parent",
      phone: PHONE,
    });
    expect(setup).toHaveBeenCalledTimes(2);
    for (const [input] of setup.mock.calls) expect(input).not.toHaveProperty("contact");
  });

  it("setAutoCharge passes the contact on when it has to save a card first", async () => {
    const setup = vi.spyOn(razorpay, "createHostedSetup");
    await service.setAutoCharge({
      ...arm,
      on: true,
      provider: "razorpay",
      returnTo: "/parent",
      phone: PHONE,
    });
    expect(setup).toHaveBeenCalledWith(
      expect.objectContaining({ contact: { email: parent.email, phone: PHONE } }),
    );
  });

  it("setAutoCharge asks for the phone when it has to save a card first", async () => {
    const errors = await fieldErrorsOf(
      service.setAutoCharge({ ...arm, on: true, provider: "razorpay", returnTo: "/parent" }),
    );
    expect(Object.keys(errors)).toEqual(["phone"]);
    expect(repo.setAutoChargeFor).not.toHaveBeenCalled();
  });

  it("setAutoCharge needs no phone when a card is already saved there", async () => {
    vi.mocked(repo.findCustomer).mockResolvedValue({ ...savedCustomer, customerRef: "cust_1" });
    expect(
      await service.setAutoCharge({ ...arm, on: true, provider: "razorpay", returnTo: "/parent" }),
    ).toEqual({ redirectUrl: null });
  });

  it("never logs the phone or the email", async () => {
    const info = vi.spyOn(logger, "info");
    const warn = vi.spyOn(logger, "warn");
    const error = vi.spyOn(logger, "error");
    await start({ phone: PHONE });
    vi.spyOn(razorpay, "createHostedSetup").mockRejectedValue(
      new AppError("UNAVAILABLE", "Card payments aren't available right now."),
    );
    vi.mocked(repo.failSetup).mockRejectedValue(new Error("db down"));
    await rejects(start({ phone: PHONE }), "UNAVAILABLE");
    await rejects(start({ phone: "12" }), "VALIDATION");

    expect(info).toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    const logged = JSON.stringify([info.mock.calls, warn.mock.calls, error.mock.calls]);
    expect(logged).not.toContain("9000000000");
    expect(logged).not.toContain(parent.email);
  });

  it("getAutoChargeCard says which provider needs the phone", async () => {
    vi.mocked(repo.findCustomer).mockResolvedValue(null);
    const flags = (await service.getAutoChargeCard())?.map(({ provider, needsPhone }) => ({
      provider,
      needsPhone,
    }));
    expect(flags).toEqual([
      { provider: "razorpay", needsPhone: true },
      { provider: "fake", needsPhone: false },
    ]);
  });
});

describe("saved cards", () => {
  it("getSavedCards lists every provider that is on, with its card or null", async () => {
    on = [otherProvider(), provider];
    vi.mocked(repo.findCustomer).mockImplementation(async (_db, _parent, id) =>
      id === "stripe" ? savedCustomer : null,
    );

    expect(await service.getSavedCards()).toEqual([
      { provider: "stripe", label: "Stripe", card: { brand: "visa", last4: "4242" } },
      { provider: "fake", label: "Test card", card: null },
    ]);
    expect(auth.assertUser).toHaveBeenCalled();
    expect(repo.findCustomer).toHaveBeenCalledWith(USER, parent.id, "stripe");
    expect(repo.findCustomer).toHaveBeenCalledWith(USER, parent.id, "fake");
  });

  it("getSavedCards hides a provider that can't charge the family's currency", async () => {
    on = [otherProvider(noJpy), provider];
    familyInJpy();
    vi.mocked(repo.findCustomer).mockResolvedValue(null);

    expect(await service.getSavedCards()).toEqual([
      { provider: "fake", label: "Test card", card: null },
    ]);
  });

  it("getSavedCards keeps such a provider while a card is saved there, so it can be removed", async () => {
    on = [otherProvider(noJpy), provider];
    familyInJpy();
    vi.mocked(repo.findCustomer).mockImplementation(async (_db, _parent, id) =>
      id === "stripe" ? savedCustomer : null,
    );

    expect(await service.getSavedCards()).toEqual([
      { provider: "stripe", label: "Stripe", card: { brand: "visa", last4: "4242" } },
      { provider: "fake", label: "Test card", card: null },
    ]);
  });

  it("getSavedCards is empty without a family", async () => {
    vi.mocked(family.getFamily).mockResolvedValue(null);
    expect(await service.getSavedCards()).toEqual([]);
  });

  it("getAutoChargeCard says, per provider, whether the parent has a saved card", async () => {
    on = [otherProvider(), provider];
    vi.mocked(repo.findCustomer).mockImplementation(async (_db, _parent, id) =>
      id === "fake" ? savedCustomer : customer,
    );

    expect(await service.getAutoChargeCard()).toEqual([
      {
        provider: "stripe",
        label: "Stripe",
        cardSaved: false,
        card: null,
        unavailableReason: null,
        needsPhone: false,
      },
      {
        provider: "fake",
        label: "Test card",
        cardSaved: true,
        card: { brand: "visa", last4: "4242" },
        unavailableReason: null,
        needsPhone: false,
      },
    ]);
  });

  it("getAutoChargeCard says unsupported_currency for a provider that can't charge the family's currency", async () => {
    on = [otherProvider({ minimumChargeMinor: (c) => (c === "JPY" ? null : 1) }), provider];
    vi.mocked(family.getFamily).mockResolvedValue({
      id: "fam-1",
      code: "ABC234",
      currency: "JPY",
      timezone: "UTC",
    });

    expect(await service.getAutoChargeCard()).toEqual([
      {
        provider: "stripe",
        label: "Stripe",
        cardSaved: false,
        card: null,
        unavailableReason: "unsupported_currency",
        needsPhone: false,
      },
      {
        provider: "fake",
        label: "Test card",
        cardSaved: false,
        card: null,
        unavailableReason: null,
        needsPhone: false,
      },
    ]);
  });

  it("removeSavedCard detaches, clears the method and the toggles using that provider", async () => {
    vi.mocked(repo.findCustomer).mockResolvedValue(savedCustomer);
    const detach = vi.spyOn(provider, "detachMethod");

    await service.removeSavedCard({ provider: "fake" });

    expect(family.assertRole).toHaveBeenCalledWith("parent");
    expect(repo.findCustomer).toHaveBeenCalledWith(USER, parent.id, "fake");
    expect(detach).toHaveBeenCalledWith("fake_pm_ok");
    expect(repo.clearSavedCard).toHaveBeenCalledWith(ADMIN, parent.id, "fake");
    expect(repo.clearAutoChargeBy).toHaveBeenCalledWith(ADMIN, parent.id, "fake");
  });

  it("removeSavedCard touches only the chosen provider when several are on", async () => {
    const stripe = otherProvider();
    on = [stripe, provider];
    vi.mocked(repo.findCustomer).mockResolvedValue(savedCustomer);
    const fakeDetach = vi.spyOn(provider, "detachMethod");
    const stripeDetach = vi.spyOn(stripe, "detachMethod");

    await service.removeSavedCard({ provider: "stripe" });

    expect(stripeDetach).toHaveBeenCalledTimes(1);
    expect(fakeDetach).not.toHaveBeenCalled();
    expect(repo.clearSavedCard).toHaveBeenCalledWith(ADMIN, parent.id, "stripe");
    expect(repo.clearAutoChargeBy).toHaveBeenCalledTimes(1);
    expect(repo.clearAutoChargeBy).toHaveBeenCalledWith(ADMIN, parent.id, "stripe");
  });

  it("removeSavedCard with no card still turns that provider's toggles off and detaches nothing", async () => {
    const detach = vi.spyOn(provider, "detachMethod");
    await service.removeSavedCard({ provider: "fake" });
    expect(detach).not.toHaveBeenCalled();
    expect(repo.clearSavedCard).not.toHaveBeenCalled();
    expect(repo.clearAutoChargeBy).toHaveBeenCalledWith(ADMIN, parent.id, "fake");
  });
});

describe("getCardPaymentState", () => {
  const source = { type: "occurrence" as const, id: occurrenceId };
  const fakeEntry = {
    id: "fake",
    label: "Test card",
    available: true,
    unavailableReason: null,
  };

  it("lists the provider as available for a due item with nothing in flight", async () => {
    expect(await service.getCardPaymentState(childId, source)).toEqual({
      providers: [fakeEntry],
      pending: null,
      lastOutcome: null,
    });
    expect(family.assertParentCanRead).toHaveBeenCalledWith(childId);
  });

  it("lists every provider that is on, each with its own reason", async () => {
    on = [otherProvider({ minimumChargeMinor: (c) => (c === "GBP" ? null : 1) }), provider];
    expect((await service.getCardPaymentState(childId, source)).providers).toEqual([
      {
        id: "stripe",
        label: "Stripe",
        available: false,
        unavailableReason: "unsupported_currency",
      },
      fakeEntry,
    ]);
  });

  it("says unsupported_currency for JPY", async () => {
    vi.mocked(family.getFamily).mockResolvedValue({
      id: "fam-1",
      code: "ABC234",
      currency: "JPY",
      timezone: "UTC",
    });
    vi.spyOn(provider, "minimumChargeMinor").mockImplementation((currency) =>
      currency === "JPY" ? null : 1,
    );
    expect((await service.getCardPaymentState(childId, source)).providers).toEqual([
      { ...fakeEntry, available: false, unavailableReason: "unsupported_currency" },
    ]);
  });

  it("says too_small below the minimum", async () => {
    vi.spyOn(provider, "minimumChargeMinor").mockReturnValue(1000);
    expect((await service.getCardPaymentState(childId, source)).providers).toEqual([
      { ...fakeEntry, available: false, unavailableReason: "too_small" },
    ]);
  });

  it("shows a live payment as pending with its provider and URL", async () => {
    on = [otherProvider(), provider];
    vi.mocked(repo.findLivePayment).mockResolvedValue({
      id: "pay-1",
      trigger: "manual",
      provider: "stripe",
      status: "pending",
      payerId: parent.id,
      expiresAt: new Date(NOW.getTime() + 5 * MIN).toISOString(),
      redirectUrl: "https://checkout.example/1",
      inApp: false,
      providerRef: null,
    });
    expect((await service.getCardPaymentState(childId, source)).pending).toEqual({
      provider: "stripe",
      redirectUrl: "https://checkout.example/1",
    });
  });

  it("ignores a live payment past its expiry", async () => {
    vi.mocked(repo.findLivePayment).mockResolvedValue({
      id: "pay-1",
      trigger: "manual",
      provider: "fake",
      status: "pending",
      payerId: parent.id,
      expiresAt: new Date(NOW.getTime() - MIN).toISOString(),
      redirectUrl: "https://checkout.example/1",
      inApp: false,
      providerRef: null,
    });
    expect((await service.getCardPaymentState(childId, source)).pending).toBeNull();
  });

  it("reports the last failed attempt", async () => {
    vi.mocked(repo.findLatestPayment).mockResolvedValue({
      status: "failed",
      failureCode: "declined",
    });
    expect((await service.getCardPaymentState(childId, source)).lastOutcome).toEqual({
      status: "failed",
      failureCode: "declined",
    });
  });

  it("refuses a source that belongs to another child", async () => {
    vi.mocked(repo.findPaymentSource).mockResolvedValue({ ...occurrence, childId: "child-2" });
    await rejects(service.getCardPaymentState(childId, source), "FORBIDDEN");
  });
});
