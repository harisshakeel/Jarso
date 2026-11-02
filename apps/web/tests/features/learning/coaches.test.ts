import { describe, expect, it } from "vitest";
import { coachIds } from "@/components/brand";
import { coaches, coachFor } from "@/features/learning/coaches";

describe("coachFor", () => {
  it("always brings the same coach back for the same step", () => {
    expect(coachFor("whats-in-spend-2")).toBe(coachFor("whats-in-spend-2"));
    expect(coachIds).toContain(coachFor("whats-in-spend-2").id);
  });

  it("spreads the coaches across a mission's steps", () => {
    const seen = new Set(Array.from({ length: 40 }, (_, i) => coachFor(`mission-step-${i}`).id));
    expect(seen.size).toBe(coachIds.length);
  });

  it("gives every coach a name and short lines a child can read", () => {
    for (const id of coachIds) {
      const coach = coaches[id];
      expect(coach.name.length).toBeGreaterThan(1);
      for (const line of Object.values(coach.says)) {
        expect(line.split(" ").length).toBeLessThanOrEqual(6);
        expect(line.endsWith(".")).toBe(true);
      }
    }
  });
});
