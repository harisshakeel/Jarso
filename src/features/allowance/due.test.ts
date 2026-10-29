import { describe, expect, it } from "vitest";
import { mergeDue, runningSchedule, upcomingGifts } from "./due";
import type { DueItem, Gift, Schedule } from "./types";

const item = (id: string, dueOn: string, kind: DueItem["kind"] = "allowance"): DueItem => ({
  kind,
  id,
  dueOn,
  amountMinor: 500,
  note: null,
});

describe("mergeDue", () => {
  it("lists every child's items oldest first, tagged with the child", () => {
    const merged = mergeDue([
      { child: { id: "c1", nickname: "Sam" }, due: [item("a", "2026-11-08")] },
      { child: { id: "c2", nickname: "Mia" }, due: [item("b", "2026-11-01")] },
    ]);
    expect(merged.map((d) => [d.id, d.childId, d.nickname])).toEqual([
      ["b", "c2", "Mia"],
      ["a", "c1", "Sam"],
    ]);
  });

  it("keeps child order for items due the same day", () => {
    const merged = mergeDue([
      {
        child: { id: "c1", nickname: "Sam" },
        due: [item("s1", "2026-11-01"), item("s2", "2026-11-01", "gift")],
      },
      {
        child: { id: "c2", nickname: "Mia" },
        due: [item("m1", "2026-10-30"), item("m2", "2026-11-01")],
      },
      { child: { id: "c3", nickname: "Ava" }, due: [item("v1", "2026-11-01")] },
    ]);
    expect(merged.map((d) => d.id)).toEqual(["m1", "s1", "s2", "m2", "v1"]);
  });

  it("is empty when nothing is due", () => {
    expect(mergeDue([{ child: { id: "c1", nickname: "Sam" }, due: [] }])).toEqual([]);
  });
});

const schedule = (status: Schedule["status"]): Schedule => ({
  id: "s1",
  amountMinor: 500,
  frequency: "weekly",
  status,
  anchorOn: "2026-11-01",
  nextDueOn: null,
  pausedThrough: null,
  pauseMessage: null,
});

describe("runningSchedule", () => {
  it("keeps an active or paused schedule", () => {
    expect(runningSchedule(schedule("active"))?.status).toBe("active");
    expect(runningSchedule(schedule("paused"))?.status).toBe("paused");
  });

  it("treats a stopped schedule like none", () => {
    expect(runningSchedule(schedule("stopped"))).toBeNull();
    expect(runningSchedule(null)).toBeNull();
  });
});

describe("upcomingGifts", () => {
  const gift = (id: string, giveOn: string): Gift => ({
    id,
    amountMinor: 1000,
    giveOn,
    note: null,
    status: "pending",
  });

  it("keeps only gifts dated after the family's today (due ones are in the due list)", () => {
    const gifts = [
      gift("past", "2026-10-28"),
      gift("today", "2026-10-29"),
      gift("later", "2026-11-05"),
    ];
    expect(upcomingGifts(gifts, "2026-10-29").map((g) => g.id)).toEqual(["later"]);
  });
});
