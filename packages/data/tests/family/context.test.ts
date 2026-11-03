import { getFamilyContext } from "@jarso/data/family";
import { describe, expect, it } from "vitest";

/** A client answering each table's maybeSingle with fixed rows. */
function fakeDb(member: unknown, family: unknown) {
  const from = (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: () =>
        Promise.resolve({ data: table === "family_members" ? member : family, error: null }),
    };
    return chain;
  };
  // biome-ignore lint/suspicious/noExplicitAny: a minimal fake client
  return { from } as any;
}

describe("getFamilyContext", () => {
  it("is FORBIDDEN without a membership", async () => {
    await expect(getFamilyContext(fakeDb(null, null), "u")).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Set up your family first.",
    });
  });

  it("returns currency, timezone and local today", async () => {
    const db = fakeDb(
      { family_id: "f", role: "parent" },
      { id: "f", code: "X", currency: "INR", timezone: "Asia/Kolkata" },
    );
    // 20:00 UTC is already the next day in Kolkata.
    const now = new Date("2026-11-02T20:00:00Z");
    await expect(getFamilyContext(db, "u", now)).resolves.toEqual({
      currency: "INR",
      timezone: "Asia/Kolkata",
      today: "2026-11-03",
    });
  });
});
