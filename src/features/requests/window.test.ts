import { describe, expect, it } from "vitest";
import { windowStart } from "./window";

describe("windowStart", () => {
  it("has no window for a per-time rule", () => {
    expect(windowStart("item", "UTC", new Date())).toBeNull();
  });

  it("starts the week on Monday in the family's timezone", () => {
    // Mon 00:30 IST is still Sunday 19:00 UTC: the new IST week began at Sunday 18:30 UTC.
    expect(windowStart("week", "Asia/Kolkata", new Date("2026-11-01T19:00:00Z"))).toBe(
      "2026-11-01T18:30:00.000Z",
    );
    expect(windowStart("week", "UTC", new Date("2026-11-01T19:00:00Z"))).toBe(
      "2026-10-26T00:00:00.000Z",
    );
  });

  it("starts the month on the 1st, across a DST change", () => {
    expect(windowStart("month", "Europe/London", new Date("2026-10-30T12:00:00Z"))).toBe(
      "2026-09-30T23:00:00.000Z", // BST: midnight on 1 October is 23:00 UTC the day before.
    );
    expect(windowStart("month", "Europe/London", new Date("2026-11-15T12:00:00Z"))).toBe(
      "2026-11-01T00:00:00.000Z",
    );
  });
});
