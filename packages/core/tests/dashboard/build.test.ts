import type { Schedule } from "@jarso/core/allowance";
import {
  addMonths,
  allowanceDates,
  biggestChange,
  callouts,
  categoryComparison,
  categorySentence,
  type DashboardChild,
  dashboardTotals,
  mergeActivity,
  moneyChart,
  moneyChartSentence,
  scopeChildren,
  slotFor,
  timeline,
  windowFor,
} from "@jarso/core/dashboard";
import type { HistoryItem } from "@jarso/core/ledger";
import { describe, expect, it } from "vitest";

// Friday 30 October 2026: this week is Fri 24 to Fri 30 Oct, last week 17 to 23 Oct.
const today = "2026-10-30";
const week = windowFor(7, today);

const item = (over: Partial<HistoryItem>): HistoryItem => ({
  id: "i",
  kind: "purchase",
  amountMinor: 300,
  dueMinor: null,
  label: "Comic",
  occurredOn: "2026-10-28",
  undone: false,
  entryId: null,
  canUndo: false,
  paidByCard: false,
  category: "snacks",
  jar: null,
  canFix: false,
  fixedFrom: null,
  ...over,
});

const schedule = (over: Partial<Schedule> = {}): Schedule => ({
  id: "s",
  amountMinor: 500,
  frequency: "weekly",
  status: "active",
  anchorOn: "2026-10-04",
  nextDueOn: "2026-11-01",
  pausedThrough: null,
  pauseMessage: null,
  autoCharge: false,
  autoChargeProvider: null,
  autoChargeMine: false,
  ...over,
});

const child = (
  over: Partial<DashboardChild> & { id: string; nickname: string },
): DashboardChild => ({
  slot: 1,
  spendMinor: 0,
  saveMinor: 0,
  reservedMinor: 0,
  goal: null,
  schedule: null,
  due: [],
  gifts: [],
  history: [],
  balances: null,
  flaggedChats: 0,
  ...over,
});

const aisha = child({
  id: "a",
  nickname: "Aisha",
  slot: 1,
  spendMinor: 1200,
  saveMinor: 3000,
  history: [
    item({ id: "p1", occurredOn: "2026-10-29", amountMinor: 400 }),
    item({ id: "p2", occurredOn: "2026-10-20", amountMinor: 150 }),
    item({
      id: "al",
      kind: "allowance",
      category: null,
      occurredOn: "2026-10-26",
      amountMinor: 500,
    }),
  ],
  due: [{ kind: "allowance", id: "o1", dueOn: "2026-10-30", amountMinor: 500, note: null }],
});
const zarrar = child({
  id: "z",
  nickname: "Zarrar",
  slot: 2,
  spendMinor: 800,
  saveMinor: 7000,
  history: [
    item({ id: "g1", category: "games", occurredOn: "2026-10-29", amountMinor: 900 }),
    item({ id: "g0", category: "games", occurredOn: "2026-10-18", amountMinor: 900, undone: true }),
  ],
});

describe("slots and scope", () => {
  it("gives each child a fixed slot by order, and a neutral one past the eighth", () => {
    expect([0, 1, 7, 8].map(slotFor)).toEqual([1, 2, 8, 0]);
  });

  it("scopes to one child of the family, or everyone for none or a stranger", () => {
    expect(scopeChildren([aisha, zarrar], "z")).toEqual([zarrar]);
    expect(scopeChildren([aisha, zarrar], null)).toEqual([aisha, zarrar]);
    expect(scopeChildren([aisha, zarrar], "someone-else")).toEqual([aisha, zarrar]);
  });

  it("windows a period and the one before it", () => {
    expect(week).toEqual({
      days: 7,
      from: "2026-10-24",
      to: today,
      prevFrom: "2026-10-17",
      prevTo: "2026-10-23",
    });
  });
});

describe("totals", () => {
  it("adds up what the children hold, what the parent holds and the handovers", () => {
    expect(dashboardTotals([aisha, zarrar], today)).toEqual({
      children: 2,
      spendMinor: 2000,
      saveMinor: 10000,
      handedOver: 1,
      waiting: 1,
      waitingMinor: 500,
    });
  });

  it("counts only the scoped child", () => {
    expect(dashboardTotals([zarrar], today)).toMatchObject({
      children: 1,
      saveMinor: 7000,
      waiting: 0,
    });
  });
});

describe("spending by category", () => {
  it("compares the period with the one before, leaving out undone lines", () => {
    const rows = categoryComparison([aisha, zarrar], week);
    expect(rows.map((r) => [r.key, r.nowMinor, r.beforeMinor])).toEqual([
      ["games", 900, 0],
      ["snacks", 400, 150],
    ]);
    expect(biggestChange(rows)?.key).toBe("games");
    expect(categorySentence(rows, 7, "GBP", null)).toBe("🎮 Games is new this week: £9.00.");
  });

  it("says so calmly when nothing was spent", () => {
    expect(categorySentence([], 7, "GBP", "Zarrar")).toBe(
      "Zarrar recorded no spending this week or last week.",
    );
  });

  it("names the direction of a change", () => {
    const rows = categoryComparison([aisha], week);
    expect(categorySentence(rows, 7, "GBP", "Aisha")).toBe(
      "The biggest change is 🍫 Snacks: £4.00 this week, up from £1.50 last week.",
    );
  });
});

describe("merged activity", () => {
  it("lists every child's lines once, newest day first, each tagged with its child", () => {
    const merged = mergeActivity([aisha, zarrar, aisha], 10);
    expect(merged.map((t) => `${t.nickname}:${t.item.id}`)).toEqual([
      "Aisha:p1",
      "Zarrar:g1",
      "Aisha:al",
      "Aisha:p2",
      "Zarrar:g0",
    ]);
    expect(mergeActivity([aisha, zarrar], 2)).toHaveLength(2);
  });
});

describe("timeline", () => {
  it("steps weekly and monthly schedules, and skips paused ones", () => {
    expect(allowanceDates(schedule(), today, "2026-11-13")).toEqual(["2026-11-01", "2026-11-08"]);
    expect(
      allowanceDates(
        schedule({ frequency: "monthly", nextDueOn: "2026-10-31" }),
        today,
        "2026-12-31",
      ),
    ).toEqual(["2026-10-31", "2026-11-30", "2026-12-31"]);
    expect(allowanceDates(schedule({ status: "paused" }), today, "2026-11-13")).toEqual([]);
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("merges allowances, gifts and a goal the plan reaches, oldest first", () => {
    const withPlan = child({
      id: "z",
      nickname: "Zarrar",
      slot: 2,
      schedule: schedule(),
      gifts: [
        {
          id: "gift",
          amountMinor: 2000,
          giveOn: "2026-11-05",
          note: "Birthday",
          status: "pending",
          autoCharge: false,
          autoChargeProvider: null,
          autoChargeMine: false,
        },
      ],
      goal: {
        goal: {
          id: "goal",
          name: "Bike",
          emoji: "🚲",
          targetMinor: 10000,
          planMinor: 500,
          reachedAt: null,
          celebratedAt: null,
        },
        progress: {
          countedMinor: 9000,
          remainingMinor: 1000,
          paymentsLeft: 2,
          reached: false,
          fillRatio: 0.9,
        },
      },
    });
    expect(timeline([withPlan], today, "GBP").map((e) => [e.date, e.kind, e.text])).toEqual([
      ["2026-11-01", "allowance", "Allowance, £5.00"],
      ["2026-11-05", "gift", "Gift, £20.00 · Birthday"],
      ["2026-11-08", "allowance", "Allowance, £5.00"],
      ["2026-11-08", "goal", "Could reach 🚲 Bike"],
    ]);
  });
});

describe("callouts", () => {
  it("states a goal in reach, a doubled category and Save growing, one child at a time", () => {
    const points = [
      { date: "2026-10-23", spend: 0, save: 2000 },
      ...Array.from({ length: 7 }, (_, i) => ({
        date: `2026-10-${String(24 + i).padStart(2, "0")}`,
        spend: 0,
        save: 3000,
      })),
    ];
    const lines = callouts(
      [
        { ...aisha, balances: { points, movedOn: [] } },
        {
          ...zarrar,
          goal: {
            goal: {
              id: "g",
              name: "Bike",
              emoji: "🚲",
              targetMinor: 10000,
              planMinor: 500,
              reachedAt: null,
              celebratedAt: null,
            },
            progress: {
              countedMinor: 9000,
              remainingMinor: 1000,
              paymentsLeft: 2,
              reached: false,
              fillRatio: 0.9,
            },
          },
        },
      ],
      week,
      "GBP",
    );
    expect(lines.map((c) => c.text)).toEqual([
      "Zarrar is 2 allowances from 🚲 Bike.",
      "Aisha spent twice as much on 🍫 Snacks this week as last week: £4.00.",
      "Aisha's Save grew by £10.00 this week.",
    ]);
    expect(lines.map((c) => c.action)).toEqual(["goal", "limit", "allowance"]);
  });

  it("puts a chat Jarso flagged first", () => {
    const lines = callouts([{ ...zarrar, flaggedChats: 2 }], week, "GBP");
    expect(lines[0]).toMatchObject({
      text: "2 chats Zarrar had with Jarso this week were flagged for you to read.",
      action: "chats",
    });
  });

  it("ignores changes of pennies", () => {
    const small = child({
      id: "s",
      nickname: "Sam",
      history: [
        item({ id: "n", occurredOn: "2026-10-29", amountMinor: 40 }),
        item({ id: "b", occurredOn: "2026-10-20", amountMinor: 10 }),
      ],
    });
    expect(callouts([small], week, "GBP")).toEqual([]);
  });
});

describe("money chart", () => {
  it("shows this week and last week for each child, Save under Spend, split at this week", () => {
    const chart = moneyChart(
      [
        { ...aisha, balances: { points: [{ date: today, spend: 1200, save: 3000 }], movedOn: [] } },
        zarrar,
      ],
      7,
      today,
    );
    expect(chart.dates).toHaveLength(14);
    expect(chart.dates.at(-1)).toBe(today);
    expect(chart.splitAt).toBe("2026-10-24");
    // A child whose balances could not be read is left out, not drawn at zero.
    expect(chart.series.map((s) => s.nickname)).toEqual(["Aisha"]);
    expect(chart.series[0]?.save.at(-1)).toBe(3000);
    expect(chart.series[0]?.save[0]).toBe(0);
    expect(moneyChartSentence(chart, "GBP")).toBe(
      "£0.00 on 17 Oct, £42.00 today: Aisha £42.00 (Save £30.00, Spend £12.00).",
    );
    expect(moneyChart([], 90, today).splitAt).toBeNull();
  });
});
