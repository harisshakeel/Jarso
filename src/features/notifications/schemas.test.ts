import { describe, expect, it } from "vitest";
import { inboxParamsSchema } from "./schemas";

const cursor = "2026-10-30T21:00:00.123456+00:00|7b0f6a52-3c1e-4b52-9d52-0a6f3a1d1b11";

describe("inboxParamsSchema", () => {
  it("keeps a real cursor", () => {
    expect(inboxParamsSchema.parse({ before: cursor }).before).toBe(cursor);
  });
  it.each(["x", "", "2026-10-30", ["x"], 5, "a|b"])("drops %j to the newest page", (before) => {
    expect(inboxParamsSchema.parse({ before }).before).toBeUndefined();
  });
  it("takes the first of repeated params", () => {
    expect(inboxParamsSchema.parse({ before: [cursor, "x"] }).before).toBe(cursor);
  });
});
