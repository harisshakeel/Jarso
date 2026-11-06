import type { SavingsRequest } from "@jarso/core/requests";
import { describe, expect, it } from "vitest";
import { homeCopy, momentLines, moneyActions, wordCount } from "../../src/home";

const money = (m: number) => `₹${m / 100}`;
const request = (kind: SavingsRequest["kind"]): SavingsRequest => ({
  id: "x",
  kind,
  status: "pending",
  amountMinor: 5000,
  reason: null,
  auto: false,
  occurredAt: "2026-11-05T00:00:00Z",
});

describe("home copy", () => {
  it("momentLines capitalises the fallback parent", () =>
    expect(
      momentLines({ kind: "said-yes", request: request("withdrawal") }, money, "your parent").title,
    ).toBe("Your parent said yes!"));
  it("momentLines covers every card", () => {
    const yes = (kind: SavingsRequest["kind"]) =>
      momentLines({ kind: "said-yes", request: request(kind) }, money, "Mum");
    expect(yes("emergency").line).toBe("₹50 extra is coming");
    expect(yes("withdrawal").line).toBe("₹50 from savings is coming");
    expect(momentLines({ kind: "allowance-due", amountMinor: 10000 }, money, "Mum")).toEqual({
      title: "Pocket money day!",
      line: "+₹100 · Mum hands it over",
    });
    const wait = (kind: SavingsRequest["kind"], more = 0) =>
      momentLines({ kind: "waiting", request: request(kind), more }, money, "Mum");
    expect(wait("deposit")).toEqual({
      title: "Save ₹50",
      line: "Give the cash to Mum",
      chip: "Waiting",
    });
    expect(wait("deposit", 1).chip).toBe("2 waiting");
    expect(wait("withdrawal")).toMatchObject({ title: "Use ₹50 savings", line: "Waiting for Mum" });
    expect(wait("emergency")).toMatchObject({ title: "Extra ₹50", line: "Waiting for Mum" });
  });
  it("moneyActions labels fit 3 words and hints fit 5", () => {
    for (const a of moneyActions("your parent")) {
      expect(wordCount(a.label)).toBeLessThanOrEqual(3);
      expect(wordCount(a.hint)).toBeLessThanOrEqual(5);
    }
    expect(moneyActions("Mum").map((a) => a.key)).toEqual([
      "purchase",
      "received",
      "put-in",
      "take-out",
      "ask-extra",
    ]);
  });
  it("Mum reads naturally", () => expect(moneyActions("Mum")[2]?.hint).toBe("Give cash to Mum"));
  it("saveTile caption", () => {
    expect(homeCopy.saveTile.caption("Mum")).toBe("Mum keeps it");
    expect(homeCopy.saveTile.caption("your parent")).toBe("Your parent keeps it");
  });
});
