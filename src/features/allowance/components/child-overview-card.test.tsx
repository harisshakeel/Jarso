import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChildOverviewCard } from "./child-overview-card";

afterEach(cleanup);

const base = {
  childId: "c1",
  nickname: "Maya",
  spendMinor: 800,
  saveMinor: 3100,
  reservedMinor: 500,
  schedule: null,
  dueCount: 0,
  currency: "GBP",
  /** The shared jar scale, from jarCapacity on the page. */
  capacityMinor: 3100,
};

const goal = { emoji: "⚽", name: "Football boots", targetMinor: 4500, planMinor: 400 };

describe("ChildOverviewCard", () => {
  it("shows the goal line with counted Save and the child's plan", () => {
    render(<ChildOverviewCard {...base} goal={goal} />);
    expect(
      screen.getByText("⚽ Football boots · £26 of £45 · plans £4 each allowance"),
    ).toBeInTheDocument();
  });

  it("leaves the plan out when there is none", () => {
    render(<ChildOverviewCard {...base} goal={{ ...goal, planMinor: null }} />);
    expect(screen.getByText("⚽ Football boots · £26 of £45")).toBeInTheDocument();
  });

  it("says when there is no goal", () => {
    render(<ChildOverviewCard {...base} goal={null} />);
    expect(screen.getByText("No goal yet")).toBeInTheDocument();
  });

  it("draws both jars and writes both balances", () => {
    const { container } = render(<ChildOverviewCard {...base} goal={goal} />);
    expect(container.querySelectorAll("svg[aria-hidden='true']").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("£8.00")).toBeInTheDocument();
    expect(screen.getByText("£31.00")).toBeInTheDocument();
  });

  it("puts no learning numbers beside money", () => {
    const { container } = render(<ChildOverviewCard {...base} goal={goal} />);
    expect(container.textContent).not.toMatch(/skill|mission/i);
  });
});
