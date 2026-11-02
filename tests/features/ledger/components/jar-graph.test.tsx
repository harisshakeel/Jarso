import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { coachIdFor } from "@/components/brand";
import { balanceHistory } from "@/features/ledger/balance-history";
import { JarGraph, smoothPath } from "@/features/ledger/components/jar-graph";

afterEach(cleanup);

const history = balanceHistory(
  { spend: 1240, save: 6400 },
  [
    { jar: "spend", direction: "in", amountMinor: 1000, occurredOn: "2026-10-30" },
    { jar: "save", direction: "in", amountMinor: 800, occurredOn: "2026-10-10" },
  ],
  "2026-08-03",
  "2026-10-31",
);

describe("JarGraph", () => {
  it("opens on this week with the tracks named, the coach's line and the numbers as a list", () => {
    render(<JarGraph history={history} currency="GBP" />);
    expect(screen.getByRole("heading", { name: "Your money ride" })).toBeVisible();
    expect(screen.getByRole("button", { name: "This week" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("list", { name: "Tracks" })).toHaveTextContent("SpendSave");
    // Only Spend's £10 (the 30th) falls inside the last 7 days.
    expect(screen.getByText("Spend climbed £10 this week.")).toBeVisible();
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(3); // header, the 30th, today
    expect(rows[1]).toHaveTextContent("Fri 30 Oct£12.40£64");
  });

  it("re-scopes the words and the list when the period changes", () => {
    render(<JarGraph history={history} currency="GBP" />);
    fireEvent.click(screen.getByRole("button", { name: "This month" }));
    expect(
      screen.getByText("Spend climbed £10 and Save climbed £8 this month. Nice."),
    ).toBeVisible();
    expect(screen.getAllByRole("row")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "3 months" }));
    expect(
      screen.getByText("Spend climbed £10 and Save climbed £8 these 3 months. Nice."),
    ).toBeVisible();
  });

  it("puts the coach in a cart on the track that moved most, parked at today", () => {
    const { container } = render(<JarGraph history={history} currency="GBP" />);
    const cart = container.querySelector("[data-rider]");
    expect(cart).toHaveAttribute("data-rider", "spend");
    expect(cart?.querySelector(`[data-coach="${coachIdFor("jar-graph")}"]`)).not.toBeNull();
    expect((cart as HTMLElement).style.getPropertyValue("--cart-path")).toMatch(/^path\("M/);
    // Save moved most over the month, so the coach changes track.
    fireEvent.click(screen.getByRole("button", { name: "This month" }));
    expect(container.querySelector("[data-rider]")).toHaveAttribute("data-rider", "spend");
    const saver = balanceHistory(
      { spend: 300, save: 5000 },
      [
        { jar: "save", direction: "in", amountMinor: 2000, occurredOn: "2026-10-30" },
        { jar: "spend", direction: "in", amountMinor: 100, occurredOn: "2026-10-29" },
      ],
      "2026-10-02",
      "2026-10-31",
    );
    cleanup();
    const { container: second } = render(<JarGraph history={saver} currency="GBP" />);
    expect(second.querySelector("[data-rider]")).toHaveAttribute("data-rider", "save");
    expect(
      screen.getByText("Spend climbed £1 and Save climbed £20 this week. Nice."),
    ).toBeVisible();
  });

  it("reads a day with the arrow keys: both jars' figures and the date", () => {
    render(<JarGraph history={history} currency="GBP" />);
    const graph = screen.getByRole("application", { name: /Spend and Save over time/ });
    fireEvent.keyDown(graph, { key: "ArrowLeft" });
    expect(screen.getByRole("status")).toHaveTextContent("Fri 30 Oct");
    expect(screen.getByRole("status")).toHaveTextContent("£12.40Spend");
    fireEvent.keyDown(graph, { key: "ArrowLeft" });
    expect(screen.getByRole("status")).toHaveTextContent("Thu 29 Oct");
    expect(screen.getByRole("status")).toHaveTextContent("£2.40Spend");
    fireEvent.keyDown(graph, { key: "Escape" });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("invites the first allowance when nothing has moved", () => {
    const empty = balanceHistory({ spend: 0, save: 0 }, [], "2026-10-02", "2026-10-31");
    render(<JarGraph history={empty} currency="GBP" />);
    expect(screen.getByText(/Nothing has moved yet/)).toBeVisible();
  });

  it("keeps the parent's title", () => {
    render(<JarGraph history={history} currency="GBP" title="How Sam's jars moved" />);
    expect(screen.getByRole("heading", { name: "How Sam's jars moved" })).toBeVisible();
  });
});

describe("smoothPath", () => {
  it("passes through every point and never overshoots a flat stretch", () => {
    const d = smoothPath([0, 10, 20, 30], [50, 50, 10, 10]);
    expect(d.startsWith("M0 50")).toBe(true);
    expect(d.endsWith("30 10")).toBe(true);
    // The flat first segment keeps its control points on the line.
    expect(d).toContain("C3.33 50, 6.67 50, 10 50");
    expect(smoothPath([5], [5])).toBe("M5 5");
    expect(smoothPath([], [])).toBe("");
  });
});
