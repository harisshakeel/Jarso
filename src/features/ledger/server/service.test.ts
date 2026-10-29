import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ kind: "user" })) }));
vi.mock("@/features/family/server", () => ({
  assertSelfOrParentOf: vi.fn(),
  getFamily: vi.fn(),
}));
vi.mock("./repository", () => ({
  fetchBalance: vi.fn(),
  listClosedOccurrences: vi.fn(),
  listLedgerRows: vi.fn(),
  listOccurrenceAmounts: vi.fn(),
}));

const family = await import("@/features/family/server");
const repo = await import("./repository");
const { getHistory, getJars } = await import("./service");

const childId = "child-1";
const row = (over: Partial<Awaited<ReturnType<typeof repo.listLedgerRows>>[number]>) => ({
  id: "row",
  jar: "spend" as const,
  direction: "in" as const,
  amountMinor: 0,
  label: "Allowance",
  sourceType: "occurrence",
  sourceId: "occ-1",
  occurredAt: "2026-10-26T09:00:00Z",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(family.assertSelfOrParentOf).mockResolvedValue({ id: childId, email: null });
  vi.mocked(family.getFamily).mockResolvedValue({
    id: "fam-1",
    code: "ABC234",
    currency: "INR",
    timezone: "Asia/Kolkata",
  });
  vi.mocked(repo.listClosedOccurrences).mockResolvedValue([]);
  vi.mocked(repo.listOccurrenceAmounts).mockResolvedValue([]);
});

describe("getJars", () => {
  it("returns both confirmed balances", async () => {
    vi.mocked(repo.fetchBalance).mockImplementation(async (_db, _child, jar) =>
      jar === "spend" ? 300 : 200,
    );
    await expect(getJars(childId)).resolves.toEqual({ spend: 300, save: 200 });
  });

  it("rejects when the caller is neither the child nor a parent", async () => {
    vi.mocked(family.assertSelfOrParentOf).mockRejectedValue(new AppError("FORBIDDEN", "No."));
    await expect(getJars(childId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repo.fetchBalance).not.toHaveBeenCalled();
  });
});

describe("getHistory", () => {
  it("groups one handover's Spend and Save rows and shows a shortfall", async () => {
    vi.mocked(repo.listLedgerRows).mockResolvedValue([
      row({ id: "r1", jar: "spend", amountMinor: 30000 }),
      row({ id: "r2", jar: "save", amountMinor: 10000 }),
    ]);
    vi.mocked(repo.listOccurrenceAmounts).mockResolvedValue([
      { id: "occ-1", amountMinor: 50000, shortfallMinor: 10000 },
    ]);

    await expect(getHistory(childId)).resolves.toEqual([
      {
        id: "occ-1",
        kind: "allowance",
        amountMinor: 40000,
        dueMinor: 50000,
        label: "Allowance",
        occurredOn: "2026-10-26",
      },
    ]);
  });

  it("merges gifts and skipped allowances newest first, in the family's timezone", async () => {
    vi.mocked(repo.listLedgerRows).mockResolvedValue([
      row({
        id: "g1",
        amountMinor: 1000,
        label: "Well done",
        sourceType: "parent_gift",
        sourceId: "gift-1",
        occurredAt: "2026-10-28T20:00:00Z",
      }),
      row({ id: "r1", amountMinor: 500, occurredAt: "2026-10-20T09:00:00Z" }),
    ]);
    vi.mocked(repo.listOccurrenceAmounts).mockResolvedValue([
      { id: "occ-1", amountMinor: 500, shortfallMinor: 0 },
    ]);
    vi.mocked(repo.listClosedOccurrences).mockResolvedValue([
      { id: "occ-2", closedAt: "2026-10-27T09:00:00Z" },
    ]);

    const items = await getHistory(childId);
    expect(items.map((i) => [i.kind, i.id, i.amountMinor, i.dueMinor, i.occurredOn])).toEqual([
      ["gift", "gift-1", 1000, null, "2026-10-29"],
      ["skipped", "occ-2", null, null, "2026-10-27"],
      ["allowance", "occ-1", 500, null, "2026-10-20"],
    ]);
    expect(items[0]?.label).toBe("Well done");
  });
});
