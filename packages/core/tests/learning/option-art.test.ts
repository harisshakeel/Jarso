import { OPTION_ART_WORDS, optionArt, optionArts } from "@jarso/core/learning";
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

  it("keywords match whole words only", () => {
    expect(optionArt("Unsaved money", 0)).toEqual({ kind: "letter", letter: "A" });
    expect(optionArt("It was filmed", 1)).toEqual({ kind: "letter", letter: "B" });
    expect(optionArt("A film ticket", 0)).toEqual({ kind: "emoji", emoji: "🎟️" });
  });

  it("saving and nothing get no picture", () => {
    expect(optionArt("Only Ari, because saving is always right", 1).kind).toBe("letter");
    expect(optionArt("Nothing changes", 2).kind).toBe("letter");
  });

  it("a picture shared by two options becomes letters", () => {
    expect(optionArts(["A game", "Another game", "A book"])).toEqual([
      { kind: "letter", letter: "A" },
      { kind: "letter", letter: "B" },
      { kind: "emoji", emoji: "📚" },
    ]);
  });

  it("every option in a shipped step gets its own art", () => {
    let seen = 0;
    for (const m of missions) {
      for (const step of m.steps) {
        if (step.type !== "choice" && step.type !== "predict" && step.type !== "reason") continue;
        const arts = optionArts(step.options.map((o) => o.text));
        const keys = arts.map((a) => (a.kind === "emoji" ? a.emoji : a.letter));
        expect(new Set(keys).size, step.key).toBe(keys.length);
        seen += keys.length;
      }
    }
    expect(seen).toBeGreaterThan(30);
  });

  it("art never contains a digit or a currency sign", () => {
    for (const [, emoji] of OPTION_ART_WORDS) expect(emoji).not.toMatch(/[\d$£€₹¥]/u);
    for (let i = 0; i < 4; i++) {
      const art = optionArt("no keywords", i);
      expect(art.kind === "letter" ? art.letter : "").not.toMatch(/\d/);
    }
  });
});
