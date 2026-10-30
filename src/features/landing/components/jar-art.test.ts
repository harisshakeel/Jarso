import { describe, expect, it } from "vitest";
import { PILE } from "./jar-art";

// The jar's inside, in artwork units: walls at x 88 and 418 and the floor at y 418, each a
// 64-unit stroke; the neck curls in at the top left. Coins are 100 × 36 with a 7-unit rim.
describe("coin pile", () => {
  it("keeps every coin inside the jar, clear of the walls, the floor and the neck", () => {
    for (const [x, y] of PILE) {
      expect(x - 50).toBeGreaterThanOrEqual(120);
      expect(x + 50).toBeLessThanOrEqual(386);
      expect(y + 18 + 7).toBeLessThanOrEqual(400);
      if (y < 240) expect(x - 50).toBeGreaterThanOrEqual(150);
    }
  });

  it("has room for the eight coins of the toss and the fifteen in a full Save jar", () => {
    expect(PILE.length).toBeGreaterThanOrEqual(15);
  });
});
