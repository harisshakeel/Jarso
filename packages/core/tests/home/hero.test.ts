import type { JarMovement } from "@jarso/core/ledger";
import { describe, expect, it } from "vitest";
import { BUBBLE_MAX_WORDS, heroLine, wordCount } from "../../src/home";

const money = (m: number) => `₹${m / 100}`;
const today = "2026-11-06";
const move = (
  jar: "spend" | "save",
  direction: "in" | "out",
  amountMinor: number,
): JarMovement => ({
  jar,
  direction,
  amountMinor,
  occurredOn: today,
});
const cases = {
  saveUp: { jars: { spend: 1200, save: 34000 }, movements: [move("save", "in", 4000)] },
  saveDown: { jars: { spend: 1200, save: 30000 }, movements: [move("save", "out", 2000)] },
  spendUp: { jars: { spend: 5000, save: 30000 }, movements: [move("spend", "in", 2000)] },
  spendDown: { jars: { spend: 1000, save: 30000 }, movements: [move("spend", "out", 2000)] },
  still: { jars: { spend: 1000, save: 30000 }, movements: [] },
  empty: { jars: { spend: 0, save: 0 }, movements: [] },
  loading: { jars: { spend: 0, save: 0 }, movements: null },
};
const line = (k: keyof typeof cases) => heroLine({ ...cases[k], today, money });

describe("heroLine", () => {
  it("save up praises in <= 8 words", () =>
    expect(line("saveUp")).toEqual({ text: "₹40 saved this week. Nice!", moment: "saved" }));
  it("save down is plain", () =>
    expect(line("saveDown")).toEqual({ text: "Save dipped ₹20 this week.", moment: "rest" }));
  it("spend only", () => {
    expect(line("spendUp").text).toBe("Spend climbed ₹20 this week.");
    expect(line("spendDown").text).toBe("Spend dipped ₹20 this week.");
  });
  it("nothing moved", () =>
    expect(line("still")).toEqual({ text: "Both jars stayed put this week.", moment: "rest" }));
  it("empty jars and no moves is sleepy", () =>
    expect(line("empty")).toEqual({ text: "Your pocket money will land here.", moment: "empty" }));
  it("null movements greets", () =>
    expect(line("loading")).toEqual({ text: "Good to see you!", moment: "greeting" }));
  it("every line fits the bubble budget", () => {
    for (const k of Object.keys(cases) as (keyof typeof cases)[]) {
      expect(wordCount(line(k).text)).toBeLessThanOrEqual(BUBBLE_MAX_WORDS);
    }
  });
  it("never mentions shame words", () => {
    for (const k of Object.keys(cases) as (keyof typeof cases)[]) {
      expect(line(k).text).not.toMatch(/\b(only|lost|bad)\b/i);
    }
  });
});
