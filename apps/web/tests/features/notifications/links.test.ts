import type { Notice } from "@jarso/core/notifications";
import { describe, expect, it } from "vitest";
import { routes } from "@/config";
import { noticeHref } from "@/features/notifications/links";

const base: Notice = {
  id: "n1",
  kind: "allowance_due",
  childId: "c1",
  childName: "Maya",
  sourceType: "allowance_occurrence",
  sourceId: "s1",
  payload: { amount_minor: 500, due_on: "2026-10-30", days_overdue: 0 },
  createdAt: "2026-10-30T09:00:00Z",
  read: false,
};
describe("noticeHref", () => {
  it("parent occurrence opens the handover screen", () => {
    expect(noticeHref(base, "parent")).toBe(routes.parentHandover("c1", "allowance", "s1"));
  });
  it("parent request opens the child page", () => {
    expect(noticeHref({ ...base, sourceType: "request" }, "parent")).toBe(routes.parentChild("c1"));
  });
  it("parent ledger entry opens the child's history", () => {
    expect(noticeHref({ ...base, sourceType: "ledger_entry" }, "parent")).toBe(
      routes.parentChildHistory("c1"),
    );
  });
  it("child request and occurrence open Home", () => {
    expect(noticeHref({ ...base, sourceType: "request" }, "child")).toBe(routes.child);
    expect(noticeHref(base, "child")).toBe(routes.child);
  });
  it("child ledger entry opens the diary", () => {
    expect(noticeHref({ ...base, sourceType: "ledger_entry" }, "child")).toBe(routes.childDiary);
  });
});

describe("card_charge_failed", () => {
  const failed: Notice = {
    ...base,
    kind: "card_charge_failed",
    sourceType: "payment",
    sourceId: "pay-1",
    payload: {
      source_type: "occurrence",
      source_id: "occ-1",
      amount_minor: 500,
      failure_code: null,
    },
  };

  it("opens the item's handover screen, from the payment's source", () => {
    expect(noticeHref(failed, "parent")).toBe(routes.parentHandover("c1", "allowance", "occ-1"));
    const gift = { ...failed, payload: { ...failed.payload, source_type: "parent_gift" } };
    expect(noticeHref(gift, "parent")).toBe(routes.parentHandover("c1", "gift", "occ-1"));
  });

  it("falls back to the parent's Home when the payment's item can't be found", () => {
    expect(noticeHref({ ...failed, payload: {} }, "parent")).toBe(routes.parent);
    expect(
      noticeHref({ ...failed, payload: { source_type: "request", source_id: "x" } }, "parent"),
    ).toBe(routes.parent);
  });
});
