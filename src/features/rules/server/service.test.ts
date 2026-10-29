import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ kind: "user" })) }));
vi.mock("@/features/family/server", () => ({
  assertParentOf: vi.fn(),
  assertSelfOrParentOf: vi.fn(),
}));
vi.mock("./repository", () => ({
  findChildRules: vi.fn(),
  saveAllowNegativeSpend: vi.fn(),
  saveMoneyRule: vi.fn(),
}));

const family = await import("@/features/family/server");
const repo = await import("./repository");
const service = await import("./service");

const childId = "child-1";
const rule = { childId, kind: "spend_limit", period: "week", amountMinor: 1000 } as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(family.assertParentOf).mockResolvedValue({ id: "p", email: "p@example.com" });
});

describe("setRule", () => {
  it("rejects when the caller is not the child's parent", async () => {
    vi.mocked(family.assertParentOf).mockRejectedValue(new AppError("FORBIDDEN", "No"));
    await expect(service.setRule(rule)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repo.saveMoneyRule).not.toHaveBeenCalled();
  });

  it("saves the rule, and null clears it", async () => {
    await service.setRule({ ...rule, amountMinor: null });
    expect(repo.saveMoneyRule).toHaveBeenCalledWith(
      { kind: "user" },
      { ...rule, amountMinor: null },
    );
  });
});

describe("setOverspend", () => {
  it("rejects when the caller is not the child's parent", async () => {
    vi.mocked(family.assertParentOf).mockRejectedValue(new AppError("FORBIDDEN", "No"));
    await expect(service.setOverspend({ childId, allowed: true })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(repo.saveAllowNegativeSpend).not.toHaveBeenCalled();
  });

  it("saves the setting", async () => {
    await service.setOverspend({ childId, allowed: true });
    expect(repo.saveAllowNegativeSpend).toHaveBeenCalledWith({ kind: "user" }, childId, true);
  });
});

describe("getChildRules", () => {
  it("checks self or parent before reading", async () => {
    vi.mocked(family.assertSelfOrParentOf).mockRejectedValue(new AppError("FORBIDDEN", "No"));
    await expect(service.getChildRules(childId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repo.findChildRules).not.toHaveBeenCalled();
  });
});
