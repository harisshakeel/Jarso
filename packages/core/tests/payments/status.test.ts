import { isStoredStatus, nextStatus, type StoredStatus } from "@jarso/core/payments";
import { describe, expect, it } from "vitest";

describe("nextStatus", () => {
  it.each<[StoredStatus, Parameters<typeof nextStatus>[1], ReturnType<typeof nextStatus>]>([
    // succeeded is reachable from any non-succeeded state
    ["pending", "succeeded", "succeeded"],
    ["requires_action", "succeeded", "succeeded"],
    ["failed", "succeeded", "succeeded"],
    ["expired", "succeeded", "succeeded"],
    ["canceled", "succeeded", "succeeded"],
    // nothing leaves succeeded / succeeded_unapplied
    ["succeeded", "failed", null],
    ["succeeded", "expired", null],
    ["succeeded", "canceled", null],
    ["succeeded", "requires_action", null],
    ["succeeded", "pending", null],
    ["succeeded_unapplied", "succeeded", null],
    ["succeeded_unapplied", "failed", null],
    // failed / expired / canceled only from pending / requires_action
    ["pending", "failed", "failed"],
    ["pending", "expired", "expired"],
    ["pending", "canceled", "canceled"],
    ["requires_action", "failed", "failed"],
    ["requires_action", "expired", "expired"],
    ["requires_action", "canceled", "canceled"],
    ["expired", "failed", null],
    ["canceled", "expired", null],
    ["failed", "canceled", null],
    // requires_action only from pending; nothing moves back to pending
    ["pending", "requires_action", "requires_action"],
    ["failed", "requires_action", null],
    ["requires_action", "pending", null],
    ["failed", "pending", null],
    // same → same
    ["succeeded", "succeeded", null],
    ["failed", "failed", null],
    ["pending", "pending", null],
    ["requires_action", "requires_action", null],
  ])("%s + %s → %s", (current, incoming, expected) => {
    expect(nextStatus(current, incoming)).toBe(expected);
  });
});

describe("isStoredStatus", () => {
  it("accepts the stored statuses and rejects anything else", () => {
    expect(isStoredStatus("succeeded_unapplied")).toBe(true);
    expect(isStoredStatus("requires_action")).toBe(true);
    expect(isStoredStatus("refunded")).toBe(false);
  });
});
