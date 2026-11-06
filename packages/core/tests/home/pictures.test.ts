import { RECEIVED_CATEGORIES, SPEND_CATEGORIES } from "@jarso/core/ledger";
import { describe, expect, it } from "vitest";
import { LABEL_MAX_WORDS, receivedPictures, spendPictures, wordCount } from "../../src/home";

describe("pictures", () => {
  it("spend pictures are the 9 core categories in order", () => {
    const list = spendPictures();
    expect(list.map((p) => p.key)).toEqual(SPEND_CATEGORIES.map((c) => c.key));
    expect(list.map((p) => p.label)).toEqual(SPEND_CATEGORIES.map((c) => c.label));
    expect(list[1]?.icon).toBe("gamepad-2");
    expect(list.map((p) => p.tint).slice(0, 6)).toEqual([
      "teal",
      "grape",
      "gold",
      "cyan",
      "success",
      "teal",
    ]);
  });
  it("received pictures are the 6 core categories", () => {
    expect(receivedPictures().map((p) => p.key)).toEqual(RECEIVED_CATEGORIES.map((c) => c.key));
    expect(receivedPictures()[2]?.icon).toBe("briefcase");
  });
  it("every label fits the label budget", () => {
    for (const p of [...spendPictures(), ...receivedPictures()]) {
      expect(wordCount(p.label)).toBeLessThanOrEqual(LABEL_MAX_WORDS);
    }
  });
});
