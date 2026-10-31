import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markCelebratedAction } from "@/features/goals";
import { HomeStepCard } from "./home-step-card";

vi.mock("@/features/goals", () => ({
  markCelebratedAction: vi.fn(async () => ({ ok: true, data: undefined })),
  GoalSheet: ({ goal }: { goal: unknown }) => (
    <button type="button">{goal ? "Change my goal" : "Set a goal"}</button>
  ),
}));
vi.mock("@/features/requests", () => ({
  TakeOutSheet: ({ trigger }: { trigger?: { label: string } }) => (
    <button type="button">{trigger?.label ?? "Take out"}</button>
  ),
}));
vi.mock("./next-step-card", () => ({ NextStepCard: () => <p>Next mission</p> }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const extras = {
  currency: "GBP",
  takeOutLimitMinor: 4500,
  goalSheet: {
    goal: null,
    currency: "GBP",
    allowanceMinor: 500,
    saveMinor: 4500,
    reservedMinor: 0,
  },
};

describe("HomeStepCard", () => {
  it("celebrates a reached goal once and offers to use the savings", () => {
    render(
      <HomeStepCard
        step={{ kind: "goal-reached", goalId: "g1", name: "Football boots", emoji: "⚽" }}
        {...extras}
      />,
    );
    expect(screen.getByText("Saved up. ⚽ Football boots.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask to use my savings" })).toBeInTheDocument();
    expect(markCelebratedAction).toHaveBeenCalledTimes(1);
    expect(markCelebratedAction).toHaveBeenCalledWith(null, { goalId: "g1" });
  });

  it("tells the child a parent said yes, with no button", () => {
    render(<HomeStepCard step={{ kind: "withdrawal-approved", amountMinor: 500 }} {...extras} />);
    expect(screen.getByText("Your parent said yes")).toBeInTheDocument();
    expect(screen.getByText("£5 from Save, coming soon.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("hands learning to the next-step card", () => {
    render(<HomeStepCard step={{ kind: "learning", step: { kind: "check-in" } }} {...extras} />);
    expect(screen.getByText("Next mission")).toBeInTheDocument();
  });

  it("suggests a goal", () => {
    render(<HomeStepCard step={{ kind: "set-goal" }} {...extras} />);
    expect(screen.getByText("Something to save for?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set a goal" })).toBeInTheDocument();
  });

  it("says when everything is done", () => {
    render(<HomeStepCard step={{ kind: "all-done" }} {...extras} />);
    expect(screen.getByText("All done for today.")).toBeInTheDocument();
  });
});
