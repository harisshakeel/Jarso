import type { LearningOverview } from "@jarso/core/learning";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PersonalBests } from "@/features/learning/components/personal-bests";

afterEach(cleanup);

const overview = (over: Partial<LearningOverview>): LearningOverview => ({
  journey: [],
  skills: [],
  checkIn: null,
  practiceDue: 0,
  daysThisWeek: 0,
  streak: 0,
  points: 0,
  longestStreak: 0,
  lastLearnedOn: null,
  nextStep: { kind: "check-in" },
  completed: [],
  ...over,
});

describe("PersonalBests", () => {
  it("shows the child's own best mission, longest run and points", () => {
    render(
      <PersonalBests
        overview={overview({
          points: 84,
          longestStreak: 4,
          completed: [
            {
              attemptId: "a",
              missionKey: "m1",
              title: "Splitting up",
              completedOn: "2026-11-03",
              firstTry: 4,
              answerable: 7,
              hints: 1,
            },
            {
              attemptId: "b",
              missionKey: "m2",
              title: "Spend or save",
              completedOn: "2026-11-02",
              firstTry: 6,
              answerable: 7,
              hints: 0,
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("Spend or save: 6 of 7 first try")).toBeInTheDocument();
    expect(screen.getByText("4 days in a row")).toBeInTheDocument();
    expect(screen.getByText("84 points")).toBeInTheDocument();
  });

  it("invites a first best instead of ranking anyone", () => {
    render(<PersonalBests overview={overview({})} />);
    expect(screen.getByText("Finish a mission to set one.")).toBeInTheDocument();
    expect(screen.getByText("Learn two days in a row to set one.")).toBeInTheDocument();
    expect(screen.queryByText(/rank|place|beat/i)).toBeNull();
  });
});
