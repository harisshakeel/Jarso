import type { HistoryItem } from "@jarso/core/ledger";
import { spendingByCategory, whereItWent } from "@jarso/core/ledger";
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
const view = (h: HistoryItem[]) => whereItWent(h, TODAY, "GBP", { showMinor: "always" });

describe("whereItWent", () => {
  it("names the biggest category, then the next", () => {
    const v = view([buy("snacks", 350), buy("snacks", 400), buy("games", 400)]);
    expect(v.spent).toEqual({
      headline: "Most of your spending went on 🍫 Snacks: £7.50.",
      rest: ["Then 🎮 Games: £4.00."],
    });
    expect(v.empty).toBeNull();
  });

  it("sums the rest into other things after two Then lines", () => {
    const v = view([
      buy("snacks", 500),
      buy("games", 400),
      buy("clothes", 300),
      buy("travel", 100),
      buy("apps", 50),
    ]);
    expect(v.spent?.rest).toEqual([
      "Then 🎮 Games: £4.00.",
      "Then 👕 Clothes: £3.00.",
      "And £1.50 on other things.",
    ]);
  });

  it("says nothing spent when there are no purchases", () => {
    const v = view([]);
    expect(v.spent).toBeNull();
    expect(v.empty).toBe("Nothing spent this week yet.");
  });

  it("ignores undone and last week's purchases", () => {
    const v = view([
      buy("snacks", 900, { undone: true }),
      buy("games", 900, { occurredOn: "2026-11-01" }),
      buy("travel", 200),
    ]);
    expect(v.spent?.headline).toBe("Most of your spending went on 🚌 Travel: £2.00.");
    expect(v.spent?.rest).toEqual([]);
  });

  it("writes the money-in line, summing per source", () => {
    const v = view([
      item({ kind: "allowance", amountMinor: 1000 }),
      item({ kind: "received", category: "birthday", amountMinor: 2000 }),
    ]);
    expect(v.moneyIn).toBe("You got £30.00: £20.00 🎂 Birthday, £10.00 allowance.");
    const two = view([
      item({ kind: "allowance", amountMinor: 500 }),
      item({ kind: "allowance", amountMinor: 500 }),
    ]);
    expect(two.moneyIn).toBe("You got £10.00: £10.00 allowance.");
  });

  it("names the two biggest sources and sums the rest", () => {
    const v = view([
      item({ kind: "allowance", amountMinor: 1000 }),
      item({ kind: "received", category: "birthday", amountMinor: 2000 }),
      item({ kind: "gift", amountMinor: 500 }),
      item({ kind: "extra", amountMinor: 250 }),
    ]);
    expect(v.moneyIn).toBe(
      "You got £37.50: £20.00 🎂 Birthday, £10.00 allowance, and £7.50 from other places.",
    );
  });

  it("names gift and extra money, and skips skipped, undone and transfers", () => {
    const v = view([
      item({ kind: "gift", amountMinor: 500 }),
      item({ kind: "extra", amountMinor: 300 }),
      item({ kind: "skipped", amountMinor: null }),
      item({ kind: "allowance", amountMinor: 900, undone: true }),
      item({ kind: "deposit", amountMinor: 700 }),
    ]);
    expect(v.moneyIn).toBe("You got £8.00: £5.00 gift, £3.00 extra money.");
  });

  it("has no money-in line when nothing came in", () => {
    expect(view([buy("snacks", 100)]).moneyIn).toBeNull();
  });

  it("hides zero pence by default", () => {
    const v = whereItWent([buy("snacks", 400)], TODAY, "GBP");
    expect(v.spent?.headline).toBe("Most of your spending went on 🍫 Snacks: £4.");
  });

  it("never judges or compares", () => {
    const v = view([
      buy("snacks", 500),
      buy("games", 400),
      buy("clothes", 300),
      buy("travel", 100),
      item({ kind: "allowance", amountMinor: 1000 }),
      item({ kind: "gift", amountMinor: 1000 }),
      item({ kind: "extra", amountMinor: 1000 }),
    ]);
    const text = JSON.stringify(v).toLowerCase();
    for (const bad of ["too much", "only", "%", "more than", "less than", "better", "worse"]) {
      expect(text).not.toContain(bad);
    }
  });
});

describe("spendingByCategory", () => {
  it("groups this week's live purchases, biggest first, ties by category order", () => {
    const rows = spendingByCategory(
      [
        buy("games", 400),
        buy("snacks", 400),
        buy("travel", 900),
        buy("snacks", 0 + 50, { undone: true }),
        buy("apps", 100, { occurredOn: "2026-10-30" }),
        buy(null as unknown as string, 100),
      ],
      TODAY,
    );
    expect(rows).toEqual([
      { key: "travel", emoji: "🚌", label: "Travel", totalMinor: 900 },
      { key: "snacks", emoji: "🍫", label: "Snacks", totalMinor: 400 },
      { key: "games", emoji: "🎮", label: "Games", totalMinor: 400 },
      { key: "other", emoji: "✨", label: "Other", totalMinor: 100 },
    ]);
  });
});
