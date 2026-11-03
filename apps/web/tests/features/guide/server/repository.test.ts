import { describe, expect, it, vi } from "vitest";
import { hasAnyMessage } from "@/features/guide/server/repository";

/** A chainable query double that records each call and resolves to `result`. */
function fakeDb(result: { data: unknown[] | null; error: unknown }) {
  const calls: [string, ...unknown[]][] = [];
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "eq", "is", "limit"]) {
    chain[name] = vi.fn((...args: unknown[]) => {
      calls.push([name, ...args]);
      return name === "limit" ? Promise.resolve(result) : chain;
    });
  }
  return { db: { from: vi.fn(() => chain) } as never, calls };
}

describe("hasAnyMessage", () => {
  it("counts only the child's messages in chats the child asked", async () => {
    const { db, calls } = fakeDb({ data: [{ id: "m1" }], error: null });
    await expect(hasAnyMessage(db, "child-1")).resolves.toBe(true);
    expect(calls).toContainEqual(["is", "guide_conversations.asked_by", null]);
    expect(calls).toContainEqual(["eq", "role", "child"]);
  });

  it("is false when there is none", async () => {
    const { db } = fakeDb({ data: [], error: null });
    await expect(hasAnyMessage(db, "child-1")).resolves.toBe(false);
  });
});
