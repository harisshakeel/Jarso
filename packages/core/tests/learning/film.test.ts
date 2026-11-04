import { filmSchema, filmVoicePath, textHash } from "@jarso/core/learning";
import { checkIn, missions } from "@jarso/core/learning/content";
import { describe, expect, it } from "vitest";

describe("lesson film voice files", () => {
  it("names a line's file by mission, position and a hash the voice script agrees with", () => {
    // Expected values from scripts/lesson-voice.py (FNV-1a over UTF-8, the same in both).
    expect(textHash("Before you buy something, take a peek inside your Spend jar.")).toBe(
      "f38c1858",
    );
    expect(textHash("Six and four still make ten. Your allowance just found two homes.")).toBe(
      "7b3b05dc",
    );
    expect(filmVoicePath("spend-and-save", 0, "Here comes your allowance: ten shiny coins.")).toBe(
      "/lessons/voice/spend-and-save-1-61a5c9b1.mp3",
    );
  });

  it("gives an edited line a new file, so an old recording never plays", () => {
    expect(textHash("Here comes your allowance.")).not.toBe(textHash("Here comes your allowance!"));
  });

  it("films the check-in and missions 1 and 3, in short coin-counted lines", () => {
    const filmed = missions.filter((m) => m.film).map((m) => m.key);
    expect(filmed).toEqual(expect.arrayContaining(["whats-in-spend", "spend-and-save"]));
    expect(checkIn.film).toBeDefined();
    for (const film of [...missions.map((m) => m.film), checkIn.film]) {
      if (!film) continue;
      expect(filmSchema.safeParse(film).success).toBe(true);
      const words = film.lines.join(" ").split(/\s+/).length;
      // 10 to 15 seconds spoken softly: about 25 to 40 words.
      expect(words).toBeGreaterThanOrEqual(20);
      expect(words).toBeLessThanOrEqual(40);
      // Spoken once for every family, so never a currency symbol.
      expect(film.lines.join(" ")).not.toMatch(/[£$€₹]|\{m:/);
    }
  });
});
