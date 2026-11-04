import type { HistoryItem } from "@jarso/core/ledger";
import { diaryHighlights } from "@jarso/core/ledger";
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

describe("diaryHighlights", () => {
  it("adds up this week's spending and money in, and names the biggest category", () => {
    const view = diaryHighlights(
      [
        item({ category: "snacks", amountMinor: 350 }),
        item({ category: "games", amountMinor: 200 }),
        item({ kind: "allowance", amountMinor: 500 }),
        item({ kind: "gift", amountMinor: 1000, label: "Gift" }),
        // A move between jars is not money in; an undone purchase and last week's don't count.
        item({ kind: "withdrawal", amountMinor: 300 }),
        item({ category: "snacks", amountMinor: 900, undone: true }),
        item({ category: "snacks", amountMinor: 900, occurredOn: "2026-10-30" }),
      ],
      TODAY,
    );
    expect(view.spentMinor).toBe(550);
    expect(view.inMinor).toBe(1500);
    expect(view.top?.key).toBe("snacks");
    expect(view.top?.totalMinor).toBe(350);
  });

  it("is empty before anything happens", () => {
    expect(diaryHighlights([], TODAY)).toEqual({ spentMinor: 0, inMinor: 0, top: null });
  });
});
