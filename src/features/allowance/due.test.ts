import { describe, expect, it } from "vitest";
import { mergeDue } from "./due";
import type { DueItem } from "./types";

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
