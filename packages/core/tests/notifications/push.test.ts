import type { ClaimedNotice, Notice, NoticeTarget } from "@jarso/core/notifications";
import {
  devicePushTokenDeleteSchema,
  devicePushTokenSchema,
  planPushes,
  pushData,
  pushDataSchema,
  summaryPushCopy,
  summaryPushData,
  summaryPushText,
} from "@jarso/core/notifications";
import { describe, expect, it } from "vitest";

const CHILD = "11111111-1111-4111-8111-111111111111";
const CHILD_2 = "22222222-2222-4222-8222-222222222222";
const PARENT = "33333333-3333-4333-8333-333333333333";
const OCC = "44444444-4444-4444-8444-444444444444";

let seq = 0;
function notice(overrides: Partial<Notice> = {}): Notice {
  seq += 1;
  return {
    id: `55555555-5555-4555-8555-${String(seq).padStart(12, "0")}`,
    kind: "withdrawal_decided",
    childId: CHILD,
    childName: "Sam",
    sourceType: "ledger_entry",
    sourceId: "66666666-6666-4666-8666-666666666666",
    payload: {},
    createdAt: "2026-11-03T22:00:00Z",
    read: false,
    ...overrides,
  };
}

function claimed(overrides: Partial<ClaimedNotice> = {}, n: Partial<Notice> = {}): ClaimedNotice {
  return {
    recipientId: CHILD,
    role: "child",
    currency: "INR",
    overnight: false,
    notice: notice(n),
    ...overrides,
  };
}

describe("planPushes", () => {
  it("planPushes sends two overnight notices for one child as one summary", () => {
    const a = claimed({ overnight: true });
    const b = claimed({ overnight: true });
    expect(planPushes([a, b])).toEqual([
      { kind: "summary", recipientId: CHILD, currency: "INR", notices: [a, b] },
    ]);
  });

  it("planPushes sends a single overnight notice as itself", () => {
    const a = claimed({ overnight: true });
    expect(planPushes([a])).toEqual([{ kind: "notice", claimed: a }]);
  });

  it("planPushes keeps non-overnight and parent notices as their own pushes", () => {
    const day1 = claimed();
    const day2 = claimed();
    const p1 = claimed({ recipientId: PARENT, role: "parent" });
    const p2 = claimed({ recipientId: PARENT, role: "parent" });
    expect(planPushes([day1, p1, day2, p2])).toEqual([
      { kind: "notice", claimed: day1 },
      { kind: "notice", claimed: p1 },
      { kind: "notice", claimed: day2 },
      { kind: "notice", claimed: p2 },
    ]);
  });

  it("planPushes summarises per recipient", () => {
    const a1 = claimed({ overnight: true });
    const b1 = claimed({ recipientId: CHILD_2, overnight: true }, { childId: CHILD_2 });
    const a2 = claimed({ overnight: true });
    const day = claimed();
    expect(planPushes([a1, b1, a2, day])).toEqual([
      { kind: "summary", recipientId: CHILD, currency: "INR", notices: [a1, a2] },
      { kind: "notice", claimed: b1 },
      { kind: "notice", claimed: day },
    ]);
  });
});

describe("summary push", () => {
  it("summaryPushText(3).title is 'You have 3 new notices'", () => {
    expect(summaryPushText(3)).toEqual({
      title: "You have 3 new notices",
      detail: summaryPushCopy.detail,
    });
    expect(summaryPushCopy.detail).toBe("They came in overnight. Open News to see them.");
  });

  it("summaryPushData is a child summary with its count", () => {
    expect(summaryPushData(CHILD, 4)).toEqual({
      kind: "summary",
      recipientId: CHILD,
      role: "child",
      count: 4,
    });
  });
});

describe("pushData", () => {
  it("pushData carries the parent handover target", () => {
    const c = claimed(
      { recipientId: PARENT, role: "parent" },
      {
        kind: "card_charge_failed",
        sourceType: "payment",
        payload: { source_type: "occurrence", source_id: OCC, amount_minor: 500 },
      },
    );
    expect(pushData(c)).toEqual({
      kind: "notice",
      noticeId: c.notice.id,
      recipientId: PARENT,
      role: "parent",
      target: { to: "handover", childId: CHILD, kind: "allowance", id: OCC },
    });
  });

  it("pushData for a child ledger notice targets diary", () => {
    const c = claimed({}, { sourceType: "ledger_entry", kind: "money_received" });
    expect(pushData(c)).toMatchObject({ kind: "notice", role: "child", target: { to: "diary" } });
  });
});

describe("pushDataSchema", () => {
  const targets: NoticeTarget[] = [
    { to: "handover", childId: CHILD, kind: "allowance", id: OCC },
    { to: "handover", childId: CHILD, kind: "gift", id: OCC },
    { to: "child", childId: CHILD },
    { to: "child-history", childId: CHILD },
    { to: "diary" },
    { to: "goal" },
    { to: "jarso" },
    { to: "home" },
  ];

  it.each(targets)("pushDataSchema accepts what pushData builds (%j)", (target) => {
    const data = {
      kind: "notice" as const,
      noticeId: notice().id,
      recipientId: PARENT,
      role: "parent" as const,
      target,
    };
    expect(pushDataSchema.parse(data)).toEqual(data);
  });

  it("round-trips a built notice and a summary", () => {
    const built = pushData(claimed({}, { sourceType: "request" }));
    expect(pushDataSchema.parse(built)).toEqual(built);
    const summary = summaryPushData(CHILD, 2);
    expect(pushDataSchema.parse(summary)).toEqual(summary);
  });

  it("pushDataSchema rejects an unknown target and a non-uuid id", () => {
    const base = { kind: "notice", noticeId: notice().id, recipientId: PARENT, role: "parent" };
    expect(pushDataSchema.safeParse({ ...base, target: { to: "settings" } }).success).toBe(false);
    expect(
      pushDataSchema.safeParse({ ...base, noticeId: "n1", target: { to: "home" } }).success,
    ).toBe(false);
    expect(
      pushDataSchema.safeParse({ ...base, target: { to: "child", childId: "not-a-uuid" } }).success,
    ).toBe(false);
    expect(
      pushDataSchema.safeParse({ kind: "summary", recipientId: CHILD, role: "child", count: 1 })
        .success,
    ).toBe(false);
  });
});

describe("devicePushTokenSchema", () => {
  it("devicePushTokenSchema accepts ExponentPushToken[...] and ExpoPushToken[...], rejects 'abc' and platform 'ios'", () => {
    expect(
      devicePushTokenSchema.safeParse({
        token: "ExponentPushToken[abc_DEF-123]",
        platform: "android",
      }).success,
    ).toBe(true);
    expect(
      devicePushTokenSchema.safeParse({ token: "ExpoPushToken[xyz]", platform: "android" }).success,
    ).toBe(true);
    expect(devicePushTokenSchema.safeParse({ token: "abc", platform: "android" }).success).toBe(
      false,
    );
    expect(
      devicePushTokenSchema.safeParse({ token: "ExpoPushToken[xyz]", platform: "ios" }).success,
    ).toBe(false);
    expect(
      devicePushTokenSchema.safeParse({ token: "ExpoPushToken[a b]", platform: "android" }).success,
    ).toBe(false);
  });

  it("devicePushTokenDeleteSchema needs a token", () => {
    expect(devicePushTokenDeleteSchema.safeParse({ token: "ExpoPushToken[xyz]" }).success).toBe(
      true,
    );
    expect(devicePushTokenDeleteSchema.safeParse({}).success).toBe(false);
  });
});
