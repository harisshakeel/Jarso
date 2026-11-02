import type { Notice } from "@jarso/core/notifications";
import { noticeText } from "@jarso/core/notifications";
import { describe, expect, it } from "vitest";

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

  it("tells the parent to hand it over another way (null failure code: generic copy)", () => {
    const { title, detail } = noticeText(failed, "parent", "GBP");
    expect(`${title}. ${detail}`).toBe(
      "Card payment for Maya's allowance didn't go through. Hand it over another way.",
    );
  });

  it("names the reason when there is one, and says gift for a gift", () => {
    const n = {
      ...failed,
      payload: { ...failed.payload, source_type: "parent_gift", failure_code: "expired_card" },
    };
    expect(noticeText(n, "parent", "GBP")).toEqual({
      title: "Card payment for Maya's gift didn't go through",
      detail: "The card has expired. Hand it over another way.",
    });
  });

  it("ignores a failure code it doesn't know", () => {
    const n = { ...failed, payload: { ...failed.payload, failure_code: "bogus" } };
    expect(noticeText(n, "parent", "GBP").detail).toBe("Hand it over another way.");
  });
});

describe("noticeText", () => {
  it("parent money received", () => {
    const n = {
      ...base,
      childName: "Aria",
      kind: "money_received" as const,
      sourceType: "ledger_entry" as const,
      payload: { amount_minor: 2000, category: "birthday", jar: "spend" },
    };
    expect(noticeText(n, "parent", "GBP")).toEqual({
      title: "Aria wrote down £20 from Birthday",
      detail: "Added to Spend.",
    });
    expect(
      noticeText({ ...n, payload: { ...n.payload, jar: "save" } }, "parent", "GBP").detail,
    ).toBe("Added to Save.");
  });
  it("parent entry corrected", () => {
    const n = {
      ...base,
      childName: "Aria",
      kind: "entry_corrected" as const,
      sourceType: "ledger_entry" as const,
      payload: { kind: "purchase", old_amount_minor: 500, amount_minor: 350 },
    };
    expect(noticeText(n, "parent", "GBP")).toEqual({
      title: "Aria fixed a purchase",
      detail: "£5 → £3.50",
    });
    expect(
      noticeText({ ...n, payload: { ...n.payload, kind: "gift_in" } }, "parent", "GBP").title,
    ).toBe("Aria fixed money they got");
  });
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
  it("emergency asked names the amount and reason for the parent", () => {
    const n = {
      ...base,
      kind: "emergency_requested" as const,
      sourceType: "request" as const,
      payload: { amount_minor: 500, reason: "School trip" },
    };
    expect(noticeText(n, "parent", "GBP")).toEqual({
      title: "Maya asked for extra money",
      detail: "£5: School trip",
    });
  });
  it("emergency decided tells the child where the money goes", () => {
    const n = { ...base, kind: "emergency_decided" as const, sourceType: "request" as const };
    expect(
      noticeText({ ...n, payload: { approved: true, amount_minor: 500 } }, "child", "GBP"),
    ).toEqual({
      title: "Your parent said yes to extra money",
      detail: "£5 will come to Spend when they hand it over.",
    });
    expect(noticeText({ ...n, payload: { approved: false } }, "child", "GBP").title).toBe(
      "Your parent said not now",
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
