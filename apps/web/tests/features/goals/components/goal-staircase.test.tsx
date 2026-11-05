import { goalProgress } from "@jarso/core/goals";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoalCard } from "@/features/goals/components/goal-card";
import { GoalStaircase } from "@/features/goals/components/goal-staircase";

vi.mock("@/features/goals/components/goal-sheet", () => ({
  GoalSheet: ({ goal }: { goal: unknown }) => (
    <button type="button">{goal ? "Change my goal" : "Set a goal"}</button>
  ),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const goal = {
  id: "g1",
  name: "Football boots",
  emoji: "⚽",
  targetMinor: 4500,
  planMinor: 400,
  reachedAt: null,
  celebratedAt: null,
};
const at = (saveMinor: number) =>
  goalProgress({ saveMinor, reservedMinor: 0, targetMinor: 4500, planMinor: 400 });

describe("GoalStaircase", () => {
  it("draws the steps, fills the climbed ones, and stands the coach on the last climbed step", () => {
    const { container } = render(<GoalStaircase goal={goal} progress={at(2600)} currency="GBP" />);
    expect(
      screen.getByRole("img", { name: "Your goal: Football boots, £45. 6 of 12 steps climbed." }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("[data-step]")).toHaveLength(12);
    expect(container.querySelectorAll('[data-climbed="true"]')).toHaveLength(6);
    expect(container.querySelector("[data-coach-at]")).toHaveAttribute("data-coach-at", "6");
    expect(container.querySelector("[data-coach]")).toHaveAttribute("data-coach", "pip");
    expect(container.querySelector("[data-goal-item]")).toHaveTextContent("⚽");
    // No words under the climb since 2026-11-06: the picture's name above carries the figures.
    expect(screen.queryByText("About 5 allowances to go")).toBeNull();
    expect(screen.queryByText("The amounts")).toBeNull();
  });

  it("lights the step and cheers once when a quarter mark is passed, never on first paint", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      <GoalStaircase goal={goal} progress={at(1000)} currency="GBP" />,
    );
    expect(container.querySelector("[data-lit]")).toBeNull();
    expect(container.querySelector("[data-coach]")).not.toHaveAttribute("data-reaction");
    rerender(<GoalStaircase goal={goal} progress={at(2400)} currency="GBP" />);
    expect(container.querySelector("[data-lit]")).not.toBeNull();
    expect(container.querySelector("[data-coach]")).toHaveAttribute("data-reaction", "cheer");
    act(() => vi.advanceTimersByTime(1000));
    expect(container.querySelector("[data-lit]")).toBeNull();
    // Money leaving passes no mark.
    rerender(<GoalStaircase goal={goal} progress={at(1000)} currency="GBP" />);
    expect(container.querySelector("[data-lit]")).toBeNull();
  });

  it("says it is reached in its name and puts the coach on the top step", () => {
    const { container } = render(<GoalStaircase goal={goal} progress={at(4500)} currency="GBP" />);
    expect(screen.getByRole("img", { name: /Football boots/ })).toBeInTheDocument();
    expect(container.querySelector("[data-coach-at]")).toHaveAttribute("data-coach-at", "12");
  });
});

describe("GoalCard", () => {
  it("shows the compact climb with the way to the page", () => {
    render(
      <GoalCard
        goal={{ goal, progress: at(2600) }}
        currency="GBP"
        allowanceMinor={1000}
        saveMinor={2600}
        reservedMinor={0}
      />,
    );
    expect(screen.getByRole("region", { name: "Your goal" })).toBeInTheDocument();
    expect(screen.queryByText("⚽ Football boots, £45.")).toBeNull();
    expect(screen.getByRole("img", { name: /Football boots, £45/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See it" })).toHaveAttribute("href", "/child/goal");
  });

  it("invites a child without a goal to set one", () => {
    render(
      <GoalCard goal={null} currency="GBP" allowanceMinor={1000} saveMinor={0} reservedMinor={0} />,
    );
    expect(
      screen.getByText("Something to save for? Pick it and see the climb."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set a goal" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "See it" })).toBeNull();
  });
});
