import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
const { getHistory, getHistoryPage, getJars } = await import("./service");

const childId = "child-1";
const row = (over: Partial<Awaited<ReturnType<typeof repo.listLedgerRows>>[number]>) => ({
  id: "row",
  kind: "allowance",
  reversesEntryId: null,
  reversed: false,
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
        undone: false,
        entryId: null,
        canUndo: false,
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

describe("getHistory requests", () => {
  const requestRow = (over: Parameters<typeof row>[0]) =>
    row({
      sourceType: "request",
      sourceId: "req-1",
      occurredAt: "2026-10-28T10:00:00Z",
      ...over,
    });

  it("shows a withdrawal's out/in pair as one line", async () => {
    vi.mocked(repo.listLedgerRows).mockResolvedValue([
      requestRow({
        id: "r2",
        kind: "withdrawal_in",
        jar: "spend",
        direction: "in",
        amountMinor: 500,
        label: "New bike",
      }),
      requestRow({
        id: "r1",
        kind: "withdrawal_out",
        jar: "save",
        direction: "out",
        amountMinor: 500,
        label: "New bike",
      }),
    ]);
    const items = await getHistory(childId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "req-1",
      kind: "withdrawal",
      amountMinor: 500,
      label: "New bike",
      occurredOn: "2026-10-28",
      canUndo: false,
    });
  });

  it("shows a deposit as one line", async () => {
    vi.mocked(repo.listLedgerRows).mockResolvedValue([
      requestRow({
        id: "r2",
        kind: "deposit_in",
        jar: "save",
        direction: "in",
        amountMinor: 700,
        label: "Put into Save",
      }),
      requestRow({
        id: "r1",
        kind: "deposit_out",
        jar: "spend",
        direction: "out",
        amountMinor: 700,
      }),
    ]);
    const items = await getHistory(childId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "deposit", amountMinor: 700, label: "Put into Save" });
  });
});

describe("getHistory purchases", () => {
  const NOW = Date.parse("2026-10-29T12:00:00Z");
  const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
  const purchase = (over: Parameters<typeof row>[0] = {}) =>
    row({
      id: "p1",
      kind: "purchase",
      direction: "out",
      amountMinor: 300,
      label: "Snack",
      sourceType: "diary",
      sourceId: null,
      occurredAt: hoursAgo(2),
      ...over,
    });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("shows a purchase as its own line that can be undone within 24 hours", async () => {
    vi.mocked(repo.listLedgerRows).mockResolvedValue([purchase()]);
    await expect(getHistory(childId)).resolves.toEqual([
      {
        id: "p1",
        kind: "purchase",
        amountMinor: 300,
        dueMinor: null,
        label: "Snack",
        occurredOn: "2026-10-29",
        undone: false,
        entryId: "p1",
        canUndo: true,
      },
    ]);
  });

  it("cannot undo a purchase older than 24 hours", async () => {
    vi.mocked(repo.listLedgerRows).mockResolvedValue([purchase({ occurredAt: hoursAgo(25) })]);
    const [item] = await getHistory(childId);
    expect(item).toMatchObject({ kind: "purchase", undone: false, canUndo: false });
  });

  it("folds a purchase and its reversal into one undone line", async () => {
    vi.mocked(repo.listLedgerRows).mockResolvedValue([
      row({
        id: "rev",
        kind: "reversal",
        direction: "in",
        amountMinor: 300,
        sourceType: "diary",
        sourceId: null,
        reversesEntryId: "p1",
        occurredAt: hoursAgo(1),
      }),
      purchase({ reversed: true }),
    ]);
    const items = await getHistory(childId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "p1",
      kind: "purchase",
      amountMinor: 300,
      undone: true,
      canUndo: false,
    });
  });

  it("marks a purchase undone from its flag even when the reversal is on another page", async () => {
    vi.mocked(repo.listLedgerRows).mockResolvedValue([purchase({ reversed: true })]);
    const [item] = await getHistory(childId);
    expect(item).toMatchObject({ undone: true, canUndo: false });
  });

  it("labels an unlabelled purchase 'Purchase'", async () => {
    vi.mocked(repo.listLedgerRows).mockResolvedValue([purchase({ label: null })]);
    const [item] = await getHistory(childId);
    expect(item?.label).toBe("Purchase");
  });

  it("gives existing lines no undo", async () => {
    vi.mocked(repo.listLedgerRows).mockResolvedValue([
      row({ id: "g", sourceType: "parent_gift", sourceId: "gift-1", amountMinor: 100 }),
    ]);
    const [item] = await getHistory(childId);
    expect(item).toMatchObject({ undone: false, entryId: null, canUndo: false });
  });
});

describe("getHistoryPage", () => {
  /** `n` single-row gifts, one minute apart, newest first, starting at `from`. */
  const gifts = (n: number, from = Date.parse("2026-10-28T12:00:00Z")) =>
    Array.from({ length: n }, (_, i) =>
      row({
        id: `g${i}`,
        sourceType: "parent_gift",
        sourceId: `gift-${i}`,
        amountMinor: 100,
        occurredAt: new Date(from - i * 60_000).toISOString(),
      }),
    );

  it("is the last page when everything fits", async () => {
    vi.mocked(repo.listLedgerRows).mockResolvedValue(gifts(3));
    const page = await getHistoryPage(childId);
    expect(page.items).toHaveLength(3);
    expect(page.olderBefore).toBeNull();
  });

  it("passes the cursor to both reads", async () => {
    vi.mocked(repo.listLedgerRows).mockResolvedValue([]);
    await getHistoryPage(childId, "2026-10-01T00:00:00Z");
    expect(repo.listLedgerRows).toHaveBeenCalledWith(
      expect.anything(),
      childId,
      100,
      "2026-10-01T00:00:00Z",
    );
    expect(repo.listClosedOccurrences).toHaveBeenCalledWith(
      expect.anything(),
      childId,
      51,
      "2026-10-01T00:00:00Z",
    );
  });

  it("keeps 50 items and points the cursor at the oldest one shown", async () => {
    const rows = gifts(60);
    vi.mocked(repo.listLedgerRows).mockResolvedValue(rows);
    const page = await getHistoryPage(childId);
    expect(page.items).toHaveLength(50);
    expect(page.items.at(-1)?.id).toBe("gift-49");
    expect(page.olderBefore).toBe(rows[49]?.occurredAt);
  });

  it("leaves a source cut in two by a full read, and anything older, to the next page", async () => {
    // 100 rows: 49 two-row allowances, then one more allowance with only its Spend row read.
    const start = Date.parse("2026-10-28T12:00:00Z");
    const rows = Array.from({ length: 100 }, (_, i) =>
      row({
        id: `r${i}`,
        jar: i % 2 === 0 ? "spend" : "save",
        amountMinor: 100,
        sourceId: `occ-${Math.floor(i / 2)}`,
        occurredAt: new Date(start - Math.floor(i / 2) * 60_000).toISOString(),
      }),
    );
    rows[99] = row({ ...rows[98], id: "r99", sourceId: "occ-50" });
    rows[98] = row({ ...rows[98], sourceId: "occ-49" });
    vi.mocked(repo.listLedgerRows).mockResolvedValue(rows);
    // Not given long ago: older than the cut, so it belongs to a later page.
    vi.mocked(repo.listClosedOccurrences).mockResolvedValue([
      { id: "occ-old", closedAt: "2026-01-01T00:00:00Z" },
    ]);

    const page = await getHistoryPage(childId);
    const ids = page.items.map((i) => i.id);
    expect(ids).not.toContain("occ-49");
    expect(ids).not.toContain("occ-50");
    expect(ids).not.toContain("occ-old");
    expect(page.items).toHaveLength(49);
    expect(page.olderBefore).toBe(rows[97]?.occurredAt);
  });
});
