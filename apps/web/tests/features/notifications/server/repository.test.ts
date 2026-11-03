import { describe, expect, it, vi } from "vitest";
import {
  encodeCursor,
  insertChildNote,
  parseCursor,
  toClaimed,
  toNotice,
} from "@/features/notifications/server/repository";

const row = {
  id: "n1",
  kind: "allowance_due",
  child_id: "c1",
  source_type: "allowance_occurrence",
  source_id: "s1",
  payload: { amount_minor: 500 },
  created_at: "2026-10-30T09:00:00.123456+00:00",
  read_at: null as string | null,
  child: { nickname: "Maya" } as { nickname: string } | null,
};

describe("toNotice", () => {
  it("maps a row", () => {
    expect(toNotice(row)).toEqual({
      id: "n1",
      kind: "allowance_due",
      childId: "c1",
      childName: "Maya",
      sourceType: "allowance_occurrence",
      sourceId: "s1",
      payload: { amount_minor: 500 },
      createdAt: row.created_at,
      read: false,
    });
  });
  it("handles a null child join", () => {
    expect(toNotice({ ...row, child: null }).childName).toBe("");
  });
  it("replaces non-object payloads with {}", () => {
    expect(toNotice({ ...row, payload: [1] }).payload).toEqual({});
    expect(toNotice({ ...row, payload: "x" }).payload).toEqual({});
    expect(toNotice({ ...row, payload: null }).payload).toEqual({});
  });
  it("read_at means read", () => {
    expect(toNotice({ ...row, read_at: "2026-10-30T10:00:00Z" }).read).toBe(true);
  });
});

describe("cursor", () => {
  const id = "123e4567-e89b-12d3-a456-426614174000";
  it("round trips, keeping microseconds", () => {
    const c = { createdAt: row.created_at, id };
    expect(parseCursor(encodeCursor(c))).toEqual(c);
  });
  it("rejects junk and filter injection", () => {
    expect(() => parseCursor("nope")).toThrow();
    expect(() => parseCursor(`2026-10-30T09:00:00Z"),id.gt.0|${id}`)).toThrow();
  });
});

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

describe("insertChildNote", () => {
  const args = { childId: "c1", text: "Great saving!", idempotencyKey: "k1" };
  const db = (result: { data: unknown; error: { code: string; message: string } | null }) =>
    ({ rpc: vi.fn(async () => result) }) as never;

  it("sends through send_child_note and returns what it did", async () => {
    const client = db({ data: "sent", error: null });
    await expect(insertChildNote(client, args)).resolves.toBe("sent");
    expect((client as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith(
      "send_child_note",
      { p_child_id: "c1", p_text: "Great saving!", p_idempotency_key: "k1" },
    );
    await expect(insertChildNote(db({ data: "already_sent", error: null }), args)).resolves.toBe(
      "already_sent",
    );
  });

  it("turns the daily cap into a calm rate limit", async () => {
    await expect(
      insertChildNote(
        db({ data: null, error: { code: "JA429", message: "Too many notes" } }),
        args,
      ),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
      message: "That's a lot of notes today. Send more tomorrow.",
    });
  });

  it("refuses an answer it doesn't know", async () => {
    await expect(insertChildNote(db({ data: "maybe", error: null }), args)).rejects.toMatchObject({
      code: "INTERNAL",
    });
  });
});
