import { OPTION_ART_WORDS, optionArt } from "@jarso/core/learning";
import { missions } from "@jarso/core/learning/content";
import { describe, expect, it } from "vitest";

describe("optionArt", () => {
  it("a comic gets a book picture", () => {
    expect(optionArt("A comic for {m:650}", 0)).toEqual({ kind: "emoji", emoji: "📖" });
  });

  it("first matching word wins", () => {
    expect(optionArt("Headphones and a game", 0)).toEqual({ kind: "emoji", emoji: "🎧" });
  });

  it("no match falls back to a letter by position", () => {
    expect(optionArt("It takes the same time", 1)).toEqual({ kind: "letter", letter: "B" });
  });

  it("every option in the shipped missions gets art without throwing", () => {
    let seen = 0;
    for (const m of missions) {
      for (const step of m.steps) {
        if (step.type !== "choice" && step.type !== "predict" && step.type !== "reason") continue;
        step.options.forEach((o, i) => {
          expect(() => optionArt(o.text, i)).not.toThrow();
          seen++;
        });
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("art never contains a digit or a currency sign", () => {
    for (const [, emoji] of OPTION_ART_WORDS) expect(emoji).not.toMatch(/[\d$£€₹¥]/u);
    for (let i = 0; i < 4; i++) {
      const art = optionArt("no keywords", i);
      expect(art.kind === "letter" ? art.letter : "").not.toMatch(/\d/);
    }
  });
});
