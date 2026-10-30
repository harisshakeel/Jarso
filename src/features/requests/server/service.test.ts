import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ kind: "user" })) }));
vi.mock("@/features/family/server", () => ({
  assertRole: vi.fn(),
  assertParentOf: vi.fn(),
  assertSelfOrParentOf: vi.fn(),
  getFamily: vi.fn(),
}));
vi.mock("@/features/rules/server", () => ({ getChildRules: vi.fn() }));
vi.mock("./repository", () => ({
  callCancel: vi.fn(),
  callComplete: vi.fn(),
  callCreateDeposit: vi.fn(),
  callCreateWithdrawal: vi.fn(),
  callDecideDeposit: vi.fn(),
  callDecideWithdrawal: vi.fn(),
  fetchBalances: vi.fn(),
  findRequestChildId: vi.fn(),
  listRequestsFor: vi.fn(),
  listOpenRequests: vi.fn(),
  sumWithdrawalsSince: vi.fn(),
}));

const family = await import("@/features/family/server");
const rules = await import("@/features/rules/server");
const repo = await import("./repository");
const service = await import("./service");

const parent = { id: "p1", email: "p@example.com" };
const requestId = "req-1";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(family.assertParentOf).mockResolvedValue(parent);
  vi.mocked(family.assertSelfOrParentOf).mockResolvedValue(parent);
  vi.mocked(family.assertRole).mockResolvedValue({
    user: { id: "child-1", email: null },
    membership: null,
  });
  vi.mocked(family.getFamily).mockResolvedValue({
    id: "f",
    code: "ABC234",
    currency: "GBP",
    timezone: "UTC",
  });
  vi.mocked(repo.findRequestChildId).mockResolvedValue("child-1");
});

describe("parent mutations", () => {
  const calls = {
    decideWithdrawal: () => service.decideWithdrawal({ requestId, approve: true }),
    rejectDeposit: () => service.rejectDeposit({ requestId }),
    completeRequest: () => service.completeRequest({ requestId, idempotencyKey: "k" }),
  };
  it.each(Object.entries(calls))("%s rejects when assertParentOf throws", async (_n, call) => {
    vi.mocked(family.assertParentOf).mockRejectedValue(new AppError("FORBIDDEN", "No"));
    await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repo.callDecideWithdrawal).not.toHaveBeenCalled();
    expect(repo.callDecideDeposit).not.toHaveBeenCalled();
    expect(repo.callComplete).not.toHaveBeenCalled();
  });

  it("a missing request is forbidden, like the database says", async () => {
    vi.mocked(repo.findRequestChildId).mockResolvedValue(null);
    await expect(calls.completeRequest()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("completeRequest", () => {
  it("treats already_completed as success", async () => {
    vi.mocked(repo.callComplete).mockResolvedValue("already_completed");
    await expect(service.completeRequest({ requestId, idempotencyKey: "k" })).resolves.toBe(
      "already_completed",
    );
  });

  it.each(["not_approved", "over_available"] as const)("%s is a CONFLICT", async (result) => {
    vi.mocked(repo.callComplete).mockResolvedValue(result);
    await expect(service.completeRequest({ requestId, idempotencyKey: "k" })).rejects.toMatchObject(
      {
        code: "CONFLICT",
        message: "This request changed. Refresh to see where it is.",
      },
    );
  });
});

describe("cancelRequest", () => {
  it("lets the child or a parent cancel, already_closed is fine", async () => {
    vi.mocked(repo.callCancel).mockResolvedValue("already_closed");
    await expect(service.cancelRequest({ requestId })).resolves.toBe("already_closed");
    expect(family.assertSelfOrParentOf).toHaveBeenCalledWith("child-1");
  });
});

describe("createWithdrawal", () => {
  it("asks for the signed-in child and returns a cap refusal as a result", async () => {
    const result = { status: "over_cap", period: "week", capMinor: 1500, usedMinor: 1000 } as const;
    vi.mocked(repo.callCreateWithdrawal).mockResolvedValue(result);
    await expect(
      service.createWithdrawal({ amountMinor: 600, idempotencyKey: "k" }),
    ).resolves.toEqual(result);
    expect(repo.callCreateWithdrawal).toHaveBeenCalledWith(
      { kind: "user" },
      { childId: "child-1", amountMinor: 600, reason: "", idempotencyKey: "k" },
    );
  });
});

describe("getAvailability", () => {
  const balances = {
    spendMinor: 500,
    saveMinor: 5000,
    reservedSaveMinor: 1000,
    heldSpendMinor: 0,
    availableSaveMinor: 4000,
    availableSpendMinor: 500,
  };
  const rule = (period: "item" | "week" | "month", amountMinor: number) =>
    ({ kind: "withdrawal_cap", period, amountMinor }) as const;

  beforeEach(() => {
    vi.mocked(repo.fetchBalances).mockResolvedValue(balances);
  });

  it("is null without a cap", async () => {
    vi.mocked(rules.getChildRules).mockResolvedValue({ allowNegativeSpend: false, rules: [] });
    await expect(service.getAvailability("child-1")).resolves.toEqual({
      ...balances,
      takeOutLimitMinor: null,
    });
  });

  it("is the smallest of available Save and each cap minus used", async () => {
    vi.mocked(rules.getChildRules).mockResolvedValue({
      allowNegativeSpend: false,
      rules: [rule("item", 3500), rule("week", 3000), rule("month", 9000)],
    });
    vi.mocked(repo.sumWithdrawalsSince).mockImplementation(async (_db, _c, since) => {
      // Week window started Monday 2026-10-26; month window on the 1st.
      return since?.startsWith("2026-10-01") ? 1000 : 2500;
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-29T12:00:00Z"));
    const result = await service.getAvailability("child-1");
    vi.useRealTimers();
    // item 3500, week 3000-2500=500, month 9000-1000=8000, available 4000.
    expect(result.takeOutLimitMinor).toBe(500);
  });

  it("caps at available Save and never goes below zero", async () => {
    vi.mocked(rules.getChildRules).mockResolvedValue({
      allowNegativeSpend: false,
      rules: [rule("item", 99999)],
    });
    expect((await service.getAvailability("child-1")).takeOutLimitMinor).toBe(4000);

    vi.mocked(rules.getChildRules).mockResolvedValue({
      allowNegativeSpend: false,
      rules: [rule("week", 100)],
    });
    vi.mocked(repo.sumWithdrawalsSince).mockResolvedValue(900);
    expect((await service.getAvailability("child-1")).takeOutLimitMinor).toBe(0);
  });
});
