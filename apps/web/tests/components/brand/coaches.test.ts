import { describe, expect, it } from "vitest";
import { coachIds } from "@/components/brand/coach-figure";
import { coachIdFor, coachLines, coachNames } from "@/components/brand/coaches";

describe("coachIdFor", () => {
  it("keeps the same coach for the same page key", () => {
    for (const key of ["learn", "inbox", "history", "settings", "sign-in", "start"]) {
      expect(coachIdFor(key)).toBe(coachIdFor(key));
      expect(coachIds).toContain(coachIdFor(key));
    }
  });

  it("spreads the four coaches across the app's screens", () => {
    const seen = new Set(
      ["learn", "inbox", "history", "settings", "sign-in", "start", "jar-graph", "offline"].map(
        coachIdFor,
      ),
    );
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });
});

describe("coach lines", () => {
  it("gives every coach a name and a short line for every moment, read once by a 10-year-old", () => {
    for (const id of coachIds) {
      expect(coachNames[id].length).toBeGreaterThan(1);
      for (const [moment, lines] of Object.entries(coachLines)) {
        const line = lines[id];
        expect(line.length, `${id} ${moment}`).toBeGreaterThan(3);
        expect(line.split(" ").length, `${id} ${moment}`).toBeLessThanOrEqual(12);
        // Empty states and goodbyes never shout.
        expect(line.includes("!"), `${id} ${moment}`).toBe(false);
      }
    }
  });

  it("keeps the empty-state words the screens always had", () => {
    expect(coachLines.nothingNew.pip).toBe("Nothing here yet.");
    expect(coachLines.moneyStory.bo).toBe("Your money story starts here.");
    expect(coachLines.nothingMoved.nell).toMatch(/^Nothing has moved yet\./);
  });
});
