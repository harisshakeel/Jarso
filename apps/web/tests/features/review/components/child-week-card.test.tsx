import { cleanup, render, screen } from "@testing-library/react";
import type { Route } from "next";
import { afterEach, describe, expect, it } from "vitest";
import {
  type ChildWeek,
  ChildWeekCard,
  parentChatsLine,
  parentLearningLine,
  parentWeekSentence,
} from "@/features/review/components/child-week-card";

afterEach(cleanup);

const money = (minor: number) => `£${(minor / 100).toFixed(2)}`;
const week = { weekStart: "2026-10-26", weekEnd: "2026-11-01", stillDueMinor: 0 };

describe("parentWeekSentence", () => {
  it("names the child and what came in, went out and moved to Save", () => {
    expect(
      parentWeekSentence(
        "Maya",
        { ...week, receivedMinor: 1000, spentMinor: 350, savedMinor: 400 },
        money,
      ),
    ).toBe("Maya got £10.00, spent £3.50 and put £4.00 into Save this week.");
    expect(
      parentWeekSentence(
        "Maya",
        { ...week, receivedMinor: 0, spentMinor: 0, savedMinor: -200 },
        money,
      ),
    ).toBe("Maya took £2.00 out of Save this week.");
  });

  it("stays calm when nothing moved", () => {
    expect(
      parentWeekSentence(
        "Maya",
        { ...week, receivedMinor: 0, spentMinor: 0, savedMinor: 0 },
        money,
      ),
    ).toBe("No money moved for Maya this week.");
  });
});

describe("parentLearningLine and parentChatsLine", () => {
  it("counts days and missions and names the next stop", () => {
    expect(
      parentLearningLine({
        daysThisWeek: 2,
        missionsDone: 1,
        current: { day: 2, title: "Small buys add up" },
      }),
    ).toBe("2 learning days this week, 1 mission done. Next: Day 2, Small buys add up.");
    expect(parentLearningLine({ daysThisWeek: 0, missionsDone: 7, current: null })).toBe(
      "No learning days yet this week, 7 missions done. Every mission is done.",
    );
  });

  it("says how many chats and whether any are flagged, or nothing when Jarso is off", () => {
    expect(parentChatsLine("Maya", { count: 3, flagged: 1 })).toBe(
      "3 chats with Jarso this week, 1 worth a look.",
    );
    expect(parentChatsLine("Maya", { count: 1, flagged: 0 })).toBe(
      "1 chat with Jarso this week, nothing flagged.",
    );
    expect(parentChatsLine("Maya", { count: 0, flagged: 0 })).toBe(
      "Maya hasn't chatted with Jarso this week.",
    );
    expect(parentChatsLine("Maya", null)).toBeNull();
  });
});

describe("ChildWeekCard", () => {
  it("shows the three sentences as links into the child's pages", () => {
    const data: ChildWeek = {
      nickname: "Maya",
      money: { ...week, receivedMinor: 1000, spentMinor: 0, savedMinor: 0 },
      learning: { daysThisWeek: 1, missionsDone: 0, current: { day: 1, title: "Split it" } },
      chats: { count: 0, flagged: 0 },
    };
    render(
      <ChildWeekCard
        week={data}
        currency="GBP"
        hrefs={{
          money: "/parent/children/c1" as Route,
          learning: "/parent/children/c1/learning" as Route,
          jarso: "/parent/children/c1/guide" as Route,
        }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Maya's week" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Maya got £10.00 this week." })).toHaveAttribute(
      "href",
      "/parent/children/c1",
    );
    expect(screen.getByRole("link", { name: /Next: Day 1, Split it/ })).toHaveAttribute(
      "href",
      "/parent/children/c1/learning",
    );
    expect(screen.getByRole("link", { name: /hasn't chatted/ })).toHaveAttribute(
      "href",
      "/parent/children/c1/guide",
    );
  });
});
