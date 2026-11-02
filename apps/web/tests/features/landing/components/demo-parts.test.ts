import { describe, expect, it } from "vitest";
import { beat, scrollHint, typed } from "@/features/landing/components/demos/demo-parts";

describe("beat", () => {
  it("maps a stretch of the step's progress onto 0 to 1 and clamps outside it", () => {
    expect(beat(0, 0.2, 0.6)).toBe(0);
    expect(beat(0.2, 0.2, 0.6)).toBe(0);
    expect(beat(0.4, 0.2, 0.6)).toBeCloseTo(0.5);
    expect(beat(0.6, 0.2, 0.6)).toBe(1);
    expect(beat(1, 0.2, 0.6)).toBe(1);
  });
});

describe("typed", () => {
  it("types the text letter by letter and never overshoots", () => {
    expect(typed("Comic", 0)).toBe("");
    expect(typed("Comic", 0.4)).toBe("Co");
    expect(typed("Comic", 1)).toBe("Comic");
    expect(typed("Comic", 2)).toBe("Comic");
    expect(typed("Comic", -1)).toBe("");
  });
});

describe("scrollHint", () => {
  it("asks for a scroll, then to keep going, then says what happened", () => {
    expect(scrollHint(0, "Done.")).toBe("Scroll to play.");
    expect(scrollHint(0.5, "Done.")).toBe("Keep scrolling.");
    expect(scrollHint(1, "Done.")).toBe("Done.");
  });
});
