import type { ClaimedNotice, NoticeKind, PushGroup, PushPlan } from "@jarso/core/notifications";
import {
  devicePushPrefsSchema,
  noticeGroup,
  noticeGroupCopy,
  planForDevice,
} from "@jarso/core/notifications";
import { describe, expect, it } from "vitest";

const CHILD = "11111111-1111-4111-8111-111111111111";

let seq = 0;
function overnight(kind: NoticeKind): ClaimedNotice {
  seq += 1;
  return {
    recipientId: CHILD,
    role: "child",
    currency: "GBP",
    overnight: true,
    notice: {
      id: `n${seq}`,
      kind,
      childId: CHILD,
      childName: "Sam",
      sourceType: "ledger_entry",
      sourceId: "s1",
      payload: {},
      createdAt: "2026-11-03T22:00:00Z",
      read: false,
    },
  };
}

const summary = (notices: ClaimedNotice[]): PushPlan => ({
  kind: "summary",
  recipientId: CHILD,
  currency: "GBP",
  notices,
});

const open = { mutedGroups: [] as PushGroup[], paused: false };

describe("noticeGroup", () => {
  const table: Record<NoticeKind, PushGroup> = {
    limit_exceeded: "requests",
    withdrawal_requested: "requests",
    withdrawal_decided: "requests",
    deposit_requested: "requests",
    deposit_decided: "requests",
    emergency_requested: "requests",
    emergency_decided: "requests",
    allowance_due: "money",
    handover_reminder: "money",
    card_charge_failed: "money",
    money_received: "money",
    entry_corrected: "money",
    jar_moved: "money",
    guide_noticed: "learning",
    parent_note: "notes",
  };

  it.each(Object.entries(table))(
    "noticeGroup places every NotificationKind (%s)",
    (kind, group) => {
      expect(noticeGroup(kind as NoticeKind)).toBe(group);
    },
  );
});

describe("planForDevice", () => {
  it("planForDevice drops everything when paused", () => {
    const n = overnight("withdrawal_decided");
    expect(planForDevice({ kind: "notice", claimed: n }, { mutedGroups: [], paused: true })).toBe(
      null,
    );
    expect(
      planForDevice(summary([n, overnight("parent_note")]), { mutedGroups: [], paused: true }),
    ).toBe(null);
  });

  it("planForDevice drops a notice in a muted group", () => {
    const plan: PushPlan = { kind: "notice", claimed: overnight("money_received") };
    expect(planForDevice(plan, { mutedGroups: ["money"], paused: false })).toBe(null);
    expect(planForDevice(plan, { mutedGroups: ["notes"], paused: false })).toBe(plan);
    expect(planForDevice(plan, open)).toBe(plan);
  });

  it("planForDevice shrinks a summary to its unmuted notices", () => {
    const keep = overnight("withdrawal_decided");
    const plan = summary([overnight("allowance_due"), keep, overnight("money_received")]);
    expect(planForDevice(plan, { mutedGroups: ["money"], paused: false })).toEqual({
      kind: "notice",
      claimed: keep,
    });
  });

  it("planForDevice keeps a summary of 2+ unmuted", () => {
    const a = overnight("withdrawal_decided");
    const b = overnight("parent_note");
    const plan = summary([a, overnight("guide_noticed"), b]);
    expect(planForDevice(plan, { mutedGroups: ["learning"], paused: false })).toEqual(
      summary([a, b]),
    );
    expect(planForDevice(plan, open)).toBe(plan);
    expect(
      planForDevice(summary([overnight("jar_moved")]), { mutedGroups: ["money"], paused: false }),
    ).toBe(null);
  });
});

describe("devicePushPrefsSchema", () => {
  const token = "ExponentPushToken[abc]";
  it("devicePushPrefsSchema rejects an unknown group", () => {
    expect(
      devicePushPrefsSchema.safeParse({ token, mutedGroups: ["money", "notes"], paused: false })
        .success,
    ).toBe(true);
    expect(
      devicePushPrefsSchema.safeParse({ token, mutedGroups: ["spam"], paused: false }).success,
    ).toBe(false);
    expect(
      devicePushPrefsSchema.safeParse({ token: "abc", mutedGroups: [], paused: false }).success,
    ).toBe(false);
  });
});

describe("noticeGroupCopy", () => {
  it("labels every group", () => {
    expect(Object.keys(noticeGroupCopy.groups).sort()).toEqual(
      ["learning", "money", "notes", "requests"].sort(),
    );
    expect(noticeGroupCopy.groups.requests.label).toBe("Requests and answers");
    expect(noticeGroupCopy.inboxStillShows).toBe("Notices still show in your inbox.");
  });
});
