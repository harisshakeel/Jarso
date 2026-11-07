import { FREEDOM_PRESETS, freedomWrites, smallCapMinor } from "@jarso/core/rules";
import { describe, expect, it } from "vitest";

describe("freedom presets", () => {
  it("are ask, small and free", () => {
    expect(FREEDOM_PRESETS).toEqual(["ask", "small", "free"]);
  });

  it("ask me every time writes nothing (a new child's defaults)", () => {
    expect(freedomWrites("ask", 5000)).toEqual({ jarMoves: null, rules: [] });
  });

  it("small ones go through under the cap, per item, both ways", () => {
    expect(freedomWrites("small", 5000)).toEqual({
      jarMoves: null,
      rules: [
        { kind: "withdrawal_auto_approve", period: "item", amountMinor: 5000 },
        { kind: "deposit_auto_confirm", period: "item", amountMinor: 5000 },
      ],
    });
  });

  it("the child decides: moves are recorded and the parent gets a note", () => {
    expect(freedomWrites("free", 5000)).toEqual({ jarMoves: "notify", rules: [] });
  });

  it.each([
    ["INR", 5000],
    ["JPY", 500],
    ["GBP", 500],
    ["USD", 500],
  ])("the small cap in %s is %i minor units", (currency, minor) => {
    expect(smallCapMinor(currency)).toBe(minor);
  });
});
