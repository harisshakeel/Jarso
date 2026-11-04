import type { ChildLearning } from "@jarso/core/dashboard";
import { familyRoad } from "@jarso/core/dashboard";
import type { LearningOverview } from "@jarso/core/learning";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChildCard } from "@/features/dashboard/components/child-card";
import { FamilyRoadCard } from "@/features/dashboard/components/family-board";

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
    // Each child stands on the road as their kid, not a letter.
    expect(screen.getByRole("img", { name: "Zarrar: on Day 1, Mission 1" })).toHaveAttribute(
      "data-coach",
    );
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

describe("ChildCard", () => {
  const card = (over: Partial<Parameters<typeof ChildCard>[0]> = {}) =>
    render(
      <ChildCard
        child={{ childId: "z", nickname: "Zarrar", slot: 1 }}
        learning={zarrar.overview}
        jars={{ spend: 22500, save: 25000 }}
        goal={{
          name: "Gaming PC",
          emoji: "🎧",
          percent: 31,
          reached: false,
          countedMinor: 25000,
          targetMinor: 80000,
        }}
        today={today}
        currency="USD"
        allowance={<p>The allowance block</p>}
        {...over}
      />,
    );

  it("keeps learning and money in their own headed parts", () => {
    card();
    const learning = screen.getByRole("region", { name: "Learning" });
    expect(learning).toHaveTextContent("Mission 1 of 7: Mission 1");
    expect(learning).toHaveTextContent("Learned on 2 days this week");
    expect(learning).not.toHaveTextContent("US$");
    const recent = screen.getByRole("region", { name: "Zarrar: Recent lessons" });
    expect(within(recent).getAllByRole("listitem")).toHaveLength(2);
    const money = screen.getByRole("region", { name: "Money" });
    expect(money).toHaveTextContent("US$225");
    expect(money).toHaveTextContent("US$250 of US$800 · 31%");
    expect(money).toHaveTextContent("The allowance block");
    expect(money).not.toHaveTextContent("point");
    expect(screen.getByRole("link", { name: "See their learning for Zarrar" })).toHaveAttribute(
      "href",
      "/parent/children/z",
    );
  });

  it("says so in place when learning, jars or a goal are missing", () => {
    card({ learning: null, jars: null, goal: null });
    expect(screen.getByText(/Learning couldn't load just now/)).toBeVisible();
    expect(screen.getByText("Jars couldn't load just now.")).toBeVisible();
    expect(screen.getByText("Not saving for anything yet")).toBeVisible();
  });
});
