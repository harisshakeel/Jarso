import type { ChildLearning } from "@jarso/core/dashboard";
import { familyRoad } from "@jarso/core/dashboard";
import type { LearningOverview } from "@jarso/core/learning";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FamilyRoadCard } from "@/features/dashboard/components/family-board";
import { ChildLearningPanel } from "@/features/dashboard/components/learning-cards";

afterEach(cleanup);

const today = "2026-11-04";
const journey: LearningOverview["journey"] = Array.from({ length: 7 }, (_, index) => ({
  key: `m${index + 1}`,
  day: index + 1,
  title: `Mission ${index + 1}`,
  topic: "spend-save" as LearningOverview["journey"][number]["topic"],
  summary: "",
  status: index === 0 ? "current" : "locked",
  inProgress: false,
  completedOn: null,
}));
const overview = (over: Partial<LearningOverview>): LearningOverview => ({
  journey,
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
const lesson = (title: string, completedOn: string) => ({
  attemptId: `${title}-${completedOn}`,
  missionKey: title,
  title,
  completedOn,
  firstTry: 5,
  answerable: 7,
  hints: 1,
});
const zarrar: ChildLearning = {
  childId: "z",
  nickname: "Zarrar",
  slot: 1,
  overview: overview({
    daysThisWeek: 2,
    streak: 3,
    points: 120,
    nextStep: { kind: "mission", missionKey: "m", title: "Needs and wants", day: 3 },
    completed: [lesson("What's in Spend", "2026-11-03"), lesson("Saving up", "2026-10-28")],
  }),
};
const ayesha: ChildLearning = { childId: "a", nickname: "Ayesha", slot: 2, overview: overview({}) };

describe("FamilyRoadCard", () => {
  it("names each child once, with where they are and their last lesson", () => {
    render(<FamilyRoadCard road={familyRoad([zarrar, ayesha])} />);
    expect(screen.getByRole("heading", { name: "Lessons" })).toBeVisible();
    // One link per child, named exactly by the nickname, opening their page.
    expect(screen.getByRole("link", { name: "Zarrar" })).toHaveAttribute(
      "href",
      "/parent/children/z",
    );
    const row = screen.getByRole("link", { name: "Zarrar" }).closest("li") as HTMLElement;
    expect(row).toHaveTextContent("on Day 1, Mission 1");
    expect(row).toHaveTextContent("What's in Spend, 3 Nov: 5 of 7 first try. 1 hint.");
    const quiet = screen.getByRole("link", { name: "Ayesha" }).closest("li") as HTMLElement;
    expect(quiet).toHaveTextContent("No lessons finished yet");
    expect(screen.getAllByRole("link", { name: "Add a child" })).toHaveLength(1);
  });

  it("still names a child whose learning couldn't load", () => {
    render(
      <FamilyRoadCard
        road={familyRoad([])}
        unavailable={[{ childId: "a", nickname: "Ayesha", slot: 2 }]}
      />,
    );
    expect(screen.getByRole("link", { name: "Ayesha" })).toBeVisible();
    expect(screen.getByText(/Learning couldn't load just now/)).toBeVisible();
  });
});

describe("ChildLearningPanel", () => {
  it("is about learning: the week, skills and the last lessons", () => {
    render(<ChildLearningPanel child={zarrar} today={today} />);
    const recent = screen.getByRole("region", { name: "Zarrar: Recent lessons" });
    expect(within(recent).getAllByRole("listitem")).toHaveLength(2);
    expect(recent).toHaveTextContent("What's in Spend");
    expect(screen.getByText("Learned on 2 days this week")).toBeVisible();
    expect(screen.queryByText(/Spend US\$/)).toBeNull();
    expect(screen.getByRole("link", { name: "See their learning for Zarrar" })).toHaveAttribute(
      "href",
      "/parent/children/z",
    );
  });
});
