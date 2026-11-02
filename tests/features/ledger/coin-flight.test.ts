import { describe, expect, it } from "vitest";
import { flightFor } from "@/features/ledger/coin-flight";

describe("flightFor", () => {
  it("flies jar to jar when money moves between them", () => {
    expect(flightFor({ spend: 800, save: 3100 }, { spend: 1300, save: 2600 })).toEqual({
      from: "save",
      to: "spend",
    });
    expect(flightFor({ spend: 800, save: 3100 }, { spend: 300, save: 3600 })).toEqual({
      from: "spend",
      to: "save",
    });
  });

  it("flies out of Spend for a purchase", () => {
    expect(flightFor({ spend: 800, save: 3100 }, { spend: 450, save: 3100 })).toEqual({
      from: "spend",
      to: "out",
    });
  });

  it("flies nothing when money only arrives, only leaves Save, or nothing changes", () => {
    expect(flightFor({ spend: 800, save: 3100 }, { spend: 1800, save: 3100 })).toBeNull();
    expect(flightFor({ spend: 800, save: 3100 }, { spend: 800, save: 2100 })).toBeNull();
    expect(flightFor({ spend: 800, save: 3100 }, { spend: 800, save: 3100 })).toBeNull();
  });
});
