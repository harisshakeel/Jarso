import { groupNotices, type Notice, noticeTarget, timeAgo } from "@jarso/core/notifications";
import { describe, expect, it } from "vitest";

const base: Notice = {
  id: "n1",
  kind: "allowance_due",
  childId: "c1",
  childName: "Maya",
  sourceType: "allowance_occurrence",
  sourceId: "s1",
  payload: {},
  createdAt: "2026-10-30T09:00:00Z",
  read: false,
};

describe("noticeTarget", () => {
  it("sends a parent to the record as it is now", () => {
    expect(noticeTarget(base, "parent")).toEqual({
      to: "handover",
      childId: "c1",
      kind: "allowance",
      id: "s1",
    });
    expect(noticeTarget({ ...base, sourceType: "request" }, "parent")).toEqual({
      to: "child",
      childId: "c1",
    });
    expect(noticeTarget({ ...base, sourceType: "ledger_entry" }, "parent")).toEqual({
      to: "child-history",
      childId: "c1",
    });
  });

  it("opens a card payment's due item, or parent Home without one", () => {
    const payment = { ...base, sourceType: "payment" as const };
    expect(
      noticeTarget(
        { ...payment, payload: { source_type: "parent_gift", source_id: "g1" } },
        "parent",
      ),
    ).toEqual({ to: "handover", childId: "c1", kind: "gift", id: "g1" });
    expect(noticeTarget(payment, "parent")).toEqual({ to: "home" });
  });

  it("sends a child to the diary for ledger lines and Home otherwise", () => {
    expect(noticeTarget({ ...base, sourceType: "ledger_entry" }, "child")).toEqual({ to: "diary" });
    expect(noticeTarget({ ...base, sourceType: "request" }, "child")).toEqual({ to: "home" });
  });
});

describe("groupNotices", () => {
  const now = Date.parse("2026-10-30T12:00:00Z");
  const at = (hoursAgo: number, id: string) => ({
    ...base,
    id,
    createdAt: new Date(now - hoursAgo * 3_600_000).toISOString(),
  });

  it("splits into Today, This week and Older, leaving empty groups out", () => {
    const groups = groupNotices([at(1, "a"), at(3 * 24, "b"), at(20 * 24, "c")], now);
    expect(groups.map((g) => [g.label, g.items.map((n) => n.id)])).toEqual([
      ["Today", ["a"]],
      ["This week", ["b"]],
      ["Older", ["c"]],
    ]);
    expect(groupNotices([at(2, "a")], now).map((g) => g.label)).toEqual(["Today"]);
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-10-30T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("says how long ago, in plain words", () => {
    expect(timeAgo(ago(10_000), now)).toBe("just now");
    expect(timeAgo(ago(5 * 60_000), now)).toBe("5 minutes ago");
    expect(timeAgo(ago(3 * 3_600_000), now)).toBe("3 hours ago");
    expect(timeAgo(ago(24 * 3_600_000), now)).toBe("yesterday");
    expect(timeAgo(ago(-60_000), now)).toBe("just now");
  });
});
