import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { SkillProgress } from "../types";
import { SkillsStrip } from "./skills-strip";

afterEach(cleanup);

const progress = (
  skillKey: SkillProgress["skillKey"],
  level: SkillProgress["level"],
): SkillProgress => ({
  skillKey,
  level,
  firstTryCorrect: 0,
  correctWithHints: 0,
  reasonsCorrect: 0,
  reviewsPassed: 0,
});

describe("SkillsStrip", () => {
  it("counts skills learned and lists Got it first", () => {
    render(
      <SkillsStrip
        skills={[
          progress("split.amounts", 1),
          progress("balance.afford", 3),
          progress("goal.progress", 2),
        ]}
      />,
    );
    expect(screen.getByText("1 skill learned")).toBeInTheDocument();
    const chips = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(chips[0]).toContain("Knowing what you can afford");
    expect(chips[0]).toContain("Got it");
    expect(screen.getByRole("link", { name: "See all" })).toHaveAttribute("href", "/child/learn");
  });

  it("leaves out skills not started", () => {
    render(<SkillsStrip skills={[progress("split.amounts", 0)]} />);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText("0 skills learned")).toBeInTheDocument();
  });
});
