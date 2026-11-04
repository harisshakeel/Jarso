import type { ChildLearning } from "@jarso/core/dashboard";
import type { LearningOverview } from "@jarso/core/learning";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChildLearningPanel, HomeLearning } from "@/features/dashboard/components/learning-cards";

afterEach(cleanup);

const today = "2026-11-04";
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

describe("HomeLearning", () => {
  it("names each child once, with their week, last lesson and what's next", () => {
    render(<HomeLearning items={[zarrar, ayesha]} today={today} />);
    expect(screen.getByRole("heading", { name: "This week's learning" })).toBeVisible();
    // One link per child, named exactly by the nickname, opening their page.
    expect(screen.getByRole("link", { name: "Zarrar" })).toHaveAttribute(
      "href",
      "/parent/children/z",
    );
    expect(screen.getByRole("heading", { name: "Zarrar" })).toBeVisible();
    const card = screen.getByRole("heading", { name: "Zarrar" }).closest("li") as HTMLElement;
    expect(card).toHaveTextContent("Learned on 2 days this week");
    expect(card).toHaveTextContent("What's in Spend, 3 Nov: 5 of 7 first try. 1 hint.");
    expect(card).toHaveTextContent("Next mission: Needs and wants");
    expect(card).toHaveTextContent("3 days in a row");
    expect(card).toHaveTextContent("120 points");
    const quiet = screen.getByRole("heading", { name: "Ayesha" }).closest("li") as HTMLElement;
    expect(quiet).toHaveTextContent("No lessons yet this week");
    expect(quiet).toHaveTextContent("No lessons finished yet.");
    expect(quiet).not.toHaveTextContent("in a row");
    expect(screen.getAllByRole("link", { name: "Add a child" })).toHaveLength(1);
  });

  it("still names a child whose learning couldn't load", () => {
    render(
      <HomeLearning
        items={[]}
        unavailable={[{ childId: "a", nickname: "Ayesha", slot: 2 }]}
        today={today}
      />,
    );
    expect(screen.getByRole("link", { name: "Ayesha" })).toBeVisible();
    expect(screen.getByText(/Learning couldn't load just now/)).toBeVisible();
  });
});

describe("ChildLearningPanel", () => {
  it("leads with learning and keeps the jars to one line", () => {
    render(
      <ChildLearningPanel
        child={zarrar}
        today={today}
        jars={{ spend: 22500, save: 25000 }}
        currency="USD"
      />,
    );
    const recent = screen.getByRole("region", { name: "Zarrar: Recent lessons" });
    expect(within(recent).getAllByRole("listitem")).toHaveLength(2);
    expect(recent).toHaveTextContent("What's in Spend");
    expect(screen.getByText("Next mission: Needs and wants")).toBeVisible();
    expect(screen.getByText(/Spend/, { selector: "p" })).toHaveTextContent(
      "Spend US$225 · Save US$250",
    );
    expect(screen.getByRole("link", { name: "See their learning for Zarrar" })).toHaveAttribute(
      "href",
      "/parent/children/z",
    );
  });
});
