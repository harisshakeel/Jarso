import type { Callout, DashboardChild, MoneyChartData } from "@jarso/core/dashboard";
import { dashboardTotals, mergeActivity } from "@jarso/core/dashboard";
import type { HistoryItem } from "@jarso/core/ledger";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityList } from "@/features/dashboard/components/activity-list";
import { CalloutsCard } from "@/features/dashboard/components/callouts-card";
import { ChildTiles } from "@/features/dashboard/components/child-tiles";
import { FamilySummary } from "@/features/dashboard/components/family-summary";
import { FamilyTotals } from "@/features/dashboard/components/family-totals";
import { MoneyChart } from "@/features/dashboard/components/money-chart";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

afterEach(cleanup);

const today = "2026-10-30";

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
  history: [item({ id: "p1", label: "Crisps", occurredOn: "2026-10-29" })],
  due: [
    {
      kind: "allowance",
      id: "o1",
      dueOn: today,
      amountMinor: 500,
      note: null,
      plannedSaveMinor: null,
    },
  ],
});
const zarrar = child({
  id: "z",
  nickname: "Zarrar",
  slot: 2,
  spendMinor: 800,
  saveMinor: 7000,
  history: [item({ id: "g1", label: "Game", category: "games", occurredOn: "2026-10-27" })],
});

describe("FamilyTotals", () => {
  it("shows the family's money in one card", () => {
    render(
      <FamilyTotals totals={dashboardTotals([aisha, zarrar], today)} currency="GBP" who={null} />,
    );
    expect(screen.getByRole("heading", { name: "Family money" })).toBeVisible();
    expect(screen.getByText("The children hold in Spend").nextSibling).toHaveTextContent("£20.00");
    expect(screen.getByText("You're holding in Save for 2 children").nextSibling).toHaveTextContent(
      "£100.00",
    );
    expect(screen.getByText("1 still to hand over (£5.00)")).toBeVisible();
  });

  it("speaks about the picked child alone", () => {
    render(<FamilyTotals totals={dashboardTotals([zarrar], today)} currency="GBP" who="Zarrar" />);
    expect(screen.getByRole("heading", { name: "Zarrar's money" })).toBeVisible();
    expect(screen.getByText("You're holding in Save for Zarrar")).toBeVisible();
    expect(screen.getByText("Nothing waiting")).toBeVisible();
  });
});

describe("ActivityList", () => {
  it("lists every child's lines once, each tagged with its child", () => {
    render(
      <ActivityList
        items={mergeActivity([aisha, zarrar, aisha], 8)}
        currency="GBP"
        seeAllHref={null}
      />,
    );
    const list = screen.getByRole("region", { name: "Recent activity" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Aisha");
    expect(rows[0]).toHaveTextContent("Crisps");
    expect(rows[1]).toHaveTextContent("Zarrar");
    expect(rows[1]).toHaveTextContent("Game");
    expect(screen.queryByRole("link", { name: "See all history" })).toBeNull();
  });
});

describe("ChildTiles", () => {
  it("gives each child one tile named exactly by their nickname, plus Add a child", () => {
    render(<ChildTiles items={[aisha, zarrar]} currency="GBP" />);
    expect(screen.getByRole("link", { name: "Aisha" })).toHaveAttribute(
      "href",
      "/parent/children/a",
    );
    expect(screen.getByRole("heading", { name: "Zarrar" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Add a child" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Send a note to Zarrar" })).toBeVisible();
    // Aisha has an allowance waiting.
    expect(screen.getByText("due", { exact: false })).toBeInTheDocument();
  });
});

describe("MoneyChart", () => {
  const chart: MoneyChartData = {
    dates: ["2026-10-29", "2026-10-30"],
    splitAt: "2026-10-30",
    series: [
      { childId: "a", nickname: "Aisha", slot: 1, save: [2000, 3000], spend: [1000, 1200] },
      { childId: "z", nickname: "Zarrar", slot: 2, save: [7000, 7000], spend: [800, 800] },
    ],
  };
  const hrefs = { a: "/parent?child=a", z: "/parent?child=z" };

  it("names every child in a legend link and puts every figure in words and a table", () => {
    render(
      <MoneyChart
        chart={chart}
        currency="GBP"
        hrefs={hrefs}
        sentence="The chart in words."
        split={{ before: "Last week", now: "This week" }}
      />,
    );
    expect(screen.getByRole("link", { name: "Aisha only" })).toHaveAttribute(
      "href",
      "/parent?child=a",
    );
    expect(screen.getAllByText("The chart in words.")).toHaveLength(2);
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Zarrar" })).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(3);
  });

  it("shows the day's figures on hover, and a tap on a band shows only that child", () => {
    const { container } = render(
      <MoneyChart chart={chart} currency="GBP" hrefs={hrefs} sentence="Words." split={null} />,
    );
    const svg = container.querySelector("svg") as SVGSVGElement;
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 640,
      height: 240,
      right: 640,
      bottom: 240,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const layer = container.querySelector("rect[fill='transparent']") as SVGRectElement;
    fireEvent.pointerMove(layer, { clientX: 630, clientY: 120 });
    expect(screen.getAllByText("Today")).toHaveLength(2);
    expect(screen.getByText("Family").parentElement).toHaveTextContent("£120.00");
    // Near the bottom of the stack at today: Aisha's band.
    fireEvent.click(layer, { clientX: 630, clientY: 205 });
    expect(push).toHaveBeenCalledWith("/parent?child=a", { scroll: false });
  });

  it("draws Spend as stripes in each child's colour, and the legend shows both jars", () => {
    const { container } = render(
      <MoneyChart chart={chart} currency="GBP" hrefs={hrefs} sentence="Words." split={null} />,
    );
    const patterns = [...container.querySelectorAll("pattern")];
    expect(patterns).toHaveLength(2);
    expect(patterns[0]?.querySelector("rect:last-child")).toHaveClass("fill-series-1");
    const spend = [...container.querySelectorAll("path")].filter((path) =>
      path.getAttribute("fill")?.startsWith("url(#"),
    );
    expect(spend).toHaveLength(2);
    expect(spend.map((path) => path.getAttribute("fill"))).toEqual(
      patterns.map((pattern) => `url(#${pattern.id})`),
    );
    expect(screen.getByText("Save")).toBeVisible();
    expect(screen.getByText("Spend")).toBeVisible();
  });

  it("says so when nothing is recorded", () => {
    render(
      <MoneyChart
        chart={{ dates: [], series: [], splitAt: null }}
        currency="GBP"
        hrefs={{}}
        sentence=""
        split={null}
      />,
    );
    expect(screen.getByText("No money recorded yet.")).toBeVisible();
  });
});

describe("CalloutsCard", () => {
  const saved: Callout = {
    id: "saved-a",
    childId: "a",
    nickname: "Aisha",
    slot: 1,
    text: "Aisha's Save grew by £8.00 this week.",
    action: "allowance",
    matchMinor: 800,
  };
  const goal: Callout = {
    id: "goal-z",
    childId: "z",
    nickname: "Zarrar",
    slot: 2,
    text: "Zarrar is 2 allowances from 🚲 Bike.",
    action: "goal",
    matchMinor: null,
  };

  it("offers a note on every line, and matching only where Save grew", () => {
    render(<CalloutsCard items={[saved, goal]} currency="GBP" period="this week" />);
    expect(screen.getByRole("button", { name: "Match it for Aisha" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Match it for Zarrar" })).toBeNull();
    expect(screen.getByRole("button", { name: "Send a note to Aisha" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Send a note to Zarrar" })).toBeVisible();
    expect(screen.getByRole("link", { name: "See their goal for Zarrar" })).toBeVisible();
  });

  it("offers no note from a flagged chat: the parent reads the chat first", () => {
    const chats: Callout = {
      id: "chats-a",
      childId: "a",
      nickname: "Aisha",
      slot: 1,
      text: "A chat Aisha had with Jarso this week was flagged for you to read.",
      action: "chats",
      matchMinor: null,
    };
    render(<CalloutsCard items={[chats]} currency="GBP" period="this week" />);
    expect(screen.getByRole("link", { name: "Read the chat for Aisha" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Send a note to Aisha" })).toBeNull();
  });
});

describe("FamilySummary", () => {
  it("labels the summary as written by AI", () => {
    render(<FamilySummary text="Aisha's £5.00 allowance is waiting for you." />);
    const region = screen.getByRole("region", { name: "Jarso's summary" });
    expect(region).toHaveTextContent("written by AI");
    expect(region).toHaveTextContent("Aisha's £5.00 allowance is waiting for you.");
  });
});
