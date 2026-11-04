import type { Client } from "@jarso/data/ledger";
import { GRAPH_DAYS, getBalanceHistory } from "@jarso/data/ledger";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/ledger/repository", () => ({
  fetchBalance: vi.fn(),
  listClosedOccurrences: vi.fn(),
  listLedgerRows: vi.fn(),
  listMovementsSince: vi.fn(),
  listOccurrenceAmounts: vi.fn(),
}));

const repo = await import("../../src/ledger/repository");

const db = { kind: "user" } as unknown as Client;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.fetchBalance).mockImplementation(async (_db, _child, jar) =>
    jar === "spend" ? 300 : 1000,
  );
  vi.mocked(repo.listMovementsSince).mockResolvedValue([]);
});

describe("getBalanceHistory", () => {
  it("spans GRAPH_DAYS in the family timezone", async () => {
    // 12:00 UTC on 3 November is already 4 November in Kiritimati (UTC+14).
    vi.mocked(repo.listMovementsSince).mockResolvedValue([
      { jar: "save", direction: "in", amountMinor: 500, occurredAt: "2026-11-03T20:00:00Z" },
    ]);
    const history = await getBalanceHistory(db, "child-1", {
      timezone: "Pacific/Kiritimati",
      now: new Date("2026-11-03T12:00:00Z"),
    });
    expect(GRAPH_DAYS).toBe(90);
    expect(history.points).toHaveLength(GRAPH_DAYS);
    expect(history.points[0]?.date).toBe("2026-08-07");
    expect(history.points.at(-1)).toEqual({ date: "2026-11-04", spend: 300, save: 1000 });
    expect(history.points.at(-2)).toEqual({ date: "2026-11-03", spend: 300, save: 500 });
    expect(history.movedOn).toEqual(["2026-11-04"]);
    // A day before the first date, in UTC, covers every timezone's start of that day.
    expect(repo.listMovementsSince).toHaveBeenCalledWith(db, "child-1", "2026-08-06T00:00:00Z");
  });

  it("ends today in UTC for a UTC family", async () => {
    const history = await getBalanceHistory(db, "child-1", {
      timezone: "UTC",
      now: new Date("2026-11-03T12:00:00Z"),
    });
    expect(history.points.at(-1)?.date).toBe("2026-11-03");
    expect(history.movedOn).toEqual([]);
  });
});
