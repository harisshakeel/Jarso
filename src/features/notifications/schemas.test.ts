import { describe, expect, it } from "vitest";
import { inboxParamsSchema, pushEndpointSchema, pushSubscriptionSchema } from "./schemas";

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
