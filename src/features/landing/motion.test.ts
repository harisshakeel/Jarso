import { describe, expect, it } from "vitest";
import { CHECKPOINT, captionWindows, taglineStarts, taglinesLeave } from "./components/hero-scene";
import { kidHands, kidPose } from "./components/kid-art";
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

describe("hero taglines", () => {
  it("pop in one after another during the toss and leave before the checkpoint", () => {
    expect(taglineStarts).toHaveLength(landingCopy.hero.taglines.length);
    expect([...taglineStarts]).toEqual([...taglineStarts].sort((a, b) => a - b));
    expect(Math.max(...taglineStarts)).toBeLessThan(taglinesLeave[0]);
    expect(taglinesLeave[1]).toBeLessThanOrEqual(CHECKPOINT);
  });
});

describe("kid pose", () => {
  it("starts unsure, looking at the coins, then throws them straight up", () => {
    const opening = kidPose(0);
    expect(opening.mood).toBe("unsure");
    expect(opening.lookY).toBeGreaterThan(0.5);
    const throwing = kidPose(0.13);
    expect(throwing.mood).toBe("cheer");
    expect(throwing.lookY).toBeLessThan(0);
    // A V over the head, not hands on the head: both hands clear of the head (radius 38) and
    // above the shoulders.
    const { left, right } = kidHands(throwing);
    expect(right.x).toBeGreaterThan(38);
    expect(left.x).toBeLessThan(-38);
    expect(Math.max(left.y, right.y)).toBeLessThan(-200);
  });
});

describe("hero captions", () => {
  it("has one window per caption, in order, after the checkpoint, without overlaps", () => {
    expect(captionWindows).toHaveLength(landingCopy.hero.captions.length);
    captionWindows.forEach(([start, end], index) => {
      expect(end).toBeGreaterThan(start);
      expect(start).toBeGreaterThanOrEqual(CHECKPOINT);
      const next = captionWindows[index + 1];
      if (next) expect(next[0]).toBeGreaterThanOrEqual(end);
    });
  });
});
