import { describe, expect, it } from "vitest";
import { encodeCursor, parseCursor, toNotice } from "./repository";

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
