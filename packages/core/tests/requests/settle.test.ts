import type { SavingsRequest } from "@jarso/core/requests";
import { settleRequestReads } from "@jarso/core/requests";
import { describe, expect, it } from "vitest";

const request = { id: "r1" } as SavingsRequest;

describe("settleRequestReads", () => {
  it("keeps loaded children and names the ones that failed", () => {
    const { items, failed } = settleRequestReads(
      ["Mia", "Leo", "Zoe"],
      [
        { status: "fulfilled", value: [request] },
        { status: "rejected", reason: new Error("down") },
        { status: "fulfilled", value: [] },
      ],
    );
    expect(items).toEqual([{ nickname: "Mia", request }]);
    expect(failed).toEqual(["Leo"]);
  });

  it("returns nothing for nobody", () => {
    expect(settleRequestReads([], [])).toEqual({ items: [], failed: [] });
  });
});
