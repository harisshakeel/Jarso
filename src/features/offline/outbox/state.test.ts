import { describe, expect, it } from "vitest";
import { offlineCopy } from "../copy";
import { nextState } from "./state";
import { makeItem } from "./test-utils";

const now = new Date("2026-10-30T10:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

describe("state", () => {
  it("done deletes", () => {
    expect(nextState(makeItem(), { kind: "done", data: { id: 1 } }, now)).toBeNull();
  });

  it("refused becomes needs_look with the message", () => {
    const next = nextState(makeItem(), { kind: "refused", message: "Nope." }, now);
    expect(next).toMatchObject({ status: "needs_look", message: "Nope." });
  });

  it("retry backs off 2s, 5s, 15s, 30s, 60s, 60s", () => {
    let item = makeItem({ occurredAt: now.toISOString(), createdAt: now.toISOString() });
    const delays: number[] = [];
    for (let i = 0; i < 6; i++) {
      const next = nextState(item, { kind: "retry" }, now);
      if (!next) throw new Error("retry must not delete");
      expect(next.status).toBe("waiting");
      expect(next.attempts).toBe(i + 1);
      delays.push(Date.parse(next.nextAttemptAt) - now.getTime());
      item = next;
    }
    expect(delays).toEqual([2_000, 5_000, 15_000, 30_000, 60_000, 60_000]);
  });

  it("20th retry becomes needs_look with the expired copy", () => {
    const nineteenth = nextState(makeItem({ attempts: 18 }), { kind: "retry" }, now);
    expect(nineteenth).toMatchObject({ status: "waiting", attempts: 19 });
    const twentieth = nextState(makeItem({ attempts: 19 }), { kind: "retry" }, now);
    expect(twentieth).toMatchObject({
      status: "needs_look",
      attempts: 20,
      message: offlineCopy.expired,
    });
  });

  it("older than 7 days becomes needs_look", () => {
    const old = new Date(now.getTime() - 7 * DAY_MS - 1).toISOString();
    const next = nextState(makeItem({ occurredAt: old, createdAt: old }), { kind: "retry" }, now);
    expect(next).toMatchObject({ status: "needs_look", message: offlineCopy.expired });

    const fresh = new Date(now.getTime() - 7 * DAY_MS + 60_000).toISOString();
    const kept = nextState(makeItem({ occurredAt: fresh }), { kind: "retry" }, now);
    expect(kept).toMatchObject({ status: "waiting" });
  });

  it("unauthorized leaves the item unchanged", () => {
    const item = makeItem({ attempts: 3 });
    expect(nextState(item, { kind: "unauthorized" }, now)).toBe(item);
  });
});
