import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { goalProgress } from "../progress";
import type { Goal } from "../types";
import { GoalCard } from "./goal-card";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../server/actions", () => ({ saveGoalAction: vi.fn(), archiveGoalAction: vi.fn() }));

afterEach(cleanup);

const goal: Goal = {
  id: "g1",
  name: "Football boots",
  emoji: "⚽",
  targetMinor: 4500,
  planMinor: 400,
  reachedAt: null,
  celebratedAt: null,
};

function view(saveMinor: number, planMinor: number | null = 400) {
  const g = { ...goal, planMinor };
  return {
    goal: g,
    progress: goalProgress({ saveMinor, reservedMinor: 0, targetMinor: 4500, planMinor }),
  };
}

const common = { currency: "GBP", allowanceMinor: 500, saveMinor: 3100, reservedMinor: 500 };

describe("GoalCard", () => {
  it("shows the goal, what is saved, what is left and the estimate", () => {
    render(<GoalCard view={view(2600)} {...common} />);
    expect(screen.getByText("⚽ Football boots")).toBeInTheDocument();
    expect(screen.getByText("£26 saved. £19 to go.")).toBeInTheDocument();
    expect(screen.getByText("About 5 more allowances at £4 each time.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change my goal" })).toBeInTheDocument();
  });

  it("asks for a plan when there is none", () => {
    render(<GoalCard view={view(2600, null)} {...common} />);
    expect(
      screen.getByText("Set how much you'll save each time to see how long it'll take."),
    ).toBeInTheDocument();
  });

  it("says the goal is reached once counted covers it", () => {
    render(<GoalCard view={view(5000)} {...common} />);
    expect(screen.getByText("Goal reached")).toBeInTheDocument();
  });

  it("invites a goal when there is none", () => {
    render(<GoalCard view={null} {...common} />);
    expect(screen.getByText("Something to save for?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set a goal" })).toBeInTheDocument();
  });
});
