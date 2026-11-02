import { categoryOf, RECEIVED_CATEGORIES, SPEND_CATEGORIES } from "@jarso/core/ledger";
import { describe, expect, it } from "vitest";

describe("categories", () => {
  it("lists 9 spend keys in order", () => {
    expect(SPEND_CATEGORIES.map((c) => c.key)).toEqual([
      "snacks",
      "games",
      "clothes",
      "going_out",
      "gift_for_someone",
      "school",
      "travel",
      "apps",
      "other",
    ]);
  });

  it("lists 6 received keys in order", () => {
    expect(RECEIVED_CATEGORIES.map((c) => c.key)).toEqual([
      "family",
      "birthday",
      "job",
      "sold",
      "found",
      "other",
    ]);
  });

  it("falls back to other for null and unknown keys", () => {
    expect(categoryOf(null, "purchase").key).toBe("other");
    expect(categoryOf("birthday", "purchase").key).toBe("other");
    expect(categoryOf("nope", "received").key).toBe("other");
  });

  it("finds a key for its kind", () => {
    expect(categoryOf("snacks", "purchase")).toEqual({
      key: "snacks",
      emoji: "🍫",
      label: "Snacks",
    });
    expect(categoryOf("birthday", "received").label).toBe("Birthday");
  });
});
