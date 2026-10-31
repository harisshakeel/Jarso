import { describe, expect, it } from "vitest";
import { routes } from "@/config";
import { noticeHref, noticeText } from "./links";
import type { Notice } from "./types";

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

describe("noticeText", () => {
  it("child allowance due", () => {
    expect(noticeText(base, "child", "GBP")).toEqual({
      title: "Your £5 allowance is due",
      detail: "Your parent will hand it over.",
    });
  });
  it("parent handover reminder", () => {
    const n = {
      ...base,
      kind: "handover_reminder" as const,
      payload: { amount_minor: 500, days_overdue: 6 },
    };
    expect(noticeText(n, "parent", "GBP")).toEqual({
      title: "Still due: Maya's £5 allowance",
      detail: "Due 6 days ago",
    });
  });
  it("falls back to Your child when the child profile is gone", () => {
    expect(noticeText({ ...base, childName: "" }, "parent", "GBP")).toEqual({
      title: "Your child's £5 allowance is due",
      detail: "Ready to hand over.",
    });
  });
  it("limit exceeded names both amounts", () => {
    const n = {
      ...base,
      kind: "limit_exceeded" as const,
      payload: { amount_minor: 1200, limit_minor: 1000 },
    };
    expect(noticeText(n, "parent", "GBP").detail).toBe("Spent £12 against a limit of £10.");
  });
  it.each(["withdrawal_decided", "deposit_decided"] as const)(
    "%s reads the approved flag",
    (kind) => {
      const n = { ...base, kind, sourceType: "request" as const };
      expect(noticeText({ ...n, payload: { approved: true } }, "child", "GBP").title).toBe(
        "Your parent said yes",
      );
      expect(noticeText({ ...n, payload: {} }, "child", "GBP").title).toBe(
        "Your parent answered your request",
      );
    },
  );
  it("withdrawal declined says not now", () => {
    const n = { ...base, kind: "withdrawal_decided" as const, sourceType: "request" as const };
    expect(noticeText({ ...n, payload: { approved: false } }, "child", "GBP")).toEqual({
      title: "Your parent said not now",
      detail: "You can ask again later.",
    });
  });
  it("deposit not confirmed says it is still in Spend", () => {
    const n = { ...base, kind: "deposit_decided" as const, sourceType: "request" as const };
    expect(
      noticeText({ ...n, payload: { approved: false, amount_minor: 500 } }, "child", "GBP"),
    ).toEqual({
      title: "Your £5 wasn't added to Save",
      detail: "It's still in Spend. Talk to your parent.",
    });
    expect(noticeText({ ...n, payload: { approved: false } }, "child", "GBP").title).toBe(
      "Your money wasn't added to Save",
    );
  });
  it("falls back for an unknown kind", () => {
    const n = { ...base, kind: "mystery" as never };
    expect(noticeText(n, "parent", "GBP")).toEqual({
      title: "Something new",
      detail: "Take a look.",
    });
  });
});
