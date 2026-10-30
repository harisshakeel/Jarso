import { describe, expect, it } from "vitest";
import { JAR_OUTLINE_D, jarOutlinePoints } from "./jar-outline";

describe("jar outline", () => {
  it("is the mark's stroke, from the top-left curl to the top of the right side", () => {
    expect(JAR_OUTLINE_D).toBe(
      "M150 128C172 152 160 176 128 198C98 220 88 246 88 290L88 352C88 395 112 418 155 418L352 418C395 418 418 395 418 352L418 170",
    );
  });

  it("samples evenly from end to end, so the thread can morph it point by point", () => {
    const points = jarOutlinePoints(120);
    expect(points).toHaveLength(120);
    expect(points[0]).toEqual([150, 128]);
    const last = points[points.length - 1] ?? [0, 0];
    expect(last[0]).toBeCloseTo(418);
    expect(last[1]).toBeCloseTo(170);
    const steps = points.slice(1).map(([x, y], index) => {
      const [px, py] = points[index] ?? [0, 0];
      return Math.hypot(x - px, y - py);
    });
    expect(Math.max(...steps) / Math.min(...steps)).toBeLessThan(1.1);
  });
});
