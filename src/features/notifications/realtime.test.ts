import { describe, expect, it, vi } from "vitest";
import { rowToNotice } from "./realtime";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

const row = {
  id: "n1",
  family_id: "f1",
  recipient_id: "p1",
  child_id: "c1",
  kind: "deposit_requested",
  source_type: "request",
  source_id: "r1",
  window_key: null,
  payload: { amount_minor: 300 },
  created_at: "2026-10-31T09:00:00Z",
  read_at: null,
};

describe("rowToNotice", () => {
  it("maps a realtime row and leaves the child's name blank", () => {
    expect(rowToNotice(row)).toEqual({
      id: "n1",
      kind: "deposit_requested",
      childId: "c1",
      childName: "",
      sourceType: "request",
      sourceId: "r1",
      payload: { amount_minor: 300 },
      createdAt: "2026-10-31T09:00:00Z",
      read: false,
    });
  });

  it("treats a non-object payload as empty and a read_at as read", () => {
    const notice = rowToNotice({ ...row, payload: [1], read_at: "2026-10-31T10:00:00Z" });
    expect(notice.payload).toEqual({});
    expect(notice.read).toBe(true);
  });
});
