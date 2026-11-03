import { graphCopy, niceTop, smoothPath, whereItWentCopy } from "@jarso/core/ledger";
import { describe, expect, it } from "vitest";

describe("niceTop", () => {
  it("rounds up to a 1, 2 or 5 step above the highest point", () => {
    expect(niceTop(0)).toBe(100);
    expect(niceTop(100)).toBe(100);
    expect(niceTop(1250)).toBe(1500);
    expect(niceTop(4000)).toBe(4000);
    expect(niceTop(4100)).toBe(6000);
  });

  it("is never below the highest point", () => {
    for (const max of [1, 99, 101, 333, 7777, 123456])
      expect(niceTop(max)).toBeGreaterThanOrEqual(max);
  });
});

describe("smoothPath", () => {
  it("passes through every point and stays flat on a flat stretch", () => {
    const d = smoothPath([0, 10, 20, 30], [50, 50, 10, 10]);
    expect(d.startsWith("M0 50")).toBe(true);
    expect(d).toContain("10 50");
    expect(d).toContain("20 10");
    expect(d.endsWith("30 10")).toBe(true);
  });

  it("draws a point or nothing for one or no points", () => {
    expect(smoothPath([5], [5])).toBe("M5 5");
    expect(smoothPath([], [])).toBe("");
  });

  it("never overshoots between two points", () => {
    const d = smoothPath([0, 10, 20], [0, 100, 100]);
    const ys = [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[2]));
    expect(Math.max(...ys)).toBeLessThanOrEqual(100);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
  });
});

describe("graph and week copy", () => {
  it("keeps the web's words", () => {
    expect(graphCopy).toMatchObject({
      title: "Your money ride",
      seeNumbers: "See the numbers",
      spend: "Spend",
      save: "Save",
    });
    expect(whereItWentCopy.heading).toBe("Where your money went");
  });
});
