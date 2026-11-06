import { checkinDecision } from "@jarso/core/progress";
import { describe, expect, it } from "vitest";

const now = new Date("2026-11-06T10:00:00Z");
const fresh = (checkedInToday: boolean) => ({ checkedInToday, readAt: now });

describe("checkinDecision", () => {
  it("shows when not checked in and not asked today", () => {
    expect(
      checkinDecision({
        timezone: "Asia/Kolkata",
        now,
        lastPromptDay: null,
        progress: fresh(false),
      }),
    ).toBe("show");
  });

  it("skips once asked today, even if the check-in failed", () => {
    expect(
      checkinDecision({
        timezone: "Asia/Kolkata",
        now,
        lastPromptDay: "2026-11-06",
        progress: fresh(false),
      }),
    ).toBe("skip");
  });

  it("skips when the server says checked in today", () => {
    expect(
      checkinDecision({
        timezone: "Asia/Kolkata",
        now,
        lastPromptDay: "2026-11-05",
        progress: fresh(true),
      }),
    ).toBe("skip");
  });

  it("skips while progress is unknown", () => {
    expect(
      checkinDecision({ timezone: "Asia/Kolkata", now, lastPromptDay: null, progress: null }),
    ).toBe("skip");
  });

  it("near Kolkata midnight a read from 23:59 asks for a refresh at 00:01", () => {
    expect(
      checkinDecision({
        timezone: "Asia/Kolkata",
        now: new Date("2026-11-06T18:31:00Z"),
        lastPromptDay: "2026-11-06",
        progress: { checkedInToday: true, readAt: new Date("2026-11-06T18:29:00Z") },
      }),
    ).toBe("refresh");
  });

  it("the same instant is still yesterday in London", () => {
    expect(
      checkinDecision({
        timezone: "Europe/London",
        now: new Date("2026-11-06T18:31:00Z"),
        lastPromptDay: "2026-11-06",
        progress: { checkedInToday: true, readAt: new Date("2026-11-06T18:29:00Z") },
      }),
    ).toBe("skip");
  });
});
