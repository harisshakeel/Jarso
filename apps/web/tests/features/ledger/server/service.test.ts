import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib";

const db = { kind: "user" };
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => db) }));
vi.mock("@/features/family/server", () => ({
  assertSelfOrParentOf: vi.fn(),
  getFamily: vi.fn(),
}));
vi.mock("@jarso/data/ledger", () => ({
  getHistoryPage: vi.fn(),
  getJars: vi.fn(),
  localDate: vi.fn(),
  fetchBalance: vi.fn(),
  listMovementsSince: vi.fn(),
}));

const family = await import("@/features/family/server");
const data = await import("@jarso/data/ledger");
const { getHistory, getHistoryPage, getJars } = await import("@/features/ledger/server/service");

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
