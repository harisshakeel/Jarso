import type { HistoryItem } from "@jarso/core/ledger";
import { weekSpentBars } from "@jarso/core/ledger";
import { describe, expect, it } from "vitest";

const TODAY = "2026-11-04"; // Wednesday; the week starts 2026-11-02
let n = 0;
const item = (over: Partial<HistoryItem>): HistoryItem => ({
  id: `h${n++}`,
  kind: "purchase",
  amountMinor: 100,
  dueMinor: null,
  label: "",
  occurredOn: "2026-11-03",
  undone: false,
  entryId: null,
  canUndo: false,
  paidByCard: false,
  category: null,
  jar: null,
  canFix: false,
  fixedFrom: null,
  ...over,
});
const buy = (category: string, amountMinor: number, over: Partial<HistoryItem> = {}) =>
  item({ kind: "purchase", category, amountMinor, ...over });

describe("weekSpentBars", () => {
  it("three biggest categories, biggest share 1", () => {
    const { bars } = weekSpentBars(
      [buy("snacks", 9500), buy("games", 6000), buy("travel", 3000), buy("other", 1000)],
      TODAY,
    );
    expect(bars.map((b) => b.key)).toEqual(["snacks", "games", "travel"]);
    expect(bars[0]?.share).toBe(1);
    expect(bars[1]?.share).toBeCloseTo(6000 / 9500);
    expect(bars[0]?.totalMinor).toBe(9500);
  });

  it("total counts every purchase this week, not just the bars", () => {
    const { totalMinor } = weekSpentBars(
      [buy("snacks", 9500), buy("games", 6000), buy("travel", 3000), buy("other", 1000)],
      TODAY,
    );
    expect(totalMinor).toBe(19500);
  });

  it("last week and money in are ignored", () => {
    const { totalMinor, bars } = weekSpentBars(
      [
        buy("snacks", 500, { occurredOn: "2026-10-30" }),
        item({ kind: "received", amountMinor: 2000 }),
        buy("games", 300),
        buy("games", 300, { undone: true }),
      ],
      TODAY,
    );
    expect(totalMinor).toBe(300);
    expect(bars).toHaveLength(1);
  });

  it("no purchases gives no bars and total 0", () => {
    expect(weekSpentBars([], TODAY)).toEqual({ totalMinor: 0, bars: [] });
  });
});
