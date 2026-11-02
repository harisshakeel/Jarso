import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CoachFigure, coachIds, coachLooks, moodFor } from "@/components/brand/coach-figure";

afterEach(cleanup);

describe("CoachFigure", () => {
  it("draws each of the four kids as themselves: own id, own hair, own hoodie", () => {
    const { container } = render(
      <div>
        {coachIds.map((id) => (
          <CoachFigure key={id} coach={id} />
        ))}
      </div>,
    );
    const ids = [...container.querySelectorAll("svg[data-coach]")].map((svg) =>
      svg.getAttribute("data-coach"),
    );
    expect(ids).toEqual([...coachIds]);
    const hair = [...container.querySelectorAll("[data-hair]")].map((g) =>
      g.getAttribute("data-hair"),
    );
    const tops = [...container.querySelectorAll("[data-top]")].map((g) =>
      g.getAttribute("data-top"),
    );
    expect(new Set(hair).size).toBe(4);
    expect(new Set(tops).size).toBe(4);
    // Two girls, two boys, each with their coins in gold.
    expect(coachLooks.pip.hair).toBe("bunches");
    expect(coachLooks.nell.hair).toBe("bob");
    expect(coachLooks.bo.hair).toBe("crop");
    expect(coachLooks.zuzu.hair).toBe("curls");
    for (const id of coachIds) expect(coachLooks[id].coins).not.toBeNull();
    expect(container.querySelectorAll(".fill-gold").length).toBeGreaterThanOrEqual(4);
  });

  it("is hidden from AT unless named, and sizes to its height", () => {
    const { container } = render(<CoachFigure coach="bo" size={88} label="Bo" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("role", "img");
    expect(svg).toHaveAttribute("aria-label", "Bo");
    expect(svg).toHaveAttribute("height", "88");
    expect(Number(svg?.getAttribute("width"))).toBeLessThan(88);
  });

  it("wears the face for the reaction: cheer opens the mouth, a nod brings the unsure wave", () => {
    expect(moodFor("cheer")).toBe("cheer");
    expect(moodFor("nod")).toBe("unsure");
    expect(moodFor(null)).toBe("smile");
    const { container } = render(<CoachFigure coach="zuzu" reaction="nod" />);
    expect(container.querySelector("[data-mood]")).toHaveAttribute("data-mood", "unsure");
    expect(container.querySelector("svg")).toHaveAttribute("data-reaction", "nod");
  });
});
