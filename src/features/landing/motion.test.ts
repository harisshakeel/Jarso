import { describe, expect, it } from "vitest";
import { captionWindows } from "./components/hero-scene";
import { landingCopy } from "./copy";
import { drop, easeInOut, easeOut, easeOutBack, lerp, segment, typed } from "./motion";

describe("segment", () => {
  it("is 0 before, 1 after, and linear between", () => {
    expect(segment(0.1, 0.2, 0.4)).toBe(0);
    expect(segment(0.3, 0.2, 0.4)).toBeCloseTo(0.5);
    expect(segment(0.9, 0.2, 0.4)).toBe(1);
  });
});

describe("easings", () => {
  it.each([
    ["easeOut", easeOut],
    ["easeInOut", easeInOut],
    ["easeOutBack", easeOutBack],
  ])("%s starts at 0 and settles at 1", (_name, ease) => {
    expect(ease(0)).toBeCloseTo(0);
    expect(ease(1)).toBeCloseTo(1);
  });

  it("drop lands at 1 and bounces only a little", () => {
    expect(drop(1)).toBeCloseTo(1);
    expect(Math.min(...[0.86, 0.9, 0.95].map(drop))).toBeGreaterThan(0.95);
  });

  it("lerp interpolates", () => {
    expect(lerp(18, 22, 0.5)).toBe(20);
  });
});

describe("typed", () => {
  it("types one character per step after the start", () => {
    expect(typed("Comic", 100, 200)).toBe("");
    expect(typed("Comic", 200 + 28 * 3, 200)).toBe("Com");
    expect(typed("Comic", 10_000, 200)).toBe("Comic");
  });
});

describe("hero captions", () => {
  it("has one window per caption, in order, without overlaps", () => {
    expect(captionWindows).toHaveLength(landingCopy.hero.captions.length);
    captionWindows.forEach(([start, end], index) => {
      expect(end).toBeGreaterThan(start);
      const next = captionWindows[index + 1];
      if (next) expect(next[0]).toBeGreaterThanOrEqual(end);
    });
  });
});
