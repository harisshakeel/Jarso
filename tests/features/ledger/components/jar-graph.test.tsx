import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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
  it("shows the last 30 days with a legend, a caption and the numbers as a list", () => {
    render(<JarGraph history={history} currency="GBP" />);
    expect(screen.getByRole("heading", { name: "How your jars moved" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Last 30 days" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("list", { name: "Lines" })).toHaveTextContent("SpendSave");
    // Both moves fall inside the last 30 days (2 to 31 October).
    expect(screen.getByText("Spend climbed £10. Save climbed £8.")).toBeVisible();
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(4); // header, the 10th, the 30th, today
    expect(rows[1]).toHaveTextContent("Sat 10 Oct£2.40£64");
    expect(rows[2]).toHaveTextContent("Fri 30 Oct£12.40£64");
  });

  it("re-scopes the caption and list when the period changes", () => {
    render(<JarGraph history={history} currency="GBP" />);
    // The last 7 days leave Save's £8 (the 10th) out of the picture.
    fireEvent.click(screen.getByRole("button", { name: "Last 7 days" }));
    expect(screen.getByText("Spend climbed £10. Save stayed put.")).toBeVisible();
    expect(screen.getAllByRole("row")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Last 3 months" }));
    expect(screen.getByText("Spend climbed £10. Save climbed £8.")).toBeVisible();
    expect(screen.getAllByRole("row")).toHaveLength(4);
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
