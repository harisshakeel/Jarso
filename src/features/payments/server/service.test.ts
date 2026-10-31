import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib";
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
vi.mock("@/lib/payments", () => ({ getPaymentProvider: vi.fn() }));
vi.mock("./repository", () => ({
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
  setPendingSplit: vi.fn(),
  setSetupProviderRef: vi.fn(),
}));

const auth = await import("@/features/auth/server");
const family = await import("@/features/family/server");
const payments = await import("@/lib/payments");
const repo = await import("./repository");
const service = await import("./service");

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

let provider: ReturnType<typeof createFakePaymentProvider>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  provider = createFakePaymentProvider({ hostedUrl: `${APP}/dev/payments/fake` });
  vi.mocked(payments.getPaymentProvider).mockReturnValue(provider);
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

const pay = (over: Partial<{ cashMinor: number; savedMinor: number }> = {}) =>
  service.startCardPayment({
    kind: "allowance",
    id: occurrenceId,
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

    await service.startCardPayment({ kind: "gift", id: "gift-1", cashMinor: 500, savedMinor: 0 });

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
      status: "pending",
      payerId: parent.id,
      expiresAt: new Date(NOW.getTime() + 30 * MIN).toISOString(),
      redirectUrl: first.redirectUrl,
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
      status: "pending",
      payerId: parent.id,
      expiresAt: new Date(NOW.getTime() + 20 * MIN).toISOString(),
      redirectUrl: "https://checkout.example/1",
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
      status: "pending",
      payerId: parent.id,
      expiresAt: new Date(NOW.getTime() - MIN).toISOString(),
      redirectUrl: "https://checkout.example/old",
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
      status: "pending",
      payerId: parent.id,
      expiresAt: null,
      redirectUrl: null,
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
        status: "pending",
        payerId: parent.id,
        expiresAt: new Date(NOW.getTime() + 30 * MIN).toISOString(),
        redirectUrl: "https://checkout.example/other",
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
      service.startCardPayment({ kind: "gift", id: "gift-1", cashMinor: 500, savedMinor: 0 }),
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

describe("cancelCardPayment", () => {
  const source = { type: "occurrence" as const, id: occurrenceId };
  const live = {
    id: "pay-1",
    trigger: "manual" as const,
    status: "pending" as const,
    payerId: parent.id,
    expiresAt: new Date(NOW.getTime() + 20 * MIN).toISOString(),
    redirectUrl: "https://checkout.example/1",
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
    vi.mocked(payments.getPaymentProvider).mockReturnValue(null);
  });

  it("paymentsEnabled is false", () => {
    expect(service.paymentsEnabled()).toBe(false);
  });

  it.each<[string, () => Promise<unknown>]>([
    ["startCardPayment", () => pay()],
    ["startCardSetup", () => service.startCardSetup({ arm: null, returnTo: "/parent" })],
    [
      "setAutoCharge",
      () =>
        service.setAutoCharge({
          type: "allowance_schedule",
          id: scheduleId,
          on: true,
          returnTo: "/parent",
        }),
    ],
    ["removeSavedCard", () => service.removeSavedCard()],
    [
      "cancelCardPayment",
      () => service.cancelCardPayment(childId, { type: "occurrence", id: occurrenceId }),
    ],
  ])("%s throws NOT_FOUND", async (_name, run) => {
    await rejects(run(), "NOT_FOUND");
    expect(repo.insertPayment).not.toHaveBeenCalled();
    expect(repo.insertSetup).not.toHaveBeenCalled();
  });

  it("getCardPaymentState says off and getSavedCard is null", async () => {
    expect(
      await service.getCardPaymentState(childId, { type: "occurrence", id: occurrenceId }),
    ).toEqual({ available: false, unavailableReason: "off", pending: null, lastOutcome: null });
    expect(await service.getSavedCard()).toBeNull();
  });

  it("getAutoChargeCard is null, so no toggle renders", async () => {
    expect(await service.getAutoChargeCard()).toBeNull();
  });
});

describe("setAutoCharge", () => {
  const on = { type: "allowance_schedule" as const, id: scheduleId, on: true, returnTo: "/parent" };

  it("with no saved card, starts a save-card session that arms the toggle", async () => {
    const setup = vi.spyOn(provider, "createHostedSetup");

    const { redirectUrl } = await service.setAutoCharge(on);

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

    expect(await service.setAutoCharge(on)).toEqual({ redirectUrl: null });
    expect(repo.setAutoChargeFor).toHaveBeenCalledWith(
      USER,
      { type: "allowance_schedule", id: scheduleId },
      true,
      "fake",
    );
    expect(repo.insertSetup).not.toHaveBeenCalled();
  });

  it("falls back to saving a card when the card went away meanwhile", async () => {
    vi.mocked(repo.findCustomer).mockResolvedValue(savedCustomer);
    vi.mocked(repo.setAutoChargeFor).mockResolvedValue("no_card");

    const { redirectUrl } = await service.setAutoCharge(on);
    expect(redirectUrl).not.toBeNull();
    expect(repo.insertSetup).toHaveBeenCalled();
  });

  it("turning off needs no card", async () => {
    expect(await service.setAutoCharge({ ...on, on: false })).toEqual({ redirectUrl: null });
    expect(repo.setAutoChargeFor).toHaveBeenCalledWith(
      USER,
      { type: "allowance_schedule", id: scheduleId },
      false,
      "fake",
    );
  });

  it("refuses a target the caller can't see", async () => {
    vi.mocked(repo.findAutoChargeTargetChildId).mockResolvedValue(null);
    await rejects(service.setAutoCharge(on), "FORBIDDEN");
  });
});

describe("startCardSetup", () => {
  it("keeps the return path's query", async () => {
    const setup = vi.spyOn(provider, "createHostedSetup");
    await service.startCardSetup({ arm: null, returnTo: "/parent/settings?tab=card" });
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

  it("refuses a return path off the app", async () => {
    await rejects(
      service.startCardSetup({ arm: null, returnTo: "//evil.example/x" }),
      "VALIDATION",
    );
  });

  it("marks the setup failed when the provider fails", async () => {
    vi.spyOn(provider, "createHostedSetup").mockRejectedValue(
      new AppError("UNAVAILABLE", "Card payments aren't available right now."),
    );
    await rejects(service.startCardSetup({ arm: null, returnTo: "/parent" }), "UNAVAILABLE");
    expect(repo.failSetup).toHaveBeenCalledWith(ADMIN, "setup-1");
  });
});

describe("saved card", () => {
  it("getSavedCard returns brand and last 4", async () => {
    vi.mocked(repo.findCustomer).mockResolvedValue(savedCustomer);
    expect(await service.getSavedCard()).toEqual({ brand: "visa", last4: "4242" });
    expect(repo.findCustomer).toHaveBeenCalledWith(USER, parent.id, "fake");
  });

  it("getSavedCard is null without a saved method", async () => {
    expect(await service.getSavedCard()).toBeNull();
  });

  it("getAutoChargeCard says whether the parent has a saved card", async () => {
    expect(await service.getAutoChargeCard()).toEqual({
      cardSaved: false,
      unavailableReason: null,
    });
    vi.mocked(repo.findCustomer).mockResolvedValue(savedCustomer);
    expect(await service.getAutoChargeCard()).toEqual({ cardSaved: true, unavailableReason: null });
  });

  it("getAutoChargeCard says unsupported_currency when the card can't charge the family's currency", async () => {
    vi.mocked(family.getFamily).mockResolvedValue({
      id: "fam-1",
      code: "ABC234",
      currency: "JPY",
      timezone: "UTC",
    });
    vi.spyOn(provider, "minimumChargeMinor").mockImplementation((currency) =>
      currency === "JPY" ? null : 1,
    );
    expect(await service.getAutoChargeCard()).toEqual({
      cardSaved: false,
      unavailableReason: "unsupported_currency",
    });
  });

  it("removeSavedCard detaches, clears the method and every toggle the parent set", async () => {
    vi.mocked(repo.findCustomer).mockResolvedValue(savedCustomer);
    const detach = vi.spyOn(provider, "detachMethod");

    await service.removeSavedCard();

    expect(family.assertRole).toHaveBeenCalledWith("parent");
    expect(detach).toHaveBeenCalledWith("fake_pm_ok");
    expect(repo.clearSavedCard).toHaveBeenCalledWith(ADMIN, parent.id, "fake");
    expect(repo.clearAutoChargeBy).toHaveBeenCalledWith(ADMIN, parent.id);
  });

  it("removeSavedCard with no card still turns toggles off and detaches nothing", async () => {
    const detach = vi.spyOn(provider, "detachMethod");
    await service.removeSavedCard();
    expect(detach).not.toHaveBeenCalled();
    expect(repo.clearAutoChargeBy).toHaveBeenCalledWith(ADMIN, parent.id);
  });
});

describe("getCardPaymentState", () => {
  const source = { type: "occurrence" as const, id: occurrenceId };

  it("is available for a due item with nothing in flight", async () => {
    expect(await service.getCardPaymentState(childId, source)).toEqual({
      available: true,
      unavailableReason: null,
      pending: null,
      lastOutcome: null,
    });
    expect(family.assertParentCanRead).toHaveBeenCalledWith(childId);
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
    expect(await service.getCardPaymentState(childId, source)).toMatchObject({
      available: false,
      unavailableReason: "unsupported_currency",
    });
  });

  it("says too_small below the minimum", async () => {
    vi.spyOn(provider, "minimumChargeMinor").mockReturnValue(1000);
    expect(await service.getCardPaymentState(childId, source)).toMatchObject({
      available: false,
      unavailableReason: "too_small",
    });
  });

  it("shows a live payment as pending with its URL", async () => {
    vi.mocked(repo.findLivePayment).mockResolvedValue({
      id: "pay-1",
      trigger: "manual",
      status: "pending",
      payerId: parent.id,
      expiresAt: new Date(NOW.getTime() + 5 * MIN).toISOString(),
      redirectUrl: "https://checkout.example/1",
    });
    expect((await service.getCardPaymentState(childId, source)).pending).toEqual({
      redirectUrl: "https://checkout.example/1",
    });
  });

  it("ignores a live payment past its expiry", async () => {
    vi.mocked(repo.findLivePayment).mockResolvedValue({
      id: "pay-1",
      trigger: "manual",
      status: "pending",
      payerId: parent.id,
      expiresAt: new Date(NOW.getTime() - MIN).toISOString(),
      redirectUrl: "https://checkout.example/1",
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
