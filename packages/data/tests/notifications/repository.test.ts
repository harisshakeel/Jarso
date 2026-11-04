import {
  encodeCursor,
  fetchUnreadCount,
  listNotices,
  markRead,
  parseCursor,
  removeDeviceToken,
  rowToNotice,
  saveDeviceToken,
  toNotice,
} from "@jarso/data/notifications";
import { describe, expect, it } from "vitest";
import { type Call, fakeClient, ok } from "../fake-client";

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

const noticeRow = (
  i: number,
  createdAt = `2026-10-30T09:${String(59 - i).padStart(2, "0")}:00Z`,
) => ({
  ...row,
  id: `n${i}`,
  created_at: createdAt,
});

describe("listNotices", () => {
  const page = (rows: unknown[]) => fakeClient({ notifications: ok(rows) });

  it("reads the caller's own notices, one more than the page", async () => {
    const { db, queries } = page([]);
    await listNotices(db, "u1");
    expect(queries[0]?.calls).toContainEqual(["eq", "recipient_id", "u1"]);
    expect(queries[0]?.calls).toContainEqual(["limit", 21]);
  });

  it("returns nextBefore when there is a row beyond the page", async () => {
    const rows = Array.from({ length: 21 }, (_, i) => noticeRow(i));
    const result = await listNotices(page(rows).db, "u1");
    expect(result.items).toHaveLength(20);
    expect(result.nextBefore).toBe(`${rows[19]?.created_at}|n19`);
  });

  it("returns no cursor when the last page is exactly full", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => noticeRow(i));
    const result = await listNotices(page(rows).db, "u1");
    expect(result.items).toHaveLength(20);
    expect(result.nextBefore).toBeNull();
  });

  it("cursor carries the id so a same-timestamp group is not skipped", async () => {
    const rows = Array.from({ length: 21 }, (_, i) => noticeRow(i, "2026-10-30T09:00:00Z"));
    const result = await listNotices(page(rows).db, "u1");
    expect(result.nextBefore).toBe("2026-10-30T09:00:00Z|n19");
  });

  it("continues before a cursor and honours a smaller limit", async () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    const { db, queries } = page([]);
    await listNotices(db, "u1", { before: `2026-10-30T09:00:00Z|${id}`, limit: 5 });
    const calls = queries[0]?.calls ?? [];
    expect(calls).toContainEqual(["limit", 6]);
    expect(calls.find((c: Call) => c[0] === "or")?.[1]).toBe(
      `created_at.lt."2026-10-30T09:00:00Z",and(created_at.eq."2026-10-30T09:00:00Z",id.lt.${id})`,
    );
  });

  it("refuses a junk cursor", async () => {
    await expect(listNotices(page([]).db, "u1", { before: "nope" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});

describe("fetchUnreadCount and markRead", () => {
  it("call the functions", async () => {
    const { db, rpc } = fakeClient(
      {},
      { unread_notification_count: ok(3), mark_notifications_read: ok(2) },
    );
    await expect(fetchUnreadCount(db)).resolves.toBe(3);
    await expect(markRead(db)).resolves.toBe(2);
    expect(rpc).toHaveBeenLastCalledWith("mark_notifications_read", {});
    await markRead(db, ["n1"]);
    expect(rpc).toHaveBeenLastCalledWith("mark_notifications_read", { p_ids: ["n1"] });
  });
});

const realtimeRow = {
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
  pushed_at: null,
};

describe("rowToNotice", () => {
  it("maps a realtime row and leaves the child's name blank", () => {
    expect(rowToNotice(realtimeRow)).toEqual({
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
    const notice = rowToNotice({ ...realtimeRow, payload: [1], read_at: "2026-10-31T10:00:00Z" });
    expect(notice.payload).toEqual({});
    expect(notice.read).toBe(true);
  });
});

describe("device tokens", () => {
  const TOKEN = "ExponentPushToken[abc]";

  it("registers through register_device_push_token and returns the row id", async () => {
    const { db, rpc } = fakeClient({}, { register_device_push_token: ok("row-1") });
    await expect(saveDeviceToken(db, { token: TOKEN, platform: "android" })).resolves.toBe("row-1");
    expect(rpc).toHaveBeenCalledWith("register_device_push_token", {
      p_token: TOKEN,
      p_platform: "android",
    });
  });

  it("RPC 42501 (not a member) is FORBIDDEN with a safe message", async () => {
    const { db } = fakeClient(
      {},
      {
        register_device_push_token: {
          data: null,
          error: { code: "42501", message: "Join a family first" },
        },
      },
    );
    await expect(saveDeviceToken(db, { token: TOKEN, platform: "android" })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Join a family first.",
    });
  });

  it("unregisters only through unregister_device_push_token", async () => {
    const { db, rpc } = fakeClient({}, { unregister_device_push_token: ok(false) });
    await expect(removeDeviceToken(db, TOKEN)).resolves.toBe(false);
    expect(rpc).toHaveBeenCalledWith("unregister_device_push_token", { p_token: TOKEN });
  });
});
