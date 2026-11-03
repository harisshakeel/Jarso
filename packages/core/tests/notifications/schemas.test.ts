import {
  childNoteSchema,
  inboxParamsSchema,
  pushEndpointSchema,
  pushSubscriptionSchema,
} from "@jarso/core/notifications";
import { describe, expect, it } from "vitest";

const cursor = "2026-10-30T21:00:00.123456+00:00|7b0f6a52-3c1e-4b52-9d52-0a6f3a1d1b11";

describe("inboxParamsSchema", () => {
  it("keeps a real cursor", () => {
    expect(inboxParamsSchema.parse({ before: cursor }).before).toBe(cursor);
  });
  it.each(["x", "", "2026-10-30", ["x"], 5, "a|b"])("drops %j to the newest page", (before) => {
    expect(inboxParamsSchema.parse({ before }).before).toBeUndefined();
  });
  it("takes the first of repeated params", () => {
    expect(inboxParamsSchema.parse({ before: [cursor, "x"] }).before).toBe(cursor);
  });
});

describe("pushSubscriptionSchema", () => {
  const good = {
    endpoint: "https://push.example.test/abc",
    expirationTime: null,
    keys: { p256dh: "p".repeat(87), auth: "a".repeat(22) },
  };
  it("takes what the browser's toJSON gives", () => {
    expect(pushSubscriptionSchema.parse(good)).toEqual({
      endpoint: good.endpoint,
      keys: good.keys,
    });
  });
  it.each([
    { ...good, endpoint: "http://push.example.test/abc" },
    { ...good, endpoint: "not a url" },
    { ...good, keys: { p256dh: "", auth: "a" } },
    { ...good, keys: { p256dh: "p".repeat(201), auth: "a" } },
    { endpoint: good.endpoint },
  ])("refuses %j", (input) => {
    expect(pushSubscriptionSchema.safeParse(input).success).toBe(false);
  });
  it("pushEndpointSchema wants an https endpoint", () => {
    expect(pushEndpointSchema.safeParse({ endpoint: good.endpoint }).success).toBe(true);
    expect(pushEndpointSchema.safeParse({ endpoint: "http://x.test" }).success).toBe(false);
  });
});

describe("childNoteSchema", () => {
  const valid = {
    childId: "6f1c2a52-3c4e-4c8e-9a51-0a1b2c3d4e5f",
    text: "  Great saving!  ",
    idempotencyKey: "0b7e8f40-9d1a-4b2c-8e3f-1a2b3c4d5e6f",
  };
  it("trims the note", () => {
    expect(childNoteSchema.parse(valid).text).toBe("Great saving!");
  });
  it.each([
    { ...valid, text: "   " },
    { ...valid, text: "x".repeat(141) },
    { ...valid, idempotencyKey: "not-a-uuid" },
    { ...valid, childId: "nope" },
  ])("refuses %j", (input) => {
    expect(childNoteSchema.safeParse(input).success).toBe(false);
  });
});
