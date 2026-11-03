import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib";

const db = { kind: "user" };
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => db) }));
vi.mock("@/features/family/server", () => ({
  assertSelfOrParentOf: vi.fn(),
  getFamily: vi.fn(),
}));
vi.mock("@jarso/data/ledger", () => ({
  getBalanceHistory: vi.fn(),
  getHistoryPage: vi.fn(),
  getHistorySince: vi.fn(),
  getJars: vi.fn(),
}));

const family = await import("@/features/family/server");
const data = await import("@jarso/data/ledger");
const { getBalanceHistory, getHistory, getHistoryPage, getHistorySince, getJars } = await import(
  "@/features/ledger/server/service"
);

const childId = "child-1";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(family.assertSelfOrParentOf).mockResolvedValue({ id: childId, email: null });
  vi.mocked(family.getFamily).mockResolvedValue({
    id: "fam-1",
    code: "ABC234",
    currency: "INR",
    timezone: "Asia/Kolkata",
  });
  vi.mocked(data.getHistoryPage).mockResolvedValue({ items: [], olderBefore: null });
});

describe("getJars", () => {
  it("delegates to the shared read for an authorised caller", async () => {
    vi.mocked(data.getJars).mockResolvedValue({ spend: 300, save: 200 });
    await expect(getJars(childId)).resolves.toEqual({ spend: 300, save: 200 });
    expect(data.getJars).toHaveBeenCalledWith(db, childId);
  });

  it("rejects when the caller is neither the child nor a parent", async () => {
    vi.mocked(family.assertSelfOrParentOf).mockRejectedValue(new AppError("FORBIDDEN", "No."));
    await expect(getJars(childId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(data.getJars).not.toHaveBeenCalled();
  });
});

describe("getHistoryPage", () => {
  it("passes the family timezone, the server clock and the cursor", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-10-29T12:00:00Z"));
    try {
      await getHistoryPage(childId, "2026-10-01T00:00:00Z");
    } finally {
      vi.useRealTimers();
    }
    expect(data.getHistoryPage).toHaveBeenCalledWith(db, childId, {
      timezone: "Asia/Kolkata",
      now: Date.parse("2026-10-29T12:00:00Z"),
      before: "2026-10-01T00:00:00Z",
    });
  });

  it("falls back to UTC without a family", async () => {
    vi.mocked(family.getFamily).mockResolvedValue(null);
    await getHistory(childId);
    expect(data.getHistoryPage).toHaveBeenCalledWith(
      db,
      childId,
      expect.objectContaining({ timezone: "UTC" }),
    );
  });

  it("rejects before reading when the caller is not allowed", async () => {
    vi.mocked(family.assertSelfOrParentOf).mockRejectedValue(new AppError("FORBIDDEN", "No."));
    await expect(getHistoryPage(childId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(data.getHistoryPage).not.toHaveBeenCalled();
  });
});

// The walk-back over GRAPH_DAYS is shared and tested in packages/data/tests/ledger.
describe("getBalanceHistory", () => {
  it("passes the family timezone and the server clock", async () => {
    vi.mocked(data.getBalanceHistory).mockResolvedValue({ points: [], movedOn: [] });
    await expect(getBalanceHistory(childId)).resolves.toEqual({ points: [], movedOn: [] });
    expect(data.getBalanceHistory).toHaveBeenCalledWith(db, childId, {
      timezone: "Asia/Kolkata",
      now: expect.any(Date),
    });
  });

  it("rejects before reading when the caller is not allowed", async () => {
    vi.mocked(family.assertSelfOrParentOf).mockRejectedValue(new AppError("FORBIDDEN", "No."));
    await expect(getBalanceHistory(childId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(data.getBalanceHistory).not.toHaveBeenCalled();
  });
});

describe("getHistorySince", () => {
  it("checks the caller once, then reads every page back to the week's start", async () => {
    vi.mocked(data.getHistorySince).mockResolvedValue([]);
    await expect(getHistorySince(childId, "2026-11-02")).resolves.toEqual([]);
    expect(family.assertSelfOrParentOf).toHaveBeenCalledTimes(1);
    expect(data.getHistorySince).toHaveBeenCalledWith(db, childId, "2026-11-02", {
      timezone: "Asia/Kolkata",
      now: expect.any(Number),
    });
  });
});
