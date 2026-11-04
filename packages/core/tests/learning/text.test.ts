import { moneyAmounts } from "@jarso/core/learning";
import { describe, expect, it } from "vitest";

describe("moneyAmounts", () => {
  it("lists a question's amounts in order, in minor units", () => {
    expect(moneyAmounts("You have {m:1400} in Spend. You buy a book for {m:550}.")).toEqual([
      1400, 550,
    ]);
    expect(moneyAmounts("No money here.")).toEqual([]);
  });
});
