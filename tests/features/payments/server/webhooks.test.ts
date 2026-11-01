import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib";
import type { ProviderEvent } from "@/lib/payments";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({ kind: "admin" })) }));
vi.mock("@/features/payments/server/repository", () => ({
  applyPayment: vi.fn(),
  armAutoCharge: vi.fn(),
  failPayment: vi.fn(),
  failSetup: vi.fn(),
  findPaymentForWebhook: vi.fn(),
  findSetupForWebhook: vi.fn(),
  hasWebhookEvent: vi.fn(),
  markPaymentRequiresAction: vi.fn(),
  recordWebhookEvent: vi.fn(),
  saveCustomerCard: vi.fn(),
  succeedSetup: vi.fn(),
}));

const repo = await import("@/features/payments/server/repository");
const { handleProviderEvent } = await import("@/features/payments/server/webhooks");

const ADMIN = { kind: "admin" };
const PAYMENT_ID = "6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
const SETUP_ID = "7a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const PARENT_ID = "8b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e";
const SCHEDULE_ID = "9c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f";

const paid = (overrides: Partial<Extract<ProviderEvent, { kind: "payment" }>> = {}) =>
  ({
    kind: "payment",
    eventId: "evt_1",
    paymentId: PAYMENT_ID,
    providerRef: "fake_cs_1",
    status: "succeeded",
    ...overrides,
  }) satisfies ProviderEvent;

const saved = {
  kind: "setup",
  eventId: "evt_setup",
  setupId: SETUP_ID,
  methodRef: "fake_pm_ok",
  card: { brand: "visa", last4: "4242" },
} satisfies ProviderEvent;

let recorded: Set<string>;

beforeEach(() => {
  vi.clearAllMocks();
  recorded = new Set();
  vi.mocked(repo.hasWebhookEvent).mockImplementation(async (_db, provider, eventId) =>
    recorded.has(`${provider}:${eventId}`),
  );
  vi.mocked(repo.recordWebhookEvent).mockImplementation(async (_db, provider, eventId) => {
    recorded.add(`${provider}:${eventId}`);
  });
  vi.mocked(repo.findPaymentForWebhook).mockResolvedValue({
    id: PAYMENT_ID,
    provider: "fake",
    status: "pending",
  });
  vi.mocked(repo.applyPayment).mockResolvedValue("confirmed");
  vi.mocked(repo.findSetupForWebhook).mockResolvedValue({
    id: SETUP_ID,
    parentId: PARENT_ID,
    provider: "fake",
    status: "pending",
    arm: null,
  });
  vi.mocked(repo.saveCustomerCard).mockResolvedValue(true);
  vi.mocked(repo.armAutoCharge).mockResolvedValue("ok");
});

describe("handleProviderEvent: payments", () => {
  it("applies a succeeded payment once; the same event again is a duplicate", async () => {
    expect(await handleProviderEvent("fake", paid())).toBe("applied");
    expect(await handleProviderEvent("fake", paid())).toBe("duplicate");
    expect(repo.applyPayment).toHaveBeenCalledTimes(1);
    expect(repo.applyPayment).toHaveBeenCalledWith(ADMIN, PAYMENT_ID);
    expect(repo.recordWebhookEvent).toHaveBeenCalledWith(ADMIN, "fake", "evt_1");
  });

  it("ignores an unknown paymentId without throwing", async () => {
    vi.mocked(repo.findPaymentForWebhook).mockResolvedValue(null);
    expect(await handleProviderEvent("fake", paid())).toBe("ignored");
    expect(repo.applyPayment).not.toHaveBeenCalled();
    expect(repo.recordWebhookEvent).toHaveBeenCalled();
  });

  it("ignores a paymentId that is not a uuid without querying", async () => {
    expect(await handleProviderEvent("fake", paid({ paymentId: "cs_test_other_app" }))).toBe(
      "ignored",
    );
    expect(repo.findPaymentForWebhook).not.toHaveBeenCalled();
  });

  it("ignores a payment made through another provider", async () => {
    vi.mocked(repo.findPaymentForWebhook).mockResolvedValue({
      id: PAYMENT_ID,
      provider: "stripe",
      status: "pending",
    });
    expect(await handleProviderEvent("fake", paid())).toBe("ignored");
    expect(repo.applyPayment).not.toHaveBeenCalled();
  });

  it("does not fail a payment on an out-of-order expired after succeeded", async () => {
    vi.mocked(repo.findPaymentForWebhook).mockResolvedValue({
      id: PAYMENT_ID,
      provider: "fake",
      status: "succeeded",
    });
    expect(await handleProviderEvent("fake", paid({ eventId: "evt_2", status: "expired" }))).toBe(
      "ignored",
    );
    expect(repo.failPayment).not.toHaveBeenCalled();
    expect(repo.applyPayment).not.toHaveBeenCalled();
  });

  it("posts a late success onto an expired payment", async () => {
    vi.mocked(repo.findPaymentForWebhook).mockResolvedValue({
      id: PAYMENT_ID,
      provider: "fake",
      status: "expired",
    });
    expect(await handleProviderEvent("fake", paid())).toBe("applied");
    expect(repo.applyPayment).toHaveBeenCalledWith(ADMIN, PAYMENT_ID);
  });

  it("fails a pending payment with its failure code", async () => {
    expect(
      await handleProviderEvent("fake", paid({ status: "failed", failureCode: "declined" })),
    ).toBe("applied");
    expect(repo.failPayment).toHaveBeenCalledWith(ADMIN, PAYMENT_ID, "failed", "declined");
  });

  it("expires a pending payment with no failure code", async () => {
    await handleProviderEvent("fake", paid({ status: "expired" }));
    expect(repo.failPayment).toHaveBeenCalledWith(ADMIN, PAYMENT_ID, "expired", null);
  });

  it("moves a pending payment to requires_action", async () => {
    expect(await handleProviderEvent("fake", paid({ status: "requires_action" }))).toBe("applied");
    expect(repo.markPaymentRequiresAction).toHaveBeenCalledWith(ADMIN, PAYMENT_ID);
  });

  it("records nothing when processing throws, so the provider's retry reprocesses", async () => {
    vi.mocked(repo.applyPayment).mockRejectedValueOnce(new AppError("INTERNAL", "deadlock"));
    await expect(handleProviderEvent("fake", paid())).rejects.toThrow("deadlock");
    expect(repo.recordWebhookEvent).not.toHaveBeenCalled();

    expect(await handleProviderEvent("fake", paid())).toBe("applied");
    expect(repo.applyPayment).toHaveBeenCalledTimes(2);
    expect(recorded.has("fake:evt_1")).toBe(true);
  });
});

describe("handleProviderEvent: card setups", () => {
  it("saves the card, turns the toggle on for the setup's parent and marks it succeeded", async () => {
    vi.mocked(repo.findSetupForWebhook).mockResolvedValue({
      id: SETUP_ID,
      parentId: PARENT_ID,
      provider: "fake",
      status: "pending",
      arm: { type: "allowance_schedule", id: SCHEDULE_ID },
    });
    expect(await handleProviderEvent("fake", saved)).toBe("applied");
    expect(repo.saveCustomerCard).toHaveBeenCalledWith(ADMIN, PARENT_ID, "fake", {
      methodRef: "fake_pm_ok",
      card: { brand: "visa", last4: "4242" },
    });
    expect(repo.armAutoCharge).toHaveBeenCalledWith(
      ADMIN,
      PARENT_ID,
      { type: "allowance_schedule", id: SCHEDULE_ID },
      "fake",
    );
    expect(repo.succeedSetup).toHaveBeenCalledWith(ADMIN, SETUP_ID);
  });

  it("saves the card without arming when the setup has no toggle", async () => {
    expect(await handleProviderEvent("fake", saved)).toBe("applied");
    expect(repo.saveCustomerCard).toHaveBeenCalled();
    expect(repo.armAutoCharge).not.toHaveBeenCalled();
    expect(repo.succeedSetup).toHaveBeenCalledWith(ADMIN, SETUP_ID);
  });

  it("still saves the card when the toggle can no longer be turned on", async () => {
    vi.mocked(repo.findSetupForWebhook).mockResolvedValue({
      id: SETUP_ID,
      parentId: PARENT_ID,
      provider: "fake",
      status: "pending",
      arm: { type: "parent_gift", id: SCHEDULE_ID },
    });
    vi.mocked(repo.armAutoCharge).mockResolvedValue("refused");
    expect(await handleProviderEvent("fake", saved)).toBe("applied");
    expect(repo.succeedSetup).toHaveBeenCalledWith(ADMIN, SETUP_ID);
  });

  it("ignores an unknown setupId without throwing", async () => {
    vi.mocked(repo.findSetupForWebhook).mockResolvedValue(null);
    expect(await handleProviderEvent("fake", saved)).toBe("ignored");
    expect(repo.saveCustomerCard).not.toHaveBeenCalled();
  });

  it("ignores a setup that already succeeded", async () => {
    vi.mocked(repo.findSetupForWebhook).mockResolvedValue({
      id: SETUP_ID,
      parentId: PARENT_ID,
      provider: "fake",
      status: "succeeded",
      arm: { type: "allowance_schedule", id: SCHEDULE_ID },
    });
    expect(await handleProviderEvent("fake", { ...saved, eventId: "evt_other" })).toBe("ignored");
    expect(repo.saveCustomerCard).not.toHaveBeenCalled();
    expect(repo.armAutoCharge).not.toHaveBeenCalled();
  });

  it("marks a failed or expired setup", async () => {
    await handleProviderEvent("fake", {
      kind: "setup_failed",
      eventId: "evt_f",
      setupId: SETUP_ID,
      reason: "expired",
    });
    expect(repo.failSetup).toHaveBeenCalledWith(ADMIN, SETUP_ID, "expired");
  });
});
