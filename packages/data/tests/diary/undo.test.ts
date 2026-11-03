import { undoEntry } from "@jarso/data/diary";
import { describe, expect, it, vi } from "vitest";

// biome-ignore lint/suspicious/noExplicitAny: a minimal fake client
const fake = (data: unknown) => ({ rpc: vi.fn(async () => ({ data, error: null })) }) as any;

describe("undoEntry", () => {
  it("throws CONFLICT when it is too late", async () => {
    await expect(undoEntry(fake("too_late"), "e")).rejects.toMatchObject({
      code: "CONFLICT",
      message: "You can only undo within a day.",
    });
  });

  it("returns undone", async () => {
    await expect(undoEntry(fake("undone"), "e")).resolves.toBe("undone");
  });
});
