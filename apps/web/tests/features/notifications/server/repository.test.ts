import { describe, expect, it } from "vitest";
import { toClaimed } from "@/features/notifications/server/repository";

describe("toClaimed", () => {
  const claimedRow = {
    id: "n1",
    recipient_id: "p1",
    recipient_role: "child" as string | null,
    currency: "GBP",
    child_id: "c1",
    child_name: "Maya" as string | null,
    kind: "withdrawal_decided",
    source_type: "request",
    source_id: "r1",
    payload: { amount_minor: 500 },
    created_at: "2026-10-31T09:00:00+00:00",
  };
  it("maps the row with its recipient, role and currency", () => {
    expect(toClaimed(claimedRow)).toEqual({
      recipientId: "p1",
      role: "child",
      currency: "GBP",
      notice: {
        id: "n1",
        kind: "withdrawal_decided",
        childId: "c1",
        childName: "Maya",
        sourceType: "request",
        sourceId: "r1",
        payload: { amount_minor: 500 },
        createdAt: claimedRow.created_at,
        read: false,
      },
    });
  });
  it("treats a missing role as a parent and a missing nickname as empty", () => {
    const claimed = toClaimed({ ...claimedRow, recipient_role: null, child_name: null });
    expect(claimed.role).toBe("parent");
    expect(claimed.notice.childName).toBe("");
  });
});
